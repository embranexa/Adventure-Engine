"""The FastAPI app: startup/shutdown, API routes, and the static frontend."""

import asyncio
import contextlib
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.crawlers import CRAWLERS
from backend.db.base import engine
from backend.db.setup import init_db
from backend.routers import api_router
from backend.services import transitions  # noqa: F401 - registers the transition recorder
from backend.services.triage import run_sweeper

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     [%(name)s] %(message)s")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db({name: crawler.URL for name, crawler in CRAWLERS.items()})
    sweeper = asyncio.create_task(run_sweeper())  # moves missed adventures to the Necropolis
    yield
    sweeper.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sweeper
    await engine.dispose()


app = FastAPI(title="AetherNet // Arcane-Cyberpunk Topology Engine", lifespan=lifespan)

app.include_router(api_router, prefix="/api")


class FreshStaticFiles(StaticFiles):
    """Static files the browser must revalidate on every load (a cheap 304 when unchanged).

    Without a Cache-Control header, browsers may reuse cached JS modules for a while,
    so an edited file (e.g. a dynamically imported scene) can keep running stale.
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/frontend", FreshStaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})
