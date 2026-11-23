"""Reads, and the JSON shapes sent to the frontend."""

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import WHEN_WHERE_TYPES, Adventure, AdventureEntity, Enshrining, Entity, Epitaph, Event, EventSource, Move


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def source_to_dict(s: EventSource) -> dict[str, Any]:
    return {
        "name": s.name,
        "url": s.url,
        "status": s.status,
        "last_sync_time": _iso(s.last_sync_time),
        "last_error": s.last_error,
    }


def event_to_dict(e: Event, source_name: str) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "source": source_name,
        "api_id": e.api_id,
        "title": e.title,
        "start": _iso(e.start_time),
        "end": _iso(e.end_time),
        "timezone": e.timezone,
        "url": e.url,
        "venue": e.venue,
        "address": e.address,
        "city": e.city,
        "lat": e.lat,
        "lon": e.lon,
        "location_approximate": e.location_approximate,
        "cover_url": e.cover_url,
        "details": e.details,
        "review": e.review,
        "all_day": False,       # crawled events are one-off and timed
        "recurrence": None,
    }


# Fields an adventure can set itself, over its event's (see Adventure). "When/where" ones
# are blanked for types that have none.
OWN_FIELDS = ("title", "description", "url", "cover_url")
WHEN_WHERE_FIELDS = ("start", "end", "timezone", "all_day", "recurrence", "venue", "address", "city", "lat", "lon")


def _own(a: Adventure) -> dict[str, Any]:
    """The adventure's own field values, keyed like event_to_dict (null = not set)."""
    return {
        "title": a.title, "description": a.description, "url": a.url, "cover_url": a.cover_url,
        "start": _iso(a.start_time), "end": _iso(a.end_time), "timezone": a.timezone,
        "all_day": a.all_day, "recurrence": a.recurrence,
        "venue": a.venue, "address": a.address, "city": a.city, "lat": a.lat, "lon": a.lon,
    }


def entity_to_dict(o: Entity) -> dict[str, Any]:
    return {
        "id": str(o.id), "type": o.type, "name": o.name, "description": o.description, "url": o.url,
        "address": o.address, "city": o.city, "lat": o.lat, "lon": o.lon, "details": o.details or {},
        "color": o.color, "created_at": _iso(o.created_at),
    }


async def list_entities(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.scalars(select(Entity).order_by(Entity.type, func.lower(Entity.name)))
    return [entity_to_dict(o) for o in rows.all()]


def enshrining_to_dict(r: Enshrining, moves: list[Move]) -> dict[str, Any]:
    return {
        "verdict": [r.outcome, r.thrill] if r.outcome is not None and r.thrill is not None else None,
        "link": r.link, "notes": r.notes or "", "gains": r.gains or [], "losses": r.losses or [],
        "discoveries": r.discoveries or [],
        "moves": [{"text": m.text, "grade": m.grade, "better": m.better, "skills": m.skills or []} for m in moves],
        "sealed_at": _iso(r.sealed_at), "amended_at": _iso(r.amended_at),
    }


def adventure_to_dict(
    a: Adventure, e: Event | None, source_name: str | None, entities: list[Entity] = (),
    epitaph: Epitaph | None = None, enshrining: Enshrining | None = None, moves: list[Move] = (),
) -> dict[str, Any]:
    """An adventure, flattened: its own fields over its linked event's (read through).

    `id` is the adventure's id; the raw event's id is `event_id`. The shape matches
    event_to_dict, so the calendar, Atlas and Refinery can show either. `own` holds just
    the adventure's own values, which is what the Refinery edits. `entities` are its linked
    entities; a hand-made event takes its where from its linked site.
    """
    base = event_to_dict(e, source_name or "") if e else {
        "id": None, "source": None, "api_id": None, "title": "Untitled adventure",
        "start": None, "end": None, "timezone": None, "url": None, "venue": None,
        "address": None, "city": None, "lat": None, "lon": None,
        "location_approximate": False, "cover_url": None, "details": {}, "review": None,
        "all_day": False, "recurrence": None,
    }
    base.setdefault("description", None)
    own = _own(a)
    merged = {**base, **{k: v for k, v in own.items() if v is not None}}
    if own["lat"] is not None or own["venue"] is not None or own["address"] is not None:
        merged["location_approximate"] = False  # set by hand: it's exact
    site = next((o for o in entities if o.type == "site"), None)
    if site and e is None and a.type in WHEN_WHERE_TYPES:  # hand-made event: where = its site
        merged.update({"venue": site.name, "address": site.address, "city": site.city,
                       "lat": site.lat, "lon": site.lon, "location_approximate": False})
    if a.type not in WHEN_WHERE_TYPES:
        merged.update({k: None for k in WHEN_WHERE_FIELDS})
        merged["location_approximate"] = False
    return {
        **merged,
        "id": str(a.id),
        "event_id": str(e.id) if e else None,
        "own": own,
        "entities": [{"id": str(o.id), "type": o.type, "name": o.name} for o in entities],
        "site_id": str(site.id) if site else None,
        "type": a.type,
        "phase": a.phase,
        "phase_before_kill": a.phase_before_kill,
        "phase_changed_at": _iso(a.phase_changed_at),
        "epitaph": {"cause": epitaph.cause, "note": epitaph.note} if epitaph else None,
        "enshrining": enshrining_to_dict(enshrining, moves) if enshrining else None,
        "stats": a.stats,
        "flags": a.flags or [],
        "roadmap": a.roadmap,
        "costs": a.costs,
        "rewards": a.rewards,
    }


async def list_events(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(Event, EventSource.name)
        .join(EventSource, Event.source_id == EventSource.id)
        .order_by(Event.start_time)
    )
    return [event_to_dict(e, name) for e, name in rows.all()]


async def list_adventures(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(Adventure, Event, EventSource.name)
        .outerjoin(Event, Adventure.event_id == Event.id)
        .outerjoin(EventSource, Event.source_id == EventSource.id)
        .order_by(
            func.coalesce(Adventure.start_time, Event.start_time).is_(None),
            func.coalesce(Adventure.start_time, Event.start_time),
            Adventure.created_at,
        )
    )
    links: dict[Any, list[Entity]] = {}
    for adventure_id, obj in (await session.execute(
        select(AdventureEntity.adventure_id, Entity)
        .join(Entity, AdventureEntity.entity_id == Entity.id)
        .order_by(Entity.type, func.lower(Entity.name))
    )).all():
        links.setdefault(adventure_id, []).append(obj)
    epitaphs = {r.adventure_id: r for r in (await session.scalars(select(Epitaph))).all()}
    enshrinings = {r.adventure_id: r for r in (await session.scalars(select(Enshrining))).all()}
    moves: dict[Any, list[Move]] = {}
    for m in (await session.scalars(select(Move).order_by(Move.adventure_id, Move.position))).all():
        moves.setdefault(m.adventure_id, []).append(m)
    return [adventure_to_dict(a, e, name, links.get(a.id, []), epitaphs.get(a.id), enshrinings.get(a.id), moves.get(a.id, []))
            for a, e, name in rows.all()]


async def list_sources(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.scalars(select(EventSource).order_by(EventSource.name))
    return [source_to_dict(s) for s in rows.all()]


async def get_source(session: AsyncSession, name: str) -> dict[str, Any] | None:
    source = await session.scalar(select(EventSource).where(EventSource.name == name))
    return source_to_dict(source) if source else None
