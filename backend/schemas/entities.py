"""Request bodies for the entity endpoints (services/entities.py checks the rest)."""

from pydantic import BaseModel


class EntityFields(BaseModel):
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
    # "#rrggbb"; null or "" goes back to the default colour
    color: str | None = None


class EntityCreate(EntityFields):
    type: str  # deity | site | contact


class EntityUpdate(EntityFields):
    pass
