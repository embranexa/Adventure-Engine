"""Adventures: list them, move them between phases, kill and revive."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.queries import list_adventures
from backend.routers.errors import triage_errors
from backend.schemas.adventures import PhasePayload
from backend.services import triage

router = APIRouter(prefix="/adventures", tags=["adventures"])


@router.get("")
async def get_adventures(session: AsyncSession = Depends(get_session)):
    return await list_adventures(session)


@router.put("/{adventure_id}/phase")
async def set_phase(adventure_id: uuid.UUID, payload: PhasePayload):
    """Move by hand: any of queued..completed, or completed -> decommissioned."""
    with triage_errors():
        await triage.set_phase(adventure_id, payload.phase)
    return {"phase": payload.phase}


@router.post("/{adventure_id}/kill")
async def kill_adventure(adventure_id: uuid.UUID):
    """Any phase -> Necropolis (data kept; its raw event becomes ignored)."""
    with triage_errors():
        await triage.kill_adventure(adventure_id)
    return {"phase": "killed"}


@router.post("/{adventure_id}/revive")
async def revive_adventure(adventure_id: uuid.UUID):
    """Necropolis -> the phase it was killed from."""
    with triage_errors():
        await triage.revive_adventure(adventure_id)
    return {"status": "revived"}
