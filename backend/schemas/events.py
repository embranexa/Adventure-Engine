"""Validation for events entering the database."""

from typing import Any

from pydantic import AwareDatetime, BaseModel, Field, HttpUrl


class EventIn(BaseModel):
    """One event as produced by a crawler. Checked before it touches the DB."""

    api_id: str = Field(min_length=1, max_length=500)
    title: str = Field(min_length=1, max_length=500)
    start_time: AwareDatetime  # rejects naive datetimes
    end_time: AwareDatetime | None = None
    timezone: str | None = Field(None, max_length=64)
    url: HttpUrl
    venue: str | None = Field(None, max_length=500)
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=200)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    location_approximate: bool = False
    cover_url: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
