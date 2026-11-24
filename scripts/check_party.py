"""Exercise players, parties and stewards against a COPY of the database.

    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python scripts/check_party.py
"""

import asyncio
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.environ.get("ADVENTURE_DB_PATH"):
    sys.exit("set ADVENTURE_DB_PATH to a copy of the database: this script changes it")

from sqlalchemy import func, select  # noqa: E402

from backend.db.base import DATA_DIR, DB_PATH, SessionLocal  # noqa: E402
from backend.db.models import AdventureEntity, Entity, EntityLink, PartyLog, Steward  # noqa: E402
from backend.db.queries import list_adventures, list_entities  # noqa: E402
from backend.db.setup import init_db  # noqa: E402
from backend.schemas.state import FilterState  # noqa: E402
from backend.services import adventures, enshrinings, entities, party, triage  # noqa: E402

if DB_PATH.resolve() == (DATA_DIR / "adventure.db").resolve():
    sys.exit("refusing to run against the real database")

U = uuid.UUID


async def adv(id_):
    async with SessionLocal() as s:
        return next(a for a in await list_adventures(s) if a["id"] == id_)


async def ent(id_):
    async with SessionLocal() as s:
        return next(e for e in await list_entities(s) if e["id"] == id_)


async def refused(coro, *kinds):
    try:
        await coro
    except kinds:
        return
    raise AssertionError("should have been refused")


async def member(a, p):
    return next((e for e in (await adv(a))["entities"] if e["id"] == p), None)


async def main():
    await init_db({})
    await init_db({})  # a second start changes nothing
    async with SessionLocal() as s:
        assert not await s.scalar(select(func.count()).select_from(Entity).where(Entity.type == "contact"))
        q = select(func.count()).select_from(AdventureEntity).join(Entity, Entity.id == AdventureEntity.entity_id)
        assert not await s.scalar(q.where(Entity.type == "player", AdventureEntity.status.is_(None)))
        print("migrated players:", [(e["name"], a["title"], e["status"]) for a in await list_adventures(s)
                                    for e in a["entities"] if e["type"] == "player"])
    f = FilterState.model_validate({"facets": {"contact": {"x": "include"}}, "lens": "contact"})
    assert f.lens == "player" and "player" in f.facets

    p = (await entities.create_entity({"type": "player", "name": "Test player"}))["id"]
    org = (await entities.create_entity({"type": "organization", "name": "Test org"}))["id"]
    site = (await entities.create_entity({"type": "site", "name": "Test site"}))["id"]
    a = (await adventures.create_adventure({"type": "event", "title": "Test"}))["id"]

    # details
    e = await entities.update_entity(U(p), {"details": {"archetype": "cleric", "warmth": 2, "tags": ["A", "a ", ""]}})
    assert e["details"] == {"archetype": "cleric", "warmth": 2, "tags": ["a"]}, e
    for bad in ({"archetype": "warden"}, {"warmth": 6}, {"warmth": True}, {"tags": "x"}, {"shoe": "9"}):
        await refused(entities.update_entity(U(p), {"details": bad}), entities.InvalidEntity)
    await refused(entities.update_entity(U(org), {"details": {"warmth": 1}}), entities.InvalidEntity)

    # affinities and wardens
    await entities.set_entity_link(U(p), U(site), "affinity", True)
    await entities.set_entity_link(U(org), U(site), "warden", True)
    assert (await ent(p))["affinities"] == [site] and (await ent(site))["wardens"] == [org]
    await refused(entities.set_entity_link(U(org), U(site), "affinity", True), entities.InvalidEntity)
    await refused(entities.set_entity_link(U(site), U(site), "warden", True), entities.InvalidEntity)

    # party
    await entities.link(U(a), U(p))
    assert (await member(a, p))["status"] == "resonant" and not (await adv(a))["collaboration"]
    await party.set_member(U(a), U(p), {"status": "charging", "note": " hi ", "follow_up": "2026-12-01"})
    m = await member(a, p)
    assert (m["status"], m["note"], m["follow_up"]) == ("charging", "hi", "2026-12-01")
    await refused(party.set_member(U(a), U(p), {"follow_up": "soon"}), party.InvalidParty)
    await refused(party.set_member(U(a), U(p), {"status": "annealed"}), party.InvalidParty)
    await refused(party.set_member(U(a), U(org), {}), party.InvalidParty)
    await party.set_member(U(a), U(p), {"status": "bonded"})
    assert (await adv(a))["collaboration"] and (await member(a, p))["note"] == "hi"

    # aftermath nudges warmth, and a change of mind takes it back
    await triage.set_phase(U(a), "completed")
    for status, warmth in (("annealed", 3), ("repelled", 1), ("neutralized", 2), ("annealed", 3), ("bonded", 2), ("annealed", 3)):
        await party.set_member(U(a), U(p), {"status": status})
        assert (await ent(p))["details"]["warmth"] == warmth, status
    await party.set_member(U(a), U(p), {"impact": "carried us"})
    m = await member(a, p)
    assert (m["impact"], m["note"], m["status"]) == ("carried us", "hi", "annealed")
    await refused(party.set_member(U(a), U(p), {"impact": "x" * 6000}), party.InvalidParty)
    await entities.unlink(U(a), U(p))
    assert (await ent(p))["details"]["warmth"] == 2 and not await member(a, p)

    # stewards: a player can be both, and stewarding isn't collaborating
    await party.set_steward(U(a), U(p), "herald", True)
    await party.set_steward(U(a), U(org), "commissioner", True)
    assert len((await adv(a))["stewards"]) == 2 and not (await adv(a))["collaboration"]
    await refused(party.set_steward(U(a), U(p), "warden", True), party.InvalidParty)
    await refused(party.set_steward(U(a), U(site), "herald", True), party.InvalidParty)

    # a player discovered on seal is emergent
    await enshrinings.save(U(a), {"verdict": [2, 2], "link": None, "notes": "", "gains": [], "losses": [], "moves": [],
                                  "discoveries": [{"type": "player", "name": "Test found", "entity_id": None}]}, seal=True)
    found = next(e for e in (await adv(a))["entities"] if e["name"] == "Test found")
    assert found["status"] == "emergent" and (await adv(a))["collaboration"]

    async with SessionLocal() as s:
        log = await party.history(s, U(a))
    assert (log[-1]["from"], log[-1]["to"]) == (None, "resonant") and any(r["to"] is None for r in log)

    # deleting leaves nothing behind
    await triage.kill_adventure(U(a))
    await adventures.abandon_adventure(U(a))
    for e in (p, org, site, found["id"]):
        await entities.delete_entity(U(e))
    async with SessionLocal() as s:
        for t, cols in ((EntityLink, ("from_id", "to_id")), (Steward, ("adventure_id", "entity_id")), (PartyLog, ("adventure_id", "player_id"))):
            for c in cols:
                n = await s.scalar(select(func.count()).select_from(t).where(getattr(t, c).in_([U(p), U(org), U(site), U(a)])))
                assert not n, (t, c, n)
    print("all good")


asyncio.run(main())
