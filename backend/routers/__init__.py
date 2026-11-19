"""HTTP + WebSocket endpoints, one module per area. All are mounted under /api."""

from fastapi import APIRouter

from backend.routers import events, live, sources, workspace

api_router = APIRouter()
for module in (workspace, events, sources, live):
    api_router.include_router(module.router)
