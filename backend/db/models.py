"""Database tables.

    event_sources  one row per crawler (luma, ...) with its sync status
    events         one row per crawled event, unique per (source, api_id)
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base, UTCDateTime, utcnow


class EventSource(Base):
    __tablename__ = "event_sources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    url: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="idle")  # idle | syncing | failed
    last_sync_time: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_error: Mapped[str | None] = mapped_column(Text)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("source_id", "api_id", name="uq_events_source_api"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("event_sources.id", ondelete="CASCADE"))
    api_id: Mapped[str] = mapped_column(String(500))  # the source's own id for the event
    title: Mapped[str] = mapped_column(String(500))
    start_time: Mapped[datetime] = mapped_column(UTCDateTime)
    end_time: Mapped[datetime | None] = mapped_column(UTCDateTime)
    timezone: Mapped[str | None] = mapped_column(String(64))  # IANA name, e.g. America/Los_Angeles
    url: Mapped[str] = mapped_column(Text)
    venue: Mapped[str | None] = mapped_column(String(500))
    address: Mapped[str | None] = mapped_column(String(500))  # null when the source hides it
    city: Mapped[str | None] = mapped_column(String(200))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    location_approximate: Mapped[bool] = mapped_column(Boolean, default=False)
    cover_url: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # source-specific extras
    first_seen: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# Columns a crawler fills in; everything else is managed by the app.
EVENT_FIELDS = (
    "api_id", "title", "start_time", "end_time", "timezone", "url", "venue", "address",
    "city", "lat", "lon", "location_approximate", "cover_url", "details",
)
