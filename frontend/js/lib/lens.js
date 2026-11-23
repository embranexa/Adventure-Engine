// The lens (pure): which facet colors the matter, and the color of each value.
//
// A filter picks which rows are lit; the lens picks how lit rows are split up. "stage"
// (shown as Matter) is the default: each row in its stage's color. Any other lens is a
// facet from filters.js, so a row's lens values are its facet values. "none" turns the
// lens off: no lens stars in the Nexus, and colours fall back to matter (as under "stage").
// See resources/signal chain digital twin/BUILD_PLAN.md, section 1 ("Light").

import { FACETS, UNKNOWN, chosenEntityColor, facetLabel, facetValues } from '../filters.js';
import { ADVENTURE_FLAGS, ADVENTURE_TYPES, PHASE_STAGES, REVIEW_STAGES } from '../lifecycle.js';

/** Facets that can't be a lens: the stage lens already covers them. */
const NOT_LENSES = new Set(['phase', 'review']);

/** The lenses in their groups, in order (None stands alone, first). A facet missing here
 *  is appended ungrouped, so a new facet still becomes a lens. */
const LENS_GROUPS = /** @type {[string, LensKey[]][]} */ ([
    ['Basic', ['stage', 'source', 'type']],
    ['Descriptor', ['tag', 'flag']],
    ['Place', ['city', 'region', 'metro']],
    ['Entity', ['deity', 'site', 'contact', 'organization', 'skill']],
]);

/** @param {LensKey} key */
const lensLabelOf = (key) => (key === 'stage' ? 'Matter' : FACETS.find((f) => f.key === key)?.label ?? key);
const FACET_LENSES = FACETS.filter((f) => !NOT_LENSES.has(f.key)).map((f) => /** @type {LensKey} */ (f.key));

/** Lens choices: None, then each group's lenses. @type {{ key: LensKey, label: string, group?: string }[]} */
export const LENSES = [
    { key: 'none', label: 'None' },
    ...LENS_GROUPS.flatMap(([group, keys]) => keys
        .filter((k) => k === 'stage' || FACET_LENSES.includes(k))
        .map((key) => ({ key, label: lensLabelOf(key), group }))),
    ...FACET_LENSES.filter((k) => !LENS_GROUPS.some(([, keys]) => keys.includes(k))).map((key) => ({ key, label: lensLabelOf(key) })),
];

/** Fixed colors where a value has an identity of its own. */
const SOURCE_COLORS = { luma: '#3ccf8e', '19hz': '#4f8cff', 'ig-collection': '#e1306c', 'ig-profiles': '#f77737' };
const TYPE_COLORS = { event: '#4fb3ff', item: '#e0a43a', performance: '#c86bf0' };
/** Everything else: a value keeps the same color across reloads (picked by its text). */
export const PALETTE = ['#4fb3ff', '#3ccf8e', '#f2b134', '#f0643c', '#c86bf0', '#2fd2c9', '#ff7aa8', '#a3d14b', '#8f8cff', '#ffb27a'];

/** A source's own colour (its Source lens colour, its harvester's accents). @param {string} name */
export function sourceColor(name) {
    return SOURCE_COLORS[/** @type {keyof typeof SOURCE_COLORS} */ (name)] ?? PALETTE[hash(name) % PALETTE.length];
}
/** Entity facets: their values are entity ids, coloured by the entity. */
const ENTITY_LENSES = new Set(['deity', 'site', 'contact', 'organization', 'skill']);
const UNKNOWN_COLOR = '#5b616b';
/** Value for rows the lens's facet doesn't apply to (raw events under an adventure-only facet). */
export const NOT_APPLICABLE = 'n/a';
const NOT_APPLICABLE_COLOR = '#3c4048';

/**
 * Lenses in runs: consecutive lenses of one group together (City, Region, Metro under Place),
 * every other lens on its own.
 * @param {{ key: LensKey, label: string, group?: string }[]} lenses
 */
export function lensRuns(lenses) {
    /** @type {{ group?: string, items: typeof lenses }[]} */
    const runs = [];
    for (const l of lenses) {
        const last = runs.at(-1);
        if (l.group && last?.group === l.group) last.items.push(l);
        else runs.push({ group: l.group, items: [l] });
    }
    return runs;
}

/** True if the lens colours by matter: Matter itself, or no lens (the fallback). @param {LensKey} lens */
export const byMatter = (lens) => lens === 'stage' || lens === 'none';

/** @param {string} text */
function hash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * The stage key of a row: its phase if it's an adventure, else its review state.
 * @param {PoolItem} item
 */
function stageKey(item) {
    return item.kind === 'adventure' ? item.phase : item.review;
}

/**
 * A row's values under the lens (several for entity facets).
 * @param {PoolItem} item @param {LensKey} lens @returns {string[]}
 */
export function lensValues(item, lens) {
    if (byMatter(lens)) return [stageKey(item) ?? UNKNOWN];
    const facet = FACETS.find((f) => f.key === lens);
    if (!facet) return [UNKNOWN];
    if (!facet.modes.includes(item.kind === 'adventure' ? 'adventures' : 'discovery')) return [NOT_APPLICABLE];
    return facetValues(item, facet);
}

/**
 * An entity's colour: the one chosen in the Codex, else a stable default from its id.
 * @param {string} id
 */
export function entityColor(id) {
    return chosenEntityColor(id) ?? PALETTE[hash(id) % PALETTE.length];
}

/** Display color of one lens value. @param {LensKey} lens @param {string} value */
export function lensColor(lens, value) {
    if (value === UNKNOWN) return UNKNOWN_COLOR;
    if (value === NOT_APPLICABLE) return NOT_APPLICABLE_COLOR;
    if (byMatter(lens)) {
        return PHASE_STAGES[/** @type {Phase} */ (value)]?.color ?? REVIEW_STAGES[/** @type {ReviewState} */ (value)]?.color ?? UNKNOWN_COLOR;
    }
    if (lens === 'source') return sourceColor(value);
    if (ENTITY_LENSES.has(lens)) return entityColor(value);
    if (lens === 'flag') return ADVENTURE_FLAGS[/** @type {AdventureFlag} */ (value)]?.color ?? PALETTE[hash(value) % PALETTE.length];
    if (lens === 'type') return TYPE_COLORS[/** @type {keyof typeof TYPE_COLORS} */ (value)] ?? PALETTE[hash(value) % PALETTE.length];
    return PALETTE[hash(value) % PALETTE.length];
}

/**
 * A row's colour under the lens: its first lens value's colour (its matter colour under
 * Matter). Used by views that draw one mark per row (Calendar blocks, Atlas pins).
 * @param {PoolItem} item @param {LensKey} lens
 */
export function itemLensColor(item, lens) {
    return byMatter(lens) ? item.color : lensColor(lens, lensValues(item, lens)[0]);
}

/**
 * A facet value's colour, for any facet (the stage facets `phase` / `review` use the
 * stage colours). Used by Nexus stars.
 * @param {FacetKey} facet @param {string} value
 */
export function facetColor(facet, value) {
    return lensColor(NOT_LENSES.has(facet) ? 'stage' : /** @type {LensKey} */ (facet), value);
}

/** Display label of one lens value. @param {LensKey} lens @param {string} value */
export function lensLabel(lens, value) {
    if (value === NOT_APPLICABLE) return 'Raw event';
    if (byMatter(lens)) {
        return PHASE_STAGES[/** @type {Phase} */ (value)]?.matter ?? REVIEW_STAGES[/** @type {ReviewState} */ (value)]?.matter ?? value;
    }
    if (lens === 'type' && value !== UNKNOWN) return ADVENTURE_TYPES[/** @type {AdventureType} */ (value)]?.label ?? value;
    const facet = FACETS.find((f) => f.key === lens);
    return facet ? facetLabel(facet, value) : value;
}
