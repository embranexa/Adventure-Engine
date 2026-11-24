"""Persisted settings: applied + draft filters (survive server restarts). Saved places became sites."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import get_session
from backend.db.models import AppState
from backend.services import targets
from backend.schemas.state import Anvil, FilterState, Idols, LayoutPresets, Verbs

router = APIRouter(prefix="/state", tags=["state"])

# key -> schema; only these keys can be read or written
SCHEMAS: dict[str, type[BaseModel]] = {
    "filters": FilterState,        # applied: what the calendar and map show
    "filters_draft": FilterState,  # the Nexus's pending edits, until "pass through"
    "anvil": Anvil,                # the Crucible's targets (services/targets.py)
    "verbs": Verbs,                # your own quest verbs
    "idols": Idols,                # the Cohort's archetypes
    "layout_presets": LayoutPresets,  # the user's saved dock arrangements (Layouts menu)
}


def _schema(key: str) -> type[BaseModel]:
    schema = SCHEMAS.get(key)
    if not schema:
        raise HTTPException(404, f"unknown state key: {key}")
    return schema


@router.get("/{key}")
async def get_state(key: str, or_null: bool = False, session: AsyncSession = Depends(get_session)):
    """The stored value, or the defaults if nothing has been saved yet
    (or null, with `?or_null=true`, so a caller can tell "never saved" apart)."""
    schema = _schema(key)
    row = await session.get(AppState, key)
    if row is None:
        return None if or_null else schema().model_dump(mode="json")
    try:
        return schema.model_validate(row.value).model_dump(mode="json")
    except ValueError:
        return schema().model_dump(mode="json")  # stored value from an older shape: fall back


@router.put("/{key}")
async def put_state(key: str, body: dict[str, Any], session: AsyncSession = Depends(get_session)):
    """Validate and store. Returns the normalized value."""
    schema = _schema(key)
    try:
        value = schema.model_validate(body).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    row = await session.get(AppState, key)
    before = row.value if row else None
    if row is None:
        session.add(AppState(key=key, value=value))
    else:
        row.value = value
    await session.commit()
    if key == "anvil":
        await targets.sync(before, value)
    return value
