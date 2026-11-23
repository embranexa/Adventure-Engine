"""19hz crawler: the Los Angeles listing at 19hz.info, parsed from its HTML table.

19hz has no API. Each table row is one event:

    date/time | title @ venue (area) | tags | price | age | organizers | links | YYYY/MM/DD

Its title links to the event on a ticket platform (RA, DICE, Ticketmaster, ...). Phase A
uses only the row; a later phase can enrich events from those pages. The page's weekly
table ("Tuesdays (9pm-2am)") has no dates and is skipped.
"""

import hashlib
import re
import string
from datetime import date, datetime, time, timedelta
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx

from backend.services.geocode import is_vague_place

NAME = "19hz"
URL = "https://19hz.info/eventlisting_LosAngeles.php"

TZ_NAME = "America/Los_Angeles"
TZ = ZoneInfo(TZ_NAME)
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# query parameters that only track the click (dropped so api_id stays stable)
TRACKING = re.compile(r"^(utm_.*|fbclid|gclid|igshid|mc_.*|afflky|nts_trk|refid|cid|aff.*|_branch.*)$", re.I)


class _Table(HTMLParser):
    """Collects <tr> rows as lists of cells: (text, [hrefs]). Cells close implicitly at
    the next <td> (19hz leaves some unclosed)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[tuple[str, list[str]]]] = []
        self._cell: list[Any] | None = None  # [text parts, hrefs]

    def _close_cell(self) -> None:
        if self._cell is not None and self.rows:
            text = re.sub(r"\s+", " ", "".join(self._cell[0])).strip()
            self.rows[-1].append((text, self._cell[1]))
        self._cell = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._close_cell()
            self.rows.append([])
        elif tag in ("td", "th"):
            self._close_cell()
            self._cell = [[], []]
        elif self._cell is not None:
            if tag == "br":
                self._cell[0].append(" ")
            elif tag == "a":
                href = dict(attrs).get("href")
                if href:
                    self._cell[1].append(href.strip())

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th", "tr", "table"):
            self._close_cell()

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell[0].append(data)


def canonical_url(url: str) -> str:
    """The URL without tracking parameters or a fragment."""
    parts = urlsplit(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not TRACKING.match(k)])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def _clock(text: str) -> time | None:
    """'11pm', '9:30am', '11:59pm', 'noon' -> time."""
    text = text.strip().lower()
    if text in ("noon", "12noon"):
        return time(12)
    if text == "midnight":
        return time(0)
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", text)
    if not m:
        return None
    hour, minute = int(m.group(1)) % 12, int(m.group(2) or 0)
    if m.group(3) == "pm":
        hour += 12
    return time(hour, minute) if minute < 60 else None


def _split_time(part: str) -> tuple[str | None, time | None]:
    """'Sun: 10pm' -> ('sun', 10pm); '10pm' -> (None, 10pm)."""
    m = re.fullmatch(r"\s*(?:([A-Za-z]{3})[a-z]*:\s*)?(.+?)\s*", part)
    if not m:
        return None, None
    day = m.group(1).lower() if m.group(1) and m.group(1).lower() in WEEKDAYS else None
    return day, _clock(m.group(2))


def _on_weekday(start: date, day: str) -> date:
    """The first date on or after `start` that falls on `day` ('sun')."""
    return start + timedelta(days=(WEEKDAYS.index(day) - start.weekday()) % 7)


def parse_when(cell: str, start_day: date) -> tuple[datetime, datetime | None, bool]:
    """(start, end, time_known) from the date cell, e.g.
    'Fri: Nov 20-Sun: Nov 22 (Fri: 11pm-Sun: 10pm)' or 'Sun: Nov 22 (5am-4pm)'.
    Without a time the event starts at midnight and time_known is False."""
    m = re.search(r"\(([^)]*)\)", cell)
    pieces = re.split(r"\s*-\s*", m.group(1), maxsplit=1) if m else []
    s_day, s_time = _split_time(pieces[0]) if pieces else (None, None)
    if s_time is None:
        return datetime.combine(start_day, time(0), TZ), None, False

    first = _on_weekday(start_day, s_day) if s_day else start_day
    start = datetime.combine(first, s_time, TZ)
    if len(pieces) < 2:
        return start, None, True
    e_day, e_time = _split_time(pieces[1])
    if e_time is None:
        return start, None, True
    if e_day:
        end = datetime.combine(_on_weekday(first, e_day), e_time, TZ)
        if end <= start:
            end += timedelta(days=7)
    else:
        end = datetime.combine(first, e_time, TZ)
        if end <= start:  # runs past midnight
            end += timedelta(days=1)
    return start, end, True


def parse_price(text: str) -> dict[str, Any]:
    """'$90-120', 'free w/rsvp b4 11pm / $15+', 'free', '' -> Luma-style price details."""
    lower = text.lower()
    amounts = [float(n) for a, b in re.findall(r"\$\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?", text)
               for n in (a, b) if n]
    free = "free" in lower
    if not amounts:
        return {"free": free} if free else {}
    lo, hi = (0.0 if free else min(amounts)), max(amounts)
    cents = lambda v: round(v * 100)  # noqa: E731
    if lo == hi:
        return {"free": False, "price_cents": cents(lo)}
    return {"free": False, "price_min_cents": cents(lo), "price_max_cents": cents(hi)}


def _split_venue(text: str) -> tuple[str, str | None, str | None]:
    """'Title @ Venue (DTLA/Los Angeles)' -> ('Title', 'Venue', 'DTLA/Los Angeles')."""
    title, sep, place = text.rpartition(" @ ")
    if not sep:
        return text, None, None
    m = re.fullmatch(r"(.*?)\s*\(([^()]*)\)\s*", place)
    return title.strip(), (m.group(1) if m else place).strip() or None, m.group(2).strip() if m else None


def _tidy_place(name: str) -> str | None:
    """'Los ANgeles' -> 'Los Angeles'. Names that are all lower or have a capital past the
    first letter of a word get title case; others ('McLean') are left alone."""
    name = name.strip()
    if not name:
        return None
    if name.islower() or any(re.search(r"[a-z][A-Z]{2,}|[A-Z]{2,}[a-z]", w) for w in name.split()):
        return string.capwords(name.lower())
    return name


def parse_row(cells: list[tuple[str, list[str]]]) -> dict[str, Any] | None:
    """Map one table row to the fields of backend.schemas.EventIn (None if it isn't an event)."""
    if len(cells) < 7:
        return None
    sort = re.search(r"(\d{4})/(\d{2})/(\d{2})", cells[-1][0])
    if not sort:
        return None  # header row
    start_day = date(*map(int, sort.groups()))

    what, links = cells[1]
    tags, price_age, organizers = cells[2][0], cells[3][0], cells[4][0]
    start, end, time_known = parse_when(cells[0][0], start_day)
    title, place, area = _split_venue(what)
    if not title:
        return None

    # price | age (either may be missing)
    parts = [p.strip() for p in price_age.split("|")]
    age = parts.pop() if parts and re.fullmatch(r"\d+\+|all ages", parts[-1], re.I) else None
    price_text = " | ".join(p for p in parts if p) or None

    # 'DTLA/Los Angeles' -> city 'Los Angeles'; tidy stray capitals ('Los ANgeles')
    city = _tidy_place(area.split("/")[-1]) if area else None
    if is_vague_place(city):  # "Socal", "1 Hour from Downtown Los Angeles": the area stays in details
        city = None
    tba = not place or place.upper() in ("TBA", "TBD", "SECRET LOCATION")
    street = not tba and bool(re.match(r"\d+\s+\S", place or ""))
    venue = None if tba or street else place
    address = f"{place}, {city}, CA" if street and city else (place if street else None)

    link = canonical_url(links[0]) if links else None
    if link and not link.startswith(("http://", "https://")):
        link = None
    # the date is part of the id: one ticket link can serve several nights
    api_id = f"{start_day} {link}" if link else f"{start_day} 19hz:" + hashlib.sha1(title.encode()).hexdigest()[:16]

    details: dict[str, Any] = {
        **parse_price(price_text or ""),
        "hosts": [h.strip() for h in organizers.split(",") if h.strip()],
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "age": age,
        "price_text": price_text,
        "area": area,
        "links": [canonical_url(h) for h in cells[5][1]] or None,
    }
    if not time_known:
        details["time_unknown"] = True

    return {
        "api_id": api_id,
        "title": title,
        "start_time": start,
        "end_time": end,
        "timezone": TZ_NAME,
        "url": link or URL,
        "venue": venue,
        "address": address,
        "city": city,
        "lat": None,
        "lon": None,
        "location_approximate": tba,
        "cover_url": None,
        "details": {k: v for k, v in details.items() if v not in (None, [], "")},
    }


def parse_listing(page: str) -> list[dict[str, Any]]:
    table = _Table()
    table.feed(page)
    table.close()
    return [ev for ev in (parse_row(r) for r in table.rows) if ev]


async def fetch_events(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """One request: the whole listing is a single page."""
    res = await client.get(URL)
    res.raise_for_status()
    return parse_listing(res.text)
