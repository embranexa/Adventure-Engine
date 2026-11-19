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
from backend.services.telemetry import run_telemetry

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     [%(name)s] %(message)s")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db({name: crawler.URL for name, crawler in CRAWLERS.items()})
    telemetry = asyncio.create_task(run_telemetry())
    yield
    telemetry.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await telemetry
    await engine.dispose()


app = FastAPI(title="AetherNet // Arcane-Cyberpunk Topology Engine", lifespan=lifespan)

app.include_router(api_router, prefix="/api")
app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")
