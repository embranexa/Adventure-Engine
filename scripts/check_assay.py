"""Exercise the Assayer against saved pages and a COPY of the database. Never touches the network.

    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python scripts/check_assay.py
"""

import asyncio
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

if not os.environ.get("ADVENTURE_DB_PATH"):
    sys.exit("set ADVENTURE_DB_PATH to a copy of the database: this script changes it")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402
from backend.db.base import DATA_DIR, DB_PATH, SessionLocal  # noqa: E402
from backend.db.models import Event, EventSource  # noqa: E402
from backend.services import assay, assayer, geocode  # noqa: E402

if DB_PATH.resolve() == (DATA_DIR / "adventure.db").resolve():
    sys.exit("refusing to run against the real database")
geocode.start = lambda: None


async def no_map(venue, address, city):
    return (34.0, -118.0) if address else None
geocode.locate = no_map


def case(name):
    return (ROOT / "backend/tests/assay_cases" / f"{name}.html").read_text()


# --- reading ---
r = assay.read(case("dice"), "https://dice.fm/event/x")
f = r["fields"]
assert (r["kind"], f["venue"], round(f["lat"], 3), f["costs"]) == ("event", "First Congregational Church of Los Angeles", 34.065, "$49.44"), f
assert f["start_time"].isoformat() == "2027-05-15T19:00:00-07:00" and f["cover_url"].startswith("https://dice-media") and f["end_time"] > f["start_time"]
assert assay.read(case("dice"), "https://dice.fm/event/x", datetime(2027, 6, 1, tzinfo=timezone.utc))["outcome"] == "mismatch"
assert assay.read(case("dice"), "https://dice.fm/event/x", f["start_time"] + timedelta(hours=2), "x")["outcome"] == "ok"
f = assay.read(case("eventbrite"), "https://www.eventbrite.com/e/x")["fields"]
assert "venue" not in f and f["address"].startswith("613 Imperial") and f["costs"] == "$35.37 to $94.32"
assert assay.read(case("leap"), "https://events.leapevents.com/event/x")["fields"]["start_time"].utcoffset() == timedelta(hours=-8)
f = assay.read(case("buteaden"), "https://buteaden.com/e")["fields"]
assert f["title"] == "Bu Tea & Techno" and "end_time" not in f
f = assay.read(case("partiful"), "https://partiful.com/e/x")["fields"]
assert "venue" not in f and "address" not in f and "lat" not in f, f         # "Downtown" isn't a place
assert "venue" not in assay.read(case("dubmeeting"), "https://tickets.dubmeeting.com/e")["fields"]  # nor is DTLA
r = assay.read(case("secrettunnel"), "https://secrettunnel.app/e")
assert r["kind"] is None and r["fields"]["cover_url"] and r["sources"]["cover_url"] == "link preview"
assert "cover_url" not in assay.read(case("lodgeroom"), "https://www.lodgeroomhlp.com/e")["fields"]   # a favicon
assert set(assay.read(case("universe"), "https://www.universe.com/e")["fields"]) <= {"title"}   # built in the browser
ld = lambda body: f'<script type="application/ld+json">{body}</script>'  # noqa: E731
day = assay.read(ld('{"@type":"Event","name":"D","startDate":"2027-01-02","image":"/a.jpg"}'), "https://a.com/e", datetime(2027, 1, 3, 4, tzinfo=timezone.utc), "D")
assert day["outcome"] == "ok" and "start_time" not in day["fields"] and day["fields"]["cover_url"] == "https://a.com/a.jpg"   # a date isn't midnight
f = assay.read(case("musichackspace"), "https://musichackspace.org/events/x")["fields"]              # two whole days, no venue yet
assert f["all_day"] and [f[k].isoformat() for k in ("start_time", "end_time")] == ["2027-01-26T00:00:00-08:00", "2027-01-27T00:00:00-08:00"] and "venue" not in f and f["city"] == "Los Angeles"
f = assay.read(ld('{"@type":"Event","name":"One","startDate":"2027-07-04"}'), "https://a.com/e")["fields"]
assert f["all_day"] and f["start_time"] == f["end_time"] and f["start_time"].isoformat() == "2027-07-04T00:00:00-07:00"
f = assay.read(ld('{"@type":"Festival","name":"Long","startDate":"2027-01-02T12:00:00-08:00","endDate":"2027-01-05T23:00:00-08:00"}'), "https://a.com/e")["fields"]
assert "all_day" not in f and f["end_time"].day == 5                                                     # several days, timed
shop = assay.read(ld('{"@graph":[{"@type":"Product","name":"Lamp","image":{"url":"https://a.com/l.png"},"offers":{"price":"0","priceCurrency":"EUR"}}]}'), "https://a.com/p")
assert shop["kind"] == "item" and shop["fields"]["title"] == "Lamp" and shop["fields"]["costs"] == "Free"
assert assay.read(ld("{broken") + ld('[{"@type":["MusicEvent"],"name":"Ok","startDate":"2027-01-02T20:00"}]'), "https://a.com/e")["fields"]["title"] == "Ok"
assert assay.clean("https://l.instagram.com/?u=https%3A%2F%2Fdice.fm%2Fx%3Futm_source%3Dig") == "https://dice.fm/x"
assert assay.key("https://www.dice.fm/a/?utm_source=x") == assay.key("dice.fm/a") == "dice.fm/a"
for bad in ("javascript:alert(1)", "nothing", "file:///etc/passwd"):
    try:
        assay.clean(bad)
        raise SystemExit(f"{bad} was taken for a link")
    except ValueError:
        pass
for url, why in (("https://ra.co/events/1", "isn't read"), ("https://www.tixr.com/x", "isn't read"), ("http://127.0.0.1:8000/", "not public"), ("http://localhost/x", "not public")):
    got = asyncio.run(assay.look(url)) if "." in url.split("/")[2] else {"outcome": "error", "why": "not public"}
    assert got["outcome"] in ("blocked", "error") and why in got["why"], got

# --- the machine and the Lode, with a pretend web ---
PAGES = {"https://dice.fm/event/one": "dice", "https://secrettunnel.app/two": "secrettunnel"}


async def pretend(url):
    await asyncio.sleep(0.05)
    if url in PAGES:
        return case(PAGES[url]), url
    raise assay.Refused("blocked", "it refused")
assay.fetch = pretend
assayer.PACE_S = 0.05

with TestClient(app) as c:
    def call(method, path, body=None, want=200):
        r = c.request(method, f"/api{path}", json=body)
        assert r.status_code == want, (method, path, r.status_code, r.text)
        return r.json()

    def event(api_id):
        return next(e for e in call("GET", "/events") if e["api_id"] == api_id)

    async def seed():
        from sqlalchemy import select
        async with SessionLocal() as s:
            src = await s.scalar(select(EventSource.id).where(EventSource.name == "19hz"))
            at = datetime(2027, 5, 16, 2, tzinfo=timezone.utc)
            for k, url, when in (("a", "https://dice.fm/event/one", at), ("b", "https://secrettunnel.app/two", at), ("c", "https://no.example.com/x", at),
                                 ("d", "https://dice.fm/event/one", at + timedelta(days=30)), ("e", "https://dice.fm/event/one", at), ("f", "https://dice.fm/event/one", at)):
                s.add(Event(source_id=src, api_id=f"assay-{k}", title=f"Test {k}", start_time=when, url=url, city="Los Angeles", details={}, review="new"))
            await s.commit()
    c.portal.call(seed)
    ids = {k: event(f"assay-{k}")["id"] for k in "abcdef"}
    assert event("assay-a")["missing"] == ["exact location", "cover"]
    assert call("POST", "/events/assay", {"ids": list(ids.values())})["moved"] == 6
    call("POST", f"/events/{ids['f']}/ignore")                                    # ignored while it waits
    for _ in range(200):
        if not any(e["review"] == "assaying" for e in call("GET", "/events")):
            break
        time.sleep(0.05)
    a, b, x, d = (event(f"assay-{k}") for k in "abcd")
    assert (a["review"], a["missing"], a["location_approximate"], a["assay"]["outcome"]) == ("new", [], False, "ok") and a["end"] and a["venue"]
    assert b["missing"] == ["exact location"] and b["cover_url"]
    assert (x["assay"]["outcome"], x["assay"]["why"], x["missing"]) == ("blocked", "it refused", ["exact location", "cover"])
    assert d["assay"]["outcome"] == "mismatch" and d["cover_url"] is None
    assert event("assay-f")["review"] == "ignored"
    assert call("POST", "/events/assay", {"ids": [ids["b"], ids["c"]]})["moved"] == 0     # tried lately
    call("PUT", f"/events/{ids['c']}/cover", {"url": "javascript:x"}, want=409)
    call("PUT", f"/events/{ids['c']}/cover", {"url": "https://a.com/flyer.jpg"})
    call("PUT", f"/events/{ids['b']}/cover", {"url": "https://a.com/mine.jpg"})
    assert call("POST", "/events/assay", {"ids": [ids["b"], ids["c"]], "again": True})["moved"] == 2
    call("POST", "/events/assay/stop")
    assert not any(e["review"] == "assaying" for e in call("GET", "/events"))
    call("POST", "/events/assay", {"ids": [ids["b"]], "again": True})
    time.sleep(0.6)
    assert event("assay-b")["cover_url"] == "https://a.com/mine.jpg" and event("assay-c")["missing"] == ["exact location"]
    call("PUT", f"/events/{ids['c']}/cover", {"url": None})
    assert event("assay-c")["cover_url"] is None
    adv = call("POST", f"/events/{ids['a']}/pass")["adventure_id"]
    got = next(q for q in call("GET", "/adventures") if q["id"] == adv)
    assert got["cover_url"] == a["cover_url"] and got["lat"] == a["lat"] and "missing" not in got

    # the Lode
    there = call("POST", "/adventures/link", {"url": "dice.fm/event/one?utm_source=x"})["existing"]
    assert there["kind"] == "adventure" and there["id"] == adv
    made = call("POST", "/adventures/link", {"url": "dice.fm/event/one", "force": True})
    m = made["adventure"]
    assert (made["outcome"], m["type"], m["phase"], m["venue"]) == ("ok", "event", "queued", "First Congregational Church of Los Angeles") and m["costs"] == "$49.44" and m["assay"]["sources"]["title"] == "page data"
    PAGES["https://musichackspace.org/h"] = "musichackspace"
    two = call("POST", "/adventures/link", {"url": "https://musichackspace.org/h"})["adventure"]
    assert two["all_day"] and two["start"].startswith("2027-01-26T08:00") and two["end"].startswith("2027-01-27T08:00") and two["costs"] == "$75", two
    none = call("POST", "/adventures/link", {"url": "https://tickets.example.com/show"})
    assert none["outcome"] == "blocked" and none["adventure"]["url"] == "https://tickets.example.com/show" and none["adventure"]["title"] == "tickets.example.com"
    call("POST", "/adventures/link", {"url": "nothing"}, want=422)
    own = call("POST", "/adventures", {"type": "event", "title": "Mine", "url": "https://dice.fm/event/one", "venue": "My hall"})["id"]
    out = call("POST", f"/adventures/{own}/assay")
    mine = next(q for q in call("GET", "/adventures") if q["id"] == own)
    assert (mine["title"], mine["venue"]) == ("Mine", "My hall") and mine["start"] and "venue" not in out["filled"]
    bare = call("POST", "/adventures", {"type": "event", "title": "Bare"})["id"]
    call("POST", f"/adventures/{bare}/assay", want=409)

    # the Deposit
    PAGES["https://eventsta.example.com/z"] = "leap"
    out = call("POST", "/deposit", {"text": "https://eventsta.example.com/z?utm_source=a\neventsta.example.com/z, https://secrettunnel.app/zz nonsense https://dice.fm/event/one"})
    assert (out["added"], out["skipped"], out["bad"]) == (3, 1, ["nonsense"]), out
    for _ in range(100):
        rows = call("GET", "/deposit")
        if not any(r["status"] == "waiting" for r in rows):
            break
        time.sleep(0.05)
    why = {r["url"]: r["why"] for r in rows}
    assert why["https://secrettunnel.app/zz"] == "it refused" and why["https://dice.fm/event/one"].startswith("already here") and len(rows) == 2, why
    z = next(e for e in call("GET", "/events") if e["source"] == "deposit")
    assert (z["review"], z["missing"]) == ("harvested", []) and z["title"].startswith("FNGRS")
    PAGES["https://musichackspace.org/h2"] = "musichackspace"
    call("POST", "/deposit", {"text": "https://musichackspace.org/h2"})
    time.sleep(0.5)
    h = next(e for e in call("GET", "/events") if e["url"].endswith("/h2"))
    assert h["all_day"] and h["source"] == "deposit"
    call("POST", "/sources/deposit/feed")
    hid = call("POST", f"/events/{h['id']}/pass")["adventure_id"]
    assert next(q for q in call("GET", "/adventures") if q["id"] == hid)["all_day"]
    call("DELETE", f"/deposit/{rows[0]['id']}")
    assert len(call("GET", "/deposit")) == 1 and event("eventsta.example.com/z")["review"] == "new"
print("all good")
