import copy
from typing import Dict, Any
from pydantic import BaseModel

PANELS_METADATA = {
    "p1":  {"id": "p1",  "title": "01 // Scrying Feed",    "category": "OPTIC-ETHER", "status": "LOCKED"},
    "p2":  {"id": "p2",  "title": "02 // Astral Nexus Map","category": "CARTOGRAPHY", "status": "ACTIVE"},
    "p3":  {"id": "p3",  "title": "03 // Aether Spectrum", "category": "RESONANCE",   "status": "PULSING"},
    "p4":  {"id": "p4",  "title": "04 // Neural Conduit",  "category": "SYNAPSE-C2",  "status": "ENCRYPTED"},
    "p5":  {"id": "p5",  "title": "05 // Warding Radar",   "category": "AEGIS-GRID",  "status": "SWEEPING"},
    "p6":  {"id": "p6",  "title": "06 // Guild Operatives","category": "VANGUARD",    "status": "SYNCED"},
    "p7":  {"id": "p7",  "title": "07 // Mana Requisition","category": "ALCHEMY",     "status": "CHARGED"},
    "p8":  {"id": "p8",  "title": "08 // Blackwall ICE",   "category": "DAEMON-SEC",  "status": "WARDED"},
    "p9":  {"id": "p9",  "title": "09 // Chrono-Tempest",  "category": "AETHER-MET",  "status": "VOLATILE"},
    "p10": {"id": "p10", "title": "10 // Grimoire Directives","category": "CONTRACT", "status": "SEALED"},
    "p11": {"id": "p11", "title": "11 // Soulcore Flux",   "category": "REACTOR",     "status": "99.9%"},
}

DEFAULT_LAYOUT_TREE: Dict[str, Any] = {
    "id": "root-split",
    "type": "split",
    "direction": "horizontal",
    "ratio": 24,
    "first": {
        "id": "left-col",
        "type": "split",
        "direction": "vertical",
        "ratio": 52,
        "first": {
            "id": "left-top",
            "type": "split",
            "direction": "vertical",
            "ratio": 50,
            "first": {"id": "leaf-1", "type": "leaf", "tabs": ["p1"], "activeTab": "p1"},
            "second": {"id": "leaf-2", "type": "leaf", "tabs": ["p3"], "activeTab": "p3"},
        },
        "second": {"id": "leaf-3", "type": "leaf", "tabs": ["p4", "p9"], "activeTab": "p4"},
    },
    "second": {
        "id": "main-right-split",
        "type": "split",
        "direction": "horizontal",
        "ratio": 66,
        "first": {
            "id": "center-col",
            "type": "split",
            "direction": "vertical",
            "ratio": 62,
            "first": {"id": "leaf-4", "type": "leaf", "tabs": ["p2"], "activeTab": "p2"},
            "second": {
                "id": "center-bottom-row",
                "type": "split",
                "direction": "horizontal",
                "ratio": 50,
                "first": {"id": "leaf-5", "type": "leaf", "tabs": ["p6"], "activeTab": "p6"},
                "second": {"id": "leaf-6", "type": "leaf", "tabs": ["p7", "p10"], "activeTab": "p7"},
            },
        },
        "second": {
            "id": "right-col",
            "type": "split",
            "direction": "vertical",
            "ratio": 36,
            "first": {"id": "leaf-7", "type": "leaf", "tabs": ["p5"], "activeTab": "p5"},
            "second": {
                "id": "right-bottom-split",
                "type": "split",
                "direction": "vertical",
                "ratio": 50,
                "first": {"id": "leaf-8", "type": "leaf", "tabs": ["p8"], "activeTab": "p8"},
                "second": {"id": "leaf-9", "type": "leaf", "tabs": ["p11"], "activeTab": "p11"},
            },
        },
    },
}

state_store = {
    "tree": copy.deepcopy(DEFAULT_LAYOUT_TREE)
}

class LayoutPayload(BaseModel):
    tree: Dict[str, Any]
