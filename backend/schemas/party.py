"""Request bodies for the party endpoints (services/party.py checks the rest)."""

from pydantic import BaseModel


class MemberPayload(BaseModel):
    """Only the fields sent change: send null or "" to clear a note, impact or follow-up."""

    status: str | None = None
    note: str | None = None
    impact: str | None = None
    follow_up: str | None = None  # "2026-12-01"
