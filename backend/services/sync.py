"""Harvest: runs a source's crawler in the background and stores what it finds.

Flow for one harvest (a "sync" in the API):
    status -> syncing (broadcast)
    crawler.fetch_events()  -> locate from the geocache -> validate each event -> upsert into `events`
        events never seen before go into the source's Harvester ("harvested");
        ones already known are refreshed and keep their review state
    status -> idle | failed (broadcast), then broadcast the full event list
"""

import asyncio
import logging
import uuid
from typing import Any

import httpx
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert

from backend.crawlers import CRAWLERS
from backend.db.base import SessionLocal, utcnow
from backend.db.models import EVENT_FIELDS, OUTSIDE_NODE, Event, EventSource, harvester_node
from backend.db.queries import get_source
from backend.schemas.events import EventIn
from backend.services import geocode
from backend.services.hub import hub
from backend.services.transitions import record_many
from backend.services.triage import broadcast_pools, sweep_missed

log = logging.getLogger(__name__)

USER_AGENT = "adventure-engine/0.1"

_locks: dict[str, asyncio.Lock] = {name: asyncio.Lock() for name in CRAWLERS}
_tasks: set[asyncio.Task] = set()  # keep references so running tasks aren't garbage-collected


def is_syncing(name: str) -> bool:
    return _locks[name].locked()


def start_sync(name: str) -> bool:
    """Start a background sync. Returns False if one is already running for `name`."""
    if is_syncing(name):
        return False
    task = asyncio.create_task(sync_source(name))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return True


async def _set_status(name: str, **values: Any) -> None:
    async with SessionLocal() as session:
        await session.execute(update(EventSource).where(EventSource.name == name).values(**values))
        await session.commit()
        source = await get_source(session, name)
        if source:
            await hub.broadcast("source_status", source=source)


def _validate(raw_events: list[dict[str, Any]], name: str) -> list[EventIn]:
    """Keep valid events (first occurrence per api_id); log and skip the rest."""
    valid: dict[str, EventIn] = {}
    for raw in raw_events:
        try:
            ev = EventIn.model_validate(raw)
        except ValidationError as e:
            log.warning("[%s] skipping invalid event %r: %s", name, raw.get("api_id"), e.errors()[:2])
            continue
        valid.setdefault(ev.api_id, ev)
    return list(valid.values())


async def _upsert(name: str, events: list[EventIn]) -> tuple[int, int]:
    """Insert new events (into the Harvester) and refresh existing ones (prices, guest
    counts change). Returns (stored, new)."""
    if not events:
        return 0, 0
    now = utcnow()
    async with SessionLocal() as session:
        source_id = await session.scalar(select(EventSource.id).where(EventSource.name == name))
        known = set((await session.scalars(select(Event.api_id).where(
            Event.source_id == source_id, Event.api_id.in_([ev.api_id for ev in events])))).all())
        rows = [
            {
                **ev.model_dump(mode="python", include=set(EVENT_FIELDS)),
                "url": str(ev.url),
                "id": uuid.uuid4(),
                "source_id": source_id,
                "first_seen": now,
                "updated_at": now,
                "review": "harvested",  # new rows only: the conflict update below leaves it
            }
            for ev in events
        ]
        stmt = insert(Event).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["source_id", "api_id"],
            # keep id, first_seen and review; refresh everything the crawler provides
            set_={f: stmt.excluded[f] for f in (*EVENT_FIELDS, "updated_at")},
        )
        await session.execute(stmt)
        # the generated ids of new rows are their real ids (known rows kept their old ones)
        fresh = [r["id"] for r in rows if r["api_id"] not in known]
        record_many(session, "event", fresh, OUTSIDE_NODE, harvester_node(name))
        await session.commit()
    return len(rows), len(fresh)


async def sync_source(name: str) -> None:
    crawler = CRAWLERS[name]
    async with _locks[name]:
        log.info("[%s] sync started", name)
        await _set_status(name, status="syncing")
        try:
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
                raw_events = await crawler.fetch_events(client)
            raw_events = await geocode.fill_from_cache(raw_events)  # places looked up before
            count, fresh = await _upsert(name, _validate(raw_events, name))
        except Exception as e:  # noqa: BLE001 - any crawler failure becomes a 'failed' status
            log.exception("[%s] sync failed", name)
            await _set_status(name, status="failed", last_error=f"{type(e).__name__}: {e}")
            return

        log.info("[%s] harvest done: %d new, %d stored (%d fetched)", name, fresh, count, len(raw_events))
        await _set_status(name, status="idle", last_sync_time=utcnow(), last_error=None)
        # event times may have changed: check for missed adventures, then send both pools
        # (adventures read their event's fields, so they change too)
        await sweep_missed()
        await broadcast_pools()
        geocode.start()  # look up places not in the cache yet (background)
