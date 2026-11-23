"""Adventures: list, create and edit them, move them between phases, kill and revive, write
epitaphs, enshrine, edit item sheets and roadmaps."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.queries import list_adventures
from backend.routers.errors import triage_errors
from backend.schemas.adventures import AdventureCreate, AdventureUpdate, BountyPayload, EnshriningPayload, EpitaphPayload, ForgePayload, ItemPayload, PhasePayload, RoadmapPayload
from backend.services import adventures, enshrinings, epitaphs, forge, items, ledger, roadmap, triage

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


@router.delete("/{adventure_id}")
async def abandon_adventure(adventure_id: uuid.UUID):
    """Delete a killed adventure for good. 409 unless it's killed."""
    with triage_errors():
        await adventures.abandon_adventure(adventure_id)
    return {"status": "abandoned"}


@router.put("/{adventure_id}/epitaph")
async def set_epitaph(adventure_id: uuid.UUID, payload: EpitaphPayload):
    """Why it died. 409 unless it's killed; 422 for an unknown cause."""
    with triage_errors():
        try:
            await epitaphs.set_epitaph(adventure_id, payload.cause, payload.note)
        except epitaphs.InvalidEpitaph as e:
            raise HTTPException(422, str(e)) from e
    return {"status": "carved"}


@router.delete("/{adventure_id}/epitaph")
async def clear_epitaph(adventure_id: uuid.UUID):
    """Remove the epitaph. 409 unless it's killed."""
    with triage_errors():
        await epitaphs.clear_epitaph(adventure_id)
    return {"status": "cleared"}


@router.put("/{adventure_id}/enshrining")
async def save_enshrining(adventure_id: uuid.UUID, payload: EnshriningPayload):
    """Save the draft analysis, or (seal: true) seal or amend it. 409 unless it's completed,
    or when a draft is saved over a sealed one; 422 if a field is invalid."""
    with triage_errors():
        try:
            return await enshrinings.save(adventure_id, payload.model_dump(exclude={"seal"}), payload.seal)
        except enshrinings.InvalidEnshrining as e:
            raise HTTPException(422, str(e)) from e


@router.put("/{adventure_id}/item")
async def save_item(adventure_id: uuid.UUID, payload: ItemPayload):
    """Set an item's purpose, effects or model (only the fields sent). 409 unless it's an
    item; 422 for an invalid effect or recipe."""
    with triage_errors():
        try:
            await items.save_item(adventure_id, payload.model_dump(exclude_unset=True))
        except items.InvalidItem as e:
            raise HTTPException(422, str(e)) from e
    return {"status": "saved"}


@router.post("/{adventure_id}/forge")
async def request_model(adventure_id: uuid.UUID, payload: ForgePayload):
    """Ask Claude for the item's model, or for changes to it. The result arrives as a
    proposal on the item (an `adventures` message). 409 if it can't start; 422 without text."""
    with triage_errors():
        try:
            await forge.request(adventure_id, payload.text)
        except items.InvalidItem as e:
            raise HTTPException(422, str(e)) from e
    return {"status": "forging"}


@router.post("/{adventure_id}/forge/accept")
async def accept_model(adventure_id: uuid.UUID):
    """The proposal becomes the item's model."""
    with triage_errors():
        await forge.accept(adventure_id)
    return {"status": "accepted"}


@router.delete("/{adventure_id}/forge")
async def dismiss_model(adventure_id: uuid.UUID):
    """Drop the proposal, or stop the work."""
    with triage_errors():
        await forge.dismiss(adventure_id)
    return {"status": "dismissed"}


@router.put("/{adventure_id}/bounty")
async def set_bounty(adventure_id: uuid.UUID, payload: BountyPayload | None = None):
    """What it's worth (no body clears it). 409 once it's locked; 422 out of range."""
    with triage_errors():
        try:
            await ledger.set_bounty(adventure_id, payload.model_dump() if payload else None)
        except ledger.InvalidBounty as e:
            raise HTTPException(422, str(e)) from e
    return {"status": "set" if payload else "cleared"}
