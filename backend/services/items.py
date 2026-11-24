"""Item sheets (the Inventory): what an item is for, its effects, and its 3D model.

A model is a recipe: data, never code. It lists named parts made of known shapes
(SHAPES), each with a place, a material role (MATERIALS) and optionally the roadmap action
that makes it. The frontend draws it (frontend/js/lib/cabinet/recipe.js); everything here
is checked so that a recipe can't hold anything else.

Effects are rated buffs (or debuffs) to skills. The Arena shows those of a checked preparation;
nothing else applies them.
"""

import math
import uuid
from typing import Any

from sqlalchemy import select

from backend.db.base import SessionLocal, utcnow
from backend.db.models import Entity, ItemSheet
from backend.services.triage import InvalidTransition, _get_adventure, broadcast_pools

PURPOSE_LIMIT, EFFECT_LIMIT, MAX_EFFECTS = 5_000, 200, 50
MAX_RATING = 3

MATERIALS = ("steel", "dark", "brass", "copper", "pale", "tint", "glow", "glass", "screen")
# shape -> the sizes it needs ("pts2" / "pts3": a list of 2D / 3D points)
SHAPES: dict[str, dict[str, Any]] = {
    "box": {"size": 3}, "plane": {"size": 2}, "cyl": {"r": 1, "h": 1}, "sphere": {"r": 1}, "torus": {"r": 1, "t": 1},
    "gem": {"r": 1}, "gear": {"r": 1, "n": "count"}, "pill": {"r": 1, "h": 1}, "lathe": {"pts": "pts2"},
    "tube": {"pts": "pts3", "r": 1}, "extrude": {"pts": "pts2", "depth": 1}, "loop": {"pts": "pts2", "r": 1},
}
MAX_PARTS, MAX_POINTS, MAX_REPEAT, MAX_SPIN, SIZE = 80, 200, 200, 24, 200.0


class InvalidItem(Exception):
    pass


def _num(value: Any, where: str, lo: float = -SIZE, hi: float = SIZE) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
        raise InvalidItem(f"{where}: expected a number from {lo:g} to {hi:g}")
    return value


def _nums(value: Any, n: int | tuple[int, ...], where: str, lo: float = -SIZE, hi: float = SIZE) -> list[float]:
    sizes = (n,) if isinstance(n, int) else n
    if not isinstance(value, list) or len(value) not in sizes:
        raise InvalidItem(f"{where}: expected {' or '.join(str(s) for s in sizes)} numbers")
    return [_num(v, where, lo, hi) for v in value]


def _points(value: Any, n: tuple[int, ...], where: str, least: int = 2) -> list[list[float]]:
    if not isinstance(value, list) or not least <= len(value) <= MAX_POINTS:
        raise InvalidItem(f"{where}: expected {least} to {MAX_POINTS} points")
    return [_nums(p, n, where) for p in value]


def clean_model(parts: Any) -> list[dict[str, Any]] | None:
    """A checked recipe, or None (no model). Unknown keys are refused."""
    if not parts:
        return None
    if not isinstance(parts, list) or len(parts) > MAX_PARTS:
        raise InvalidItem(f"a model is a list of at most {MAX_PARTS} parts")
    out = []
    for i, p in enumerate(parts):
        where = f"part {i + 1}"
        if not isinstance(p, dict):
            raise InvalidItem(f"{where}: expected an object")
        shape, name = p.get("shape"), str(p.get("name") or "").strip()
        if shape not in SHAPES:
            raise InvalidItem(f"{where}: shape must be one of {', '.join(SHAPES)}")
        if not name or len(name) > 80:
            raise InvalidItem(f"{where}: needs a name (max 80 characters)")
        if p.get("mat") not in MATERIALS:
            raise InvalidItem(f"{where}: mat must be one of {', '.join(MATERIALS)}")
        need = SHAPES[shape]
        allowed = {"name", "shape", "mat", "at", "rot", "repeat", "mirror", "face", "spin", "axis", "act", "on", "k", *need}
        allowed |= {"r2"} if shape == "cyl" else set()
        allowed |= {"sharp"} if shape in ("extrude", "loop") else set()
        extra = set(p) - allowed
        if extra:
            raise InvalidItem(f"{where}: unknown: {', '.join(sorted(extra))}")
        clean: dict[str, Any] = {"name": name, "shape": shape, "mat": p["mat"]}
        for key, kind in need.items():
            at = f"{where}: {key}"
            if kind == "pts2":
                clean[key] = _points(p.get(key), (2,), at, 3 if shape in ("extrude", "loop") else 2)
            elif kind == "pts3":
                clean[key] = _points(p.get(key), (2, 3), at)
            elif kind == "count":
                clean[key] = int(_num(p.get(key), at, 3, 60))
            elif kind == 1:
                clean[key] = _num(p.get(key), at, 0.01)
            else:
                clean[key] = _nums(p.get(key), kind, at, 0.01)
        if p.get("r2") is not None:
            clean["r2"] = _num(p["r2"], f"{where}: r2", 0)
        for key in ("at", "rot"):
            if p.get(key) is not None:
                clean[key] = _nums(p[key], 3, f"{where}: {key}", -720, 720)
        if p.get("repeat") is not None:  # x, y, z, and optionally a turn about z in degrees
            if not isinstance(p["repeat"], list) or not 1 <= len(p["repeat"]) <= MAX_REPEAT:
                raise InvalidItem(f"{where}: repeat takes 1 to {MAX_REPEAT} places")
            clean["repeat"] = [_nums(q, (2, 3, 4), f"{where}: repeat", -720, 720) for q in p["repeat"]]
        if p.get("spin") is not None:
            clean["spin"] = int(_num(p["spin"], f"{where}: spin", 1, MAX_SPIN))
        if p.get("axis") is not None:
            if p["axis"] not in ("x", "y", "z"):
                raise InvalidItem(f"{where}: axis is x, y or z")
            clean["axis"] = p["axis"]
        for key in ("mirror", "face", "sharp"):
            if p.get(key):
                clean[key] = True
        if p.get("act") is not None:
            clean["act"] = str(p["act"])[:40]
        clean["on"] = bool(p.get("on", True))
        clean["k"] = _num(p.get("k", 1), f"{where}: k", 0.1, 5)
        out.append(clean)
    return out


async def skill_ids(session) -> set[str]:
    return {str(i) for i in (await session.scalars(select(Entity.id).where(Entity.type == "skill"))).all()}


def clean_effects(rows: list[dict[str, Any]], skills: set[str]) -> list[dict[str, Any]]:
    """Checked effects, one per skill; those whose skill was deleted are dropped."""
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        skill, text, rating = str(r.get("skill")), str(r.get("text") or "").strip(), r.get("rating", 1)
        if len(text) > EFFECT_LIMIT:
            raise InvalidItem(f"an effect is too long (max {EFFECT_LIMIT} characters)")
        if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= abs(rating) <= MAX_RATING:
            raise InvalidItem(f"a rating is 1 to {MAX_RATING}, or -1 to -{MAX_RATING}")
        if skill in skills:
            out[skill] = {"skill": skill, "rating": rating, "text": text}
    return list(out.values())


async def save_item(adventure_id: uuid.UUID, changes: dict[str, Any]) -> None:
    """Set an item's purpose, effects and / or model (only the fields sent)."""
    async with SessionLocal() as session:
        adventure = await _get_adventure(session, adventure_id)
        if adventure.type != "item":
            raise InvalidTransition("only items have a sheet")
        sheet = await session.get(ItemSheet, adventure_id)
        if sheet is None:
            sheet = ItemSheet(adventure_id=adventure_id, purpose="", effects=[])
            session.add(sheet)
        if "purpose" in changes:
            text = str(changes["purpose"] or "").strip()
            if len(text) > PURPOSE_LIMIT:
                raise InvalidItem(f"the purpose is too long (max {PURPOSE_LIMIT} characters)")
            sheet.purpose = text
        if "effects" in changes:
            rows = changes["effects"] or []
            if len(rows) > MAX_EFFECTS:
                raise InvalidItem(f"too many effects (max {MAX_EFFECTS})")
            sheet.effects = clean_effects(rows, await skill_ids(session))
        if "model" in changes:
            sheet.model = clean_model(changes["model"])
        sheet.updated_at = utcnow()
        await session.commit()
    await broadcast_pools()
