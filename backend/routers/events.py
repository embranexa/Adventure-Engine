"""Raw harvested events and their review: pass, ignore, revive, and purging the centrifuge."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.models import Adventure, Event
from backend.db.queries import list_events
from backend.routers.errors import triage_errors
from backend.services import triage

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
async def get_events(session: AsyncSession = Depends(get_session)):
    return await list_events(session)


@router.delete("")
async def clear_events(session: AsyncSession = Depends(get_session)):
    """Delete raw events that have no adventure (those keep their event data).

    Mainly for development: the next harvest brings them back into their harvesters.
    """
    linked = select(Adventure.event_id).where(Adventure.event_id.is_not(None))
    result = await session.execute(delete(Event).where(Event.id.not_in(linked)))
    await session.commit()
    await triage.broadcast_pools()
    return {"deleted": result.rowcount}


@router.post("/purge")
async def purge_centrifuge():
    """Centrifuge -> Sump: every event still in the centrifuge (new) becomes ignored."""
    return {"moved": await triage.purge_centrifuge()}


@router.post("/{event_id}/pass")
async def pass_event(event_id: uuid.UUID):
    """Prima materia -> ore: creates an adventure in the Hopper."""
    with triage_errors():
        return {"adventure_id": await triage.pass_event(event_id)}


@router.post("/{event_id}/ignore")
async def ignore_event(event_id: uuid.UUID):
    """Prima materia -> shade (Sump)."""
    with triage_errors():
        await triage.ignore_event(event_id)
    return {"status": "ignored"}


@router.post("/{event_id}/revive")
async def revive_event(event_id: uuid.UUID):
    """Shade -> passed: restores its adventure from the Necropolis, or creates one."""
    with triage_errors():
        return {"adventure_id": await triage.revive_event(event_id)}
