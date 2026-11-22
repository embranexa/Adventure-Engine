"""Places: Plus Codes to coordinates (see services/geo.py)."""

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
