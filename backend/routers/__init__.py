"""HTTP + WebSocket endpoints, one module per area. All are mounted under /api."""

from fastapi import APIRouter

from backend.routers import adventures, deposit, events, geo, live, media, entities, party, sources, state, transitions, workspace

api_router = APIRouter()
for module in (workspace, events, adventures, entities, party, sources, state, transitions, media, geo, deposit, live):
    api_router.include_router(module.router)
