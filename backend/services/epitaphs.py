"""Epitaphs: why a killed adventure died (the Necropolis).

Optional, one per adventure: a cause (EPITAPH_CAUSES) and a note. A missed event gets the
cause "missed" from the sweeper (services/triage.py). Reviving an adventure keeps its
epitaph; the interface shows it only while the adventure is dead.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal
from backend.db.models import EPITAPH_CAUSES, Epitaph
from backend.services.triage import InvalidTransition, _get_adventure, broadcast_pools

NOTE_LIMIT = 2_000


class InvalidEpitaph(Exception):
    pass


async def set_epitaph(adventure_id: uuid.UUID, cause: str, note: str | None) -> None:
    """Write (or rewrite) a killed adventure's epitaph."""
    if cause not in EPITAPH_CAUSES:
        raise InvalidEpitaph(f"cause must be one of {', '.join(EPITAPH_CAUSES)}")
    text = (note or "").strip() or None
    if text and len(text) > NOTE_LIMIT:
        raise InvalidEpitaph(f"the note is too long (max {NOTE_LIMIT} characters)")
    async with SessionLocal() as session:
        await _get_dead(session, adventure_id)
        row = await session.get(Epitaph, adventure_id)
        if row is None:
            session.add(Epitaph(adventure_id=adventure_id, cause=cause, note=text))
        else:
            row.cause, row.note = cause, text
        await session.commit()
    await broadcast_pools()


async def clear_epitaph(adventure_id: uuid.UUID) -> None:
    """Remove a killed adventure's epitaph (nothing happens if it has none)."""
    async with SessionLocal() as session:
        await _get_dead(session, adventure_id)
        row = await session.get(Epitaph, adventure_id)
        if row is None:
            return
        await session.delete(row)
        await session.commit()
    await broadcast_pools()


async def _get_dead(session: AsyncSession, adventure_id: uuid.UUID) -> None:
    adventure = await _get_adventure(session, adventure_id)
    if adventure.phase != "killed":
        raise InvalidTransition("only vestiges (killed adventures) have epitaphs")
