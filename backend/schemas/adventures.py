"""Request bodies for the adventure endpoints."""

from datetime import date
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field


class PhasePayload(BaseModel):
    phase: str  # checked against the allowed transitions in services/triage.py


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


class AdventureUpdate(AdventureFields):
    type: str | None = None


class AdventureCreate(AdventureFields):
    type: str = "event"


class RoadmapAction(BaseModel):
    id: str
    title: str


class RoadmapPayload(BaseModel):
    """An adventure's action roadmap; checked further in services/roadmap.py."""

    actions: list[RoadmapAction] = Field(default_factory=list, max_length=200)
    edges: list[list[str]] = Field(default_factory=list, max_length=2000)
    done: list[str] = Field(default_factory=list, max_length=200)
