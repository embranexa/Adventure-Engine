"""Adventures made and edited by hand (the node card's editor).

    create   a new adventure with no raw event, in ore (queued): an event, item or song
    update   set or clear the adventure's own fields (see models.Adventure); on a crawled
             adventure these win over the event's values, and clearing one shows the
             event's again

Items and songs have no when/where: those fields are refused for them, and cleared when
a hand-made adventure becomes one.
"""

import uuid
from typing import Any
from urllib.parse import urlparse

from backend.db.base import SessionLocal
from backend.db.models import ADVENTURE_FLAGS, ADVENTURE_TYPES, WHEN_WHERE_TYPES, Adventure
from backend.db.queries import list_adventures
from backend.services.hub import hub
from backend.services.triage import _get_adventure

TEXT_LIMITS = {"title": 500, "venue": 500, "address": 500, "city": 200, "timezone": 64, "description": 20_000,
               "costs": 5_000, "rewards": 5_000}
URL_FIELDS = ("url", "cover_url")
WHEN_WHERE = ("start_time", "end_time", "timezone", "all_day", "recurrence", "venue", "address", "city", "lat", "lon")


class InvalidAdventure(Exception):
    pass


def _text(field: str, value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) > TEXT_LIMITS[field]:
        raise InvalidAdventure(f"{field} is too long (max {TEXT_LIMITS[field]} characters)")
    return text


def _url(field: str, value: Any) -> str | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise InvalidAdventure(f"{field} must be an http(s) link")
    return text


def _apply(adventure: Adventure, changes: dict[str, Any]) -> None:
    """Validate `changes` (only the fields sent) and write them onto the adventure."""
    if "type" in changes:
        new_type = changes["type"]
        if new_type not in ADVENTURE_TYPES:
            raise InvalidAdventure(f"type must be one of {', '.join(ADVENTURE_TYPES)}")
        if new_type != adventure.type and adventure.event_id is not None:
            raise InvalidAdventure("a crawled adventure is always an event")
        adventure.type = new_type

    has_when_where = adventure.type in WHEN_WHERE_TYPES
    if not has_when_where:
        sent = [f for f in WHEN_WHERE if changes.get(f) not in (None, "")]
        if sent:
            article = "an" if adventure.type[0] in "aeiou" else "a"
            raise InvalidAdventure(f"{article} {adventure.type} has no when/where ({', '.join(sent)})")
        for field in WHEN_WHERE:  # e.g. a hand-made event turned into an item
            setattr(adventure, field, None)

    for field in ("title", "description", "venue", "address", "city", "timezone", "costs", "rewards"):
        if field in changes:
            setattr(adventure, field, _text(field, changes[field]))
    for field in URL_FIELDS:
        if field in changes:
            setattr(adventure, field, _url(field, changes[field]))
    for field in ("start_time", "end_time"):
        if field in changes:
            setattr(adventure, field, changes[field])
    if "flags" in changes:  # the whole set, kept in ADVENTURE_FLAGS order
        wanted = set(changes["flags"] or [])
        if wanted - set(ADVENTURE_FLAGS):
            raise InvalidAdventure(f"unknown flags: {', '.join(sorted(wanted - set(ADVENTURE_FLAGS)))}")
        adventure.flags = [f for f in ADVENTURE_FLAGS if f in wanted]
    if "all_day" in changes:
        adventure.all_day = bool(changes["all_day"]) or None
    if "recurrence" in changes:
        adventure.recurrence = _recurrence(changes["recurrence"])
    if "lat" in changes or "lon" in changes:
        lat, lon = changes.get("lat", adventure.lat), changes.get("lon", adventure.lon)
        if (lat is None) != (lon is None):
            raise InvalidAdventure("give both latitude and longitude, or neither")
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise InvalidAdventure("coordinates out of range")
        adventure.lat, adventure.lon = lat, lon

    start, end = adventure.start_time, adventure.end_time
    if start and end and end < start:
        raise InvalidAdventure("the end is before the start")
    if end and not start and adventure.event_id is None:
        raise InvalidAdventure("an end needs a start")
    if adventure.recurrence:
        if not start and adventure.event_id is None:
            raise InvalidAdventure("a weekly event needs a first date")
        until = adventure.recurrence.get("until")
        if until and start and until < start.date().isoformat():
            raise InvalidAdventure("a weekly event can't end before it starts")


def _recurrence(value: Any) -> dict[str, Any] | None:
    """A clean weekly recurrence, or None (null clears it). Pydantic already checked the shape."""
    if not value:
        return None
    raw = value if isinstance(value, dict) else value.model_dump()
    days = sorted({int(d) for d in raw.get("days") or []})
    if not days or any(d < 0 or d > 6 for d in days):
        raise InvalidAdventure("weekly days are 0 (Monday) to 6 (Sunday)")
    until = raw.get("until")
    return {"freq": "weekly", "days": days, "until": until.isoformat() if hasattr(until, "isoformat") else until}


async def _broadcast(adventure_id: uuid.UUID) -> dict[str, Any]:
    async with SessionLocal() as session:
        adventures = await list_adventures(session)
    await hub.broadcast("adventures", adventures=adventures)
    return next(a for a in adventures if a["id"] == str(adventure_id))


async def create_adventure(fields: dict[str, Any]) -> dict[str, Any]:
    """A hand-made adventure in ore. `fields` must include `type`."""
    async with SessionLocal() as session:
        adventure = Adventure(id=uuid.uuid4(), event_id=None, type="event", phase="queued", stats={})
        _apply(adventure, fields)
        if adventure.title is None:
            adventure.title = f"New {adventure.type}"
        session.add(adventure)
        await session.commit()
        adventure_id = adventure.id
    return await _broadcast(adventure_id)


async def update_adventure(adventure_id: uuid.UUID, changes: dict[str, Any]) -> dict[str, Any]:
    """Set or clear the adventure's own fields; returns the adventure as sent to browsers."""
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        _apply(adventure, changes)
        if adventure.event_id is None and adventure.title is None:
            raise InvalidAdventure("a hand-made adventure needs a title")
        await session.commit()
    return await _broadcast(adventure_id)


__all__ = ["InvalidAdventure", "create_adventure", "update_adventure"]
