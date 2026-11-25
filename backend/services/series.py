"""Weekly adventures (series): completed a date at a time.

    enshrine_date    a date you did becomes an artifact of its own, unsealed; the series stays in the Arena
    end_series       into the Archive, once it has an artifact
    continue_series  a weekly adventure completed as a whole: it becomes its date's artifact, and
                     the series carries on in the Arena

Rules:
    - dates you didn't do leave nothing; one artifact per date (a killed one doesn't count)
    - an artifact copies the series: its fields, entities with their factors, stewards, model, and
      whoever is bonded or emergent (as bonded). Then it stands alone
    - quests stay with the series and pay once; a sealed date pays the completion share
      (the bounty's `part`, see services/ledger.py)
    - objectives and buffs go with the date as they stand, and start over for the next
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import ACTIVE_STATUSES, Adventure, AdventureEntity, Entity, ItemSheet, Steward
from backend.db.queries import list_adventures
from backend.services.entities import add_link
from backend.services.triage import InvalidTransition, _get_adventure, _set_phase, broadcast_pools

TEXT = ("title", "description", "url", "cover_url", "timezone", "venue", "address", "city", "lat", "lon")


async def artifacts(session: AsyncSession, series_id: uuid.UUID) -> list[Adventure]:
    return list((await session.scalars(select(Adventure).where(Adventure.series_id == series_id, Adventure.phase != "killed"))).all())


async def _copy(session: AsyncSession, source: Adventure, statuses: tuple[str, ...], **fields: Any) -> Adventure:
    """A new adventure like `source`; players with one of `statuses` come along, bonded."""
    seen = next(a for a in await list_adventures(session) if a["id"] == str(source.id))  # its event's fields read through
    copy = Adventure(id=uuid.uuid4(), event_id=None, type=source.type, stats=dict(source.stats or {}), all_day=source.all_day,
                     costs=source.costs, rewards=source.rewards, objectives=list(source.objectives or []),
                     preparations=list(source.preparations or []), adversaries=list(source.adversaries or []),
                     flags=[], **{k: seen[k] for k in TEXT}, **fields)
    copy.spawned = True  # it comes from the series, not the Lode (services/transitions.py)
    links = (await session.execute(
        select(AdventureEntity, Entity).join(Entity, Entity.id == AdventureEntity.entity_id).where(AdventureEntity.adventure_id == source.id))).all()
    if any(e.type == "site" for _, e in links):  # its site is its where
        for k in ("venue", "address", "city", "lat", "lon"):
            setattr(copy, k, None)
    session.add(copy)
    await session.flush()
    for link, entity in links:
        if entity.type == "player" and link.status not in statuses:
            continue
        row = add_link(session, copy.id, entity, "bonded")
        row.factor, row.role = link.factor, link.role
    for s in (await session.scalars(select(Steward).where(Steward.adventure_id == source.id))).all():
        session.add(Steward(adventure_id=copy.id, entity_id=s.entity_id, role=s.role))
    sheet = await session.get(ItemSheet, source.id)
    if sheet:
        session.add(ItemSheet(adventure_id=copy.id, purpose=sheet.purpose, effects=sheet.effects, model=sheet.model, face=sheet.face))
    return copy


def _part(bounty: dict[str, Any] | None, part: str) -> dict[str, Any] | None:
    return {**bounty, "part": part} if bounty else None


async def enshrine_date(adventure_id: uuid.UUID, day: date, start: datetime, end: datetime | None) -> str:
    """Returns the artifact's id. `day` is the date where you are; `start` and `end` its times."""
    async with SessionLocal() as session:
        series = await _get_adventure(session, adventure_id)
        rule = series.recurrence
        if not rule:
            raise InvalidTransition("only a weekly adventure is enshrined a date at a time")
        if series.phase != "consuming":
            raise InvalidTransition("a date is enshrined from the Arena")
        if day.weekday() not in rule["days"] or (rule.get("until") and day.isoformat() > rule["until"]):
            raise InvalidTransition("it doesn't happen on that day")
        if start > utcnow():
            raise InvalidTransition("that date hasn't come yet")
        if any(a.series_date == day.isoformat() for a in await artifacts(session, series.id)):
            raise InvalidTransition("that date is already an artifact")
        artifact = await _copy(session, series, ACTIVE_STATUSES, phase="completed", series_id=series.id, series_date=day.isoformat(),
                               start_time=start, end_time=end, bounty=_part(series.bounty, "date"))
        series.objectives = [{**o, "state": "open"} for o in series.objectives or []]
        series.preparations = [{**p, "checked": False} for p in series.preparations or []]
        await session.commit()
        artifact_id = str(artifact.id)
    await broadcast_pools()
    return artifact_id


async def end_series(adventure_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        series = await _get_adventure(session, adventure_id)
        if not series.recurrence or series.phase in ("completed", "decommissioned", "killed"):
            raise InvalidTransition("only a weekly adventure under way can be ended")
        if not await artifacts(session, series.id):
            raise InvalidTransition("it has no artifact: kill it instead")
        _set_phase(series, "decommissioned")
        await session.commit()
    await broadcast_pools()


async def continue_series(adventure_id: uuid.UUID, day: date) -> str:
    """Returns the id of the series that carries on. `day`: the date of the one that was completed."""
    async with SessionLocal() as session:
        done = await _get_adventure(session, adventure_id)
        if done.phase != "completed" or not done.recurrence:
            raise InvalidTransition("only a completed weekly adventure can be continued")
        seen = next(a for a in await list_adventures(session) if a["id"] == str(done.id))
        times = {k: datetime.fromisoformat(seen[v]) if seen[v] else None for k, v in (("start_time", "start"), ("end_time", "end"))}
        series = await _copy(session, done, (*ACTIVE_STATUSES, "annealed", "neutralized"), phase="consuming", recurrence=done.recurrence,
                             roadmap=done.roadmap, bounty=_part(done.bounty, "spent"), **times)
        series.objectives = [{**o, "state": "open"} for o in series.objectives or []]
        series.preparations = [{**p, "checked": False} for p in series.preparations or []]
        for k, v in times.items():  # it's one date now, wherever its times came from
            setattr(done, k, v)
        done.recurrence, done.series_id, done.series_date = None, series.id, day.isoformat()
        await session.commit()
        series_id = str(series.id)
    await broadcast_pools()
    return series_id
