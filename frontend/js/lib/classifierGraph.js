// Classifier model (pure: no three.js, no React). See resources/classifier.md, section 7.
//
//   stars     parents: facet values (from the visible layers, plus every value with an
//             active filter), the date range, the proximity ring, the Hermetic Seal
//   galaxies  Venn regions: pool items grouped by exactly which visible stars they link to
//   region    a sphere at the centre: galaxies whose items pass every filter sit inside
//             it, the rest (and every star) outside
//
// Whether an item passes is decided by filters.js. Every active filter is always a
// visible star, so all items in a galaxy share the same answer.

import { FACETS, facetLabel, facetValues, inDateRange, inRing, isSealed, passes } from '../filters.js';
import { facetColor } from './lens.js';

/**
 * A star's colour is its identity, never its role: facet values use their lens colour
 * (lens.js), whatever the filter. The role (include / exclude / seal) is shown by a
 * magic circle around the star in the role's colour (classifierScene.js).
 */
export const ROLE_COLORS = { include: '#ffffff', exclude: '#e0524a', seal: '#e9c43b' };
/** Identity colours of the stars that aren't facet values. */
const DATE_COLOR = '#c8a46a';
const RING_COLOR = '#5fe0e6';

/**
 * @typedef {{
 *   id: string, kind: 'facet' | 'date' | 'ring' | 'seal', label: string, group: string,
 *   facet?: FacetKey, value?: string,
 *   role: FilterMode | 'off' | 'seal', color: string, count: number, collapsed: boolean,
 * }} Star
 * @typedef {{ id: string, starIds: string[], members: PoolItem[], passes: boolean, hidden: boolean }} Galaxy
 * @typedef {{ stars: Star[], galaxies: Galaxy[], passCount: number, total: number }} ClassifierModel
 * @typedef {Partial<Record<FacetKey, boolean>>} Layers
 */

/**
 * @param {PoolItem[]} items  the whole pool (not just the visible subset)
 * @param {FilterState} filters
 * @param {PoolMode} mode
 * @param {Layers} layers  which facet types are shown as stars
 * @param {(id: string) => boolean} isCollapsed  is this star collapsed (visual only)
 * @param {number} now
 * @returns {ClassifierModel}
 */
export function buildModel(items, filters, mode, layers, isCollapsed, now) {
    /** @type {Star[]} */
    const stars = [];
    /** @type {Map<string, (item: PoolItem) => boolean>} */
    const membership = new Map();

    for (const facet of FACETS) {
        if (!facet.modes.includes(mode)) continue;
        const active = filters.facets[facet.key] ?? {};
        /** @type {Map<string, number>} */
        const counts = new Map();
        for (const item of items) {
            for (const v of facetValues(item, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        // under the lens: every value, or only the most common if the facet has too many
        const ranked = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
        const values = new Set(layers[facet.key] ? ranked.slice(0, facet.starLimit ?? Infinity) : []);
        for (const v of Object.keys(active)) values.add(v); // active filters are always stars
        for (const value of values) {
            const id = `facet:${facet.key}:${value}`;
            const role = /** @type {FilterMode | 'off'} */ (active[value] ?? 'off');
            stars.push({
                id, kind: 'facet', facet: facet.key, value, group: facet.label,
                label: facetLabel(facet, value),
                role, color: facetColor(facet.key, value),
                count: counts.get(value) ?? 0, collapsed: isCollapsed(id),
            });
            membership.set(id, (item) => facetValues(item, facet).includes(value));
        }
    }

    if (filters.date_range) {
        const r = filters.date_range;
        stars.push({
            id: 'date', kind: 'date', group: 'Date', label: r.start === r.end ? r.start : `${r.start} → ${r.end}`,
            role: r.mode, color: DATE_COLOR, count: 0, collapsed: isCollapsed('date'),
        });
        membership.set('date', (item) => inDateRange(item, r));
    }
    if (filters.ring) {
        const ring = filters.ring;
        stars.push({
            id: 'ring', kind: 'ring', group: 'Proximity', label: ring.center.label || 'Ring',
            role: ring.mode, color: RING_COLOR, count: 0, collapsed: isCollapsed('ring'),
        });
        membership.set('ring', (item) => inRing(item, ring));
    }
    if (mode === 'adventures') {
        stars.push({
            id: 'seal', kind: 'seal', group: 'Hermetic Seal', label: filters.seal ? 'Sealed' : 'Seal broken',
            role: filters.seal ? 'seal' : 'off', color: filters.seal ? ROLE_COLORS.seal : '#5c626c',
            count: 0, collapsed: isCollapsed('seal'),
        });
        membership.set('seal', (item) => isSealed(item, now));
    }

    // Venn regions: group items by the exact set of stars they belong to
    /** @type {Map<string, Galaxy>} */
    const galaxies = new Map();
    let passCount = 0;
    for (const item of items) {
        const starIds = stars.filter((s) => membership.get(s.id)?.(item)).map((s) => s.id);
        // its own namespace: a galaxy linked to one star must not share that star's id
        const id = `galaxy:${starIds.length ? starIds.join('|') : '(unlinked)'}`;
        let g = galaxies.get(id);
        if (!g) {
            g = { id, starIds, members: [], passes: passes(item, filters, mode, now), hidden: false };
            galaxies.set(id, g);
        }
        g.members.push(item);
        if (g.passes) passCount++;
    }
    for (const s of stars) {
        if (s.kind !== 'facet') s.count = items.filter((i) => membership.get(s.id)?.(i)).length;
    }
    for (const g of galaxies.values()) g.hidden = g.starIds.some((id) => isCollapsed(id));

    return { stars, galaxies: [...galaxies.values()], passCount, total: items.length };
}

// --- layout ---------------------------------------------------------------

/** djb2 hash -> [0, 1). @param {string} s */
function unit(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 100000) / 100000;
}

/** Deterministic point on a sphere for an id. @param {string} id @param {number} r */
function seedPoint(id, r) {
    const u = unit(id), v = unit(id + '#');
    const theta = u * Math.PI * 2, phi = Math.acos(2 * v - 1);
    return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.6, r * Math.sin(phi) * Math.sin(theta)];
}

/** Visual radius of a galaxy body. @param {number} count */
export function galaxyRadius(count) {
    return 5 + Math.sqrt(count) * 4;
}

/** The region's radius: everything inside passes the filters. */
export const REGION_R = 110;
const STAR_SHELL = { off: 170, include: 145, exclude: 220, seal: 220 };
const OUTER_GAP = 14;    // failing galaxies keep at least this far outside the region
const INNER_GAP = 6;     // passing galaxies keep at least this far inside it
const CORE_ORBIT = 50;   // passing galaxies drift toward this distance from the centre

/**
 * Place stars and galaxies with a small force simulation. Starts from `previous`
 * positions when available, so the scene moves smoothly between updates.
 * @param {ClassifierModel} model
 * @param {Map<string, number[]>} [previous]
 * @param {number} [iterations]
 * @returns {Map<string, number[]>} id -> [x, y, z]
 */
export function layout(model, previous = new Map(), iterations = 260) {
    /** @type {{ id: string, p: number[], v: number[], r: number, type: 'star' | 'galaxy', ref: Star | Galaxy }[]} */
    const nodes = [];
    for (const s of model.stars) {
        nodes.push({ id: s.id, p: [...(previous.get(s.id) ?? seedPoint(s.id, STAR_SHELL[s.role] ?? 125))], v: [0, 0, 0], r: 10, type: 'star', ref: s });
    }
    const starIndex = new Map(nodes.map((n, i) => [n.id, i]));
    for (const g of model.galaxies) {
        if (g.hidden) continue;
        let p = previous.get(g.id);
        if (!p) { // start between its stars, or near the portal / outer shell
            const linked = g.starIds.map((id) => nodes[starIndex.get(id) ?? -1]).filter(Boolean);
            const seed = seedPoint(g.id, g.passes ? 40 : REGION_R + 60);
            p = linked.length
                ? [0, 1, 2].map((k) => linked.reduce((a, n) => a + n.p[k], 0) / linked.length * 0.7 + seed[k] * 0.3)
                : seed;
        }
        nodes.push({ id: g.id, p: [...p], v: [0, 0, 0], r: galaxyRadius(g.members.length), type: 'galaxy', ref: g });
    }

    const add = (/** @type {number[]} */ v, /** @type {number[]} */ d, /** @type {number} */ k) => { v[0] += d[0] * k; v[1] += d[1] * k; v[2] += d[2] * k; };
    const len = (/** @type {number[]} */ d) => Math.hypot(d[0], d[1], d[2]) || 1e-6;

    for (let it = 0; it < iterations; it++) {
        const cool = 1 - it / iterations;
        for (const n of nodes) n.v = [0, 0, 0];

        // repulsion between every pair (keeps bodies apart)
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const d = [a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]];
                const dist = len(d);
                const min = (a.r + b.r) * 1.6 + 12;
                const f = Math.min(6, (min * min) / (dist * dist)) * 2.2;
                add(a.v, d, f / dist); add(b.v, d, -f / dist);
            }
        }

        for (const n of nodes) {
            const dist = len(n.p);
            if (n.type === 'star') {
                // stars settle on a shell whose radius depends on their role
                const target = STAR_SHELL[/** @type {Star} */ (n.ref).role] ?? 125;
                add(n.v, n.p, ((target - dist) / dist) * 0.05);
                n.v[1] -= n.p[1] * 0.02; // flatten toward the disc
            } else {
                const g = /** @type {Galaxy} */ (n.ref);
                for (const sid of g.starIds) { // springs to its stars
                    const s = nodes[starIndex.get(sid) ?? -1];
                    if (!s) continue;
                    const d = [s.p[0] - n.p[0], s.p[1] - n.p[1], s.p[2] - n.p[2]];
                    const dl = len(d);
                    const rest = 30 + n.r;
                    add(n.v, d, ((dl - rest) / dl) * 0.03);
                }
                if (g.passes) {
                    add(n.v, n.p, ((CORE_ORBIT - dist) / dist) * 0.06);  // toward the centre
                    const limit = REGION_R - INNER_GAP - n.r;          // and never out of the region
                    if (dist > limit) add(n.v, n.p, ((limit - dist) / dist) * 0.4);
                } else {
                    const limit = REGION_R + OUTER_GAP + n.r;          // failing: outside the region
                    if (dist < limit) add(n.v, n.p, ((limit - dist) / dist) * 0.4);
                }
                n.v[1] -= n.p[1] * 0.015;
            }
        }

        const step = 0.9 * cool + 0.1;
        for (const n of nodes) {
            const speed = len(n.v);
            const max = 12 * step;
            const k = speed > max ? max / speed : 1;
            n.p[0] += n.v[0] * k * step; n.p[1] += n.v[1] * k * step; n.p[2] += n.v[2] * k * step;
        }
    }

    // the region is a promise: clamp anything the forces left on the wrong side
    for (const n of nodes) {
        if (n.type !== 'galaxy') continue;
        const g = /** @type {Galaxy} */ (n.ref);
        const dist = len(n.p);
        const want = g.passes ? Math.min(dist, Math.max(0, REGION_R - INNER_GAP - n.r)) : Math.max(dist, REGION_R + OUTER_GAP + n.r);
        if (want !== dist) { const k = want / dist; n.p = n.p.map((c) => c * k); }
    }
    return new Map(nodes.map((n) => [n.id, n.p]));
}
