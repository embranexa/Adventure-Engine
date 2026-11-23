"""Workspace layout: panel definitions, the default dock tree, and the current layout.

The layout lives in memory, so it resets to DEFAULT_LAYOUT_TREE on server restart.
"""

import copy
from typing import Any

# Each panel: `kind` picks the frontend component (frontend/js/components/panels/index.js);
# `icon`, `name`, `question` and `flow` (input -> output) make its two-line title.
PANELS_METADATA = {
    "node": {
        "id": "node", "kind": "node", "icon": "eye",
        "name": "Refinery", "question": "why", "flow": ["ore", "essence"],
    },
    "classifier": {
        "id": "classifier", "kind": "classifier", "icon": "flask",
        "name": "Nexus", "question": "which", "flow": ["matter", "topology"],
    },
    "map": {
        "id": "map", "kind": "map", "icon": "compass",
        "name": "Atlas", "question": "where", "flow": ["matter", "space"],
    },
    "calendar": {
        "id": "calendar", "kind": "calendar", "icon": "clock",
        "name": "Calendar", "question": "when", "flow": ["matter", "time"],
    },
    "alembic": {
        "id": "alembic", "kind": "alembic", "icon": "alembic",
        "name": "Alembic", "question": "how", "flow": ["essence", "distillate"],
    },
    "scripter": {
        "id": "scripter", "kind": "scripter", "icon": "quill",
        "name": "Scripter", "question": "how", "flow": ["essence", "distillate"],
    },
    "codex": {
        "id": "codex", "kind": "codex", "icon": "codex",
        "name": "Codex", "question": "with", "flow": ["entities", "links"],
    },
    "quests": {
        "id": "quests", "kind": "quests", "icon": "scroll",
        "name": "Crucible", "question": "now", "flow": ["alloy", "animus"],
    },
    "ledger": {
        "id": "ledger", "kind": "ledger", "icon": "ledger",
        "name": "Ledger", "question": "what", "flow": ["matter", "list"],
    },
    "treasury": {
        "id": "treasury", "kind": "treasury", "icon": "crown",
        "name": "Treasury", "question": "how well", "flow": ["animus", "artifact"],
    },
    "necropolis": {
        "id": "necropolis", "kind": "necropolis", "icon": "tomb",
        "name": "Necropolis", "question": "why not", "flow": ["matter", "vestige"],
    },
    "signal_chain": {
        "id": "signal_chain", "kind": "twin", "icon": "gear",
        "name": "Signal Chain", "question": "all", "flow": ["flux", "relic"],
    },
}

DEFAULT_LAYOUT_TREE: dict[str, Any] = {
    "id": "root-split",
    "type": "split",
    "direction": "horizontal",
    "ratio": 25,
    "first": {"id": "leaf-node", "type": "leaf", "tabs": ["node", "scripter", "quests", "codex"], "activeTab": "quests"},
    "second": {
        "id": "top-split",
        "type": "split",
        "direction": "horizontal",
        "ratio": 50,
        "first": {"id": "leaf-classifier", "type": "leaf", "tabs": ["classifier", "alembic", "signal_chain"], "activeTab": "alembic"},
        "second": {
            "id": "split-map-calendar",
            "type": "split",
            "direction": "vertical",
            "ratio": 50,
            "first": {"id": "leaf-map", "type": "leaf", "tabs": ["map"], "activeTab": "map"},
            "second": {"id": "leaf-calendar", "type": "leaf", "tabs": ["calendar", "ledger"], "activeTab": "calendar"},
        },
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
