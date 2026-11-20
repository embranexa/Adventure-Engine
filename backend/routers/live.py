"""Live updates over a single WebSocket (message types: see services/hub.py)."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.db.base import SessionLocal
from backend.db.queries import list_adventures, list_events, list_objects, list_sources
from backend.services.hub import hub

router = APIRouter(tags=["live"])


@router.websocket("/ws")
async def live_socket(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        # snapshot so a fresh page has data without waiting for the next sync
        async with SessionLocal() as session:
            await hub.send(websocket, "events", events=await list_events(session))
            await hub.send(websocket, "adventures", adventures=await list_adventures(session))
            await hub.send(websocket, "objects", objects=await list_objects(session))
            for source in await list_sources(session):
                await hub.send(websocket, "source_status", source=source)
        while True:
            await websocket.receive_text()  # keeps the connection open; client messages unused
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(websocket)
