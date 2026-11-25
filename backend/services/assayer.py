"""The Assayer: specimens out of the Centrifuge, read one at a time, and back as ore (or as
specimens that say what they lack and why).

    start      send specimens in (those still new; ones tried lately only if asked for singly)
    stop       everything waiting goes back
    set_cover  a cover by hand, kept through later runs

What it finds is the event's `assay` column (backend/services/assay.py reads the pages).
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select

from backend.db.base import SessionLocal, utcnow
from backend.db.models import ASSAYER_NODE, CENTRIFUGE_NODE, Event, EventSource
from backend.db.queries import event_to_dict, list_events
from backend.services import assay
from backend.services.hub import hub
from backend.services.transitions import record, record_many
from backend.services.triage import InvalidTransition, _get_event

log = logging.getLogger(__name__)

PACE_S = 0.5  # the least time one takes, so each can be seen going back
BY_HAND = "by hand"
_task: asyncio.Task | None = None


async def _broadcast() -> None:
    async with SessionLocal() as session:
        await hub.broadcast("events", events=await list_events(session))


def _tried(e: Event) -> bool:
    at = (e.assay or {}).get("at")
    return bool(at) and utcnow() - datetime.fromisoformat(at) < assay.REST


async def start(ids: list[uuid.UUID], again: bool = False) -> list[uuid.UUID]:
    global _task
    async with SessionLocal() as session:
        rows = (await session.execute(select(Event, EventSource.name).join(EventSource, Event.source_id == EventSource.id)
                                      .where(Event.id.in_(ids), Event.review == "new"))).all()
        going = [e for e, name in rows if (again or not _tried(e)) and event_to_dict(e, name)["missing"]]
        for e in going:
            e.review = "assaying"
        moved = [e.id for e in going]
        record_many(session, "event", moved, CENTRIFUGE_NODE, ASSAYER_NODE)
        await session.commit()
    if moved:
        await _broadcast()
        if _task is None or _task.done():
            _task = asyncio.create_task(_work())
    return moved


async def _work() -> None:
    while True:
        async with SessionLocal() as session:
            row = (await session.execute(select(Event.id, Event.url, Event.start_time, Event.title, Event.city)
                                         .where(Event.review == "assaying").order_by(Event.start_time).limit(1))).first()
        if row is None:
            return
        try:
            found, _ = await asyncio.gather(assay.look(row.url, row.start_time, row.title, row.city), asyncio.sleep(PACE_S))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - one bad page mustn't stop the rest
            log.exception("[assayer] %s", row.url)
            found = {"outcome": "error", "why": "it couldn't be read", "url": row.url, "fields": {}, "sources": {}}
        await _finish(row.id, found)


def merge(before: dict[str, Any] | None, found: dict[str, Any]) -> dict[str, Any]:
    """The new findings over the old; what was set by hand stays."""
    old, fields, sources = before or {}, assay.to_json(found["fields"]), dict(found["sources"])
    for k, source in (old.get("sources") or {}).items():
        if source == BY_HAND or k not in fields:  # a page that stopped answering loses nothing
            fields[k], sources[k] = (old.get("fields") or {}).get(k), source
    return {"at": utcnow().isoformat(), "outcome": found["outcome"], "why": found["why"], "url": found["url"], "fields": fields, "sources": sources}


async def _finish(event_id: uuid.UUID, found: dict[str, Any]) -> None:
    async with SessionLocal() as session:
        event = await session.get(Event, event_id)
        if event is None:
            return
        event.assay = merge(event.assay, found)
        if event.review == "assaying":  # else it was passed or ignored meanwhile
            event.review = "new"
            record(session, "event", event.id, ASSAYER_NODE, CENTRIFUGE_NODE)
        await session.commit()
    await _broadcast()


async def empty() -> list[uuid.UUID]:
    """Everything waiting goes back to the Centrifuge."""
    async with SessionLocal() as session:
        rows = (await session.scalars(select(Event).where(Event.review == "assaying"))).all()
        for e in rows:
            e.review = "new"
        ids = [e.id for e in rows]
        record_many(session, "event", ids, ASSAYER_NODE, CENTRIFUGE_NODE)
        await session.commit()
    return ids


async def stop() -> list[uuid.UUID]:
    global _task
    if _task and not _task.done():
        _task.cancel()
        await asyncio.gather(_task, return_exceptions=True)
    _task = None
    ids = await empty()
    if ids:
        await _broadcast()
    return ids


async def set_cover(event_id: uuid.UUID, url: str | None) -> None:
    """A cover by hand; None takes it away."""
    url = (url or "").strip()
    if url and (urlsplit(url).scheme not in ("http", "https") or not urlsplit(url).netloc or len(url) > 2000):
        raise InvalidTransition("a cover is an http(s) link to an image")
    async with SessionLocal() as session:
        event = await _get_event(session, event_id)
        a = dict(event.assay or {"at": None, "outcome": None, "why": None, "url": event.url})
        a["fields"], a["sources"] = dict(a.get("fields") or {}), dict(a.get("sources") or {})
        for d in (a["fields"], a["sources"]):
            d.pop("cover_url", None)
        if url:
            a["fields"]["cover_url"], a["sources"]["cover_url"] = url, BY_HAND
        event.assay = a
        await session.commit()
    await _broadcast()
