// Where something is, typed by hand: "lat, lon" or a Plus Code (a full one, or a short one
// with its town, e.g. M4RP+3R Irvine, California). Plus Codes are resolved by the server
// (GET /api/geo/plus-code; backend/services/geo.py). Shared by the Refinery and the Codex.

/** @param {number | null} lat @param {number | null} lon */
export const coordsText = (lat, lon) => (lat != null && lon != null ? `${lat}, ${lon}` : '');

/** "34.05, -118.25" -> [lat, lon]; '' -> [null, null]; null if unreadable. @param {string} text */
export function parseCoords(text) {
    if (!text.trim()) return [null, null];
    const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
}

const PLUS_CODE = /^\s*[23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*/i;

/** The placeholder for a coordinates field that takes Plus Codes too. */
export const PLACE_PLACEHOLDER = 'lat, lon · M4RP+3R Irvine, CA';

/**
 * Read a typed place: coordinates, or a Plus Code (asks the server).
 * @param {string} text
 * @returns {Promise<{ lat: number | null, lon: number | null, note: string | null } | { error: string }>}
 */
export async function readPlace(text) {
    const coords = parseCoords(text);
    if (coords) return { lat: coords[0], lon: coords[1], note: null };
    if (!PLUS_CODE.test(text)) {
        return { error: 'Write coordinates as "lat, lon" (34.05, -118.25) or a Plus Code (M4RP+3R Irvine, California)' };
    }
    try {
        const res = await fetch(`/api/geo/plus-code?q=${encodeURIComponent(text.trim())}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) return { error: typeof body?.detail === 'string' ? body.detail : `Plus Code not found (${res.status})` };
        return { lat: body.lat, lon: body.lon, note: `${body.code}${body.place ? ` · ${body.place}` : ''}` };
    } catch {
        return { error: 'Server unreachable' };
    }
}

/** @typedef {{ venue: string | null, address: string | null, city: string | null }} PlaceWords */

/** What's at a point (asks the server), or null if it can't say. @param {number} lat @param {number} lon @returns {Promise<PlaceWords | null>} */
export async function placeAt(lat, lon) {
    try {
        const res = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/**
 * The fields a new point fills in: the empty ones, and those that only say what was at the
 * old point (filled in by it). Anything else you wrote stays.
 * @param {PlaceWords} now @param {PlaceWords | null} before @param {PlaceWords} current
 */
export function fillPlace(now, before, current) {
    /** @type {Partial<PlaceWords>} */
    const changes = {};
    for (const key of /** @type {(keyof PlaceWords)[]} */ (['venue', 'address', 'city'])) {
        const mine = current[key]?.trim() || null, stale = mine != null && mine === before?.[key];
        if ((mine == null || stale) && now[key] !== mine && (now[key] || stale)) changes[key] = now[key];
    }
    return changes;
}
