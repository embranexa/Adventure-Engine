"""Moving matter through the refinery: review raw events and change adventure phases.

Rules (resources/classifier.md, section 4):
    feed     a source's harvested events -> new (Harvester -> Centrifuge)
    siphon   a source's new events       -> harvested (Centrifuge -> Harvester)
    purge    every new event             -> ignored (Centrifuge -> Sump)
    siphon / purge by id: the same moves for chosen new events (the ones a Discovery
             pass-through leaves out: see siphon_events / purge_events)
    move     chosen events between harvested / new / ignored (undoing a bulk transfer)
    pass     new raw event            -> passed;  new adventure in the Hopper (queued)
    ignore   new raw event            -> ignored (Sump)
    revive   ignored raw event        -> its killed adventure is restored (passed), else the
                                         event goes back to the Centrifuge (new) for another look
    kill     adventure (any phase)    -> killed (Necropolis); its raw event -> ignored; data kept
    phase    adventure, by hand       -> any of MANUAL_PHASES, or completed -> decommissioned
                                         (moving back out of the Treasury unseals its enshrining)
    missed   pre-Arena adventure whose event has ended -> killed (automatic, see sweep_missed),
             with the epitaph "missed"

Every change is followed by a broadcast of the updated lists. Moves are logged as
transitions: automatically for single rows, explicitly for the bulk ones (feed, siphon,
purge), see services/transitions.py.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import (
    CENTRIFUGE_NODE, MANUAL_PHASES, PRE_ARENA_PHASES, PHASES, SUMP_NODE, WHEN_WHERE_TYPES, Adventure, Enshrining, Epitaph,
    Event, EventSource, harvester_node,
)
from backend.db.queries import list_adventures, list_events
from backend.services.hub import hub
from backend.services.transitions import record_many

log = logging.getLogger(__name__)

SWEEP_INTERVAL_S = 300  # how often to check for missed adventures


class NotFound(Exception):
    pass


class InvalidTransition(Exception):
    pass


async def broadcast_pools() -> None:
    """Send both pools to every browser after a change."""
    async with SessionLocal() as session:
        await hub.broadcast("events", events=await list_events(session))
        await hub.broadcast("adventures", adventures=await list_adventures(session))


async def _get_event(session: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await session.get(Event, event_id)
    if not event:
        raise NotFound(f"no raw event {event_id}")
    return event


async def _get_adventure(session: AsyncSession, adventure_id: uuid.UUID) -> Adventure:
    adventure = await session.get(Adventure, adventure_id)
    if not adventure:
        raise NotFound(f"no adventure {adventure_id}")
    return adventure


def _set_phase(adventure: Adventure, phase: str) -> None:
    adventure.phase = phase
    adventure.phase_changed_at = utcnow()


def _restore(adventure: Adventure) -> None:
    """Bring a killed adventure back to the phase it was killed from."""
    _set_phase(adventure, adventure.phase_before_kill or "queued")
    adventure.phase_before_kill = None


# --- harvesters and the centrifuge (bulk) ---

async def _source_id(session: AsyncSession, name: str) -> uuid.UUID:
    source_id = await session.scalar(select(EventSource.id).where(EventSource.name == name))
    if source_id is None:
        raise NotFound(f"no source {name}")
    return source_id


async def _move(session: AsyncSession, where, review: str, values: dict) -> list[uuid.UUID]:
    """Set every event matching `where` to `review`; returns the ids that moved."""
    ids = list((await session.scalars(select(Event.id).where(*where))).all())
    if ids:
        await session.execute(update(Event).where(Event.id.in_(ids)).values(review=review, **values))
    return ids


async def feed_source(name: str) -> list[uuid.UUID]:
    """Harvester -> Centrifuge: a source's harvested events become new (shown in Discovery)."""
    async with SessionLocal() as session:
        source_id = await _source_id(session, name)
        ids = await _move(session, (Event.source_id == source_id, Event.review == "harvested"), "new", {})
        record_many(session, "event", ids, harvester_node(name), CENTRIFUGE_NODE)
        await session.commit()
    if ids:
        await broadcast_pools()
    return ids


async def siphon_source(name: str) -> list[uuid.UUID]:
    """Centrifuge -> Harvester: a source's new events go back to waiting in its harvester."""
    async with SessionLocal() as session:
        source_id = await _source_id(session, name)
        ids = await _move(session, (Event.source_id == source_id, Event.review == "new"), "harvested", {})
        record_many(session, "event", ids, CENTRIFUGE_NODE, harvester_node(name))
        await session.commit()
    if ids:
        await broadcast_pools()
    return ids


async def purge_centrifuge() -> list[uuid.UUID]:
    """Centrifuge -> Sump: every event still new becomes ignored (each can be revived)."""
    async with SessionLocal() as session:
        ids = await _move(session, (Event.review == "new",), "ignored", {"reviewed_at": utcnow()})
        record_many(session, "event", ids, CENTRIFUGE_NODE, SUMP_NODE)
        await session.commit()
    if ids:
        await broadcast_pools()
    return ids


async def siphon_events(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Centrifuge -> Harvester for chosen events: each still-new one goes back to its
    own source's harvester (the rest of `ids` is left alone)."""
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(Event.id, EventSource.name).join(EventSource, Event.source_id == EventSource.id)
            .where(Event.id.in_(ids), Event.review == "new"))).all()
        if rows:
            await session.execute(update(Event).where(Event.id.in_([r.id for r in rows])).values(review="harvested"))
            by_source: dict[str, list[uuid.UUID]] = {}
            for r in rows:
                by_source.setdefault(r.name, []).append(r.id)
            for name, moved in by_source.items():
                record_many(session, "event", moved, CENTRIFUGE_NODE, harvester_node(name))
        await session.commit()
    if rows:
        await broadcast_pools()
    return [r.id for r in rows]


async def purge_events(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Centrifuge -> Sump for chosen events (only those still new)."""
    async with SessionLocal() as session:
        moved = await _move(session, (Event.id.in_(ids), Event.review == "new"), "ignored", {"reviewed_at": utcnow()})
        record_many(session, "event", moved, CENTRIFUGE_NODE, SUMP_NODE)
        await session.commit()
    if moved:
        await broadcast_pools()
    return moved


# review state -> the node holding events in it (harvested: the source's own harvester)
_HOLDERS = {"new": lambda src: CENTRIFUGE_NODE, "ignored": lambda src: SUMP_NODE, "harvested": harvester_node}


async def move_events(ids: list[uuid.UUID], from_review: str, to_review: str) -> list[uuid.UUID]:
    """Move chosen events between the harvesters, the Centrifuge and the Sump: those of
    `ids` still in `from_review` go to `to_review` (others have moved on: left alone).
    Used to undo a bulk transfer."""
    if from_review not in _HOLDERS or to_review not in _HOLDERS or from_review == to_review:
        raise InvalidTransition(f"can't move events from {from_review} to {to_review}")
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(Event.id, EventSource.name).join(EventSource, Event.source_id == EventSource.id)
            .where(Event.id.in_(ids), Event.review == from_review))).all()
        if rows:
            values = {"reviewed_at": utcnow() if to_review == "ignored" else None}
            await session.execute(update(Event).where(Event.id.in_([r.id for r in rows])).values(review=to_review, **values))
            for r in rows:
                record_many(session, "event", [r.id], _HOLDERS[from_review](r.name), _HOLDERS[to_review](r.name))
        await session.commit()
    if rows:
        await broadcast_pools()
    return [r.id for r in rows]


# --- raw events ---

async def pass_event(event_id: uuid.UUID) -> str:
    """Prima materia -> ore. Returns the new adventure's id."""
    async with SessionLocal() as session:
        event = await _get_event(session, event_id)
        if event.review != "new":
            raise InvalidTransition(f"can only pass a new event (this one is {event.review})")
        existing = await session.scalar(select(Adventure).where(Adventure.event_id == event.id))
        if existing:  # shouldn't happen for a new event, but never create a second link
            raise InvalidTransition("this event already has an adventure")
        adventure = Adventure(event_id=event.id, type="event", phase="queued")
        session.add(adventure)
        event.review, event.reviewed_at = "passed", utcnow()
        await session.commit()
        adventure_id = str(adventure.id)
    await broadcast_pools()
    return adventure_id


async def ignore_event(event_id: uuid.UUID) -> None:
    """Prima materia -> dross (Sump)."""
    async with SessionLocal() as session:
        event = await _get_event(session, event_id)
        if event.review != "new":
            raise InvalidTransition(f"can only ignore a new event (this one is {event.review})")
        event.review, event.reviewed_at = "ignored", utcnow()
        await session.commit()
    await broadcast_pools()


async def revive_event(event_id: uuid.UUID) -> str | None:
    """Dross back into play. If it had an adventure (killed), that is restored and its id
    returned; otherwise the event returns to the Centrifuge as prima materia (None)."""
    async with SessionLocal() as session:
        event = await _get_event(session, event_id)
        if event.review != "ignored":
            raise InvalidTransition(f"can only revive an ignored event (this one is {event.review})")
        adventure = await session.scalar(select(Adventure).where(Adventure.event_id == event.id))
        if adventure:
            _restore(adventure)
            event.review, event.reviewed_at = "passed", utcnow()
        else:
            event.review, event.reviewed_at = "new", None
        await session.commit()
        adventure_id = str(adventure.id) if adventure else None
    await broadcast_pools()
    return adventure_id


# --- adventures ---

async def kill_adventure(adventure_id: uuid.UUID) -> None:
    """Any phase -> Necropolis. Keeps the data and the phase it came from."""
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.phase == "killed":
            raise InvalidTransition("already a vestige")
        adventure.phase_before_kill = adventure.phase
        _set_phase(adventure, "killed")
        if adventure.event_id:
            event = await session.get(Event, adventure.event_id)
            if event:
                event.review, event.reviewed_at = "ignored", utcnow()
        await session.commit()
    await broadcast_pools()


async def revive_adventure(adventure_id: uuid.UUID) -> None:
    """Necropolis -> the phase it was killed from (its raw event becomes passed again)."""
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.phase != "killed":
            raise InvalidTransition("only vestiges (killed adventures) can be revived")
        _restore(adventure)
        if adventure.event_id:
            event = await session.get(Event, adventure.event_id)
            if event:
                event.review, event.reviewed_at = "passed", utcnow()
        await session.commit()
    await broadcast_pools()


async def set_phase(adventure_id: uuid.UUID, phase: str) -> None:
    """Move an adventure by hand (node card)."""
    if phase not in PHASES:
        raise InvalidTransition(f"unknown phase: {phase}")
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.phase == phase:
            return
        if phase == "killed":
            raise InvalidTransition("use kill to turn an adventure into a vestige")
        if adventure.phase == "killed":
            raise InvalidTransition("revive it first")
        if phase == "decommissioned" and adventure.phase != "completed":
            raise InvalidTransition("only artifacts (completed adventures) can be decommissioned")
        if phase not in MANUAL_PHASES and phase != "decommissioned":
            raise InvalidTransition(f"can't move to {phase} by hand")
        if adventure.phase in ("completed", "decommissioned") and phase not in ("completed", "decommissioned"):
            record = await session.get(Enshrining, adventure_id)  # un-completed: its analysis is a draft again
            if record:
                record.sealed_at = record.amended_at = None
        _set_phase(adventure, phase)
        # animus or later by hand: the roadmap counts as finished (services/roadmap.py)
        if phase in ("consuming", "completed", "decommissioned") and adventure.roadmap and adventure.roadmap.get("actions"):
            adventure.roadmap = {**adventure.roadmap, "done": [a["id"] for a in adventure.roadmap["actions"]]}
        await session.commit()
    await broadcast_pools()


# --- automatic ---

async def sweep_missed() -> int:
    """Kill adventures that were still pre-Arena when their event ended.

    Events only (items and performances have no when/where), crawled or hand-made. "Ended" = end
    time, else start time, the adventure's own (set by hand) over its raw event's. Only adventures whose phase was last set
    *before* the event ended count as missed: reviving one afterwards, or passing an
    event that is already over, is a deliberate choice and isn't undone.
    An all-day event ends after its last day; a weekly one after its `until` day, or never.
    Returns how many moved; broadcasts if any did.
    """
    now = utcnow()
    async with SessionLocal() as session:
        ended_at = func.coalesce(Adventure.end_time, Adventure.start_time, Event.end_time, Event.start_time)
        candidates = (await session.execute(
            select(Adventure, ended_at)
            .outerjoin(Event, Adventure.event_id == Event.id)
            .where(
                Adventure.type.in_(WHEN_WHERE_TYPES),
                Adventure.phase.in_(PRE_ARENA_PHASES),
                ended_at < now,  # the first occurrence is over; refined below
            )
        )).all()
        missed = []
        for adventure, first_end in candidates:
            end = _really_ended(adventure, first_end)
            if end is not None and end < now and adventure.phase_changed_at < end:
                missed.append(adventure)
        for adventure in missed:
            adventure.phase_before_kill = adventure.phase
            _set_phase(adventure, "killed")
            event = await session.get(Event, adventure.event_id) if adventure.event_id else None
            if event:
                event.review, event.reviewed_at = "ignored", now
            if await session.get(Epitaph, adventure.id) is None:  # one written by hand stays
                session.add(Epitaph(adventure_id=adventure.id, cause="missed"))
        await session.commit()
    if missed:
        log.info("moved %d missed adventure(s) to the Necropolis", len(missed))
        await broadcast_pools()
    return len(missed)


def _really_ended(adventure: Adventure, first_end: datetime) -> datetime | None:
    """When the adventure's event is over (None: never, a weekly event without an end)."""
    end = first_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if adventure.all_day:
        end += timedelta(days=1)  # the last day counts
    rec = adventure.recurrence
    if rec:
        until = rec.get("until")
        if not until:
            return None
        # the end of the until day, generously (a day past it in UTC covers every zone)
        end = max(end, datetime.fromisoformat(until).replace(tzinfo=timezone.utc) + timedelta(days=2))
    return end


async def run_sweeper() -> None:
    """Background loop: check for missed adventures every SWEEP_INTERVAL_S."""
    while True:
        try:
            await sweep_missed()
        except Exception:  # noqa: BLE001 - keep the loop alive; the next run may succeed
            log.exception("missed-adventure sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_S)
