"""Shapes of the persisted settings (app_state table). Mirrors FilterState in
frontend/types/global.d.ts; the filtering itself happens in the browser (frontend/js/filters.js)."""

from datetime import date
from typing import Any, Literal, get_args

from pydantic import BaseModel, Field, model_validator

FilterMode = Literal["include", "exclude"]
FacetKey = Literal["source", "tag", "city", "region", "metro", "type", "phase", "review", "flag",
                   "collaboration", "leader", "deity", "site", "player", "organization", "skill"]
# what colors the matter: "stage" (Matter) or a facet (frontend/js/lib/lens.js)
LensKey = Literal["none", "stage", "source", "tag", "city", "region", "metro", "type", "flag",
                  "collaboration", "leader", "deity", "site", "player", "organization", "skill"]
RENAMED_KEYS = {"pillar": "deity", "contact": "player"}  # saved filters may still use the old name
FACET_KEYS, LENS_KEYS = set(get_args(FacetKey)), set(get_args(LensKey))


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
    label: str | None = Field(None, max_length=200)
    site_id: str | None = Field(None, max_length=64)  # set when the ring is anchored on a site


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
    lens: LensKey = "stage"  # applies at once (never pending): it changes colors, not the subset

    @model_validator(mode="before")
    @classmethod
    def drop_retired_keys(cls, data: Any) -> Any:
        """Saved state may name facets or a lens since removed (e.g. registration): drop
        those filters and fall back to the Matter lens, rather than fail to load. Renamed
        ones (pillar -> deity, the song type -> performance) are kept under their new name."""
        if isinstance(data, dict):
            data = dict(data)
            if isinstance(data.get("facets"), dict):
                facets = {RENAMED_KEYS.get(k, k): v for k, v in data["facets"].items()}
                if isinstance(facets.get("type"), dict):
                    facets["type"] = {"performance" if k == "song" else k: v for k, v in facets["type"].items()}
                data["facets"] = {k: v for k, v in facets.items() if k in FACET_KEYS}
            data["lens"] = RENAMED_KEYS.get(data.get("lens"), data.get("lens")) or "stage"
            if data.get("lens") is not None and data["lens"] not in LENS_KEYS:
                data["lens"] = "stage"
        return data



class Pin(BaseModel):
    adventure: str = Field(max_length=40)
    action: str = Field(max_length=40)


class Anvil(BaseModel):
    """Targeted quests (the Crucible), in order."""

    pins: list[Pin] = Field(default_factory=list, max_length=200)


class Verbs(BaseModel):
    """Verbs you defined for quests and buffs, beside the built-in ones."""

    verbs: list[str] = Field(default_factory=list, max_length=100)
    buff_verbs: list[str] = Field(default_factory=list, max_length=100)


class Idol(BaseModel):
    """What you wrote about an archetype (the Cohort). description null: the built-in one."""

    description: str | None = Field(None, max_length=5000)
    skills: list[str] = Field(default_factory=list, max_length=40)  # ids of skill entities


class Idols(BaseModel):
    idols: dict[str, Idol] = Field(default_factory=dict)


class LayoutPreset(BaseModel):
    """A saved dock arrangement (the Layouts menu): a name and the layout tree."""

    name: str = Field(min_length=1, max_length=60)
    tree: dict[str, Any]


class LayoutPresets(BaseModel):
    presets: list[LayoutPreset] = Field(default_factory=list, max_length=40)
