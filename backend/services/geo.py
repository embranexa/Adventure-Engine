"""Plus Codes (Open Location Code) to coordinates.

Accepts what Google Maps shows and shares:
    8FVC9G8F+6X                       a full code: decoded offline
    M4RP+3R Irvine, California        a short code and a locality (any short code, any
    M4RP+3R, Irvine, CA               place): the locality is geocoded, then the full code
                                      nearest to it is recovered and decoded

The locality goes to OpenStreetMap's Nominatim (with a generic client name, nothing
about the user); answers are kept in memory.
"""

import re
from typing import Any

import httpx

ALPHABET = "23456789CFGHJMPQRVWX"
SEPARATOR = "+"
SEPARATOR_AT = 8
PAIR_LENGTH = 10
GRID_ROWS, GRID_COLS = 5, 4
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "AdventureEngine/1.0 (self-hosted)"

CODE_RE = re.compile(r"^\s*([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*)\s*,?\s*(.*?)\s*$", re.IGNORECASE)

_places: dict[str, tuple[float, float, str]] = {}


class PlusCodeError(Exception):
    pass


def _clip_lat(lat: float) -> float:
    return min(90.0, max(-90.0, lat))


def _norm_lng(lng: float) -> float:
    while lng < -180:
        lng += 360
    while lng >= 180:
        lng -= 360
    return lng


def is_valid(code: str) -> bool:
    code = code.upper()
    if code.count(SEPARATOR) != 1:
        return False
    sep = code.index(SEPARATOR)
    if sep > SEPARATOR_AT or sep % 2 == 1:
        return False
    body = code.replace(SEPARATOR, "")
    if "0" in body:  # padding: only in full codes, only right before the separator
        if sep < SEPARATOR_AT or not re.fullmatch(r"[^0]*0+", code[:sep]) or len(code) > sep + 1:
            return False
    if len(code) - sep - 1 == 1:  # a single digit after the separator isn't allowed
        return False
    return all(c in ALPHABET for c in body.replace("0", ""))


def is_full(code: str) -> bool:
    code = code.upper()
    if not is_valid(code) or code.index(SEPARATOR) != SEPARATOR_AT:
        return False
    return ALPHABET.index(code[0]) * 20 < 180 and ALPHABET.index(code[1]) * 20 < 360


def encode(lat: float, lng: float, length: int = PAIR_LENGTH) -> str:
    """The code for a point (pairs only; enough to give short codes their prefix)."""
    lat = _clip_lat(lat)
    if lat == 90:
        lat -= 1e-9
    lat += 90
    lng = _norm_lng(lng) + 180
    out, res = "", 20.0
    for _ in range(PAIR_LENGTH // 2):
        d_lat, d_lng = int(lat // res), int(lng // res)
        lat -= d_lat * res
        lng -= d_lng * res
        out += ALPHABET[d_lat] + ALPHABET[d_lng]
        res /= 20
    out = out[:length]
    return out[:SEPARATOR_AT] + SEPARATOR + out[SEPARATOR_AT:]


def decode(code: str) -> tuple[float, float]:
    """The centre (lat, lng) of a full code's area."""
    if not is_full(code):
        raise PlusCodeError(f"{code} is not a full Plus Code")
    digits = code.upper().replace(SEPARATOR, "").replace("0", "")
    lat, lng, res = -90.0, -180.0, 400.0
    for i in range(0, min(len(digits), PAIR_LENGTH), 2):
        res /= 20
        lat += ALPHABET.index(digits[i]) * res
        lng += ALPHABET.index(digits[i + 1]) * res
    lat_size = lng_size = res
    for ch in digits[PAIR_LENGTH:PAIR_LENGTH + 5]:
        d = ALPHABET.index(ch)
        lat_size /= GRID_ROWS
        lng_size /= GRID_COLS
        lat += (d // GRID_COLS) * lat_size
        lng += (d % GRID_COLS) * lng_size
    return _clip_lat(lat + lat_size / 2), _norm_lng(lng + lng_size / 2)


def recover_nearest(short: str, ref_lat: float, ref_lng: float) -> str:
    """The full code nearest the reference point that ends in `short`."""
    short = short.upper()
    if is_full(short):
        return short
    if not is_valid(short):
        raise PlusCodeError(f"{short} is not a Plus Code")
    padding = SEPARATOR_AT - short.index(SEPARATOR)
    resolution = 20 ** (2 - padding / 2)
    half = resolution / 2
    code = encode(ref_lat, ref_lng).replace(SEPARATOR, "")[:padding] + short
    lat, lng = decode(code)
    # the prefix came from the reference's cell: step one cell over if that's nearer
    if ref_lat + half < lat and lat - resolution >= -90:
        lat -= resolution
    elif ref_lat - half > lat and lat + resolution <= 90:
        lat += resolution
    if ref_lng + half < lng:
        lng -= resolution
    elif ref_lng - half > lng:
        lng += resolution
    digits = len(short.replace(SEPARATOR, "")) + padding
    return _encode_digits(lat, _norm_lng(lng), digits)


def _encode_digits(lat: float, lng: float, digits: int) -> str:
    """Encode with grid digits past the pairs when the short code had them."""
    code = encode(lat, lng).replace(SEPARATOR, "")
    if digits > PAIR_LENGTH:
        lat_r, lng_r = (_clip_lat(lat) + 90), (_norm_lng(lng) + 180)
        res = 20.0 / 20 ** 4
        lat_r %= res
        lng_r %= res
        lat_size, lng_size = res, res
        for _ in range(digits - PAIR_LENGTH):
            lat_size /= GRID_ROWS
            lng_size /= GRID_COLS
            row, col = int(lat_r // lat_size), int(lng_r // lng_size)
            lat_r -= row * lat_size
            lng_r -= col * lng_size
            code += ALPHABET[row * GRID_COLS + col]
    else:
        code = code[:digits]
    return code[:SEPARATOR_AT] + SEPARATOR + code[SEPARATOR_AT:]


async def geocode(place: str) -> tuple[float, float, str]:
    """A place name's coordinates and display name, through Nominatim (cached)."""
    key = place.strip().lower()
    if key in _places:
        return _places[key]
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": USER_AGENT}) as client:
        res = await client.get(NOMINATIM, params={"q": place, "format": "json", "limit": 1})
    if res.status_code != 200:
        raise PlusCodeError(f"the geocoder answered {res.status_code}")
    hits = res.json()
    if not hits:
        raise PlusCodeError(f"couldn't find {place!r}")
    hit = (float(hits[0]["lat"]), float(hits[0]["lon"]), str(hits[0].get("display_name") or place))
    _places[key] = hit
    return hit


async def resolve(text: str) -> dict[str, Any]:
    """`code [locality]` -> {lat, lon, code (full), place}."""
    m = CODE_RE.match(text or "")
    if not m:
        raise PlusCodeError("write a Plus Code, e.g. 8FVC9G8F+6X or M4RP+3R Irvine, California")
    code, place = m.group(1).upper(), m.group(2).strip(" ,")
    if not is_valid(code):
        raise PlusCodeError(f"{code} is not a Plus Code")
    if is_full(code):
        lat, lon = decode(code)
        return {"lat": round(lat, 6), "lon": round(lon, 6), "code": code, "place": place or None}
    if not place:
        raise PlusCodeError(f"{code} is a short code: add the town, e.g. {code} Irvine, California")
    ref_lat, ref_lon, name = await geocode(place)
    full = recover_nearest(code, ref_lat, ref_lon)
    lat, lon = decode(full)
    return {"lat": round(lat, 6), "lon": round(lon, 6), "code": full, "place": name}
