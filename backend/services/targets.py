"""Targets: the quests laid at the top of the Crucible (app state "targets", in order).

Targeting a quest starts the build: its adventure, if it hasn't reached the Crucible, becomes
alloy. Dropping an adventure's last target before any quest is done takes that back, to
armature (services/roadmap.py holds it in alloy meanwhile).
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal
from backend.db.models import Adventure, AppState
from backend.services import ledger

BEFORE = ("queued", "classifying", "decomposing")


def adventures_of(value: Any) -> set[str]:
    return {p["adventure"] for p in (value or {}).get("pins", [])}


async def is_targeted(session: AsyncSession, adventure: Adventure) -> bool:
    """Whether a quest it still has to do is a target."""
    row = await session.get(AppState, "targets")
    road = adventure.roadmap or {}
    todo = {a["id"] for a in road.get("actions") or []} - set(road.get("done") or [])
    return any(p["adventure"] == str(adventure.id) and p["action"] in todo for p in ((row.value if row else None) or {}).get("pins", []))


async def sync(before: Any, after: Any) -> None:
    """Move the adventures whose first target was just laid, or last one just dropped."""
    from backend.services.triage import _set_phase, broadcast_pools  # avoids an import cycle

    moved, paid = False, False
    async with SessionLocal() as session:
        for id_ in adventures_of(before) ^ adventures_of(after):
            try:
                adventure = await session.get(Adventure, uuid.UUID(id_))
            except ValueError:
                continue
            if adventure is None:
                continue
            if id_ in adventures_of(after):
                go = adventure.phase in BEFORE and await is_targeted(session, adventure)
                phase = "constructing"
            else:
                road = adventure.roadmap or {}
                go = adventure.phase == "constructing" and bool(road.get("actions")) and not road.get("done")
                phase = "decomposing"
            if go:
                _set_phase(adventure, phase)
                paid = bool(await ledger.settle(session, adventure)) or paid
                moved = True
        await session.commit()
    if moved:
        await broadcast_pools()
    if paid:
        await ledger.broadcast()
