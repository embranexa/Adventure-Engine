"""Request bodies for the workspace layout endpoints."""

from typing import Any

from pydantic import BaseModel


class LayoutPayload(BaseModel):
    tree: dict[str, Any]
