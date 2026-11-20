"""Request bodies for the virtual object endpoints (services/objects.py checks the rest)."""

from pydantic import BaseModel


class ObjectFields(BaseModel):
    """Only the fields sent change: send null or "" to clear one."""

    name: str | None = None
    description: str | None = None
    url: str | None = None
    # sites only
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lon: float | None = None
    # contacts only: email, phone, handle (null clears one)
    details: dict[str, str | None] | None = None


class ObjectCreate(ObjectFields):
    type: str  # pillar | site | contact


class ObjectUpdate(ObjectFields):
    pass
