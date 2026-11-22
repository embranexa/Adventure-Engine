"""Media served from the app's origin: cover images (see services/covers.py)."""

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from backend.services import covers

router = APIRouter(tags=["media"])


@router.get("/cover")
async def get_cover(url: str = Query(..., max_length=4000)):
    """A cover image from another site, fetched once and cached, so 3D scenes can draw it."""
    try:
        body, ctype = await covers.fetch(url)
    except covers.CoverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {type(exc).__name__}") from exc
    # images are content-addressed by URL: let the browser keep them
    return Response(content=body, media_type=ctype, headers={"Cache-Control": "public, max-age=604800"})
