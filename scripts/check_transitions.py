"""Exercise every signal chain move against a COPY of the database and check the log.

    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python scripts/check_transitions.py

After each step it checks that:
  - both counting rules hold (BUILD_PLAN.md, section 1)
  - replaying the step's transitions on the node counts from before gives exactly the
    node counts after (so the log can drive the twin)
  - every observed transition was broadcast
The harvest uses fake events instead of the real crawler (no network).
"""

import asyncio
import os
import sys
import uuid
from collections import Counter
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.environ.get("ADVENTURE_DB_PATH"):
    sys.exit("set ADVENTURE_DB_PATH to a copy of the database: this script changes it")

from sqlalchemy import func, select, update  # noqa: E402

from backend.crawlers import CRAWLERS  # noqa: E402
from backend.db.base import DATA_DIR, DB_PATH, SessionLocal, utcnow  # noqa: E402
from backend.db.models import (  # noqa: E402
    CENTRIFUGE_NODE, PHASE_NODES, SUMP_NODE, Adventure, Event, EventSource, Transition, harvester_node,
)
from backend.db.setup import init_db  # noqa: E402
from backend.services import adventures, entities, roadmap, sync, triage  # noqa: E402
from backend.services.hub import hub  # noqa: E402

if DB_PATH.resolve() == (DATA_DIR / "adventure.db").resolve():
    sys.exit("refusing to run against the real database")

SOURCE_NODES = {"outside", "forge"}  # packets appear from these (not counted)
broadcast_ids: list[int] = []


async def fake_broadcast(type_, **payload):
    if type_ == "transitions":
        broadcast_ids.extend(t["id"] for t in payload["transitions"])


hub.broadcast = fake_broadcast  # type: ignore[method-assign]


async def node_counts() -> Counter:
    async with SessionLocal() as s:
        linked = set((await s.scalars(select(Adventure.event_id).where(Adventure.event_id.is_not(None)))).all())
        n: Counter = Counter()
        for e, src in (await s.execute(select(Event, EventSource.name).join(EventSource))).all():
            if e.review == "harvested":
                n[harvester_node(src)] += 1
            elif e.review == "new":
                n[CENTRIFUGE_NODE] += 1
            elif e.review == "ignored" and e.id not in linked:
                n[SUMP_NODE] += 1
        for phase, count in (await s.execute(select(Adventure.phase, func.count()).group_by(Adventure.phase))).all():
            n[PHASE_NODES[phase]] += count
        n_events = await s.scalar(select(func.count()).select_from(Event))
        n_adventures = await s.scalar(select(func.count()).select_from(Adventure))
    # counting rules
    core = sum(n[v] for v in PHASE_NODES.values())
    assert core == n_adventures, f"rule 1: {core} != {n_adventures}"
    net = sum(c for k, c in n.items() if k.startswith("harvester:")) + n[CENTRIFUGE_NODE] + n[SUMP_NODE] + len(linked)
    assert net == n_events, f"rule 2: {net} != {n_events}"
    return +n


async def last_id() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.max(Transition.id))) or 0


async def step(label: str, action, expect: dict[tuple[str, str], int] | None = None):
    before, since = await node_counts(), await last_id()
    await action()
    await asyncio.sleep(0.01)  # let broadcast tasks run
    async with SessionLocal() as s:
        new = (await s.scalars(select(Transition).where(Transition.id > since).order_by(Transition.id))).all()
    replayed = Counter(before)
    for t in new:
        if t.subject == "link":
            continue  # entities aren't rows: links don't change levels
        if t.from_node not in SOURCE_NODES:
            replayed[t.from_node] -= 1
        if t.to_node != "outside":  # abandoned: gone from the chain
            replayed[t.to_node] += 1
    after = await node_counts()
    assert +replayed == after, f"{label}: replay {dict(+replayed)} != actual {dict(after)}"
    edges = Counter((t.from_node, t.to_node) for t in new)
    if expect is not None:
        assert dict(edges) == expect, f"{label}: edges {dict(edges)} != expected {expect}"
    missing = {t.id for t in new} - set(broadcast_ids)
    assert not missing, f"{label}: not broadcast: {missing}"
    print(f"ok  {label:<34} {dict(edges)}")


def fake_events(n: int, past: int = 0):
    now = utcnow()
    for i in range(n):
        start = now - timedelta(days=2) if i < past else now + timedelta(days=3 + i)
        yield {"api_id": f"check-{i}", "title": f"Check event {i}", "start_time": start,
               "end_time": start + timedelta(hours=2), "url": f"https://example.com/check-{i}", "city": "Testville"}


async def main():
    await init_db({name: c.URL for name, c in CRAWLERS.items()})
    await triage.sweep_missed()  # settle real adventures first: a harvest runs the sweeper too
    luma = CRAWLERS["luma"]
    h = harvester_node("luma")

    async def harvest(n):
        async def fetch(client):
            return list(fake_events(n, past=1))
        luma.fetch_events = fetch
        await sync.sync_source("luma")

    await step("harvest 5", lambda: harvest(5), {("outside", h): 5})
    await step("harvest again (+1 new)", lambda: harvest(6), {("outside", h): 1})
    async with SessionLocal() as s:
        ids = {e.api_id: e.id for e in (await s.scalars(select(Event).where(Event.api_id.like("check-%")))).all()}
    # the harvester may already hold real events from the copied database: they move too
    held = (await node_counts())[h]
    assert held >= 6, f"harvester holds {held}, expected at least the 6 fake events"
    await step("feed", lambda: triage.feed_source("luma"), {(h, "centrifuge"): held})
    await step("siphon", lambda: triage.siphon_source("luma"), {("centrifuge", h): held})
    await step("feed again", lambda: triage.feed_source("luma"), {(h, "centrifuge"): held})

    state = {}

    async def pass_(key, name):
        state[name] = uuid.UUID(await triage.pass_event(ids[key]))
    await step("pass A", lambda: pass_("check-1", "A"), {("centrifuge", "hopper"): 1})
    await step("pass P (past event)", lambda: pass_("check-0", "P"), {("centrifuge", "hopper"): 1})

    async def age_p():
        async with SessionLocal() as s:
            await s.execute(update(Adventure).where(Adventure.id == state["P"])
                            .values(phase_changed_at=utcnow() - timedelta(days=3)))
            await s.commit()
        assert await triage.sweep_missed() == 1
    await step("sweeper kills P", age_p, {("hopper", "necropolis"): 1})
    # weekly and all-day events (resources/UPGRADES_PLAN.md, U4): the sweeper waits for their end
    async def make_timed():
        now = utcnow()
        state["W"] = uuid.UUID((await adventures.create_adventure({
            "type": "event", "title": "Check weekly", "start_time": now - timedelta(days=10),
            "end_time": now - timedelta(days=10) + timedelta(hours=2), "recurrence": {"days": [0, 3]}}))["id"])
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        state["D"] = uuid.UUID((await adventures.create_adventure({
            "type": "event", "title": "Check all day", "start_time": today - timedelta(days=2),
            "end_time": today, "all_day": True}))["id"])
        async with SessionLocal() as s:
            for key in ("W", "D"):
                await s.execute(update(Adventure).where(Adventure.id == state[key])
                                .values(phase_changed_at=now - timedelta(days=11)))
            await s.commit()
    await step("forge a weekly and an all-day event", make_timed, {("forge", "hopper"): 2})

    async def sweep_none():
        assert await triage.sweep_missed() == 0, "the sweeper killed a weekly or an all-day event too early"
    await step("sweeper spares weekly and all-day", sweep_none, {})

    async def end_weekly():
        await adventures.update_adventure(state["W"], {"recurrence": {"days": [0, 3], "until": (utcnow() - timedelta(days=5)).date()}})
        assert await triage.sweep_missed() == 1
    await step("weekly with a past end is missed", end_weekly, {("hopper", "necropolis"): 1})
    await step("ignore B", lambda: triage.ignore_event(ids["check-2"]), {("centrifuge", "sump"): 1})
    await step("purge", triage.purge_centrifuge, {("centrifuge", "sump"): held - 3})  # all but A, P and B
    await step("revive C from the sump", lambda: triage.revive_event(ids["check-3"]), {("sump", "hopper"): 1})
    await step("A -> classifying", lambda: triage.set_phase(state["A"], "classifying"), {("hopper", "refinery"): 1})
    await step("A -> decomposing", lambda: triage.set_phase(state["A"], "decomposing"), {("refinery", "alembic"): 1})
    await step("kill A", lambda: triage.kill_adventure(state["A"]), {("alembic", "necropolis"): 1})
    await step("revive A", lambda: triage.revive_adventure(state["A"]), {("necropolis", "alembic"): 1})
    await step("revive P via its event", lambda: triage.revive_event(ids["check-0"]), {("necropolis", "hopper"): 1})

    async def forge():
        state["F"] = uuid.UUID((await adventures.create_adventure({"type": "item", "title": "Check item"}))["id"])
    await step("forge an item", forge, {("forge", "hopper"): 1})

    # the roadmap moves its adventure (resources/UPGRADES_PLAN.md, U3)
    async def forge_r():
        state["R"] = uuid.UUID((await adventures.create_adventure({"type": "item", "title": "Check roadmap"}))["id"])
        for phase in ("classifying", "decomposing"):
            await triage.set_phase(state["R"], phase)
    await step("forge R into the alembic", forge_r, {("forge", "hopper"): 1, ("hopper", "refinery"): 1, ("refinery", "alembic"): 1})

    def plan(done):
        return lambda: roadmap.save_roadmap(state["R"], {
            "actions": [{"id": "A1", "title": "One"}, {"id": "A2", "title": "Two"}], "edges": [], "done": done})
    await step("roadmap drafted (nothing done)", plan([]), {})
    await step("first action done -> alloy", plan(["A1"]), {("alembic", "crucible"): 1})
    await step("all done stays alloy", plan(["A1", "A2"]), {})
    await step("promote R to animus", lambda: triage.set_phase(state["R"], "consuming"), {("crucible", "arena"): 1})
    await step("un-complete one -> alloy", plan(["A1"]), {("arena", "crucible"): 1})
    await step("un-complete the last -> distillate", plan([]), {("crucible", "alembic"): 1})
    await step("animus by hand", lambda: triage.set_phase(state["R"], "consuming"), {("alembic", "arena"): 1})
    async with SessionLocal() as s:
        r = await s.get(Adventure, state["R"])
        assert r is not None and r.roadmap and sorted(r.roadmap["done"]) == ["A1", "A2"], f"by hand: done = {r and r.roadmap}"
    print("ok  animus by hand marks every action done")

    async def make_sites():
        state["s1"] = uuid.UUID((await entities.create_entity({"type": "site", "name": "Check site 1"}))["id"])
        state["s2"] = uuid.UUID((await entities.create_entity({"type": "site", "name": "Check site 2"}))["id"])
        state["p"] = uuid.UUID((await entities.create_entity({"type": "deity", "name": "Check deity"}))["id"])
    await step("create entities", make_sites, {})
    await step("link site 1 to A", lambda: entities.link(state["A"], state["s1"]), {("codex", "refinery"): 1})
    await step("link site 2 (replaces 1)", lambda: entities.link(state["A"], state["s2"]),
               {("refinery", "codex"): 1, ("codex", "refinery"): 1})
    await step("link deity", lambda: entities.link(state["A"], state["p"]), {("codex", "refinery"): 1})
    await step("unlink deity", lambda: entities.unlink(state["A"], state["p"]), {("refinery", "codex"): 1})
    await step("delete site 2", lambda: entities.delete_entity(state["s2"]), {("refinery", "codex"): 1})

    async def to_archive():
        for phase in ("classifying", "decomposing", "constructing", "consuming", "completed", "decommissioned"):
            await triage.set_phase(state["F"], phase)
    await step("forge item to the archive", to_archive, {
        ("hopper", "refinery"): 1, ("refinery", "alembic"): 1, ("alembic", "crucible"): 1,
        ("crucible", "arena"): 1, ("arena", "treasury"): 1, ("treasury", "archive"): 1})
    await step("set the same phase (no-op)", lambda: triage.set_phase(state["F"], "decommissioned"), {})
    print("all checks passed")


asyncio.run(main())
