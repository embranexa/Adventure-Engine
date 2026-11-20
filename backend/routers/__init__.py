"""HTTP + WebSocket endpoints, one module per area. All are mounted under /api."""

from fastapi import APIRouter

from backend.routers import adventures, events, live, objects, sources, state, workspace

api_router = APIRouter()
for module in (workspace, events, adventures, objects, sources, state, live):
    api_router.include_router(module.router)
