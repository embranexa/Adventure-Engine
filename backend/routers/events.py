"""Crawled events."""

from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.models import Event
from backend.db.queries import list_events
from backend.services.hub import hub

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
async def get_events(session: AsyncSession = Depends(get_session)):
    return await list_events(session)


@router.delete("")
async def clear_events(session: AsyncSession = Depends(get_session)):
    """Delete every stored event (sources stay registered). Mainly for development."""
    result = await session.execute(delete(Event))
    await session.commit()
    await hub.broadcast("events", events=[])
    return {"deleted": result.rowcount}
