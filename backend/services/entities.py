"""Entities (the Codex): deities, sites, players, organizations and skills that adventures link to.

    create / update / delete   an entity (deleting also removes its links)
    link / unlink              attach an entity to an adventure, or detach it
    set_entity_link            between entities: a player's affinity, or a site's warden

Rules:
    - only sites have a location (address, city, lat/lon); players keep email, phone,
      handle, archetype, warmth and tags in `details`
    - a player linked to an adventure joins its party as resonant (services/party.py)
    - an event links at most one site: linking another replaces it
    - a hand-made event takes its where from its site, so linking one clears the event's
      own where fields (crawled events keep their source's where; see queries.py)

Every change is broadcast: `entities`, and `adventures` when links or names changed.
Links and unlinks are logged as transitions (codex <-> refinery); links removed with a
delete statement are recorded here, since the automatic recorder only sees ORM objects.
"""

import re
import uuid
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, select

from backend.db.base import SessionLocal, utcnow
from backend.db.models import (
    AFFINITY_TYPES, ARCHETYPES, CODEX_NODE, GEO_ENTITY_TYPES, ENTITY_TYPES, PHASE_NODES, STEWARD_TYPES, WHEN_WHERE_TYPES,
    AdventureEntity, Entity, EntityLink, PartyLog, Steward,
)
from backend.db.queries import list_adventures, get_entity, list_entities
from backend.services.hub import hub
from backend.services.transitions import record
from backend.services.triage import NotFound, _get_adventure

LIMITS = {"name": 200, "description": 20_000, "address": 500, "city": 200}
PLAYER_DETAILS = {"email": 200, "phone": 60, "handle": 100}
LOCATION = ("address", "city", "lat", "lon")


class InvalidEntity(Exception):
    pass


def _text(field: str, value: Any, limit: int) -> str | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    if len(text) > limit:
        raise InvalidEntity(f"{field} is too long (max {limit} characters)")
    return text


def _player_detail(entity_type: str, key: str, value: Any) -> Any:
    """One checked `details` value (None clears it)."""
    if entity_type != "player" or key not in (*PLAYER_DETAILS, "archetype", "warmth", "tags"):
        raise InvalidEntity(f"a {entity_type} has no {key}")
    if key in PLAYER_DETAILS:
        return _text(key, value, PLAYER_DETAILS[key])
    if value in (None, ""):
        return None
    if key == "archetype":
        if value not in ARCHETYPES:
            raise InvalidEntity(f"archetype must be one of {', '.join(ARCHETYPES)}")
        return value
    if key == "warmth":
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 5:
            raise InvalidEntity("warmth is a whole number from 0 to 5")
        return value
    if not isinstance(value, list) or len(value) > 20:
        raise InvalidEntity("tags are a list of up to 20")
    return list(dict.fromkeys(t for t in ((_text("a tag", v, 40) or "").lower() for v in value) if t))


def _apply(entity: Entity, changes: dict[str, Any]) -> None:
    """Validate `changes` (only the fields sent) and write them onto the entity."""
    if "type" in changes and changes["type"] != entity.type:
        if entity.type is not None:
            raise InvalidEntity("an entity's type can't change")
        if changes["type"] not in ENTITY_TYPES:
            raise InvalidEntity(f"type must be one of {', '.join(ENTITY_TYPES)}")
        entity.type = changes["type"]

    if "name" in changes:
        name = _text("name", changes["name"], LIMITS["name"])
        if not name:
            raise InvalidEntity("a name is required")
        entity.name = name
    if "description" in changes:
        entity.description = _text("description", changes["description"], LIMITS["description"])
    if "color" in changes:
        color = (changes["color"] or "").strip().lower() or None
        if color and not re.fullmatch(r"#[0-9a-f]{6}", color):
            raise InvalidEntity('a colour is written "#rrggbb"')
        entity.color = color
    if "url" in changes:
        url = _text("url", changes["url"], 2000)
        if url and (urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc):
            raise InvalidEntity("the link must be an http(s) address")
        entity.url = url

    geo = entity.type in GEO_ENTITY_TYPES
    sent = [f for f in LOCATION if changes.get(f) not in (None, "")]
    if sent and not geo:
        raise InvalidEntity(f"only sites have a location ({', '.join(sent)})")
    for field in ("address", "city"):
        if field in changes:
            setattr(entity, field, _text(field, changes[field], LIMITS[field]))
    if "lat" in changes or "lon" in changes:
        lat, lon = changes.get("lat", entity.lat), changes.get("lon", entity.lon)
        if (lat is None) != (lon is None):
            raise InvalidEntity("give both latitude and longitude, or neither")
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise InvalidEntity("coordinates out of range")
        entity.lat, entity.lon = lat, lon

    if "details" in changes:
        details = dict(entity.details or {})
        for key, value in (changes["details"] or {}).items():
            clean = _player_detail(entity.type, key, value)
            if clean in (None, []):
                details.pop(key, None)
            else:
                details[key] = clean
        entity.details = details


async def _delete_links(session, *where) -> None:
    """Delete the links matching `where`, recording each as an unlink (refinery -> codex)."""
    links = (await session.execute(
        select(AdventureEntity.adventure_id, AdventureEntity.entity_id, AdventureEntity.status).where(*where))).all()
    for adventure_id, entity_id, status in links:
        if status:  # a player leaves the party
            session.add(PartyLog(adventure_id=adventure_id, player_id=entity_id, from_status=status, to_status=None))
        record(session, "link", entity_id, PHASE_NODES["classifying"], CODEX_NODE, ref_id=adventure_id)
    if links:
        await session.execute(delete(AdventureEntity).where(*where))


async def _get_entity(session, entity_id: uuid.UUID) -> Entity:
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise NotFound(f"no entity {entity_id}")
    return entity


async def _broadcast(adventures_too: bool) -> None:
    async with SessionLocal() as session:
        await hub.broadcast("entities", entities=await list_entities(session))
        if adventures_too:
            await hub.broadcast("adventures", adventures=await list_adventures(session))


async def create_entity(fields: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as session:
        entity = Entity(id=uuid.uuid4(), type=None, details={})
        _apply(entity, {"name": fields.get("name") or f"New {fields.get('type', 'entity')}", **fields})
        session.add(entity)
        await session.commit()
        result = await get_entity(session, entity)
    await _broadcast(adventures_too=False)
    return result


async def update_entity(entity_id: uuid.UUID, changes: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as session:
        entity = await _get_entity(session, entity_id)
        _apply(entity, changes)
        await session.commit()
        result = await get_entity(session, entity)
    # names and site locations show on linked adventures
    await _broadcast(adventures_too=True)
    return result


async def delete_entity(entity_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        entity = await _get_entity(session, entity_id)
        await _delete_links(session, AdventureEntity.entity_id == entity_id)
        await session.execute(delete(EntityLink).where((EntityLink.from_id == entity_id) | (EntityLink.to_id == entity_id)))
        await session.execute(delete(Steward).where(Steward.entity_id == entity_id))
        await session.execute(delete(PartyLog).where(PartyLog.player_id == entity_id))
        await session.delete(entity)
        await session.commit()
    await _broadcast(adventures_too=True)


def add_link(session, adventure_id: uuid.UUID, entity: Entity, status: str = "resonant") -> AdventureEntity:
    """A new link; a player joins the party with `status`."""
    row = AdventureEntity(adventure_id=adventure_id, entity_id=entity.id)
    if entity.type == "player":
        row.status, row.status_at = status, utcnow()
        session.add(PartyLog(adventure_id=adventure_id, player_id=entity.id, from_status=None, to_status=status))
    session.add(row)
    return row


async def set_entity_link(from_id: uuid.UUID, to_id: uuid.UUID, role: str, on: bool) -> None:
    """Add or remove a link between entities (EntityLink says which are allowed)."""
    async with SessionLocal() as session:
        a, b = await _get_entity(session, from_id), await _get_entity(session, to_id)
        row = await session.get(EntityLink, (from_id, to_id, role))
        if on and row is None:
            if role == "affinity" and (a.type != "player" or b.type not in AFFINITY_TYPES):
                raise InvalidEntity(f"a {a.type} can't have an affinity with a {b.type}")
            if role == "warden" and (a.type not in STEWARD_TYPES or b.type != "site"):
                raise InvalidEntity("a warden is a player or organization, and keeps a site")
            session.add(EntityLink(from_id=from_id, to_id=to_id, role=role))
        elif not on and row is not None:
            await session.delete(row)
        await session.commit()
    await _broadcast(adventures_too=False)


async def link(adventure_id: uuid.UUID, entity_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        entity = await _get_entity(session, entity_id)
        if entity.type == "site" and adventure.type in WHEN_WHERE_TYPES:
            # an event happens at one site: replace any other
            others = select(Entity.id).where(Entity.type == "site", Entity.id != entity.id)
            await _delete_links(session, AdventureEntity.adventure_id == adventure_id,
                                AdventureEntity.entity_id.in_(others))
            if adventure.event_id is None:  # hand-made: the site is its where now
                for field in ("venue", "address", "city", "lat", "lon"):
                    setattr(adventure, field, None)
        exists = await session.get(AdventureEntity, (adventure_id, entity_id))
        if not exists:
            add_link(session, adventure_id, entity)
        await session.commit()
    await _broadcast(adventures_too=True)


async def unlink(adventure_id: uuid.UUID, entity_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        await _get_adventure(session, adventure_id)
        row = await session.get(AdventureEntity, (adventure_id, entity_id))
        if row and row.nudge:  # its aftermath goes with it (services/party.py)
            player = await _get_entity(session, entity_id)
            warmth = (player.details or {}).get("warmth", 0) - row.nudge
            player.details = {**(player.details or {}), "warmth": max(0, min(5, warmth))}
        await _delete_links(session, AdventureEntity.adventure_id == adventure_id,
                            AdventureEntity.entity_id == entity_id)
        await session.commit()
    await _broadcast(adventures_too=True)


async def migrate_saved_places(places: list[dict[str, Any]]) -> int:
    """One-time: saved map places (app_state "places") become sites. Returns how many."""
    async with SessionLocal() as session:
        for place in places:
            session.add(Entity(
                id=uuid.uuid4(), type="site", name=str(place.get("label") or "Place")[:200],
                lat=place.get("lat"), lon=place.get("lon"), details={},
            ))
        await session.commit()
    return len(places)


__all__ = ["InvalidEntity", "add_link", "create_entity", "delete_entity", "link", "migrate_saved_places",
           "set_entity_link", "unlink", "update_entity"]
