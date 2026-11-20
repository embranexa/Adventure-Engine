"""Request bodies for the adventure endpoints."""

from pydantic import BaseModel, Field


class PhasePayload(BaseModel):
    phase: str  # checked against the allowed transitions in services/triage.py


class RoadmapAction(BaseModel):
    id: str
    title: str


class RoadmapPayload(BaseModel):
    """An adventure's action roadmap; checked further in services/roadmap.py."""

    actions: list[RoadmapAction] = Field(default_factory=list, max_length=200)
    edges: list[list[str]] = Field(default_factory=list, max_length=2000)
    done: list[str] = Field(default_factory=list, max_length=200)
