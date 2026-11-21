"""Sources and their Harvesters: list them, harvest (sync), feed and siphon.

    POST /sources/{name}/sync     harvest: crawl in the background, new events fill the harvester
    POST /sources/{name}/feed     harvester -> centrifuge (its events show in Discovery)
    POST /sources/{name}/siphon   centrifuge -> harvester (its events leave Discovery)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.crawlers import CRAWLERS
from backend.db.base import get_session
from backend.db.queries import list_sources
from backend.routers.errors import triage_errors
from backend.services import sync, triage

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


@router.post("/{name}/feed")
async def feed_source(name: str):
    """Pour the source's harvested events into the centrifuge."""
    with triage_errors():
        return {"moved": await triage.feed_source(name)}


@router.post("/{name}/siphon")
async def siphon_source(name: str):
    """Draw the source's events back out of the centrifuge into its harvester."""
    with triage_errors():
        return {"moved": await triage.siphon_source(name)}
