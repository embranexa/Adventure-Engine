"""Parties: an adventure's players and their statuses, its stewards, and the history."""

import uuid
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.routers.errors import triage_errors
from backend.schemas.party import MemberPayload
from backend.services import party

router = APIRouter(prefix="/adventures/{adventure_id}", tags=["party"])


@contextmanager
def _errors():
    with triage_errors():
        try:
            yield
        except party.InvalidParty as e:
            raise HTTPException(422, str(e)) from e


@router.put("/party/{player_id}")
async def set_member(adventure_id: uuid.UUID, player_id: uuid.UUID, payload: MemberPayload):
    """Add a player to the party, or change its status, note or follow-up. To remove it,
    unlink it (DELETE /adventures/{id}/entities/{id})."""
    with _errors():
        await party.set_member(adventure_id, player_id, payload.model_dump(exclude_unset=True))
    return {"status": "saved"}


@router.get("/party/history")
async def get_history(adventure_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    return await party.history(session, adventure_id)


@router.put("/stewards/{entity_id}/{role}")
async def add_steward(adventure_id: uuid.UUID, entity_id: uuid.UUID, role: str):
    with _errors():
        await party.set_steward(adventure_id, entity_id, role, True)
    return {"steward": True}


@router.delete("/stewards/{entity_id}/{role}")
async def remove_steward(adventure_id: uuid.UUID, entity_id: uuid.UUID, role: str):
    with _errors():
        await party.set_steward(adventure_id, entity_id, role, False)
    return {"steward": False}
