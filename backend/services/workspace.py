"""Workspace layout: panel definitions, the default dock tree, and the current layout.

The layout lives in memory, so it resets to DEFAULT_LAYOUT_TREE on server restart.
"""

import copy
from typing import Any

# `kind` picks the frontend component (frontend/js/components/panels/index.js).
PANELS_METADATA = {
    "node":     {"id": "node",     "title": "Node // What",     "category": "EVENT-LOCK", "status": "LIVE", "kind": "node"},
    "calendar": {"id": "calendar", "title": "Calendar // When", "category": "CHRONO-MAP", "status": "LIVE", "kind": "calendar"},
}

DEFAULT_LAYOUT_TREE: dict[str, Any] = {
    "id": "root-split",
    "type": "split",
    "direction": "horizontal",
    "ratio": 28,
    "first": {"id": "leaf-node", "type": "leaf", "tabs": ["node"], "activeTab": "node"},
    "second": {"id": "leaf-calendar", "type": "leaf", "tabs": ["calendar"], "activeTab": "calendar"},
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
