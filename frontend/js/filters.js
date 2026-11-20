// The filter engine (pure: no React, no store). See resources/classifier.md, section 6.
//
// Logic: each facet value can be include / exclude / off. Within one facet, includes
// combine with OR and any exclude removes; different facets (and the date range, ring
// and Hermetic Seal) combine with AND. The result is the subset every view shows.

import { PHASE_STAGES, REVIEW_STAGES } from './lifecycle.js';

/** @type {FilterState} */
export const DEFAULT_FILTERS = { facets: {}, date_range: null, ring: null, seal: true, units: 'mi' };

/** Value used for items that have no value for a facet (e.g. no city). */
export const UNKNOWN = '∅';

/**
 * Facets: the derived parent types. `modes` limits a facet to one pool.
 * @type {{ key: FacetKey, label: string, modes: PoolMode[], value: (item: PoolItem) => string | null | undefined, display?: (value: string) => string }[]}
 */
export const FACETS = [
    { key: 'source', label: 'Source', modes: ['adventures', 'discovery'], value: (i) => i.source },
    { key: 'city', label: 'City', modes: ['adventures', 'discovery'], value: (i) => i.city },
    {
        key: 'registration', label: 'Registration', modes: ['adventures', 'discovery'],
        value: (i) => (typeof i.details?.registration === 'string' ? i.details.registration : null),
    },
    {
        key: 'phase', label: 'Matter', modes: ['adventures'],
        value: (i) => (i.kind === 'adventure' ? i.phase : null),
        display: (v) => PHASE_STAGES[/** @type {Phase} */ (v)]?.matter ?? v,
    },
    {
        key: 'review', label: 'Review', modes: ['discovery'],
        value: (i) => (i.kind === 'omen' ? i.review : null),
        display: (v) => REVIEW_STAGES[/** @type {ReviewState} */ (v)]?.matter ?? v,
    },
];

/** Phases the Hermetic Seal hides (on top of anything already past). */
export const SEALED_PHASES = new Set(['completed', 'killed', 'decommissioned']);

/** @param {PoolItem} item @param {(typeof FACETS)[number]} facet */
export function facetValue(item, facet) {
    const v = facet.value(item);
    return v == null || v === '' ? UNKNOWN : String(v);
}

/** off -> include -> exclude -> off. @param {FilterMode | undefined} mode @returns {FilterMode | null} */
export function nextMode(mode) {
    if (!mode) return 'include';
    return mode === 'include' ? 'exclude' : null;
}

// --- geometry & time ---

const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_MI = 1.609344;

/** Great-circle distance in km. @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2 */
export function haversineKm(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "2026-11-20" -> local midnight Date. @param {string} day */
export function parseDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Date -> "2026-11-20" (local calendar day). @param {Date} date */
export function dayKey(date) {
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** @param {PoolItem} item @returns {[number, number] | null} start/end in ms */
function timeSpan(item) {
    if (!item.start) return null;
    const start = new Date(item.start).getTime();
    if (Number.isNaN(start)) return null;
    const end = item.end ? new Date(item.end).getTime() : NaN;
    return [start, Number.isNaN(end) || end < start ? start : end];
}

/** True if the item overlaps the range's days (local time). @param {PoolItem} item @param {DateRange} range */
export function inDateRange(item, range) {
    const span = timeSpan(item);
    if (!span) return false;
    const from = parseDay(range.start).getTime();
    const to = parseDay(range.end);
    to.setDate(to.getDate() + 1); // end day is inclusive
    return span[0] < to.getTime() && span[1] >= from;
}

/** True if the item lies within the ring. @param {PoolItem} item @param {Ring} ring */
export function inRing(item, ring) {
    if (item.lat == null || item.lon == null) return false;
    return haversineKm(ring.center.lat, ring.center.lon, item.lat, item.lon) <= ring.radius_km;
}

/** True if the Hermetic Seal hides this item: past, or an artifact, vestige or relic. @param {PoolItem} item @param {number} now */
export function isSealed(item, now) {
    if (item.kind === 'adventure' && SEALED_PHASES.has(item.phase)) return true;
    const span = timeSpan(item);
    return span != null && span[1] < now;
}

// --- applying ---

/**
 * Does one item pass every active filter?
 * @param {PoolItem} item @param {FilterState} filters @param {PoolMode} mode @param {number} now
 */
export function passes(item, filters, mode, now) {
    if (mode === 'adventures' && filters.seal && isSealed(item, now)) return false;

    for (const facet of FACETS) {
        if (!facet.modes.includes(mode)) continue;
        const settings = filters.facets[facet.key];
        if (!settings) continue;
        const value = facetValue(item, facet);
        const setting = settings[value];
        if (setting === 'exclude') return false;
        const includes = Object.values(settings).some((m) => m === 'include');
        if (includes && setting !== 'include') return false;
    }

    if (filters.date_range) {
        const inside = inDateRange(item, filters.date_range);
        if (inside !== (filters.date_range.mode === 'include')) return false;
    }
    if (filters.ring) {
        const inside = inRing(item, filters.ring);
        if (inside !== (filters.ring.mode === 'include')) return false;
    }
    return true;
}

/**
 * The visible subset. Returns `previous` unchanged when the result is the same list,
 * so components reading it don't re-render.
 * @param {PoolItem[]} items @param {FilterState} filters @param {PoolMode} mode @param {number} now
 * @param {PoolItem[]} [previous]
 */
export function applyFilters(items, filters, mode, now, previous) {
    const next = items.filter((item) => passes(item, filters, mode, now));
    if (previous && previous.length === next.length && previous.every((item, i) => item === next[i])) return previous;
    return next;
}

/**
 * Count of pool items per value of each facet that applies to the mode.
 * @param {PoolItem[]} items @param {PoolMode} mode
 * @returns {{ facet: (typeof FACETS)[number], values: [string, number][] }[]}
 */
export function facetCounts(items, mode) {
    return FACETS.filter((f) => f.modes.includes(mode)).map((facet) => {
        /** @type {Map<string, number>} */
        const counts = new Map();
        for (const item of items) {
            const v = facetValue(item, facet);
            counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        const values = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        return { facet, values };
    });
}

/** True if any filter (besides the Seal) is active. @param {FilterState} filters */
export function hasActiveFilters(filters) {
    return Boolean(filters.date_range || filters.ring ||
        Object.values(filters.facets).some((s) => s && Object.keys(s).length));
}

/** @param {number} km @param {'mi' | 'km'} units */
export function formatDistance(km, units) {
    const v = units === 'mi' ? km / KM_PER_MI : km;
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units}`;
}

/**
 * How many facet / Seal settings differ between the draft and the applied filters
 * (ranges apply immediately, so they never differ).
 * @param {FilterState} draft @param {FilterState} applied
 */
export function pendingChanges(draft, applied) {
    let n = draft.seal === applied.seal ? 0 : 1;
    const keys = new Set([...Object.keys(draft.facets), ...Object.keys(applied.facets)]);
    for (const k of keys) {
        const a = draft.facets[/** @type {FacetKey} */ (k)] ?? {}, b = applied.facets[/** @type {FacetKey} */ (k)] ?? {};
        for (const v of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[v] !== b[v]) n++;
    }
    return n;
}
