"""Enshrinings: the analysis of a completed adventure (the Treasury).

    save    the draft while it isn't sealed: the verdict, moves, discoveries, spoils, tithes, notes
    seal    check it, put its discoveries in the Codex, and seal it; sealing a sealed one amends it

Rules:
    - only completed adventures; a seal needs a verdict, and a performance needs its link
    - moving an adventure back out of the Treasury unseals it (services/triage.py); the
      writing stays as a draft
    - discoveries become entities on seal. One that names an existing entity of its type uses
      that. They are linked to the adventure, except a site found at an event (or a performance or battle): it has
      one site (its where), and a discovery mustn't replace it
"""

import uuid
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import SessionLocal, utcnow
from backend.db.models import (
    ENTITY_TYPES, MOVE_GRADES, UNLINKABLE_TYPES, WHEN_WHERE_TYPES, Adventure, AdventureEntity, Enshrining, Entity, Move,
)
from backend.db.queries import list_entities
from backend.services import ledger
from backend.services.entities import add_link
from backend.services.hub import hub
from backend.services.triage import InvalidTransition, _get_adventure, broadcast_pools

LIMITS = {"notes": 20_000, "text": 500, "better": 500, "name": 200, "qty": 40, "unit": 40}
MAX_ROWS = 200


class InvalidEnshrining(Exception):
    pass


def _text(field: str, value: Any) -> str:
    text = str(value or "").strip()
    if len(text) > LIMITS[field]:
        raise InvalidEnshrining(f"{field} is too long (max {LIMITS[field]} characters)")
    return text


def _lines(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Spoils or tithes: what, how much, of what. Rows without a name are dropped."""
    clean = [{k: _text(k, r.get(k)) for k in ("name", "qty", "unit")} for r in rows]
    return [r for r in clean if r["name"]]


def _discoveries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clean = []
    for r in rows:
        if r.get("type") not in ENTITY_TYPES:
            raise InvalidEnshrining(f"a discovery's type must be one of {', '.join(ENTITY_TYPES)}")
        name = _text("name", r.get("name"))
        if name:
            clean.append({"type": r["type"], "name": name, "entity_id": r.get("entity_id")})
    return clean


def _moves(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clean = []
    for r in rows:
        if r.get("grade") not in MOVE_GRADES:
            raise InvalidEnshrining(f"a move's grade must be one of {', '.join(MOVE_GRADES)}")
        row = {"text": _text("text", r.get("text")), "grade": r["grade"], "better": _text("better", r.get("better")) or None,
               "spell": str(r["spell"])[:40] if r.get("spell") else None, "skills": [str(s) for s in r.get("skills") or []][:20]}
        if row["text"] or row["better"] or row["spell"]:
            clean.append(row)
    return clean


def _feedback(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What was judged, or added after (its key starts with "own:")."""
    clean = [{"key": r["key"], "label": _text("text", r.get("label")), "target": r.get("target"), "rating": max(-9, min(9, int(r.get("rating") or 0))),
              "result": r.get("result")} for r in rows]
    return [r for r in clean if r["result"] or (r["key"].startswith("own:") and r["label"])]


def _verdict(value: Any) -> tuple[int, int] | None:
    if not value:
        return None
    if len(value) != 2 or any(v not in (0, 1, 2) for v in value):
        raise InvalidEnshrining("a verdict is two numbers from 0 to 2")
    return int(value[0]), int(value[1])


def _link(value: Any) -> str | None:
    text = str(value or "").strip()
    return text[:2000] or None


def _is_http(link: str | None) -> bool:
    parsed = urlparse(link or "")
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


async def save(adventure_id: uuid.UUID, fields: dict[str, Any], seal: bool = False) -> dict[str, Any]:
    """Save the draft, or (seal=True) seal or amend it. Returns {"discovered": [names new to the Codex]}."""
    for key in ("moves", "feedback", "gains", "losses", "discoveries"):
        if len(fields.get(key) or []) > MAX_ROWS:
            raise InvalidEnshrining(f"too many {key} (max {MAX_ROWS})")
    verdict = _verdict(fields.get("verdict"))
    moves, gains, losses = _moves(fields.get("moves") or []), _lines(fields.get("gains") or []), _lines(fields.get("losses") or [])
    feedback = _feedback(fields.get("feedback") or [])
    discoveries, link, notes = _discoveries(fields.get("discoveries") or []), _link(fields.get("link")), _text("notes", fields.get("notes"))

    new: list[str] = []
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.phase != "completed":
            raise InvalidTransition("only artifacts (completed adventures) can be enshrined")
        row = await session.get(Enshrining, adventure_id)
        if row and row.sealed_at and not seal:
            raise InvalidTransition("it's sealed: amend it instead")
        if seal:
            if verdict is None:
                raise InvalidEnshrining("choose a verdict")
            if adventure.type == "performance" and not _is_http(link):
                raise InvalidEnshrining("a performance needs a link that starts with http:// or https://")
            new = await _discover(session, adventure, discoveries)
        if row is None:
            row = Enshrining(adventure_id=adventure_id)
            session.add(row)
        row.outcome, row.thrill = verdict if verdict else (None, None)
        row.notes, row.link, row.gains, row.losses, row.discoveries = notes, link, gains, losses, discoveries
        row.feedback = feedback
        row.updated_at = utcnow()
        if seal:
            if row.sealed_at is None:
                row.sealed_at = utcnow()
            else:
                row.amended_at = utcnow()
        await session.execute(delete(Move).where(Move.adventure_id == adventure_id))
        session.add_all(Move(adventure_id=adventure_id, position=i, **m) for i, m in enumerate(moves))
        await session.flush()
        paid = await ledger.settle(session, adventure)
        await session.commit()
        if seal:
            # new discoveries, and the skills its plays teach their spells
            await hub.broadcast("entities", entities=await list_entities(session))
    await broadcast_pools()
    if paid:
        await ledger.broadcast()
    return {"discovered": new}


async def _discover(session: AsyncSession, adventure: Adventure, discoveries: list[dict[str, Any]]) -> list[str]:
    """Turn discoveries into entities (filling in each one's entity_id) and link them."""
    new = []
    for d in discoveries:
        entity = None
        if d.get("entity_id"):
            try:
                entity = await session.get(Entity, uuid.UUID(str(d["entity_id"])))
            except ValueError:
                entity = None
            if entity and entity.type != d["type"]:
                entity = None
        if entity is None:
            entity = await session.scalar(select(Entity).where(Entity.type == d["type"], func.lower(Entity.name) == d["name"].lower()))
        if entity is None:
            entity = Entity(id=uuid.uuid4(), type=d["type"], name=d["name"], details={})
            session.add(entity)
            await session.flush()
            new.append(entity.name)
        d["entity_id"], d["name"] = str(entity.id), entity.name
        if entity.type in UNLINKABLE_TYPES:
            continue
        if entity.type == "site" and adventure.type in WHEN_WHERE_TYPES:
            continue
        if await session.get(AdventureEntity, (adventure.id, entity.id)) is None:
            add_link(session, adventure.id, entity, "emergent")  # a player met there joins the party
            await session.flush()
    return new
