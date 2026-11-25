"""Raw harvested events and their review: pass, ignore, revive, purging the centrifuge and
siphoning chosen events back to their harvesters."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.models import Adventure, Event
from backend.db.queries import list_events
from backend.routers.errors import triage_errors
from backend.services import assayer, triage

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


class EventIds(BaseModel):
    ids: list[uuid.UUID] = Field(max_length=20000)


@router.post("/purge")
async def purge_centrifuge(body: EventIds | None = None):
    """Centrifuge -> Sump: every event still in the centrifuge (new) becomes ignored, or
    only the given ones."""
    ids = await (triage.purge_events(body.ids) if body is not None else triage.purge_centrifuge())
    return {"moved": len(ids), "ids": ids}


@router.post("/siphon")
async def siphon_events(body: EventIds):
    """Centrifuge -> Harvester: the given events (still new) go back to their sources' harvesters."""
    ids = await triage.siphon_events(body.ids)
    return {"moved": len(ids), "ids": ids}


class EventMove(EventIds):
    from_review: Literal["harvested", "new", "ignored"]
    to_review: Literal["harvested", "new", "ignored"]


@router.post("/move")
async def move_events(body: EventMove):
    """Chosen events between harvesters, Centrifuge and Sump (undo of a bulk transfer)."""
    with triage_errors():
        ids = await triage.move_events(body.ids, body.from_review, body.to_review)
    return {"moved": len(ids), "ids": ids}


class Assay(EventIds):
    again: bool = False  # even ones tried lately


@router.post("/assay")
async def assay_events(body: Assay):
    """Centrifuge -> Assayer: the given specimens, read one at a time and returned."""
    ids = await assayer.start(body.ids, body.again)
    return {"moved": len(ids), "ids": ids}


@router.post("/assay/stop")
async def stop_assay():
    """Assayer -> Centrifuge: everything still waiting."""
    ids = await assayer.stop()
    return {"moved": len(ids), "ids": ids}


class CoverPayload(BaseModel):
    url: str | None = Field(None, max_length=2000)


@router.put("/{event_id}/cover")
async def set_cover(event_id: uuid.UUID, body: CoverPayload):
    """A specimen's cover, by hand (null takes it away)."""
    with triage_errors():
        await assayer.set_cover(event_id, body.url)
    return {"cover": body.url}


@router.post("/{event_id}/pass")
async def pass_event(event_id: uuid.UUID):
    """Raw event -> concentrate: creates an adventure in the Hopper."""
    with triage_errors():
        return {"adventure_id": await triage.pass_event(event_id)}


@router.post("/{event_id}/ignore")
async def ignore_event(event_id: uuid.UUID):
    """Raw event -> tailings (Sump)."""
    with triage_errors():
        await triage.ignore_event(event_id)
    return {"status": "ignored"}


@router.post("/{event_id}/revive")
async def revive_event(event_id: uuid.UUID):
    """Tailings -> passed: restores its adventure from the Necropolis, or creates one."""
    with triage_errors():
        return {"adventure_id": await triage.revive_event(event_id)}
