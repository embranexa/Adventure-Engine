"""Parties: the players of an adventure and their statuses, and its stewards.

    set_member    add a player, change its status, or write its role, proposal note, follow-up day and impact
    set_steward   add or remove a herald, commissioner or archon
    history       every status change in an adventure's party

Rules:
    - a player's place in the party is its link to the adventure, so unlinking it
      (services/entities.py) takes it out of the party
    - any status can follow any other; the aftermath ones need a completed adventure
    - annealed adds 1 to the player's warmth and repelled takes 1; a change of mind undoes that
    - stewards aren't party members: one player can be both
    - except the archon, who leads: naming one bonds them (unless already bonded or beyond) and
      replaces the last. Leaving the party, or going back to recruitment, gives it up; giving
      it up doesn't leave the party
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import (
    AFTERMATH_STATUSES, PARTY_STATUSES, RECRUITMENT_STATUSES, STEWARD_ROLES, STEWARD_TYPES, AdventureEntity, Entity, PartyLog, Steward,
)
from backend.services.entities import _broadcast, _get_entity, add_link, drop_archon
from backend.services.triage import _get_adventure

NOTE_LIMIT = 5_000
NUDGES = {"annealed": 1, "repelled": -1}
MAX_WARMTH = 5


class InvalidParty(Exception):
    pass


def _nudge(player: Entity, row: AdventureEntity, status: str) -> None:
    """Take back what the old aftermath did to the player's warmth, then apply the new one."""
    before = (player.details or {}).get("warmth")
    base = (before or 0) - (row.nudge or 0)
    after = max(0, min(MAX_WARMTH, base + NUDGES.get(status, 0)))
    row.nudge = after - base
    if after != (before or 0):
        player.details = {**(player.details or {}), "warmth": after}


async def set_member(adventure_id: uuid.UUID, player_id: uuid.UUID, changes: dict[str, Any]) -> None:
    """Only the fields sent change. A player not in the party joins it (as resonant, or `status`)."""
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        player = await _get_entity(session, player_id)
        if player.type != "player":
            raise InvalidParty(f"a {player.type} can't join a party")
        row = await session.get(AdventureEntity, (adventure_id, player_id))
        status = changes.get("status") or (row.status if row else "resonant")
        if status not in PARTY_STATUSES:
            raise InvalidParty(f"status must be one of {', '.join(PARTY_STATUSES)}")
        changing = row is None or status != row.status
        if changing and status in AFTERMATH_STATUSES and adventure.phase not in ("completed", "decommissioned"):
            raise InvalidParty(f"{status} needs a completed adventure")
        if row is None:
            row = add_link(session, adventure_id, player, status)
        elif changing:
            session.add(PartyLog(adventure_id=adventure_id, player_id=player_id, from_status=row.status, to_status=status))
            row.status, row.status_at = status, utcnow()
        if changing and status in RECRUITMENT_STATUSES:
            await drop_archon(session, adventure_id, player_id)
        if changing:
            _nudge(player, row, status)
        for field in ("note", "impact"):
            if field in changes:
                text = (changes[field] or "").strip() or None
                if text and len(text) > NOTE_LIMIT:
                    raise InvalidParty(f"the {field} is too long (max {NOTE_LIMIT} characters)")
                setattr(row, field, text)
        if "role" in changes:
            text = (changes["role"] or "").strip() or None
            if text and len(text) > 60:
                raise InvalidParty("the role is too long (max 60 characters)")
            row.role = text
        if "follow_up" in changes:
            row.follow_up = _day(changes["follow_up"])
        await session.commit()
    await _broadcast(adventures_too=True)


def _day(value: Any) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError as e:
        raise InvalidParty("the follow-up is a day, like 2026-12-01") from e


async def _crown(session: AsyncSession, adventure_id: uuid.UUID, player: Entity) -> None:
    """Make way for a new archon, and bond them."""
    if player.type != "player":
        raise InvalidParty("only a player can be the archon")
    await session.execute(delete(Steward).where(Steward.adventure_id == adventure_id, Steward.role == "archon"))
    row = await session.get(AdventureEntity, (adventure_id, player.id))
    if row is None:
        add_link(session, adventure_id, player, "bonded")
    elif row.status is None or row.status in RECRUITMENT_STATUSES:
        session.add(PartyLog(adventure_id=adventure_id, player_id=player.id, from_status=row.status, to_status="bonded"))
        row.status, row.status_at = "bonded", utcnow()


async def set_steward(adventure_id: uuid.UUID, entity_id: uuid.UUID, role: str, on: bool) -> None:
    if role not in STEWARD_ROLES:
        raise InvalidParty(f"role must be one of {', '.join(STEWARD_ROLES)} (wardens belong to the site)")
    async with SessionLocal() as session:
        await _get_adventure(session, adventure_id)
        entity = await _get_entity(session, entity_id)
        row = await session.get(Steward, (adventure_id, entity_id, role))
        if on and row is None:
            if entity.type not in STEWARD_TYPES:
                raise InvalidParty(f"a {entity.type} can't be a {role}")
            if role == "archon":
                await _crown(session, adventure_id, entity)
            session.add(Steward(adventure_id=adventure_id, entity_id=entity_id, role=role))
        elif not on and row is not None:
            await session.delete(row)
        await session.commit()
    await _broadcast(adventures_too=True)


async def history(session: AsyncSession, adventure_id: uuid.UUID) -> list[dict[str, Any]]:
    """Newest first."""
    rows = await session.scalars(select(PartyLog).where(PartyLog.adventure_id == adventure_id).order_by(PartyLog.id.desc()))
    return [{"id": r.id, "at": r.at.isoformat(), "player_id": str(r.player_id), "from": r.from_status, "to": r.to_status}
            for r in rows.all()]
