"""Placeholder telemetry: four fake entities orbiting the map.

Broadcast to every connected browser by one shared loop, as the "telemetry"
message type. Replace with real data once the panels show events.
"""

import asyncio
import math
import time
from typing import Any

from backend.services.hub import hub

INTERVAL_S = 0.25


def make_packet(tick: float) -> dict[str, Any]:
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

    return {
        "timestamp": round(time.time(), 1),
        "aetherFlux": round(84.0 + 14.5 * math.sin(tick * 0.6), 1),
        "entities": entities,
    }


async def run_telemetry() -> None:
    """Broadcast forever; skips work while nobody is connected."""
    tick = 0.0
    while True:
        if hub.connections:
            tick += 0.08
            await hub.broadcast("telemetry", **make_packet(tick))
        await asyncio.sleep(INTERVAL_S)
