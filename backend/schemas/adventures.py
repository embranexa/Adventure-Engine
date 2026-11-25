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
    spell: str | None = None  # a spell entity's id
    skills: list[str] = Field(default_factory=list)


class Feedback(BaseModel):
    """Something that helped or hurt: an effect that was active, or one added after."""

    key: str = Field(max_length=100)
    label: str = ""
    target: str | None = None
    rating: int = 0
    result: Literal["helped", "none", "hurt"] | None = None


class EnshriningPayload(BaseModel):
    """The whole analysis; checked further in services/enshrinings.py."""

    verdict: list[int] | None = None  # [outcome 0-2, thrill 0-2]
    link: str | None = None
    notes: str = ""
    gains: list[Line] = Field(default_factory=list)
    losses: list[Line] = Field(default_factory=list)
    discoveries: list[Discovery] = Field(default_factory=list)
    moves: list[MovePayload] = Field(default_factory=list)
    feedback: list[Feedback] = Field(default_factory=list)
    seal: bool = False


class Effect(BaseModel):
    target: str      # an attribute (backend.db.models.ATTRIBUTES), or a skill entity's id
    rating: int = 1  # its amp: 1 to 5, or -1 to -5 (a debuff)
    text: str = ""


class BountyPayload(BaseModel):
    effort: int
    resistance: int
    ratio: int


class ForgePayload(BaseModel):
    text: str = Field(max_length=4000)


class ItemPayload(BaseModel):
    """An adventure's sheet (purpose and effects: items only); checked further in services/items.py."""

    face: Literal["cover", "model"] | None = None

    purpose: str | None = None
    effects: list[Effect] | None = None
    model: list[dict[str, Any]] | None = None


class Recurrence(BaseModel):
    """Weekly for now: on these weekdays (Monday = 0), until a day (inclusive) or forever."""

    freq: Literal["weekly"] = "weekly"
    days: list[int] = Field(min_length=1, max_length=7)
    until: date | None = None


class Objective(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field("", max_length=300)
    kind: Literal["primary", "bonus"] = "primary"
    state: Literal["open", "achieved", "failed"] = "open"


class Preparation(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    item: str | None = None  # an owned item of the adventure's gear set
    text: str = Field("", max_length=300)
    checked: bool = False
    effects: list["Effect"] = Field(default_factory=list, max_length=20)  # free-text ones only


class Adversary(BaseModel):
    entity_id: str | None = None
    name: str = Field("", max_length=200)


class AdventureFields(BaseModel):
    """An adventure's own fields (services/adventures.py checks the rest). Only the fields
    sent are changed: send null or "" to clear one."""

    title: str | None = None
    description: str | None = None
    url: str | None = None
    cover_url: str | None = None
    # when/where (not items); times need an offset, e.g. 2026-12-06T14:00:00-08:00
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
    objectives: list[Objective] | None = Field(None, max_length=50)
    preparations: list[Preparation] | None = Field(None, max_length=50)
    adversaries: list[Adversary] | None = Field(None, max_length=20)
    costs: str | None = None
    rewards: str | None = None
    # flags (backend.db.models.ADVENTURE_FLAGS): the full set it should carry; [] clears them
    flags: list[Literal["important", "urgent", "favorite", "maybe", "waiting"]] | None = None

    def sent(self) -> dict[str, Any]:
        """The fields sent, in full (exclude_unset would also drop nested defaults)."""
        return {k: v for k, v in self.model_dump().items() if k in self.model_fields_set}


class AdventureUpdate(AdventureFields):
    type: str | None = None


class AdventureCreate(AdventureFields):
    type: str = "event"


class RoadmapAction(BaseModel):
    id: str
    title: str
    notes: str | None = Field(None, max_length=2000)
    skills: list[str] = Field(default_factory=list, max_length=10)  # ids of skill entities it practices


class RoadmapPayload(BaseModel):
    """An adventure's action roadmap; checked further in services/roadmap.py."""

    actions: list[RoadmapAction] = Field(default_factory=list, max_length=200)
    edges: list[list[str]] = Field(default_factory=list, max_length=2000)
    done: list[str] = Field(default_factory=list, max_length=200)


class DayPayload(BaseModel):
    """A date where you are."""

    date: date


class DatePayload(DayPayload):
    """One date of a weekly adventure."""

    start: AwareDatetime
    end: AwareDatetime | None = None
