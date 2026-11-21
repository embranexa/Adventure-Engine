"""The transitions log, for the signal chain twin: packets to replay and flows per pipe."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.services import transitions

router = APIRouter(prefix="/transitions", tags=["transitions"])


@router.get("")
async def get_transitions(
    since_id: int | None = None,
    hours: float = Query(24, gt=0, le=24 * 365),
    limit: int = Query(500, ge=1, le=5000),
    session: AsyncSession = Depends(get_session),
):
    """Observed moves, oldest first: after `since_id`, else from the last `hours`."""
    return await transitions.recent(session, since_id=since_id, hours=hours, limit=limit)


@router.get("/flows")
async def get_flows(days: float = Query(7, gt=0, le=3650), session: AsyncSession = Depends(get_session)):
    """Packets per edge (from, to) over the last `days`: sizes the pipes."""
    return await transitions.flows(session, days=days)
