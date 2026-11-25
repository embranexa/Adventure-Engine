"""The Assayer's engine: reads an event's (or an item's) page and says what it found.

No keys, no AI, no browser: the page is downloaded as text and its published data is parsed.
In order, stopping when nothing is missing:
    1. schema.org JSON-LD (Event and its subtypes; Product for items)
    2. Open Graph tags (title, description, image), as link previews use

    clean(url)               the link without redirect wrappers or tracking
    read(html, url, near)    parsing only: no network (scripts/check_assay.py runs it on saved pages)
    fetch(url)               a polite download
    look(url, ...)           fetch + read + geocode

Manners: robots.txt is obeyed, one request a second per site, a plain client name; a site that
refuses is left alone for a week, and some (NEVER) are never asked. Unknown stays unknown: a
vague place isn't a place, and dates without times are whole days, never midnight.
"""

import asyncio
import html as html_lib
import json
import logging
import re
import time as clock
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

import httpx

from backend.crawlers.nineteenhz import canonical_url
from backend.services import covers, geocode

log = logging.getLogger(__name__)

USER_AGENT = "event-page-reader/0.1"  # names neither the user nor the app
TIMEOUT_S = 15.0
MAX_BYTES = 4 * 1024 * 1024
MAX_REDIRECTS = 5
GAP_S = 1.2
REST = timedelta(days=7)        # before a refusal, or a failed page, is tried again
SAME_EVENT = timedelta(hours=36)  # a page whose event is further off than this is another event's
LOCAL = "America/Los_Angeles"   # times without an offset

# sites that block automated requests, or were excluded
NEVER = ("ra.co", "residentadvisor.net", "ticketweb.com", "tixr.com", "axs.com", "ticketmaster.com", "livenation.com",
         "facebook.com", "fb.me", "instagram.com")
CHALLENGE = re.compile(r"just a moment|security checkpoint|attention required|verify you are human|captcha|access denied", re.I)
NOT_A_COVER = re.compile(r"favicon|logo|placeholder|default[-_.]|apple-touch|cropped-", re.I)
AREA = re.compile(r"(the )?(downtown|dtla|dtsd|los angeles|la|hollywood|arts district|warehouse|undisclosed|private|location|online|virtual)\b[\w ,]{0,24}$", re.I)
UNSETTLED = re.compile(r"\bto be (confirmed|announced|determined|revealed)\b|\bcoming soon\b", re.I)
WRAPPERS = {"l.instagram.com": "u", "l.facebook.com": "u", "lm.facebook.com": "u"}


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").removeprefix("www.").lower()


def never(url: str) -> bool:
    host = host_of(url)
    return any(host == n or host.endswith("." + n) for n in NEVER)


def clean(url: str) -> str:
    """The link itself: redirect wrappers unwrapped (without asking them), tracking removed."""
    url = url.strip()
    if not re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I):
        url = f"https://{url}"
    for _ in range(3):
        param = WRAPPERS.get(urlsplit(url).netloc.lower())
        target = parse_qs(urlsplit(url).query).get(param, [None])[0] if param else None
        if not target:
            break
        url = target
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or "." not in parts.hostname:
        raise ValueError("not an http(s) link")
    return canonical_url(url)


def key(url: str) -> str:
    """What makes two links the same."""
    try:
        parts = urlsplit(clean(url))
    except ValueError:
        return url
    return f"{(parts.hostname or '').removeprefix('www.')}{parts.path.rstrip('/')}{'?' + parts.query if parts.query else ''}"


# --- reading ---

class _Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.blocks: list[str] = []
        self.title = ""
        self._in: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "meta":
            name, content = (a.get("property") or a.get("name") or "").lower(), a.get("content")
            if name and content and name not in self.meta:
                self.meta[name] = content.strip()
        elif tag == "script" and "ld+json" in (a.get("type") or "").lower():
            self._in = "ld"
            self.blocks.append("")
        elif tag == "title" and not self.title:
            self._in = "title"

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "title"):
            self._in = None

    def handle_data(self, data: str) -> None:
        if self._in == "ld":
            self.blocks[-1] += data
        elif self._in == "title":
            self.title += data


def _types(o: dict[str, Any]) -> list[str]:
    t = o.get("@type")
    return [str(x) for x in (t if isinstance(t, list) else [t]) if x]


def _day(v: Any) -> Any:
    m = re.match(r"\d{4}-\d\d-\d\d", _text(v, 60) or "")
    try:
        return date.fromisoformat(m.group(0)) if m else None
    except ValueError:
        return None


def _vague(name: str) -> bool:
    return geocode.is_vague_place(name) or bool(AREA.match(name.strip()) or UNSETTLED.search(name))


def _cased(name: str | None) -> str | None:
    return name.title() if name and name.isupper() and len(name) > 4 else name


def _walk(o: Any, depth: int = 0):
    if depth > 12:
        return
    if isinstance(o, list):
        for x in o:
            yield from _walk(x, depth + 1)
    elif isinstance(o, dict):
        yield o
        for v in o.values():
            if isinstance(v, (dict, list)):
                yield from _walk(v, depth + 1)


def _first(v: Any) -> Any:
    return (v[0] if v else None) if isinstance(v, list) else v


def _text(v: Any, limit: int) -> str | None:
    v = _first(v)
    if not isinstance(v, (str, int, float)):
        return None
    text = html_lib.unescape(re.sub(r"<(br|/p|/li)\b[^>]*>", "\n", str(v), flags=re.I))
    text = re.sub(r"<[^>]+>", "", text).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()
    return text[:limit] or None


def _when(v: Any, tz: str) -> datetime | None:
    """A moment; None for a bare date (a date isn't midnight)."""
    text = _text(v, 60)
    if not text or not re.search(r"\d[T ]\d{1,2}:\d\d", text):
        return None
    text = re.sub(r"([+-]\d\d)(\d\d)$", r"\1:\2", text.replace("Z", "+00:00"))
    try:
        at = datetime.fromisoformat(text)
    except ValueError:
        return None
    return at if at.tzinfo else at.replace(tzinfo=ZoneInfo(tz))


def _image(v: Any, base: str) -> str | None:
    for x in v if isinstance(v, list) else [v]:
        if isinstance(x, dict):
            x = x.get("url") or x.get("contentUrl")
        x = _first(x)
        if isinstance(x, str) and x.strip():
            url = urljoin(base, html_lib.unescape(x.strip()))
            if url.startswith("http") and not NOT_A_COVER.search(urlsplit(url).path.rsplit("/", 1)[-1]):
                return url[:2000]
    return None


def _place(v: Any) -> dict[str, Any]:
    """venue, address, city, lat, lon of a schema.org location."""
    for loc in v if isinstance(v, list) else [v]:
        if isinstance(loc, dict) and "VirtualLocation" not in _types(loc):
            break
    else:
        return {}
    out: dict[str, Any] = {}
    addr = _first(loc.get("address"))
    street = city = None
    if isinstance(addr, dict):
        street, city = _text(addr.get("streetAddress"), 300), _text(addr.get("addressLocality"), 200)
        if street and any(ch.isdigit() for ch in street):
            tail = [city, " ".join(x for x in (_text(addr.get("addressRegion"), 60), _text(addr.get("postalCode"), 20)) if x)]
            out["address"] = ", ".join([street, *(t for t in tail if t and t.lower() not in street.lower())])[:500]
    elif isinstance(addr, str) and any(ch.isdigit() for ch in addr):
        out["address"] = _text(addr, 500)
    if city and not geocode.is_vague_place(city):
        out["city"] = _cased(city)
    venue = _text(loc.get("name"), 300)
    if venue and not _vague(venue) and not (out.get("address") or "").lower().startswith(venue.lower()):
        out["venue"] = venue
    geo = _first(loc.get("geo"))
    if isinstance(geo, dict) and (out.get("address") or out.get("venue")):  # else it's only an area's middle
        try:
            lat, lon = float(geo["latitude"]), float(geo["longitude"])
        except (KeyError, TypeError, ValueError):
            lat = lon = 0.0
        if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon):
            out.update(lat=lat, lon=lon)
    return out


def _price(offers: Any) -> str | None:
    values, unit = [], "$"
    for o in offers if isinstance(offers, list) else [offers]:
        if not isinstance(o, dict):
            continue
        currency = str(o.get("priceCurrency") or "USD").upper()
        unit = "$" if currency == "USD" else f"{currency} "
        for k in ("price", "lowPrice", "highPrice"):
            try:
                values.append(float(str(o.get(k)).replace(",", "")))
            except ValueError:
                pass
    if not values:
        return None
    lo, hi = min(values), max(values)
    show = lambda x: f"{unit}{x:g}" if x == int(x) else f"{unit}{x:.2f}"  # noqa: E731
    return "Free" if hi == 0 else show(lo) if lo == hi else f"{show(lo)} to {show(hi)}"


def _words(text: str | None) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower())) - {"the", "a", "at", "and", "of", "in", "presents", "tickets"}


def read(page: str, url: str, near: datetime | None = None, title: str | None = None, tz: str = LOCAL) -> dict[str, Any]:
    """What a page says: {kind: event | item | None, outcome: ok | mismatch | empty, fields, sources}.

    `near`, `title`: the event it should be about. Fields: title, description, start_time, end_time
    (datetimes), venue, address, city, lat, lon, cover_url, costs."""
    doc = _Page()
    doc.feed(page)
    fields: dict[str, Any] = {}
    sources: dict[str, str] = {}

    def put(name: str, value: Any, source: str) -> None:
        if value is not None and name not in fields:
            fields[name], sources[name] = value, source

    nodes: list[dict[str, Any]] = []
    for block in doc.blocks:
        try:
            nodes.extend(_walk(json.loads(block.strip(), strict=False)))
        except (ValueError, RecursionError):
            continue
    events = [(n, _when(n.get("startDate"), tz)) for n in nodes if n.get("startDate") and any(t.endswith(("Event", "Festival")) for t in _types(n))]
    products = [n for n in nodes if "Product" in _types(n) and n.get("name")]
    kind, event = None, None
    if events:
        kind = "event"
        if near is not None:
            local = near.astimezone(ZoneInfo(tz)).date()
            close = [(n, s) for n, s in events if (abs(s - near) <= SAME_EVENT if s is not None
                     else (d := _day(n.get("startDate"))) is not None and abs((d - local).days) <= 1)]
            if not close:
                return {"kind": kind, "outcome": "mismatch", "fields": {}, "sources": {}}
            event, start = max(close, key=lambda p: (len(_words(_text(p[0].get("name"), 500)) & _words(title)), -abs((p[1] - near).total_seconds()) if p[1] else 0))
        elif len({(_text(n.get("name"), 500), s) for n, s in events}) == 1 or urlsplit(url).path not in ("", "/"):
            # several events: the one this page is, if it says so
            own = [(n, s) for n, s in events if isinstance(n.get("url"), str) and key(n["url"]) == key(url)]
            event, start = (own or events)[0] if own or len({_text(n.get("name"), 500) for n, _ in events}) == 1 else (None, None)
    if event is not None:
        put("title", _text(event.get("name"), 500), "page data")
        put("start_time", start, "page data")
        end = _when(event.get("endDate"), tz)
        if end and start and start < end <= start + timedelta(days=14):
            put("end_time", end, "page data")
        first, last = _day(event.get("startDate")), _day(event.get("endDate"))
        if near is None and start is None and first:  # whole days: the first and last day's local midnights
            last = last if last and first <= last <= first + timedelta(days=60) else first
            for name, d in (("start_time", first), ("end_time", last)):
                put(name, datetime(d.year, d.month, d.day, tzinfo=ZoneInfo(tz)), "page data")
            put("all_day", True, "page data")
        for name, value in _place(event.get("location")).items():
            put(name, value, "page data")
        put("cover_url", _image(event.get("image"), url), "page data")
        put("description", _text(event.get("description"), 5000), "page data")
        put("costs", _price(event.get("offers")), "page data")
    elif products and near is None:
        kind, p = "item", products[0]
        put("title", _text(p.get("name"), 500), "page data")
        put("description", _text(p.get("description"), 5000), "page data")
        put("cover_url", _image(p.get("image"), url), "page data")
        put("costs", _price(p.get("offers")), "page data")
    if kind is None and doc.meta.get("og:type", "").lower().startswith("product"):
        kind = "item"
    put("title", _text(doc.meta.get("og:title"), 500), "link preview")
    put("description", _text(doc.meta.get("og:description") or doc.meta.get("description"), 5000), "link preview")
    put("cover_url", _image(doc.meta.get("og:image") or doc.meta.get("twitter:image"), url), "link preview")
    if near is None:
        name = host_of(url).rsplit(".", 1)[0].split(".")[-1]
        if name not in re.sub(r"\W", "", doc.title.lower())[:len(name) + 12] and not CHALLENGE.search(doc.title):  # only the site's own name
            put("title", _text(doc.title, 500), "page title")
    return {"kind": kind, "outcome": "ok" if fields else "empty", "fields": fields, "sources": sources}


# --- fetching ---

class Refused(Exception):
    """It isn't to be read: `outcome` is blocked (it said no, or never asked) or error."""

    def __init__(self, outcome: str, why: str) -> None:
        super().__init__(why)
        self.outcome, self.why = outcome, why


_robots: dict[str, tuple[float, RobotFileParser | None]] = {}   # None: unreachable, so not allowed
_next: dict[str, float] = {}
_locks: dict[str, asyncio.Lock] = {}
_resting: dict[str, float] = {}


async def _turn(host: str) -> None:
    """Wait for a site's next second."""
    async with _locks.setdefault(host, asyncio.Lock()):
        wait = _next.get(host, 0) - clock.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _next[host] = clock.monotonic() + GAP_S


async def _get(client: httpx.AsyncClient, url: str) -> tuple[int, dict[str, str], str]:
    try:
        await covers._check_host(url)
    except covers.CoverError as e:
        raise Refused("error", str(e)) from e
    await _turn(host_of(url))
    async with client.stream("GET", url) as res:
        chunks, size = [], 0
        async for chunk in res.aiter_bytes():
            size += len(chunk)
            if size > MAX_BYTES:
                raise Refused("error", "the page is too large")
            chunks.append(chunk)
        return res.status_code, dict(res.headers), b"".join(chunks).decode(res.charset_encoding or "utf-8", errors="replace")


async def _allowed(client: httpx.AsyncClient, url: str) -> bool:
    parts = urlsplit(url)
    root = f"{parts.scheme}://{parts.netloc}"
    at, rules = _robots.get(root, (0.0, None))
    if not at or clock.monotonic() - at > 86_400:
        target, rules = f"{root}/robots.txt", RobotFileParser()
        rules.parse([])
        try:
            for _ in range(MAX_REDIRECTS):
                status, headers, text = await _get(client, target)
                if 300 <= status < 400 and headers.get("location"):
                    target = urljoin(target, headers["location"])
                    continue
                if status == 200:
                    rules.parse(text.splitlines())
                elif status >= 500 or status == 429:
                    rules = None
                break
        except httpx.HTTPError:
            rules = None
        _robots[root] = (clock.monotonic(), rules)
    return rules is not None and rules.can_fetch(USER_AGENT, url)


async def fetch(url: str) -> tuple[str, str]:
    """The page's text and final address. Raises Refused."""
    current = url
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False,
                                     headers={"User-Agent": USER_AGENT, "Accept": "text/html"}) as client:
            for _ in range(MAX_REDIRECTS + 1):
                host = host_of(current)
                if never(current):
                    raise Refused("blocked", f"{host} isn't read")
                if _resting.get(host, 0) > clock.monotonic():
                    raise Refused("blocked", f"{host} refused lately")
                if not await _allowed(client, current):
                    raise Refused("blocked", f"{host} doesn't allow it")
                status, headers, text = await _get(client, current)
                if 300 <= status < 400 and headers.get("location"):
                    current = urljoin(current, headers["location"])
                    continue
                title = re.search(r"<title[^>]*>(.*?)</title>", text[:200_000], re.S | re.I)
                if status in (401, 403, 429) or (status == 202 and not text.strip()) or (title and CHALLENGE.search(title.group(1))):
                    _resting[host] = clock.monotonic() + REST.total_seconds()
                    raise Refused("blocked", f"{host} refused")
                if status in (404, 410):
                    raise Refused("error", "the page is gone")
                if status != 200:
                    raise Refused("error", f"{host} answered {status}")
                if "html" not in headers.get("content-type", "html").lower():
                    raise Refused("error", "it isn't a web page")
                return text, current
            raise Refused("error", "too many redirects")
    except httpx.HTTPError as e:
        raise Refused("error", f"{host_of(current)} didn't answer") from e


async def look(url: str, near: datetime | None = None, title: str | None = None, city: str | None = None) -> dict[str, Any]:
    """Read a link: {outcome: ok | empty | mismatch | blocked | error, why, url, kind, fields, sources}."""
    try:
        url = clean(url)
    except ValueError as e:
        return {"outcome": "error", "why": str(e), "url": url, "kind": None, "fields": {}, "sources": {}}
    try:
        page, final = await fetch(url)
    except Refused as e:
        return {"outcome": e.outcome, "why": e.why, "url": url, "kind": None, "fields": {}, "sources": {}}
    found = await asyncio.to_thread(read, page, final, near, title)
    f = found["fields"]
    if "lat" not in f and (f.get("address") or f.get("venue")):
        try:
            spot = await geocode.locate(f.get("venue"), f.get("address"), f.get("city") or city)
        except httpx.HTTPError:
            spot = None
        if spot:
            f["lat"], f["lon"] = spot
            found["sources"]["lat"] = found["sources"]["lon"] = "map"
    why = {"empty": "the page says nothing readable", "mismatch": "the page is about another date"}.get(found["outcome"])
    return {**found, "why": why, "url": url}


def to_json(fields: dict[str, Any]) -> dict[str, Any]:
    return {k: v.astimezone(timezone.utc).isoformat() if isinstance(v, datetime) else v for k, v in fields.items()}
