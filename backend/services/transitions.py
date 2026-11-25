"""The transitions log: every move of a packet between nodes of the signal chain.

The twin (resources/signal chain digital twin/BUILD_PLAN.md) draws these as packets
travelling the pipes, and sizes pipes by how many went through recently.

Two ways rows get recorded:

1. Automatically, for changes made through ORM objects. A `before_flush` listener looks
   at what changed and adds Transition rows in the same transaction:
       new Adventure                     centrifuge / sump / lode -> its phase's node
       Adventure.phase a -> b            node(a) -> node(b)   (kill, revive, sweeper, by hand)
       Event.review new -> ignored       centrifuge -> sump
       Event.review ignored -> new       sump -> centrifuge   (revive; other review changes
                                                               are recorded by the adventure)
       new AdventureEntity               codex -> athanor     (a link)
       deleted AdventureEntity           athanor -> codex     (an unlink)
2. Explicitly, with record() / record_many(), for SQL statements that change rows without
   ORM objects (harvest, feed, siphon, purge, link deletes): `before_flush` never sees those.

After a commit, the new (non-synthetic) rows are broadcast as a `transitions` message.
"""

import asyncio
import logging
import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import event, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from backend.db.base import SessionLocal, utcnow
from backend.db.models import (
    ASSAYER_NODE, CENTRIFUGE_NODE, CODEX_NODE, LODE_NODE, MANUAL_PHASES, OUTSIDE_NODE, PHASE_NODES, SUMP_NODE,
    Adventure, AdventureEntity, AppState, Event, EventSource, Transition, harvester_node,
)
from backend.services.hub import hub

log = logging.getLogger(__name__)

ATHANOR_NODE = PHASE_NODES["classifying"]  # links arrive where adventures are classified
_PENDING = "pending_transitions"           # session.info key: rows to broadcast after commit
_tasks: set[asyncio.Task] = set()          # keep broadcast tasks alive until they finish


def transition_to_dict(t: Transition) -> dict[str, Any]:
    return {
        "id": t.id,
        "at": t.at.isoformat() if t.at else None,
        "subject": t.subject,
        "row_id": str(t.row_id),
        "ref_id": str(t.ref_id) if t.ref_id else None,
        "from": t.from_node,
        "to": t.to_node,
    }


def record(
    session: Session | AsyncSession, subject: str, row_id: uuid.UUID, from_node: str, to_node: str,
    *, ref_id: uuid.UUID | None = None, at: datetime | None = None, synthetic: bool = False,
) -> Transition:
    """Add one transition to the session (saved with the session's next commit)."""
    t = Transition(subject=subject, row_id=row_id, ref_id=ref_id, from_node=from_node,
                   to_node=to_node, at=at or utcnow(), synthetic=synthetic)
    session.add(t)
    if not synthetic:
        session.info.setdefault(_PENDING, []).append(t)
    return t


def record_many(
    session: Session | AsyncSession, subject: str, row_ids: Iterable[uuid.UUID], from_node: str, to_node: str,
) -> int:
    """Record the same move for many rows (bulk statements). Returns how many."""
    at = utcnow()
    n = 0
    for row_id in row_ids:
        record(session, subject, row_id, from_node, to_node, at=at)
        n += 1
    return n


# --- automatic recording (ORM changes) ---

def _change(obj: Any, attr: str) -> tuple[Any, Any] | None:
    """(old, new) if this flush changes a loaded attribute, else None."""
    history = inspect(obj).attrs[attr].history
    if history.deleted and history.added and history.deleted[0] != history.added[0]:
        return history.deleted[0], history.added[0]
    return None


@event.listens_for(Session, "before_flush")
def _record_orm_changes(session: Session, flush_context, instances) -> None:
    # an event's review before this flush, so a new adventure knows where it came from
    old_review = {}
    for obj in session.dirty:
        if isinstance(obj, Event) and (change := _change(obj, "review")):
            old_review[obj.id] = change[0]

    for obj in list(session.new):
        if isinstance(obj, Adventure):
            if obj.id is None:
                obj.id = uuid.uuid4()  # the column default only applies at INSERT, after this
            if getattr(obj, "spawned", False):  # from a series: out of the Arena
                record(session, "adventure", obj.id, OUTSIDE_NODE, PHASE_NODES["consuming"])
                if obj.phase != "consuming":
                    record(session, "adventure", obj.id, PHASE_NODES["consuming"], PHASE_NODES[obj.phase])
                continue
            if obj.event_id is None:
                origin = LODE_NODE
            else:
                origin = {"ignored": SUMP_NODE, "assaying": ASSAYER_NODE}.get(old_review.get(obj.event_id), CENTRIFUGE_NODE)
            record(session, "adventure", obj.id, origin, PHASE_NODES[obj.phase or "queued"])
        elif isinstance(obj, AdventureEntity):
            record(session, "link", obj.entity_id, CODEX_NODE, ATHANOR_NODE, ref_id=obj.adventure_id)

    for obj in list(session.dirty):
        if isinstance(obj, Adventure) and (change := _change(obj, "phase")):
            record(session, "adventure", obj.id, PHASE_NODES[change[0]], PHASE_NODES[change[1]])
        elif isinstance(obj, Event) and _change(obj, "review") == ("new", "ignored"):
            record(session, "event", obj.id, CENTRIFUGE_NODE, SUMP_NODE)
        elif isinstance(obj, Event) and _change(obj, "review") == ("assaying", "ignored"):
            record(session, "event", obj.id, ASSAYER_NODE, SUMP_NODE)
        elif isinstance(obj, Event) and _change(obj, "review") == ("ignored", "new"):
            record(session, "event", obj.id, SUMP_NODE, CENTRIFUGE_NODE)

    for obj in session.deleted:
        if isinstance(obj, AdventureEntity):
            record(session, "link", obj.entity_id, ATHANOR_NODE, CODEX_NODE, ref_id=obj.adventure_id)


@event.listens_for(Session, "after_commit")
def _broadcast_committed(session: Session) -> None:
    rows = session.info.pop(_PENDING, None)
    if not rows:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no event loop (a script): nobody to tell
    task = loop.create_task(hub.broadcast("transitions", transitions=[transition_to_dict(t) for t in rows]))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


@event.listens_for(Session, "after_rollback")
def _drop_rolled_back(session: Session) -> None:
    session.info.pop(_PENDING, None)


# --- reads ---

async def recent(session: AsyncSession, since_id: int | None = None, hours: float = 24,
                 limit: int = 500) -> list[dict[str, Any]]:
    """Observed (non-synthetic) transitions to replay, oldest first: those after `since_id`,
    else those from the last `hours`. At most `limit` (the newest)."""
    query = select(Transition).where(Transition.synthetic.is_(False))
    if since_id is not None:
        query = query.where(Transition.id > since_id)
    else:
        query = query.where(Transition.at >= utcnow() - timedelta(hours=hours))
    rows = (await session.scalars(query.order_by(Transition.id.desc()).limit(limit))).all()
    return [transition_to_dict(t) for t in reversed(rows)]


async def flows(session: AsyncSession, days: float = 7) -> list[dict[str, Any]]:
    """How many packets went along each edge in the last `days` (synthetic ones included:
    they carry their rows' real timestamps, so they age out of the window like the rest)."""
    rows = await session.execute(
        select(Transition.from_node, Transition.to_node, func.count())
        .where(Transition.at >= utcnow() - timedelta(days=days))
        .group_by(Transition.from_node, Transition.to_node)
    )
    return [{"from": f, "to": t, "count": n} for f, t, n in rows.all()]


# --- one-time backfill ---

BACKFILL_KEY = "transitions_backfilled"
_MAIN_ROUTE = [PHASE_NODES[p] for p in MANUAL_PHASES]  # hopper ... treasury


def _route_to(phase: str, phase_before_kill: str | None) -> list[str]:
    """The nodes an adventure in `phase` most likely passed through, from the hopper on."""
    if phase == "killed":
        return _route_to(phase_before_kill or "queued", None) + [PHASE_NODES["killed"]]
    if phase == "decommissioned":
        return _MAIN_ROUTE + [PHASE_NODES["decommissioned"]]
    return _MAIN_ROUTE[: _MAIN_ROUTE.index(PHASE_NODES[phase]) + 1]


def _path(session: AsyncSession, subject: str, row_id: uuid.UUID, nodes: list[str],
          first_at: datetime, last_at: datetime) -> int:
    """Record one synthetic transition per step of `nodes`; the last step at `last_at`."""
    steps = list(zip(nodes, nodes[1:]))
    for i, (a, b) in enumerate(steps):
        record(session, subject, row_id, a, b, at=last_at if i == len(steps) - 1 else first_at, synthetic=True)
    return len(steps)


async def backfill() -> int:
    """Give rows that existed before the log a synthetic history, once, so pipes don't start
    empty: each row's likely path to where it is now. Returns how many rows were written."""
    async with SessionLocal() as session:
        if await session.get(AppState, BACKFILL_KEY):
            return 0
        written = 0
        if not await session.scalar(select(func.count()).select_from(Transition)):
            events = (await session.execute(
                select(Event, EventSource.name).join(EventSource, Event.source_id == EventSource.id))).all()
            event_by_id = {e.id: (e, src) for e, src in events}
            adventures = (await session.scalars(select(Adventure))).all()
            with_adventure = {a.event_id for a in adventures if a.event_id}

            for e, src in events:
                intake = [OUTSIDE_NODE, harvester_node(src)]
                if e.id in with_adventure:
                    nodes = intake + [CENTRIFUGE_NODE]
                else:
                    nodes = {"harvested": intake, "new": intake + [CENTRIFUGE_NODE],
                             "ignored": intake + [CENTRIFUGE_NODE, SUMP_NODE]}.get(e.review, [])
                written += _path(session, "event", e.id, nodes, e.first_seen, e.reviewed_at or e.first_seen)

            for a in adventures:
                origin = CENTRIFUGE_NODE if a.event_id in event_by_id else LODE_NODE
                nodes = [origin] + _route_to(a.phase, a.phase_before_kill)
                written += _path(session, "adventure", a.id, nodes, a.created_at, a.phase_changed_at)

            for link in (await session.scalars(select(AdventureEntity))).all():
                record(session, "link", link.entity_id, CODEX_NODE, ATHANOR_NODE,
                       ref_id=link.adventure_id, at=link.created_at, synthetic=True)
                written += 1

        session.add(AppState(key=BACKFILL_KEY, value={"rows": written, "at": utcnow().isoformat()}))
        await session.commit()
    if written:
        log.info("backfilled %d synthetic transition(s)", written)
    return written
