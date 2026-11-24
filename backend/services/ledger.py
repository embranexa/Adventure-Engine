"""The Agora's ledger: ambrosia earned, and taken back.

Rules:
    - a bounty is set before the Crucible and locks on reaching it (or anything later). An
      adventure that got there without one never pays
    - actions pay the action share as they're done; enshrining pays the rest. The total is
      fixed, so splitting or adding actions never earns more
    - undoing takes it back: un-ticking an action, breaking a seal. The ledger is append-only:
      a reversal is a new entry
    - killing keeps what was earned (paid for doing, not for succeeding). Amending an
      enshrining never changes its pay
    - back before the Crucible with nothing paid, a bounty unlocks again

`settle` compares what an adventure should have been paid with what the ledger says and adds
the difference, so it's safe to call after any change.
"""

import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import Adventure, Ambrosia, Enshrining, Event
from backend.db.queries import list_adventures
from backend.services import bounty
from backend.services.hub import hub

BEFORE = ("queued", "classifying", "decomposing")       # a bounty can be set
STARTED = ("constructing", "consuming", "completed", "decommissioned")
SEAL = "seal"                                           # the ledger ref of an enshrining's pay
SHOWN = 300                                             # entries sent to browsers


class InvalidBounty(Exception):
    pass


async def settle(session: AsyncSession, adventure: Adventure) -> bool:
    """Bring the ledger in line with one adventure (in the session, before its commit).
    Returns whether anything was added."""
    b = adventure.bounty
    if not b or adventure.phase == "killed":
        return False
    if adventure.phase in STARTED and not b.get("locked_at"):
        b = {**b, "locked_at": utcnow().isoformat()}
        adventure.bounty = b
    if not b.get("locked_at"):
        return False

    net: dict[str, int] = defaultdict(int)
    for ref, amount in (await session.execute(
        select(Ambrosia.ref, func.sum(Ambrosia.amount)).where(Ambrosia.adventure_id == adventure.id).group_by(Ambrosia.ref))).all():
        net[ref] = amount
    title = adventure.title
    if title is None and adventure.event_id:
        title = await session.scalar(select(Event.title).where(Event.id == adventure.event_id))
    added = False

    def add(kind: str, ref: str, amount: int, label: str) -> None:
        nonlocal added
        session.add(Ambrosia(adventure_id=adventure.id, kind=kind, ref=ref, amount=amount, label=label[:400]))
        net[ref] += amount
        added = True

    record = await session.get(Enshrining, adventure.id)
    sealed = bool(record and record.sealed_at) and adventure.phase in ("completed", "decommissioned")
    if not sealed and net[SEAL]:
        add("reversal", SEAL, -net[SEAL], f"{title}: seal broken")
    if not sealed or not net[SEAL]:  # a paid seal fixes the actions' pay too
        roadmap = adventure.roadmap or {}
        actions, done = roadmap.get("actions") or [], set(roadmap.get("done") or [])
        names = {a["id"]: a["title"] for a in actions}
        for ref in [r for r, n in net.items() if r != SEAL and n and r not in done]:
            add("reversal", ref, -net[ref], f"{title}: {names.get(ref, 'a quest')} undone")
        # what the done actions should have earned together, so small shares don't round away
        ticked = [a for a in actions if a["id"] in done]
        due = bounty.round_half_up(bounty.action_share(b) * len(ticked) / len(actions)) if actions else 0
        waiting = [a for a in ticked if not net[a["id"]]]
        for k, a in enumerate(waiting):
            gap = due - sum(n for r, n in net.items() if r != SEAL)
            amount = bounty.round_half_up(gap / (len(waiting) - k))
            if amount > 0:
                add("action", a["id"], amount, f"{title}: {a['title']}")
        if sealed:
            rest = bounty.total(b) - sum(n for r, n in net.items() if r != SEAL)
            if rest > 0:
                add("enshrined", SEAL, rest, f"{title}: enshrined")
    if adventure.phase in BEFORE and not any(net.values()):
        adventure.bounty = {**b, "locked_at": None}
    return added


async def set_bounty(adventure_id: uuid.UUID, value: dict[str, Any] | None) -> None:
    """Set (or, with None, clear) an adventure's bounty. Only before it locks."""
    from backend.services.triage import InvalidTransition, _get_adventure  # triage imports this module

    if value is not None:
        for key, (lo, hi) in (("effort", bounty.EFFORT), ("resistance", bounty.RESISTANCE), ("ratio", bounty.RATIO)):
            if not lo <= value[key] <= hi:
                raise InvalidBounty(f"{key} goes from {lo} to {hi}")
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.phase not in BEFORE or (adventure.bounty or {}).get("locked_at"):
            raise InvalidTransition("a bounty is set before the Crucible")
        adventure.bounty = {k: value[k] for k in ("effort", "resistance", "ratio")} | {"locked_at": None} if value else None
        await session.commit()
        adventures = await list_adventures(session)
    await hub.broadcast("adventures", adventures=adventures)


async def read(session: AsyncSession) -> dict[str, Any]:
    """The balance, the newest entries (newest first, each with the balance after it), and
    totals by kind."""
    balance = await session.scalar(select(func.coalesce(func.sum(Ambrosia.amount), 0)))
    rows = (await session.scalars(select(Ambrosia).order_by(Ambrosia.id.desc()).limit(SHOWN))).all()
    by_kind = dict((await session.execute(select(Ambrosia.kind, func.sum(Ambrosia.amount)).group_by(Ambrosia.kind))).all())
    entries, after = [], balance
    for r in rows:
        entries.append({"id": r.id, "at": r.at.isoformat(), "adventure_id": str(r.adventure_id), "kind": r.kind,
                        "amount": r.amount, "label": r.label, "balance": after})
        after -= r.amount
    return {"balance": balance, "entries": entries, "by_kind": by_kind}


async def broadcast() -> None:
    async with SessionLocal() as session:
        await hub.broadcast("ambrosia", ambrosia=await read(session))
