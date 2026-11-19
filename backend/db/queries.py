"""Reads, and the JSON shapes sent to the frontend."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Event, EventSource


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def source_to_dict(s: EventSource) -> dict[str, Any]:
    return {
        "name": s.name,
        "url": s.url,
        "status": s.status,
        "last_sync_time": _iso(s.last_sync_time),
        "last_error": s.last_error,
    }


def event_to_dict(e: Event, source_name: str) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "source": source_name,
        "api_id": e.api_id,
        "title": e.title,
        "start": _iso(e.start_time),
        "end": _iso(e.end_time),
        "timezone": e.timezone,
        "url": e.url,
        "venue": e.venue,
        "address": e.address,
        "city": e.city,
        "lat": e.lat,
        "lon": e.lon,
        "location_approximate": e.location_approximate,
        "cover_url": e.cover_url,
        "details": e.details,
    }


async def list_events(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(Event, EventSource.name)
        .join(EventSource, Event.source_id == EventSource.id)
        .order_by(Event.start_time)
    )
    return [event_to_dict(e, name) for e, name in rows.all()]


async def list_sources(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await session.scalars(select(EventSource).order_by(EventSource.name))
    return [source_to_dict(s) for s in rows.all()]


async def get_source(session: AsyncSession, name: str) -> dict[str, Any] | None:
    source = await session.scalar(select(EventSource).where(EventSource.name == name))
    return source_to_dict(source) if source else None
