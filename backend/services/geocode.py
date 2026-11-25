"""Locating events that come without coordinates (19hz): the most precise place found.

Each event is tried from the finest level down; the first hit wins:
    address   its street address                 exact
    venue     "<venue>, <city>, California"      exact (a named place, never a street or area)
    city      "<city>, California"               approximate: the city's centre

Lookups go to OpenStreetMap's Nominatim (generic client name, nothing about the user), at
most one a second, and every answer (misses too) is kept in the `geocache` table, so each
place is asked once. A venue or address more than MAX_FROM_CITY_KM from its city's centre
is treated as a wrong match.

    fill_from_cache(raw_events)   during a harvest: instant, cache only
    start()                       background: look up what the cache lacks, update events

Located events get details.located = "address" | "venue" | "city".
"""

import asyncio
import logging
import math
import re
from typing import Any

import httpx
from sqlalchemy import func, or_, select, update

from backend.db.base import SessionLocal
from backend.db.models import Event, GeoCache
from backend.services.geo import NOMINATIM, USER_AGENT

log = logging.getLogger(__name__)

REGION = "California"
REQUEST_GAP_S = 1.1          # Nominatim's usage policy: at most one request a second
MAX_FROM_CITY_KM = 60
BROADCAST_EVERY = 20         # lookups between interim updates of the pools
# matches that are never a venue: streets, boundaries, whole areas
NOT_A_VENUE = {"highway", "boundary"}
AREA_TYPES = {"city", "town", "village", "suburb", "neighbourhood", "quarter", "county", "state", "hamlet", "locality"}

Hit = tuple[float, float] | None   # coordinates, or None for a miss

# areas that aren't a place: "Socal", "1 Hour from Downtown Los Angeles", "TBA", ...
_VAGUE = re.compile(r"\b(socal|so cal|southern california|norcal|california|tba|tbd|secret|hours?|miles?|mins?|minutes?|from|near|outside|around|various)\b", re.I)


def is_vague_place(name: str | None) -> bool:
    """True for an area that names no single place (it mustn't be geocoded as a city)."""
    return bool(name) and bool(_VAGUE.search(name))


def candidates(venue: str | None, address: str | None, city: str | None) -> list[tuple[str, str]]:
    """(level, cache key) for each level this event can be looked up at, finest first."""
    out = []
    if address:
        out.append(("address", f"address:{address.strip().lower()}"))
    # a venue named only by digits ("1720") would match house numbers anywhere
    if venue and city and any(ch.isalpha() for ch in venue) and not is_vague_place(city):
        out.append(("venue", f"venue:{venue.strip().lower()}, {city.strip().lower()}"))
    if city and not is_vague_place(city):
        out.append(("city", f"city:{city.strip().lower()}"))
    return out


def best(cands: list[tuple[str, str]], cache: dict[str, Hit]) -> tuple[str, float, float] | None:
    """The finest cached hit, or None. Levels not yet looked up are skipped (for now)."""
    for level, key in cands:
        hit = cache.get(key)
        if hit:
            return level, hit[0], hit[1]
    return None


def _query_text(key: str) -> str:
    level, text = key.split(":", 1)
    return text if level == "address" else f"{text}, {REGION}"


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    rad = math.pi / 180
    dlat, dlon = (b[0] - a[0]) * rad, (b[1] - a[1]) * rad
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * rad) * math.cos(b[0] * rad) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


async def _load_cache(keys: set[str]) -> dict[str, Hit]:
    if not keys:
        return {}
    async with SessionLocal() as session:
        rows = (await session.execute(select(GeoCache.query, GeoCache.lat, GeoCache.lon).where(GeoCache.query.in_(keys)))).all()
    return {q: (lat, lon) if lat is not None and lon is not None else None for q, lat, lon in rows}


def _located(ev: dict[str, Any], level: str, lat: float, lon: float) -> None:
    ev.update(lat=lat, lon=lon, location_approximate=level == "city")
    ev["details"] = {**(ev.get("details") or {}), "located": level}


async def fill_from_cache(raw_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Give events without coordinates the finest location already in the cache."""
    todo = [ev for ev in raw_events if ev.get("lat") is None or ev.get("lon") is None]
    cands = {id(ev): candidates(ev.get("venue"), ev.get("address"), ev.get("city")) for ev in todo}
    cache = await _load_cache({k for cs in cands.values() for _, k in cs})
    for ev in todo:
        found = best(cands[id(ev)], cache)
        if found:
            _located(ev, *found)
    return raw_events


# --- background lookups ---

_lock = asyncio.Lock()
_again = False
_tasks: set[asyncio.Task] = set()


def start() -> None:
    """Look up missing places in the background (one run at a time; a call during a run
    makes it go round once more, for events that arrived meanwhile)."""
    global _again
    if _lock.locked():
        _again = True
        return
    task = asyncio.create_task(_run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def locate(venue: str | None, address: str | None, city: str | None) -> tuple[float, float] | None:
    """One place's exact spot (its address, else its named venue), looked up now if need be."""
    cands = candidates(venue, address, city)
    cache = await _load_cache({k for _, k in cands})
    if any(lv != "city" and k not in cache for lv, k in cands):
        async with _lock:  # one lookup a second, whoever asks
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
                city_key = next((k for lv, k in cands if lv == "city"), None)
                for level, key in ([("city", city_key)] if city_key else []) + [c for c in cands if c[0] != "city"]:
                    if key in cache:
                        if cache[key] and level != "city":
                            break
                        continue
                    hit, label = await _lookup(client, key, cache.get(city_key) if city_key and level != "city" else None)
                    cache[key] = hit
                    await _store(key, hit, label)
                    await asyncio.sleep(REQUEST_GAP_S)
                    if hit and level != "city":
                        break
        if _again:
            start()
    found = best([c for c in cands if c[0] != "city"], cache)
    return (found[1], found[2]) if found else None


async def _lookup(client: httpx.AsyncClient, key: str, city_centre: Hit) -> tuple[Hit, str | None]:
    level = key.split(":", 1)[0]
    res = await client.get(NOMINATIM, params={"q": _query_text(key), "format": "jsonv2", "limit": 5, "countrycodes": "us"})
    res.raise_for_status()
    for r in res.json():
        point = (float(r["lat"]), float(r["lon"]))
        if level == "venue" and (r.get("category") in NOT_A_VENUE or r.get("type") in AREA_TYPES):
            continue
        if level != "city" and city_centre and _km(point, city_centre) > MAX_FROM_CITY_KM:
            continue
        return point, r.get("display_name")
    return None, None


async def _run() -> None:
    global _again
    async with _lock:
        while True:
            _again = False
            try:
                await _resolve()
            except Exception:  # noqa: BLE001 - lookups are best effort; the next harvest retries
                log.exception("[geocode] lookups failed")
            if not _again:
                break


async def _resolve() -> None:
    from backend.services.triage import broadcast_pools  # avoids an import cycle

    async with SessionLocal() as session:
        rows = (await session.execute(
            select(Event.id, Event.venue, Event.address, Event.city, Event.details, Event.location_approximate)
            # never located, or located by us (a finer level may since have been looked up)
            .where(or_(Event.lat.is_(None), func.json_extract(Event.details, "$.located").is_not(None)))
        )).all()
    events = [(r, candidates(r.venue, r.address, r.city)) for r in rows]
    cache = await _load_cache({k for _, cs in events for _, k in cs})

    looked = 0
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
        for _, cands in events:
            for level, key in cands:
                if key in cache:
                    if cache[key]:
                        break       # the finest level with a hit is known
                    continue        # a known miss: try the next level
                # a venue or address is checked against its city's centre: look that up first
                city_key = next((k for lv, k in cands if lv == "city"), None)
                if level != "city" and city_key and city_key not in cache:
                    cache[city_key], label = await _lookup(client, city_key, None)
                    await _store(city_key, cache[city_key], label)
                    looked += 1
                    await asyncio.sleep(REQUEST_GAP_S)
                hit, label = await _lookup(client, key, cache.get(city_key) if city_key else None)
                cache[key] = hit
                await _store(key, hit, label)
                looked += 1
                await asyncio.sleep(REQUEST_GAP_S)
                if looked % BROADCAST_EVERY == 0 and await _apply(events, cache):
                    await broadcast_pools()
                if hit:
                    break
    if await _apply(events, cache):
        await broadcast_pools()
    if looked:
        log.info("[geocode] %d lookups", looked)


async def _store(key: str, hit: Hit, label: str | None) -> None:
    async with SessionLocal() as session:
        await session.merge(GeoCache(query=key, lat=hit[0] if hit else None, lon=hit[1] if hit else None, label=label))
        await session.commit()


async def _apply(events: list, cache: dict[str, Hit]) -> int:
    """Write each event's finest known location. Returns how many changed."""
    changed = 0
    async with SessionLocal() as session:
        for row, cands in events:
            found = best(cands, cache)
            if not found:
                continue
            level, lat, lon = found
            event = await session.get(Event, row.id)
            if event is None or (event.lat, event.lon, (event.details or {}).get("located")) == (lat, lon, level):
                continue
            ev = {"lat": event.lat, "lon": event.lon, "details": event.details, "location_approximate": event.location_approximate}
            _located(ev, level, lat, lon)
            event.lat, event.lon, event.location_approximate, event.details = ev["lat"], ev["lon"], ev["location_approximate"], ev["details"]
            changed += 1
        await session.commit()
    return changed
