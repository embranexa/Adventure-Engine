"""Action roadmaps (the Anvil): one dependency graph of actions per adventure.

The interface calls actions quests. A roadmap is stored on its adventure as JSON:

    {"actions": [{"id": "A1", "title": "Buy tickets", "notes": "...", "skills": [...]}, ...],   # notes and skills (ids) optional
     "edges":   [["A1", "A2"], ...],     # A1 must be done before A2
     "done":    ["A1", ...]}

An action is locked until every action pointing to it is done. Its "bottlenecks"
(incomplete actions whose prerequisites are all done) are the quests in the quest log;
the frontend works those out (frontend/js/lib/roadmap.js), the server only keeps the
graph valid: known ids, no self-links, no cycles, and nothing done behind an
unfinished prerequisite.

The roadmap also moves its adventure (the user's rule, resources/UPGRADES_PLAN.md U3), for
adventures in the Anvil or later (never queued, classifying or killed): no action done
-> armature (decomposing), or alloy if one is a target; some done -> alloy (constructing); all done -> stays where it
is (promotion to animus is the Promote button), except a armature becomes alloy. So
un-completing an action on an animus, artifact or relic sends it back to alloy. Moving an
adventure by hand to animus or later marks every action done (triage.set_phase).
"""

import re
import uuid
from typing import Any

from backend.db.base import SessionLocal
from backend.db.queries import list_adventures
from backend.services import ledger
from backend.services.hub import hub
from backend.services.targets import is_targeted
from backend.services.triage import NotFound, _get_adventure, _leave_treasury, _set_phase

MAX_ACTIONS = 200
# phases whose adventure the roadmap moves (see phase_for)
ROADMAP_PHASES = ("decomposing", "constructing", "consuming", "completed", "decommissioned")

MAX_TITLE = 200
MAX_NOTES = 2000
MAX_SKILLS = 10
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
        raise InvalidRoadmap(f"at most {MAX_ACTIONS} quests")
    clean_actions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for action in actions:
        action_id = str(action.get("id", ""))
        title = str(action.get("title", "")).strip()
        if not ID_PATTERN.match(action_id):
            raise InvalidRoadmap(f"bad quest id {action_id!r} (letters, digits, - and _ only)")
        if action_id in seen:
            raise InvalidRoadmap(f"quest {action_id} appears twice")
        seen.add(action_id)
        clean: dict[str, Any] = {"id": action_id, "title": (title or action_id)[:MAX_TITLE]}
        notes = str(action.get("notes") or "").strip()
        if notes:
            clean["notes"] = notes[:MAX_NOTES]
        skills = list(dict.fromkeys(str(s) for s in action.get("skills") or []))
        if any(not ID_PATTERN.match(s) for s in skills):
            raise InvalidRoadmap(f"quest {action_id} has a bad skill id")
        if skills:
            clean["skills"] = skills[:MAX_SKILLS]
        clean_actions.append(clean)

    ids = [a["id"] for a in clean_actions]
    edges: list[tuple[str, str]] = []
    for edge in raw.get("edges") or []:
        if len(edge) != 2:
            raise InvalidRoadmap("each link needs a source and a target")
        a, b = str(edge[0]), str(edge[1])
        if a not in seen or b not in seen:
            raise InvalidRoadmap(f"link {a} --> {b} names an unknown quest")
        if a == b:
            raise InvalidRoadmap(f"quest {a} can't depend on itself")
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


def phase_for(phase: str, roadmap: dict[str, Any] | None, targeted: bool = False) -> str:
    """The phase an adventure belongs in given its roadmap (see the module docstring).
    `targeted`: one of its quests is a target, so building has begun (services/targets.py)."""
    if phase not in ROADMAP_PHASES or not roadmap or not roadmap.get("actions"):
        return phase
    total, done = len(roadmap["actions"]), len(roadmap.get("done") or [])
    if done == 0:
        return "constructing" if targeted else "decomposing"
    if done < total:
        return "constructing"
    return "constructing" if phase == "decomposing" else phase


async def save_roadmap(adventure_id: uuid.UUID, raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Replace an adventure's roadmap (None or no actions clears it), move the adventure
    if the roadmap says so (phase_for), then broadcast."""
    roadmap = normalize(raw) if raw else None
    if roadmap is not None and not roadmap["actions"]:
        roadmap = None
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        adventure.roadmap = roadmap
        target = phase_for(adventure.phase, roadmap, await is_targeted(session, adventure))
        if target != adventure.phase:
            await _leave_treasury(session, adventure, target)
            _set_phase(adventure, target)  # logged as a transition like any phase change
        paid = await ledger.settle(session, adventure)
        await session.commit()
        adventures = await list_adventures(session)
    await hub.broadcast("adventures", adventures=adventures)
    if paid:
        await ledger.broadcast()
    return roadmap


__all__ = ["InvalidRoadmap", "NotFound", "find_cycle", "normalize", "phase_for", "save_roadmap"]
