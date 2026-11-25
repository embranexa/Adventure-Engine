"""Exercise weekly adventures (services/series.py) against a COPY of the database.

    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python scripts/check_series.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.environ.get("ADVENTURE_DB_PATH"):
    sys.exit("set ADVENTURE_DB_PATH to a copy of the database: this script changes it")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402
from backend.db.base import DATA_DIR, DB_PATH  # noqa: E402
from backend.services import geocode, triage  # noqa: E402

if DB_PATH.resolve() == (DATA_DIR / "adventure.db").resolve():
    sys.exit("refusing to run against the real database")
geocode.start = lambda: None

NOW = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
FIRST = NOW - timedelta(days=21)
DAYS = [FIRST + timedelta(days=7 * i) for i in range(5)]  # 3 weeks ago .. next week
EMPTY = {"moves": [], "feedback": [], "gains": [], "losses": [], "discoveries": [], "notes": "", "link": None}

with TestClient(app) as c:
    def call(method, path, body=None, want=200):
        r = c.request(method, f"/api{path}", json=body)
        assert r.status_code == want, (method, path, r.status_code, r.text)
        return r.json()

    def get(id_):
        return next((a for a in call("GET", "/adventures") if a["id"] == id_), None)

    def ent(type_, name):
        return call("POST", "/entities", {"type": type_, "name": name})["id"]

    def balance(id_):
        b = get(id_)["bounty"]
        return b["paid_actions"], b["paid_seal"]

    def day(d, **kw):
        return {"date": d.date().isoformat(), "start": d.isoformat(), "end": (d + timedelta(hours=2)).isoformat(), **kw}

    deity, site, friend, maybe = ent("deity", "S deity"), ent("site", "S site"), ent("player", "S friend"), ent("player", "S maybe")
    w = call("POST", "/adventures", {"type": "event", "title": "S weekly", "start_time": FIRST.isoformat(), "end_time": (FIRST + timedelta(hours=2)).isoformat(),
                                     "recurrence": {"days": [FIRST.weekday()]}})["id"]
    for e in (deity, site, friend, maybe):
        call("PUT", f"/adventures/{w}/entities/{e}")
    call("PATCH", f"/adventures/{w}/entities/{deity}", {"factor": 4})
    call("PUT", f"/adventures/{w}/party/{friend}", {"status": "bonded"})
    call("PATCH", f"/adventures/{w}", {"objectives": [{"id": "1", "text": "Dance", "kind": "primary", "state": "achieved"}]})
    call("PUT", f"/adventures/{w}/bounty", {"effort": 2, "resistance": 2, "ratio": 25})  # 40: 10 quests, 30 a date
    call("PUT", f"/adventures/{w}/roadmap", {"actions": [{"id": "A", "title": "Shoes", "skills": ["s-1", "s-1"]}], "edges": [], "done": ["A"]})
    assert get(w)["roadmap"]["actions"][0]["skills"] == ["s-1"]  # kept, once each
    call("PUT", f"/adventures/{w}/roadmap", {"actions": [{"id": "A", "title": "Shoes", "skills": ["a b"]}]}, want=422)
    call("POST", f"/adventures/{w}/dates", day(DAYS[0]), want=409)  # not in the Arena
    call("PUT", f"/adventures/{w}/phase", {"phase": "consuming"})
    call("PUT", f"/adventures/{w}/phase", {"phase": "completed"}, want=409)
    call("POST", f"/adventures/{w}/end", want=409)  # nothing to show yet
    assert balance(w) == (10, 0), balance(w)

    a = call("POST", f"/adventures/{w}/dates", day(DAYS[0]))["id"]
    call("POST", f"/adventures/{w}/dates", day(DAYS[0]), want=409)                        # twice
    call("POST", f"/adventures/{w}/dates", day(DAYS[1] + timedelta(days=1)), want=409)    # wrong day
    call("POST", f"/adventures/{w}/dates", day(DAYS[4]), want=409)                        # to come
    art, ser = get(a), get(w)
    assert (art["phase"], art["series_id"], art["series_date"], art["recurrence"], art["roadmap"]) == ("completed", w, DAYS[0].date().isoformat(), None, None)
    assert {e["name"]: (e.get("factor"), e.get("status")) for e in art["entities"]} == {"S deity": (4, None), "S site": (None, None), "S friend": (None, "bonded")}
    assert art["venue"] == "S site" and art["objectives"][0]["state"] == "achieved" and ser["objectives"][0]["state"] == "open"
    assert ser["phase"] == "consuming" and ser["done_dates"] == [DAYS[0].date().isoformat()]
    call("PUT", f"/adventures/{a}/enshrining", {**EMPTY, "verdict": [2, 2], "seal": True})
    assert balance(a) == (0, 30) and balance(w) == (10, 0)
    call("PUT", f"/adventures/{a}/party/{friend}", {"status": "annealed"})
    assert next(e for e in get(w)["entities"] if e["id"] == friend)["status"] == "bonded"
    b = call("POST", f"/adventures/{w}/dates", day(DAYS[2]))["id"]                        # a skipped week leaves nothing
    call("PUT", f"/adventures/{b}/enshrining", {**EMPTY, "verdict": [1, 1], "seal": True})
    assert balance(b) == (0, 30) and len(get(w)["done_dates"]) == 2
    call("PUT", f"/adventures/{b}/phase", {"phase": "consuming"})                         # breaking the seal takes it back
    assert balance(b) == (0, 0)
    call("PUT", f"/adventures/{b}/phase", {"phase": "completed"})
    call("POST", f"/adventures/{b}/kill")
    assert len(get(w)["done_dates"]) == 1
    b = call("POST", f"/adventures/{w}/dates", day(DAYS[2]))["id"]                        # so it can be done again
    call("POST", f"/adventures/{w}/end")
    assert get(w)["phase"] == "decommissioned" and get(a)["phase"] == "completed"

    # one that finished: archived after a week's grace, not missed
    call("PUT", f"/adventures/{w}/phase", {"phase": "consuming"})
    call("PATCH", f"/adventures/{w}", {"recurrence": {"days": [FIRST.weekday()], "until": DAYS[2].date().isoformat()}})
    import sqlite3
    db = sqlite3.connect(DB_PATH)
    db.execute("UPDATE adventures SET phase_changed_at = ? WHERE id = ?", ((NOW - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S.000000"), w.replace("-", "")))
    db.commit()
    c.portal.call(triage.sweep_missed)
    assert get(w)["phase"] == "consuming", "a week's grace"
    call("PATCH", f"/adventures/{w}", {"recurrence": {"days": [FIRST.weekday()], "until": DAYS[0].date().isoformat()}})
    c.portal.call(triage.sweep_missed)
    assert get(w)["phase"] == "decommissioned"

    # continuing one that was completed whole (as they were before series)
    x = call("POST", "/adventures", {"type": "event", "title": "S old", "start_time": FIRST.isoformat()})["id"]
    call("PUT", f"/adventures/{x}/entities/{deity}")
    call("PUT", f"/adventures/{x}/entities/{friend}")
    call("PUT", f"/adventures/{x}/party/{friend}", {"status": "bonded"})
    call("PUT", f"/adventures/{x}/bounty", {"effort": 2, "resistance": 2, "ratio": 25})
    call("PUT", f"/adventures/{x}/phase", {"phase": "completed"})
    call("PUT", f"/adventures/{x}/party/{friend}", {"status": "annealed"})
    call("PUT", f"/adventures/{x}/enshrining", {**EMPTY, "verdict": [2, 2], "seal": True})
    paid = sum(balance(x))
    call("PATCH", f"/adventures/{x}", {"recurrence": {"days": [FIRST.weekday()]}})
    n = call("POST", f"/adventures/{x}/continue", {"date": FIRST.date().isoformat()})["id"]
    old, new = get(x), get(n)
    assert (old["phase"], old["recurrence"], old["series_id"]) == ("completed", None, n) and old["enshrining"]["sealed_at"] and sum(balance(x)) == paid == 40
    assert (new["phase"], new["start"][:10], new["done_dates"]) == ("consuming", FIRST.date().isoformat(), [FIRST.date().isoformat()]) and sum(balance(n)) == 0
    assert next(e for e in new["entities"] if e["id"] == friend)["status"] == "bonded"
    y = call("POST", f"/adventures/{n}/dates", day(DAYS[1]))["id"]
    call("PUT", f"/adventures/{y}/enshrining", {**EMPTY, "verdict": [2, 2], "seal": True})
    assert balance(y) == (0, 30)
print("all good")
