"""Adventures from links (the Lode): the Assayer's engine fills in a new adventure, or the
blanks of one you have.

    make   one link -> a new adventure in concentrate; a link already here is offered instead
    fill   only the blanks of an adventure that has a link

A page that can't be read still makes an adventure, with its link.
"""

import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from backend.db.base import SessionLocal, utcnow
from backend.db.models import WHEN_WHERE_TYPES
from backend.db.queries import list_adventures, list_events
from backend.services import adventures, assay
from backend.services.triage import InvalidTransition, _get_adventure, broadcast_pools

WHERE = ("venue", "address", "city", "lat", "lon")
TIMES = ("start_time", "end_time", "all_day")


def _record(found: dict[str, Any], used: set[str]) -> dict[str, Any]:
    return {"at": utcnow().isoformat(), "outcome": found["outcome"], "why": found["why"], "url": found["url"],
            "sources": {k: v for k, v in found["sources"].items() if k in used}}


async def _remember(adventure_id: uuid.UUID, record: dict[str, Any]) -> None:
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        adventure.assay = record
        await session.commit()
    await broadcast_pools()


async def existing(url: str) -> dict[str, Any] | None:
    """The adventure, else the raw event, that already has this link."""
    wanted = assay.key(url)
    async with SessionLocal() as session:
        pools = (("adventure", await list_adventures(session)), ("event", await list_events(session)))
    for kind, rows in pools:
        for r in rows:
            if r["url"] and assay.key(r["url"]) == wanted:
                return {"kind": kind, "id": r["id"], "title": r["title"], "review": r["review"], "phase": r.get("phase")}
    return None


async def make(url: str, force: bool = False) -> dict[str, Any]:
    """{"existing": ...} or {"adventure": ..., "outcome", "why"}. ValueError: not a link."""
    url = assay.clean(url)
    if not force and (there := await existing(url)):
        return {"existing": there}
    found = await assay.look(url)
    f, kind = found["fields"], found["kind"] or "event"
    fields: dict[str, Any] = {"type": kind, "url": url, "title": f.get("title") or (urlsplit(url).hostname or "New adventure")}
    names = ["description", "cover_url", "costs"]
    if kind in WHEN_WHERE_TYPES:
        names += WHERE
        if f.get("start_time"):
            names += TIMES
            fields["timezone"] = assay.LOCAL
    fields |= {k: f[k] for k in names if f.get(k) is not None}
    try:
        made = await adventures.create_adventure(fields)
    except adventures.InvalidAdventure:
        made = await adventures.create_adventure({"type": "event", "url": url, "title": fields["title"][:500]})
        found = {**found, "outcome": "empty", "why": "what it says doesn't make sense", "sources": {}}
    record = _record(found, set(fields))
    await _remember(uuid.UUID(made["id"]), record)
    return {"adventure": {**made, "assay": record}, "outcome": found["outcome"], "why": found["why"]}


async def fill(adventure_id: uuid.UUID) -> dict[str, Any]:
    """{"filled": [fields], "outcome", "why"}"""
    async with SessionLocal() as session:
        now = next((a for a in await list_adventures(session) if a["id"] == str(adventure_id)), None)
        await _get_adventure(session, adventure_id)  # NotFound
    if not now["url"]:
        raise InvalidTransition("it has no link to read")
    near = datetime.fromisoformat(now["start"]) if now["start"] else None
    # a weekly one's page may be about any of its dates
    found = await assay.look(now["url"], None if now["recurrence"] else near, now["title"], now["city"])
    f, changes = found["fields"], {}
    for k in ("description", "cover_url", "costs"):
        if not now.get(k) and f.get(k):
            changes[k] = f[k]
    if now["type"] in WHEN_WHERE_TYPES:
        if not now["start"] and f.get("start_time"):
            changes |= {k: f[k] for k in TIMES if f.get(k)} | {"timezone": assay.LOCAL}
        elif now["start"] and not now["end"] and not now["all_day"] and f.get("end_time") and f["end_time"] > near:
            changes["end_time"] = f["end_time"]
        if not now["site_id"]:
            changes |= {k: f[k] for k in ("venue", "address", "city") if not now[k] and f.get(k)}
            if (now["lat"] is None or now["location_approximate"]) and f.get("lat") is not None:
                changes |= {"lat": f["lat"], "lon": f["lon"]}
    if changes:
        await adventures.update_adventure(adventure_id, changes)
    await _remember(adventure_id, _record(found, set(changes)))
    return {"filled": sorted(changes), "outcome": found["outcome"], "why": found["why"]}
