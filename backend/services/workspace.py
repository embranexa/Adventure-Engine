"""Workspace layout: panel definitions, the default dock tree, and the current layout.

The layout lives in memory, so it resets to DEFAULT_LAYOUT_TREE on server restart.
"""

import copy
from typing import Any

# `kind` picks the frontend component (frontend/js/components/panels/index.js).
PANELS_METADATA = {
    "node":     {"id": "node",     "title": "Node // What",     "category": "EVENT-LOCK", "status": "LIVE", "kind": "node"},
    "calendar": {"id": "calendar", "title": "Calendar // When", "category": "CHRONO-MAP", "status": "LIVE", "kind": "calendar"},
    "map":      {"id": "map",      "title": "Map // Where",     "category": "LEY-GRID",   "status": "LIVE", "kind": "map"},
    "filters":  {"id": "filters",  "title": "Filters // Which", "category": "SIEVE",      "status": "LIVE", "kind": "filters"},
    "classifier": {"id": "classifier", "title": "Assay // Why", "category": "KNOWLEDGE-GRAPH", "status": "LIVE", "kind": "classifier"},
}

DEFAULT_LAYOUT_TREE: dict[str, Any] = {
    "id": "root-split",
    "type": "split",
    "direction": "horizontal",
    "ratio": 26,
    "first": {
        "id": "left-split",
        "type": "split",
        "direction": "vertical",
        "ratio": 58,
        "first": {"id": "leaf-node", "type": "leaf", "tabs": ["node"], "activeTab": "node"},
        "second": {"id": "leaf-filters", "type": "leaf", "tabs": ["filters"], "activeTab": "filters"},
    },
    "second": {
        "id": "main-split",
        "type": "split",
        "direction": "vertical",
        "ratio": 60,
        "first": {
            "id": "top-split",
            "type": "split",
            "direction": "horizontal",
            "ratio": 50,
            "first": {"id": "leaf-classifier", "type": "leaf", "tabs": ["classifier"], "activeTab": "classifier"},
            "second": {"id": "leaf-map", "type": "leaf", "tabs": ["map"], "activeTab": "map"},
        },
        "second": {"id": "leaf-calendar", "type": "leaf", "tabs": ["calendar"], "activeTab": "calendar"},
    },
}


_state: dict[str, Any] = {"tree": copy.deepcopy(DEFAULT_LAYOUT_TREE)}


def get_tree() -> dict[str, Any]:
    return _state["tree"]


def save_tree(tree: dict[str, Any]) -> dict[str, Any]:
    _state["tree"] = tree
    return tree


def reset_tree() -> dict[str, Any]:
    _state["tree"] = copy.deepcopy(DEFAULT_LAYOUT_TREE)
    return _state["tree"]
