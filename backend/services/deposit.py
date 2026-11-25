"""The Deposit: links you drop in, read one at a time into specimens (or ore) in its harvester.

    add      one or many links; ones here already are skipped
    remove   forget a link

A link whose page gives a title and a start becomes an event of source "deposit". Any other is
held, with the reason, to be made an adventure by hand (services/links.py) or removed.
"""

import asyncio
import logging
import re
import uuid
from typing import Any

from sqlalchemy import delete, select

from backend.db.base import SessionLocal
from backend.db.models import OUTSIDE_NODE, DepositLink, Event, EventSource, harvester_node
from backend.services import assay, assayer, geocode, links
from backend.services.transitions import record

log = logging.getLogger(__name__)

SOURCE = "deposit"
MAX_LINKS = 100
_task: asyncio.Task | None = None


def to_dict(r: DepositLink) -> dict[str, Any]:
    return {"id": str(r.id), "url": r.url, "status": r.status, "why": r.why, "title": r.title, "at": r.created_at.isoformat()}


async def waiting_and_held() -> list[dict[str, Any]]:
    async with SessionLocal() as session:
        rows = await session.scalars(select(DepositLink).where(DepositLink.status != "done").order_by(DepositLink.created_at))
        return [to_dict(r) for r in rows.all()]


async def add(text: str) -> dict[str, Any]:
    """Links, one per line or spaced apart: {added, skipped, bad}."""
    added, skipped, bad = 0, 0, []
    async with SessionLocal() as session:
        known = {r for r in (await session.scalars(select(DepositLink.key))).all()}
        for word in [w for w in re.split(r"[\s<>\"']+", text) if w][:MAX_LINKS]:
            try:
                url = assay.clean(word.strip(".,;()[]"))
            except ValueError:
                bad.append(word[:80])
                continue
            k = assay.key(url)
            if k in known:
                skipped += 1
                continue
            known.add(k)
            session.add(DepositLink(url=url, key=k))
            added += 1
        await session.commit()
    start()
    return {"added": added, "skipped": skipped, "bad": bad}


async def remove(link_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        await session.execute(delete(DepositLink).where(DepositLink.id == link_id))
        await session.commit()


def start() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_work())


async def stop() -> None:
    if _task and not _task.done():
        _task.cancel()
        await asyncio.gather(_task, return_exceptions=True)


async def _work() -> None:
    while True:
        async with SessionLocal() as session:
            row = await session.scalar(select(DepositLink).where(DepositLink.status == "waiting").order_by(DepositLink.created_at).limit(1))
        if row is None:
            return
        try:
            status, why, title = await _read(row.url)
        except Exception:  # noqa: BLE001 - one bad link mustn't stop the rest
            log.exception("[deposit] %s", row.url)
            status, why, title = "held", "it couldn't be read", None
        async with SessionLocal() as session:
            mine = await session.get(DepositLink, row.id)
            if mine:
                mine.status, mine.why, mine.title = status, why, title
                await session.commit()


async def _read(url: str) -> tuple[str, str | None, str | None]:
    if there := await links.existing(url):
        return "held", f"already here: {there['title']}", there["title"]
    found = await assay.look(url)
    f = found["fields"]
    if not (f.get("title") and f.get("start_time")):
        return "held", found["why"] or ("its page gives no start" if f.get("title") else "its page gives no title"), f.get("title")
    async with SessionLocal() as session:
        source_id = await session.scalar(select(EventSource.id).where(EventSource.name == SOURCE))
        event = Event(id=uuid.uuid4(), source_id=source_id, api_id=assay.key(url)[:500], title=f["title"], start_time=f["start_time"], end_time=f.get("end_time"),
                      timezone=assay.LOCAL, url=url, venue=f.get("venue"), address=f.get("address"), city=f.get("city"), lat=f.get("lat"), lon=f.get("lon"),
                      cover_url=f.get("cover_url"), details={"all_day": True} if f.get("all_day") else {}, review="harvested", assay=assayer.merge(None, found))
        session.add(event)
        record(session, "event", event.id, OUTSIDE_NODE, harvester_node(SOURCE))
        await session.commit()
    await assayer._broadcast()
    geocode.start()  # at least its city
    return "done", None, f["title"]
