"""Database tables.

    event_sources  one row per crawler (luma, ...) with its sync status
    events         raw crawled events ("omens"), unique per (source, api_id), each with a review state
    adventures     the events you kept (plus, later, hand-made ones), each with a lifecycle phase
    app_state      small JSON settings that must survive restarts (filters, saved places)

Stage names (Sensorium, Hopper, Assay, ...) are only for display: see
resources/classifier.md. The database stores the plain values below.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base, UTCDateTime, utcnow

# Raw event review states: new (omen, Sensorium) | passed (became an adventure) | ignored (shade, Limbo)
REVIEW_STATES = ("new", "passed", "ignored")

# Adventure phases, in lifecycle order (display names in frontend/js/lifecycle.js)
PHASES = (
    "queued",          # Hopper      / ore
    "classifying",     # Assay       / essence
    "decomposing",     # Alembic     / distillate
    "constructing",    # Crucible    / alloy
    "consuming",       # Arena       / animus
    "completed",       # Treasury    / artifact
    "killed",          # Necropolis  / vestige
    "decommissioned",  # Archive     / relic
)
# Phases set by hand from the node card; "killed" only via kill, "decommissioned" only from "completed".
MANUAL_PHASES = ("queued", "classifying", "decomposing", "constructing", "consuming", "completed")
# An adventure still in one of these when its event ends was missed (-> killed automatically).
PRE_ARENA_PHASES = ("queued", "classifying", "decomposing", "constructing")


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
    review: Mapped[str] = mapped_column(String(10), default="new", server_default="new")
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Adventure(Base):
    """An adventure. Linked to its raw event (no copy): event fields are read through."""

    __tablename__ = "adventures"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # SET NULL keeps the adventure if its raw event row is ever removed
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), unique=True)
    type: Mapped[str] = mapped_column(String(20), default="event")  # event | song | item | ...
    title: Mapped[str | None] = mapped_column(String(500))  # for adventures without an event
    phase: Mapped[str] = mapped_column(String(20), default="queued")
    phase_before_kill: Mapped[str | None] = mapped_column(String(20))  # restored on revive
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # set by hand (HP, ATK, ...)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    phase_changed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AppState(Base):
    """Key/value store for small JSON settings (see backend/routers/state.py for the keys)."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


# Columns a crawler fills in; everything else is managed by the app.
EVENT_FIELDS = (
    "api_id", "title", "start_time", "end_time", "timezone", "url", "venue", "address",
    "city", "lat", "lon", "location_approximate", "cover_url", "details",
)
