"""WebSocket hub: tracks connected browsers and pushes typed messages to them.

Every message is a JSON object with a "type" field:
    telemetry      fake map entities, ~4x/second (placeholder data)
    events         {"events": [...]}  full event list, on connect and after each sync
    source_status  {"source": {...}}  a crawler's status changed
"""

import asyncio
import logging
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

log = logging.getLogger(__name__)


class Hub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.connections.discard(ws)

    async def send(self, ws: WebSocket, type_: str, **payload: Any) -> None:
        await ws.send_json(jsonable_encoder({"type": type_, **payload}))

    async def broadcast(self, type_: str, **payload: Any) -> None:
        """Send to every connection concurrently; drop any that fail."""
        if not self.connections:
            return
        message = jsonable_encoder({"type": type_, **payload})
        targets = list(self.connections)
        results = await asyncio.gather(
            *(ws.send_json(message) for ws in targets), return_exceptions=True
        )
        for ws, result in zip(targets, results):
            if isinstance(result, Exception):
                log.info("dropping websocket after send error: %s", result)
                self.disconnect(ws)


hub = Hub()
