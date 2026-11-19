"""Crawler sources: list them and trigger syncs."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.crawlers import CRAWLERS
from backend.db.base import get_session
from backend.db.queries import list_sources
from backend.services import sync

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
async def get_sources(session: AsyncSession = Depends(get_session)):
    return await list_sources(session)


@router.post("/{name}/sync", status_code=202)
async def sync_source(name: str):
    """Start a crawl in the background. Progress arrives as `source_status` messages."""
    if name not in CRAWLERS:
        raise HTTPException(404, f"unknown source: {name}")
    if not sync.start_sync(name):
        raise HTTPException(409, f"{name} is already syncing")
    return {"status": "started", "source": name}
