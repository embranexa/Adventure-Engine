"""Adventures: list, create and edit them, move them between phases, kill and revive, edit roadmaps."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.queries import list_adventures
from backend.routers.errors import triage_errors
from backend.schemas.adventures import AdventureCreate, AdventureUpdate, PhasePayload, RoadmapPayload
from backend.services import adventures, roadmap, triage

router = APIRouter(prefix="/adventures", tags=["adventures"])


@router.get("")
async def get_adventures(session: AsyncSession = Depends(get_session)):
    return await list_adventures(session)


@router.post("")
async def create_adventure(payload: AdventureCreate):
    """A hand-made adventure (event, item or performance) in ore. 422 if a field is invalid."""
    try:
        return await adventures.create_adventure(payload.model_dump(exclude_unset=True) | {"type": payload.type})
    except adventures.InvalidAdventure as e:
        raise HTTPException(422, str(e)) from e


@router.patch("/{adventure_id}")
async def update_adventure(adventure_id: uuid.UUID, payload: AdventureUpdate):
    """Set (or, with null, clear) the adventure's own fields. Only the fields sent change."""
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("type") is None:
        changes.pop("type", None)
    with triage_errors():
        try:
            return await adventures.update_adventure(adventure_id, changes)
        except adventures.InvalidAdventure as e:
            raise HTTPException(422, str(e)) from e


@router.put("/{adventure_id}/phase")
async def set_phase(adventure_id: uuid.UUID, payload: PhasePayload):
    """Move by hand: any of queued..completed, or completed -> decommissioned."""
    with triage_errors():
        await triage.set_phase(adventure_id, payload.phase)
    return {"phase": payload.phase}


@router.put("/{adventure_id}/roadmap")
async def set_roadmap(adventure_id: uuid.UUID, payload: RoadmapPayload):
    """Replace the adventure's action roadmap (no actions clears it). 422 if it has a cycle."""
    with triage_errors():
        try:
            saved = await roadmap.save_roadmap(adventure_id, payload.model_dump())
        except roadmap.InvalidRoadmap as e:
            raise HTTPException(422, str(e)) from e
    return {"roadmap": saved}


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
