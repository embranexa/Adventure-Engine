"""HTTP + WebSocket endpoints, one module per area. All are mounted under /api."""

from fastapi import APIRouter

from backend.routers import adventures, events, geo, live, media, objects, sources, state, transitions, workspace

api_router = APIRouter()
for module in (workspace, events, adventures, objects, sources, state, transitions, media, geo, live):
    api_router.include_router(module.router)
