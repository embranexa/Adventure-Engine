"""Request bodies for the adventure endpoints."""

from datetime import date
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, Field


class PhasePayload(BaseModel):
    phase: str  # checked against the allowed transitions in services/triage.py


class EpitaphPayload(BaseModel):
    cause: str  # checked in services/epitaphs.py
    note: str | None = None


class Line(BaseModel):
    name: str = ""
    qty: str = ""
    unit: str = ""


class Discovery(BaseModel):
    type: str
    name: str = ""
    entity_id: str | None = None


class MovePayload(BaseModel):
    text: str = ""
    grade: str = "good"
    better: str | None = None
    skills: list[str] = Field(default_factory=list)


class EnshriningPayload(BaseModel):
    """The whole analysis; checked further in services/enshrinings.py."""

    verdict: list[int] | None = None  # [outcome 0-2, thrill 0-2]
    link: str | None = None
    notes: str = ""
    gains: list[Line] = Field(default_factory=list)
    losses: list[Line] = Field(default_factory=list)
    discoveries: list[Discovery] = Field(default_factory=list)
    moves: list[MovePayload] = Field(default_factory=list)
    seal: bool = False


class Effect(BaseModel):
    text: str = ""
    target: str = "other"  # "favor", "other" or a skill entity's id
    amount: float = 0      # percent; below 0 is a debuff


class ItemPayload(BaseModel):
    """An item's sheet; checked further in services/items.py."""

    purpose: str | None = None
    effects: list[Effect] | None = None
    model: list[dict[str, Any]] | None = None


class Recurrence(BaseModel):
    """Weekly for now: on these weekdays (Monday = 0), until a day (inclusive) or forever."""

    freq: Literal["weekly"] = "weekly"
    days: list[int] = Field(min_length=1, max_length=7)
    until: date | None = None


class AdventureFields(BaseModel):
    """An adventure's own fields (services/adventures.py checks the rest). Only the fields
    sent are changed: send null or "" to clear one."""

    title: str | None = None
    description: str | None = None
    url: str | None = None
    cover_url: str | None = None
    # when/where (events only); times need an offset, e.g. 2026-12-06T14:00:00-08:00
    start_time: AwareDatetime | None = None
    end_time: AwareDatetime | None = None
    timezone: str | None = None
    all_day: bool | None = None
    recurrence: Recurrence | None = None
    venue: str | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lon: float | None = None
    costs: str | None = None
    rewards: str | None = None
    # flags (backend.db.models.ADVENTURE_FLAGS): the full set it should carry; [] clears them
    flags: list[Literal["important", "urgent", "favorite", "maybe", "waiting"]] | None = None


class AdventureUpdate(AdventureFields):
    type: str | None = None


class AdventureCreate(AdventureFields):
    type: str = "event"


class RoadmapAction(BaseModel):
    id: str
    title: str
    notes: str | None = Field(None, max_length=2000)


class RoadmapPayload(BaseModel):
    """An adventure's action roadmap; checked further in services/roadmap.py."""

    actions: list[RoadmapAction] = Field(default_factory=list, max_length=200)
    edges: list[list[str]] = Field(default_factory=list, max_length=2000)
    done: list[str] = Field(default_factory=list, max_length=200)
