"""Exercise battles, objectives, preparations, spells, feedback and pins against a COPY of the database.

    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python scripts/check_upgrades.py
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.environ.get("ADVENTURE_DB_PATH"):
    sys.exit("set ADVENTURE_DB_PATH to a copy of the database: this script changes it")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402
from backend.db.base import DATA_DIR, DB_PATH  # noqa: E402
from backend.services import geocode  # noqa: E402

if DB_PATH.resolve() == (DATA_DIR / "adventure.db").resolve():
    sys.exit("refusing to run against the real database")

geocode.start = lambda: None  # no network, and nothing left writing across the restart below

with TestClient(app) as c:
    def call(method, path, body=None, want=200):
        r = c.request(method, f"/api{path}", json=body)
        assert r.status_code == want, (method, path, r.status_code, r.text)
        return r.json()

    def entity(type_, name):
        return call("POST", "/entities", {"type": type_, "name": name})["id"]

    def adventure(type_, title, **kw):
        return call("POST", "/adventures", {"type": type_, "title": title, **kw})["id"]

    def get(id_):
        return next(a for a in call("GET", "/adventures") if a["id"] == id_)

    spells = [e for e in call("GET", "/entities") if e["type"] == "spell"]
    assert len(spells) == 11, len(spells)
    skill, deity, other, site = entity("skill", "T skill"), entity("deity", "T deity"), entity("deity", "T other"), entity("site", "T site")
    player = entity("player", "T foe")

    # spells can't be linked to anything
    call("PUT", f"/entities/{player}/affinities/{spells[0]['id']}", want=422)
    x = adventure("performance", "T link")
    call("PUT", f"/adventures/{x}/entities/{spells[0]['id']}", want=409)

    # when/where: battles and performances may have one, items never
    at = "2030-01-01T20:00:00+00:00"
    b = adventure("battle", "T battle", start_time=at)
    assert get(b)["start"]
    p = adventure("performance", "T song")
    assert get(p)["start"] is None
    call("PATCH", f"/adventures/{p}", {"start_time": at})
    call("POST", "/adventures", {"type": "item", "start_time": at}, want=422)
    call("PUT", f"/adventures/{b}/entities/{site}")
    assert get(b)["venue"] == "T site"

    # adversaries
    call("PATCH", f"/adventures/{b}", {"adversaries": [{"entity_id": player, "name": ""}, {"entity_id": None, "name": " Doubt "}, {"name": ""}]})
    assert [x["name"] for x in get(b)["adversaries"]] == ["T foe", "Doubt"]
    assert not get(b)["collaboration"]
    call("PATCH", f"/adventures/{b}", {"adversaries": [{"entity_id": site}]}, want=422)
    call("PATCH", f"/adventures/{p}", {"adversaries": [{"name": "x"}]}, want=422)

    # objectives
    call("PATCH", f"/adventures/{b}", {"objectives": [{"id": "1", "text": "Win"}, {"id": "2", "text": " ", "kind": "bonus"}]})
    assert get(b)["objectives"] == [{"id": "1", "text": "Win", "kind": "primary", "state": "open"}]
    call("PATCH", f"/adventures/{b}", {"objectives": [{"id": "1", "text": "a"}, {"id": "1", "text": "b"}]}, want=422)
    call("PATCH", f"/adventures/{b}", {"objectives": [{"id": "1", "text": "a", "state": "maybe"}]}, want=422)

    # gear: only owned items that share a deity
    item, stranger = adventure("item", "T gear"), adventure("item", "T stranger")
    call("PUT", f"/adventures/{b}/entities/{deity}")
    call("PUT", f"/adventures/{item}/entities/{deity}")
    call("PUT", f"/adventures/{stranger}/entities/{other}")
    prep = [{"id": "g", "item": item, "checked": True}, {"id": "s", "text": "Slept", "checked": True, "effects": [{"skill": skill, "rating": 2}]}]
    call("PATCH", f"/adventures/{b}", {"preparations": prep}, want=422)  # not owned yet
    for i in (item, stranger):
        call("PUT", f"/adventures/{i}/phase", {"phase": "completed"})
    call("PATCH", f"/adventures/{b}", {"preparations": [{"id": "x", "item": stranger}]}, want=422)
    call("PATCH", f"/adventures/{b}", {"preparations": prep})
    assert [x["checked"] for x in get(b)["preparations"]] == [True, True]
    for rating in (0, 4):
        call("PATCH", f"/adventures/{b}", {"preparations": [{"id": "s", "text": "x", "effects": [{"skill": skill, "rating": rating}]}]}, want=422)
        call("PUT", f"/adventures/{item}/item", {"effects": [{"skill": skill, "rating": rating}]}, want=422)
    call("PUT", f"/adventures/{item}/item", {"effects": [{"skill": skill, "rating": -3}, {"skill": "gone", "rating": 1}]})
    assert get(item)["item"]["effects"] == [{"skill": skill, "rating": -3, "text": ""}]

    # roles; feedback and spells in the analysis; a battle seals without a link
    call("PUT", f"/adventures/{b}/party/{entity('player', 'T ally')}", {"status": "bonded", "role": " sound "})
    assert next(e for e in get(b)["entities"] if e["type"] == "player")["role"] == "sound"
    call("PUT", f"/adventures/{b}/phase", {"phase": "completed"})
    call("PUT", f"/adventures/{b}/enshrining", {
        "verdict": [2, 2], "seal": True, "moves": [{"text": "", "grade": "best", "spell": spells[0]["id"], "skills": [skill]}],
        "feedback": [{"key": "s", "label": "Slept", "result": "helped"}, {"key": "g", "label": "Gear"}, {"key": "own:1", "label": "Rain"}]})
    e = get(b)["enshrining"]
    assert [f["key"] for f in e["feedback"]] == ["s", "own:1"] and e["moves"][0]["spell"] == spells[0]["id"] and e["sealed_at"]
    call("PUT", f"/adventures/{b}/enshrining", {"verdict": [2, 2], "feedback": [{"key": "s", "result": "maybe"}]}, want=422)

    # a sealed play teaches its spell its skills, for as long as it's sealed
    def taught():
        return next(e for e in call("GET", "/entities") if e["id"] == spells[0]["id"])["skills"]
    assert taught() == [skill]
    call("PUT", f"/adventures/{b}/phase", {"phase": "consuming"})
    assert taught() == []
    call("PUT", f"/adventures/{b}/phase", {"phase": "completed"})

    # pins and idols
    call("PUT", "/state/anvil", {"pins": [{"adventure": b, "action": "A1"}]})
    assert call("GET", "/state/anvil")["pins"][0]["action"] == "A1"
    call("PUT", "/state/idols", {"idols": {"vanguard": {"description": "x", "skills": [skill]}}})
    assert call("GET", "/state/idols")["idols"]["vanguard"]["skills"] == [skill]

    # deleted seeds stay deleted
    call("DELETE", f"/entities/{spells[1]['id']}")

with TestClient(app) as c:
    assert sum(e["type"] == "spell" for e in c.get("/api/entities").json()) == 10
print("all good")
