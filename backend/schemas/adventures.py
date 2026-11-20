"""Request bodies for the adventure endpoints."""

from pydantic import BaseModel


class PhasePayload(BaseModel):
    phase: str  # checked against the allowed transitions in services/triage.py
