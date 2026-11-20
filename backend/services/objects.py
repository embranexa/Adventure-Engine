"""Virtual objects (the Codex): pillars, sites and contacts that adventures link to.

    create / update / delete   an object (deleting also removes its links)
    link / unlink              attach an object to an adventure, or detach it

Rules:
    - only sites have a location (address, city, lat/lon); contacts keep email, phone
      and handle in `details`
    - an event links at most one site: linking another replaces it
    - a hand-made event takes its where from its site, so linking one clears the event's
      own where fields (crawled events keep their source's where; see queries.py)

Every change is broadcast: `objects`, and `adventures` when links or names changed.
"""

import uuid
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, select

from backend.db.base import SessionLocal
from backend.db.models import (
    GEO_OBJECT_TYPES, OBJECT_TYPES, WHEN_WHERE_TYPES, AdventureObject, VirtualObject,
)
from backend.db.queries import list_adventures, list_objects, object_to_dict
from backend.services.hub import hub
from backend.services.triage import NotFound, _get_adventure

LIMITS = {"name": 200, "description": 20_000, "address": 500, "city": 200}
CONTACT_DETAILS = {"email": 200, "phone": 60, "handle": 100}
LOCATION = ("address", "city", "lat", "lon")


class InvalidObject(Exception):
    pass


def _text(field: str, value: Any, limit: int) -> str | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    if len(text) > limit:
        raise InvalidObject(f"{field} is too long (max {limit} characters)")
    return text


def _apply(obj: VirtualObject, changes: dict[str, Any]) -> None:
    """Validate `changes` (only the fields sent) and write them onto the object."""
    if "type" in changes and changes["type"] != obj.type:
        if obj.type is not None:
            raise InvalidObject("an object's type can't change")
        if changes["type"] not in OBJECT_TYPES:
            raise InvalidObject(f"type must be one of {', '.join(OBJECT_TYPES)}")
        obj.type = changes["type"]

    if "name" in changes:
        name = _text("name", changes["name"], LIMITS["name"])
        if not name:
            raise InvalidObject("a name is required")
        obj.name = name
    if "description" in changes:
        obj.description = _text("description", changes["description"], LIMITS["description"])
    if "url" in changes:
        url = _text("url", changes["url"], 2000)
        if url and (urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc):
            raise InvalidObject("the link must be an http(s) address")
        obj.url = url

    geo = obj.type in GEO_OBJECT_TYPES
    sent = [f for f in LOCATION if changes.get(f) not in (None, "")]
    if sent and not geo:
        raise InvalidObject(f"only sites have a location ({', '.join(sent)})")
    for field in ("address", "city"):
        if field in changes:
            setattr(obj, field, _text(field, changes[field], LIMITS[field]))
    if "lat" in changes or "lon" in changes:
        lat, lon = changes.get("lat", obj.lat), changes.get("lon", obj.lon)
        if (lat is None) != (lon is None):
            raise InvalidObject("give both latitude and longitude, or neither")
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise InvalidObject("coordinates out of range")
        obj.lat, obj.lon = lat, lon

    if "details" in changes:
        details = dict(obj.details or {})
        for key, value in (changes["details"] or {}).items():
            if obj.type != "contact" or key not in CONTACT_DETAILS:
                raise InvalidObject(f"a {obj.type} has no {key}")
            text = _text(key, value, CONTACT_DETAILS[key])
            if text is None:
                details.pop(key, None)
            else:
                details[key] = text
        obj.details = details


async def _get_object(session, object_id: uuid.UUID) -> VirtualObject:
    obj = await session.get(VirtualObject, object_id)
    if not obj:
        raise NotFound(f"no object {object_id}")
    return obj


async def _broadcast(adventures_too: bool) -> None:
    async with SessionLocal() as session:
        await hub.broadcast("objects", objects=await list_objects(session))
        if adventures_too:
            await hub.broadcast("adventures", adventures=await list_adventures(session))


async def create_object(fields: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as session:
        obj = VirtualObject(id=uuid.uuid4(), type=None, details={})
        _apply(obj, {"name": fields.get("name") or f"New {fields.get('type', 'object')}", **fields})
        session.add(obj)
        await session.commit()
        result = object_to_dict(obj)
    await _broadcast(adventures_too=False)
    return result


async def update_object(object_id: uuid.UUID, changes: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as session:
        obj = await _get_object(session, object_id)
        _apply(obj, changes)
        await session.commit()
        result = object_to_dict(obj)
    # names and site locations show on linked adventures
    await _broadcast(adventures_too=True)
    return result


async def delete_object(object_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        obj = await _get_object(session, object_id)
        await session.execute(delete(AdventureObject).where(AdventureObject.object_id == object_id))
        await session.delete(obj)
        await session.commit()
    await _broadcast(adventures_too=True)


async def link(adventure_id: uuid.UUID, object_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        obj = await _get_object(session, object_id)
        if obj.type == "site" and adventure.type in WHEN_WHERE_TYPES:
            # an event happens at one site: replace any other
            others = select(VirtualObject.id).where(VirtualObject.type == "site", VirtualObject.id != obj.id)
            await session.execute(delete(AdventureObject).where(
                AdventureObject.adventure_id == adventure_id, AdventureObject.object_id.in_(others)))
            if adventure.event_id is None:  # hand-made: the site is its where now
                for field in ("venue", "address", "city", "lat", "lon"):
                    setattr(adventure, field, None)
        exists = await session.get(AdventureObject, (adventure_id, object_id))
        if not exists:
            session.add(AdventureObject(adventure_id=adventure_id, object_id=object_id))
        await session.commit()
    await _broadcast(adventures_too=True)


async def unlink(adventure_id: uuid.UUID, object_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        await _get_adventure(session, adventure_id)
        await session.execute(delete(AdventureObject).where(
            AdventureObject.adventure_id == adventure_id, AdventureObject.object_id == object_id))
        await session.commit()
    await _broadcast(adventures_too=True)


async def migrate_saved_places(places: list[dict[str, Any]]) -> int:
    """One-time: saved map places (app_state "places") become sites. Returns how many."""
    async with SessionLocal() as session:
        for place in places:
            session.add(VirtualObject(
                id=uuid.uuid4(), type="site", name=str(place.get("label") or "Place")[:200],
                lat=place.get("lat"), lon=place.get("lon"), details={},
            ))
        await session.commit()
    return len(places)


__all__ = ["InvalidObject", "create_object", "delete_object", "link", "migrate_saved_places",
           "unlink", "update_object"]
