"""Shapes of the persisted settings (app_state table). Mirrors FilterState / SavedPlace in
frontend/types/global.d.ts; the filtering itself happens in the browser (frontend/js/filters.js)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

FilterMode = Literal["include", "exclude"]
FacetKey = Literal["source", "city", "registration", "type", "phase", "review"]


class DateRange(BaseModel):
    start: date  # inclusive, local calendar days
    end: date
    mode: FilterMode = "include"

    @model_validator(mode="after")
    def ordered(self):
        if self.end < self.start:
            raise ValueError("end must not be before start")
        return self


class RingCenter(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    label: str | None = Field(None, max_length=100)


class Ring(BaseModel):
    center: RingCenter
    radius_km: float = Field(gt=0, le=20000)
    mode: FilterMode = "include"


class FilterState(BaseModel):
    # facet -> {value: include|exclude}; values not listed are off
    facets: dict[FacetKey, dict[str, FilterMode]] = Field(default_factory=dict)
    date_range: DateRange | None = None
    ring: Ring | None = None
    seal: bool = True  # Hermetic Seal (Adventures mode)
    units: Literal["mi", "km"] = "mi"


class SavedPlace(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=100)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class PlacesState(BaseModel):
    places: list[SavedPlace] = Field(default_factory=list, max_length=200)
