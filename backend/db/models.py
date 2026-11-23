"""Database tables.

    event_sources  one row per harvester (luma, ...) with its sync status
    events         raw harvested events, unique per (source, api_id), each with a review state
    adventures     the events you kept and hand-made ones, each with a lifecycle phase
                   and an optional action roadmap
    entities        entities (deities, sites, contacts, organizations, skills) that adventures link to (the Codex)
    adventure_entities  links between adventures and entities
    enshrinings    the analysis of a completed adventure (the Treasury), sealed or draft
    moves          the moves of an enshrining, graded like a chess game's
    ambrosia       the Agora's ledger: every amount earned or taken back
    item_sheets    an item's purpose, effects and 3D model (the Inventory)
    epitaphs       why a killed adventure died (the Necropolis)
    app_state      small JSON settings that must survive restarts (filters)
    geocache       place lookups (address / venue / city -> coordinates), so each is asked once
    transitions    log of every move between nodes of the signal chain (the twin's packets)

Stage names (Harvester, Centrifuge, Hopper, ...) are only for display: see
resources/classifier.md. The database stores the plain values below. Node ids (for the
transitions log) are in PHASE_NODES and the *_NODE constants.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base, UTCDateTime, utcnow

# Raw event review states:
#   harvested (flux, in its Harvester) | new (prima materia, in the Centrifuge: Discovery shows these)
#   passed (became an adventure)       | ignored (dross, in the Sump)
REVIEW_STATES = ("harvested", "new", "passed", "ignored")

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
# Signal chain nodes (the twin): where each phase sits, and the other node ids. Same map in
# frontend/js/lifecycle.js. Harvesters are "harvester:<source name>".
PHASE_NODES = {
    "queued": "hopper",
    "classifying": "refinery",
    "decomposing": "alembic",
    "constructing": "crucible",
    "consuming": "arena",
    "completed": "treasury",
    "killed": "necropolis",
    "decommissioned": "archive",
}
OUTSIDE_NODE = "outside"        # where harvested events come from
CENTRIFUGE_NODE = "centrifuge"  # events "new"
SUMP_NODE = "sump"              # events "ignored" that have no adventure
FORGE_NODE = "forge"            # hand-made adventures enter here
CODEX_NODE = "codex"            # entities; links travel codex <-> refinery


def harvester_node(source_name: str) -> str:
    return f"harvester:{source_name}"

# Adventure types. Only events have a when/where; items and performances are exempt from everything
# that uses one (calendar, map, date/proximity filters, the missed-adventure sweeper).
ADVENTURE_TYPES = ("event", "item", "performance")
WHEN_WHERE_TYPES = ("event",)
# Flags an adventure can carry (any number), set by hand; display in frontend/js/lifecycle.js
ADVENTURE_FLAGS = ("important", "urgent", "favorite", "maybe", "waiting")

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
    # server_default only fills rows that existed before the column did; harvests insert "harvested"
    review: Mapped[str] = mapped_column(String(10), default="harvested", server_default="new")
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Adventure(Base):
    """An adventure: crawled (linked to its raw event) or made by hand (no event).

    Event fields are read through, not copied. The adventure's own fields below are set by
    hand and win over the event's when not null: on a hand-made adventure they're all
    there is; on a crawled one they correct the source (see queries.adventure_to_dict).
    """

    __tablename__ = "adventures"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # SET NULL keeps the adventure if its raw event row is ever removed
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), unique=True)
    type: Mapped[str] = mapped_column(String(20), default="event")  # event | performance | item | ...
    title: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    # when/where: events only (WHEN_WHERE_TYPES)
    start_time: Mapped[datetime | None] = mapped_column(UTCDateTime)
    end_time: Mapped[datetime | None] = mapped_column(UTCDateTime)
    timezone: Mapped[str | None] = mapped_column(String(64))
    # whole days: start/end are the first and last day's local midnights (the last day counts)
    all_day: Mapped[bool | None] = mapped_column(Boolean)
    # repeats: {"freq": "weekly", "days": [0..6] (Monday = 0), "until": "YYYY-MM-DD" | null};
    # start/end give the first occurrence (its time of day and length)
    recurrence: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    venue: Mapped[str | None] = mapped_column(String(500))  # free text for now (venue entities later)
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(200))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    url: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(Text)
    costs: Mapped[str | None] = mapped_column(Text)    # free text for now (the Agora later)
    rewards: Mapped[str | None] = mapped_column(Text)
    phase: Mapped[str] = mapped_column(String(20), default="queued")
    phase_before_kill: Mapped[str | None] = mapped_column(String(20))  # restored on revive
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # set by hand (HP, ATK, ...)
    # what it's worth: {effort, resistance, ratio, locked_at}; see services/bounty.py, ledger.py
    bounty: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    flags: Mapped[list[str] | None] = mapped_column(JSON, default=list)  # ADVENTURE_FLAGS, set by hand
    # action roadmap (Alembic): {actions, edges, done}; see backend/services/roadmap.py
    roadmap: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    phase_changed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# Entities (the Codex): things adventures link to. Only sites have a location.
ENTITY_TYPES = ("deity", "site", "contact", "organization", "skill")
GEO_ENTITY_TYPES = ("site",)


class Entity(Base):
    """A deity, site, contact, organization or skill that adventures link to (see services/entities.py)."""

    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(20))  # ENTITY_TYPES
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    # location: sites only (GEO_ENTITY_TYPES)
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(200))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    # type-specific extras: contact {email, phone, handle}
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # "#rrggbb", chosen in the Codex; null = a stable default picked from the id (frontend)
    color: Mapped[str | None] = mapped_column(String(7))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class AdventureEntity(Base):
    """A link between an adventure and an entity (many-to-many).

    SQLite here doesn't enforce foreign keys, so services delete links explicitly.
    """

    __tablename__ = "adventure_entities"

    adventure_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("adventures.id", ondelete="CASCADE"), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Ambrosia(Base):
    """One entry of the Agora's ledger (see services/ledger.py). Append-only; no foreign key,
    so what an abandoned adventure earned stays."""

    __tablename__ = "ambrosia"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    adventure_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    kind: Mapped[str] = mapped_column(String(12))  # action | enshrined | reversal
    ref: Mapped[str] = mapped_column(String(60))   # the action's id, or "seal"
    amount: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(Text)       # as it read then (titles change)


class ItemSheet(Base):
    """What an item is for, what it does, and its model (see services/items.py)."""

    __tablename__ = "item_sheets"

    adventure_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("adventures.id", ondelete="CASCADE"), primary_key=True)
    purpose: Mapped[str] = mapped_column(Text, default="")
    effects: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)  # [{text, target, amount}]
    model: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)  # a recipe: parts
    # the Forge's work on it: {status: forging | ready | failed, text, at, proposal, error}
    forge: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# Why an adventure died, in the order offered (labels in frontend/js/lifecycle.js).
# "missed" is also set by the sweeper (services/triage.py).
EPITAPH_CAUSES = ("lost_interest", "no_time", "too_costly", "blocked", "superseded", "outside_control", "missed")


class Epitaph(Base):
    """Why a killed adventure died (see services/epitaphs.py). Kept through a revive."""

    __tablename__ = "epitaphs"

    adventure_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("adventures.id", ondelete="CASCADE"), primary_key=True)
    cause: Mapped[str] = mapped_column(String(20))  # EPITAPH_CAUSES
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


# How a move is graded: chess.com's classes (icons and meanings in frontend/js/lib/analysis.js)
MOVE_GRADES = ("brilliant", "great", "best", "excellent", "good", "book", "forced",
               "inaccuracy", "mistake", "miss", "blunder")


class Enshrining(Base):
    """What a completed adventure meant (see services/enshrinings.py). A draft until sealed."""

    __tablename__ = "enshrinings"

    adventure_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("adventures.id", ondelete="CASCADE"), primary_key=True)
    # the verdict: outcome 0 defeat .. 2 success, thrill 0 boring .. 2 exciting
    outcome: Mapped[int | None] = mapped_column(Integer)
    thrill: Mapped[int | None] = mapped_column(Integer)
    link: Mapped[str | None] = mapped_column(Text)  # to the performance
    notes: Mapped[str] = mapped_column(Text, default="")
    gains: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)   # spoils: [{name, qty, unit}]
    losses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)  # tithes
    discoveries: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)  # [{type, name, entity_id}]
    sealed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    amended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Move(Base):
    """One move of an enshrining. A table, so better lines can be found by skill later."""

    __tablename__ = "moves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    adventure_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("adventures.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    grade: Mapped[str] = mapped_column(String(12))  # MOVE_GRADES
    better: Mapped[str | None] = mapped_column(Text)  # the better line, if there was one
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)  # ids of skill entities


class Transition(Base):
    """One move of a packet between signal chain nodes (see backend/services/transitions.py).

    subject: "event" (row_id = event id), "adventure" (row_id = adventure id) or
    "link" (row_id = entity id, ref_id = adventure id). synthetic: backfilled once from
    rows that existed before the log did; never replayed as packets.
    """

    __tablename__ = "transitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    subject: Mapped[str] = mapped_column(String(10))
    row_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    from_node: Mapped[str] = mapped_column(String(120))
    to_node: Mapped[str] = mapped_column(String(120))
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class AppState(Base):
    """Key/value store for small JSON settings (see backend/routers/state.py for the keys)."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class GeoCache(Base):
    """One place lookup (services/geocode.py). lat/lon are null when nothing was found,
    so a miss isn't asked again either."""

    __tablename__ = "geocache"

    query: Mapped[str] = mapped_column(String(600), primary_key=True)  # level + normalized text
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    label: Mapped[str | None] = mapped_column(Text)  # what the geocoder matched
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# Columns a crawler (a harvester's scraper) fills in; everything else is managed by the app.
EVENT_FIELDS = (
    "api_id", "title", "start_time", "end_time", "timezone", "url", "venue", "address",
    "city", "lat", "lon", "location_approximate", "cover_url", "details",
)
