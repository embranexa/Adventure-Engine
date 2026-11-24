"""Places: Plus Codes to coordinates, coordinates to a place (see services/geo.py)."""

import httpx
from fastapi import APIRouter, HTTPException, Query

from backend.services import geo

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/plus-code")
async def plus_code(q: str = Query(..., max_length=300)):
    """`8FVC9G8F+6X` or `M4RP+3R Irvine, California` -> {lat, lon, code, place}."""
    try:
        return await geo.resolve(q)
    except geo.PlusCodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"geocoder unreachable ({type(exc).__name__})") from exc


@router.get("/reverse")
async def reverse(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    """What's at a point -> {venue, address, city}, each null if unknown."""
    try:
        return await geo.reverse(lat, lon)
    except geo.PlusCodeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"geocoder unreachable ({type(exc).__name__})") from exc
