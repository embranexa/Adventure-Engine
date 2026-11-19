"""Entry point: python server.py (the app itself lives in backend/app.py)."""

import uvicorn

from backend.app import app  # noqa: F401 - re-exported so "uvicorn server:app" works

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
