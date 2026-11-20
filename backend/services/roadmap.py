"""Action roadmaps (the Alembic): one dependency graph of actions per adventure.

A roadmap is stored on its adventure as JSON:

    {"actions": [{"id": "A1", "title": "Buy tickets"}, ...],
     "edges":   [["A1", "A2"], ...],     # A1 must be done before A2
     "done":    ["A1", ...]}

An action is locked until every action pointing to it is done. Its "bottlenecks"
(incomplete actions whose prerequisites are all done) are the quests in the quest log;
the frontend works those out (frontend/js/lib/roadmap.js), the server only keeps the
graph valid: known ids, no self-links, no cycles, and nothing done behind an
unfinished prerequisite.
"""

import re
import uuid
from typing import Any

from backend.db.base import SessionLocal
from backend.db.queries import list_adventures
from backend.services.hub import hub
from backend.services.triage import NotFound, _get_adventure

MAX_ACTIONS = 200
MAX_TITLE = 200
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


class InvalidRoadmap(Exception):
    pass


def find_cycle(ids: list[str], edges: list[tuple[str, str]]) -> list[str] | None:
    """A cycle in the graph as a list of ids (first repeated at the end), or None."""
    children: dict[str, list[str]] = {i: [] for i in ids}
    for a, b in edges:
        children[a].append(b)
    state: dict[str, int] = {}  # 1 = on the current path, 2 = finished
    path: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        path.append(node)
        for child in children[node]:
            if state.get(child) == 1:
                return path[path.index(child):] + [child]
            if child not in state and (found := visit(child)):
                return found
        path.pop()
        state[node] = 2
        return None

    for node in ids:
        if node not in state and (found := visit(node)):
            return found
    return None


def normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """Check a roadmap and return its clean form; raises InvalidRoadmap.

    Duplicate edges are dropped, `done` keeps only known ids, and an action marked done
    while one of its prerequisites isn't loses its mark (the same cascade as the UI).
    """
    actions = raw.get("actions") or []
    if len(actions) > MAX_ACTIONS:
        raise InvalidRoadmap(f"at most {MAX_ACTIONS} actions")
    clean_actions: list[dict[str, str]] = []
    seen: set[str] = set()
    for action in actions:
        action_id = str(action.get("id", ""))
        title = str(action.get("title", "")).strip()
        if not ID_PATTERN.match(action_id):
            raise InvalidRoadmap(f"bad action id {action_id!r} (letters, digits, - and _ only)")
        if action_id in seen:
            raise InvalidRoadmap(f"action {action_id} appears twice")
        seen.add(action_id)
        clean_actions.append({"id": action_id, "title": (title or action_id)[:MAX_TITLE]})

    ids = [a["id"] for a in clean_actions]
    edges: list[tuple[str, str]] = []
    for edge in raw.get("edges") or []:
        if len(edge) != 2:
            raise InvalidRoadmap("each link needs a source and a target")
        a, b = str(edge[0]), str(edge[1])
        if a not in seen or b not in seen:
            raise InvalidRoadmap(f"link {a} --> {b} names an unknown action")
        if a == b:
            raise InvalidRoadmap(f"action {a} can't depend on itself")
        if (a, b) not in edges:
            edges.append((a, b))
    if cycle := find_cycle(ids, edges):
        raise InvalidRoadmap("cycle: " + " --> ".join(cycle))

    parents: dict[str, list[str]] = {i: [] for i in ids}
    for a, b in edges:
        parents[b].append(a)
    done = {str(d) for d in raw.get("done") or []} & seen
    changed = True
    while changed:  # un-mark anything done behind an unfinished prerequisite
        changed = False
        for action_id in list(done):
            if any(p not in done for p in parents[action_id]):
                done.discard(action_id)
                changed = True

    return {
        "actions": clean_actions,
        "edges": [list(e) for e in edges],
        "done": [i for i in ids if i in done],  # in action order
    }


async def save_roadmap(adventure_id: uuid.UUID, raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Replace an adventure's roadmap (None or no actions clears it), then broadcast."""
    roadmap = normalize(raw) if raw else None
    if roadmap is not None and not roadmap["actions"]:
        roadmap = None
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        adventure.roadmap = roadmap
        await session.commit()
        adventures = await list_adventures(session)
    await hub.broadcast("adventures", adventures=adventures)
    return roadmap


__all__ = ["InvalidRoadmap", "NotFound", "find_cycle", "normalize", "save_roadmap"]
