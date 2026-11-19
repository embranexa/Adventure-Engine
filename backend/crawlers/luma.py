"""Luma crawler: upcoming events from Luma's public discover API."""

import asyncio
from typing import Any

import httpx

NAME = "luma"
URL = "https://luma.com/los-angeles"

API = "https://api.luma.com/discover/get-paginated-events"
PLACE = "discplace-OgfEAh5KgfMzise"  # Los Angeles
PAGE_SIZE = 25
MAX_PAGES = 8          # caps one sync at 200 events
PAGE_DELAY_S = 0.3     # be polite between page requests


def parse_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Map one API entry to the fields of backend.schemas.EventIn."""
    ev = entry["event"]
    geo = ev.get("geo_address_info") or {}
    coord = ev.get("coordinate") or {}
    ticket = entry.get("ticket_info") or {}
    price = ticket.get("price") or {}
    hidden = ev.get("geo_address_visibility") != "public" or geo.get("mode") == "obfuscated"

    return {
        "api_id": entry["api_id"],
        "title": ev["name"],
        "start_time": ev["start_at"],   # ISO string; pydantic parses it to an aware datetime
        "end_time": ev.get("end_at"),
        "timezone": ev.get("timezone"),
        "url": f"https://luma.com/{ev['url']}",
        "venue": None if hidden else geo.get("address"),
        "address": None if hidden else geo.get("full_address"),
        "city": geo.get("city"),
        "lat": coord.get("latitude"),
        "lon": coord.get("longitude"),
        "location_approximate": hidden,
        "cover_url": ev.get("cover_url"),
        "details": {
            "free": bool(ticket.get("is_free")),
            "price_cents": price.get("cents"),
            "price_min_cents": price.get("min_cents"),
            "price_max_cents": (ticket.get("max_price") or {}).get("cents"),
            "sold_out": bool(ticket.get("is_sold_out")),
            "registration": entry.get("registration_availability"),
            "hosts": [h["name"] for h in entry.get("hosts", []) if h.get("name")],
            "guest_count": entry.get("guest_count"),
        },
    }


async def fetch_events(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch up to MAX_PAGES pages of upcoming events."""
    events: list[dict[str, Any]] = []
    cursor = None
    for page in range(MAX_PAGES):
        params: dict[str, Any] = {"discover_place_api_id": PLACE, "pagination_limit": PAGE_SIZE}
        if cursor:
            params["pagination_cursor"] = cursor
        res = await client.get(API, params=params)
        res.raise_for_status()
        data = res.json()

        events.extend(parse_entry(e) for e in data.get("entries", []))

        cursor = data.get("next_cursor")
        if not data.get("has_more") or not cursor:
            break
        await asyncio.sleep(PAGE_DELAY_S)
    return events
