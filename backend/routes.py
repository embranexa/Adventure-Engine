import asyncio
import copy
import math
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.models import PANELS_METADATA, DEFAULT_LAYOUT_TREE, state_store, LayoutPayload

router = APIRouter()

@router.get("/workspace")
async def get_workspace():
    return {"panels": PANELS_METADATA, "tree": state_store["tree"]}

@router.put("/workspace/layout")
async def save_layout(payload: LayoutPayload):
    state_store["tree"] = payload.tree
    return {"status": "saved", "tree": state_store["tree"]}

@router.post("/workspace/reset")
async def reset_layout():
    state_store["tree"] = copy.deepcopy(DEFAULT_LAYOUT_TREE)
    return {"panels": PANELS_METADATA, "tree": state_store["tree"]}

@router.websocket("/ws")
async def telemetry_socket(websocket: WebSocket):
    await websocket.accept()
    tick = 0.0
    try:
        while True:
            tick += 0.08
            # Generate 4 dynamic arcane-cyberpunk entities on the virtual map
            entities = [
                {
                    "id": "VALKYRIE-01",
                    "name": "Seraphim Cyber-Knight",
                    "faction": "AETHER-CORP",
                    "mana": int(78 + 20 * math.sin(tick)),
                    "x": round(0.50 + 0.28 * math.cos(tick * 0.7), 4),
                    "y": round(0.50 + 0.24 * math.sin(tick * 0.7), 4),
                    "color": "#00f0ff",
                },
                {
                    "id": "WRAITH-09",
                    "name": "Void Netrunner",
                    "faction": "SHADOW-SYNTH",
                    "mana": int(64 + 30 * math.cos(tick * 1.1)),
                    "x": round(0.50 + 0.34 * math.sin(tick * 0.5), 4),
                    "y": round(0.50 + 0.28 * math.cos(tick * 0.9), 4),
                    "color": "#ff2a85",
                },
                {
                    "id": "ARCHON-04",
                    "name": "Chrono-Weaver Construct",
                    "faction": "SOLARIS-ORDER",
                    "mana": int(88 + 10 * math.sin(tick * 1.5)),
                    "x": round(0.50 + 0.18 * math.cos(-tick * 1.1), 4),
                    "y": round(0.50 + 0.18 * math.sin(-tick * 1.1), 4),
                    "color": "#f59e0b",
                },
                {
                    "id": "DRACONIC-X",
                    "name": "Elder Wyrm AI-Node",
                    "faction": "ABYSSAL-NET",
                    "mana": int(92 + 7 * math.cos(tick * 0.4)),
                    "x": round(0.50 + 0.38 * math.cos(tick * 0.3 + 2.0), 4),
                    "y": round(0.50 + 0.16 * math.sin(tick * 0.6 + 1.0), 4),
                    "color": "#a855f7",
                },
            ]

            spectrum = [
                round(40 + 45 * abs(math.sin(tick + i * 0.55)), 1)
                for i in range(12)
            ]

            await websocket.send_json({
                "timestamp": round(time.time(), 1),
                "sweepAngle": round((tick * 48) % 360, 1),
                "aetherFlux": round(84.0 + 14.5 * math.sin(tick * 0.6), 1),
                "entities": entities,
                "spectrum": spectrum,
            })
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        pass
