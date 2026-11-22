// The filter engine (pure: no React, no store). See resources/classifier.md, section 6.
//
// Logic: each facet value can be include / exclude / off. Within one facet, includes
// combine with OR and any exclude removes; different facets (and the date range, ring
// and Hermetic Seal) combine with AND. The result is the subset every view shows.
//
// Most facets have one value per item (its city, its source). Object facets (pillar,
// site, contact) have several: an item passes an include if ANY of its linked objects is
// included, and fails if any is excluded. An item with none counts as UNKNOWN.

import { ADVENTURE_TYPES, OBJECT_TYPES, PHASE_STAGES, REVIEW_STAGES, hasWhenWhere } from './lifecycle.js';
import { occursIn, span } from './lib/occurrences.js';

/** @type {FilterState} */
export const DEFAULT_FILTERS = { facets: {}, date_range: null, ring: null, seal: true, units: 'mi', lens: 'stage' };

/** Value used for items that have no value for a facet (e.g. no city). */
export const UNKNOWN = '∅';

/** Object id -> name, for labels of object facet values (kept current by the store). */
const objectNames = new Map();
/** Object id -> its chosen colour (only objects that have one). */
const objectColors = new Map();
/** @param {VObject[]} objects */
export function setObjectNames(objects) {
    objectNames.clear();
    objectColors.clear();
    for (const o of objects) {
        objectNames.set(o.id, o.name);
        if (o.color) objectColors.set(o.id, o.color);
    }
}
/** The colour chosen for an object in the Codex, if any (see objectColor in lib/lens.js). @param {string} id */
export const chosenObjectColor = (id) => objectColors.get(id) ?? null;

/** Facet values for an object type: the ids of the item's linked objects of that type. @param {ObjectType} type */
const objectFacet = (type) => ({
    key: /** @type {FacetKey} */ (type), label: OBJECT_TYPES[type].plural, modes: /** @type {PoolMode[]} */ (['adventures']),
    value: (/** @type {PoolItem} */ i) => (i.kind === 'adventure' ? i.objects.filter((o) => o.type === type).map((o) => o.id) : null),
    display: (/** @type {string} */ v) => objectNames.get(v) ?? 'Deleted object',
    unknown: `No ${OBJECT_TYPES[type].label.toLowerCase()}`,
});

/**
 * Facets: the parent types. `modes` limits a facet to one pool. `value` gives one value
 * or (object facets) a list; `unknown` labels items that have none.
 * @type {{ key: FacetKey, label: string, modes: PoolMode[], value: (item: PoolItem) => string | string[] | null | undefined, display?: (value: string) => string, unknown?: string }[]}
 */
export const FACETS = [
    { key: 'source', label: 'Source', modes: ['adventures', 'discovery'], value: (i) => i.source },
    { key: 'city', label: 'City', modes: ['adventures', 'discovery'], value: (i) => i.city },
    {
        key: 'registration', label: 'Registration', modes: ['adventures', 'discovery'],
        value: (i) => (typeof i.details?.registration === 'string' ? i.details.registration : null),
    },
    {
        key: 'type', label: 'Type', modes: ['adventures'],
        value: (i) => (i.kind === 'adventure' ? i.type : null),
        display: (v) => ADVENTURE_TYPES[/** @type {AdventureType} */ (v)]?.label ?? v,
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
    objectFacet('pillar'),
    objectFacet('site'),
    objectFacet('contact'),
    objectFacet('organization'),
    objectFacet('skill'),
];

/** Phases the Hermetic Seal hides (on top of anything already past). */
export const SEALED_PHASES = new Set(['completed', 'killed', 'decommissioned']);

/** The item's values for a facet (one, or several for object facets); [UNKNOWN] if none.
 *  @param {PoolItem} item @param {(typeof FACETS)[number]} facet @returns {string[]} */
export function facetValues(item, facet) {
    const v = facet.value(item);
    if (Array.isArray(v)) return v.length ? v : [UNKNOWN];
    return v == null || v === '' ? [UNKNOWN] : [String(v)];
}

/** Display label of one facet value. @param {(typeof FACETS)[number]} facet @param {string} value */
export function facetLabel(facet, value) {
    if (value === UNKNOWN) return facet.unknown ?? 'Unknown';
    return facet.display ? facet.display(value) : value;
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

/**
 * True if the item happens within the range's days (local time): any occurrence of a
 * weekly item counts, and an all-day item covers its whole days (lib/occurrences.js).
 * @param {PoolItem} item @param {DateRange} range
 */
export function inDateRange(item, range) {
    const from = parseDay(range.start);
    const to = parseDay(range.end);
    to.setDate(to.getDate() + 1); // end day is inclusive
    return occursIn(item, from, to);
}

/** True if the item lies within the ring. @param {PoolItem} item @param {Ring} ring */
export function inRing(item, ring) {
    if (item.lat == null || item.lon == null) return false;
    return haversineKm(ring.center.lat, ring.center.lon, item.lat, item.lon) <= ring.radius_km;
}

/** True if the Hermetic Seal hides this item: past, or an artifact, vestige or relic. @param {PoolItem} item @param {number} now */
export function isSealed(item, now) {
    if (item.kind === 'adventure' && SEALED_PHASES.has(item.phase)) return true;
    const s = span(item); // a weekly item without an end date is never past
    return s != null && s[1] < now;
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
        const values = facetValues(item, facet);
        if (values.some((v) => settings[v] === 'exclude')) return false;
        const includes = Object.values(settings).some((m) => m === 'include');
        if (includes && !values.some((v) => settings[v] === 'include')) return false;
    }

    // items and songs have no when/where: date and proximity filters don't apply to them
    if (!hasWhenWhere(item)) return true;
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
            for (const v of facetValues(item, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
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
    let n = draft.seal === applied.seal ? 0 : 1; // the lens and ranges apply at once: never pending
    const keys = new Set([...Object.keys(draft.facets), ...Object.keys(applied.facets)]);
    for (const k of keys) {
        const a = draft.facets[/** @type {FacetKey} */ (k)] ?? {}, b = applied.facets[/** @type {FacetKey} */ (k)] ?? {};
        for (const v of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[v] !== b[v]) n++;
    }
    return n;
}
