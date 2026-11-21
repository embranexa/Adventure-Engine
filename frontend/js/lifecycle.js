// The refinery: display names and colors for raw event review states and adventure
// phases. The database stores the plain values (keys below); see resources/classifier.md.
//
// Matter colors run cold -> warm along the lifecycle (slate, blue, cyan, amber, orange,
// red in the Arena, violet once it's an artifact); side paths are desaturated.

/**
 * @typedef {{ module: string, matter: string, color: string, deep: string, light: string, hint: string }} Stage
 */

/**
 * Raw event review states. Harvested events wait in their source's Harvester; fed ones
 * spin in the Centrifuge, which is what Discovery mode shows. @type {Record<ReviewState, Stage>}
 */
export const REVIEW_STAGES = {
    harvested: { module: 'Harvester',  matter: 'flux',          color: '#3a4a5e', deep: '#171e27', light: '#9fb0c4', hint: 'Harvested; feed it to the Centrifuge to review' },
    new:       { module: 'Centrifuge', matter: 'prima materia', color: '#4b5a86', deep: '#1f2640', light: '#b6c1e2', hint: 'In the Centrifuge: not reviewed yet' },
    passed:    { module: 'Hopper',     matter: 'ore',           color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Became an adventure' },
    ignored:   { module: 'Sump',       matter: 'shade',         color: '#5d6070', deep: '#25262d', light: '#8a8d9a', hint: 'Rejected; can be revived' },
};

/** Adventure phases, in lifecycle order. @type {Record<Phase, Stage>} */
export const PHASE_STAGES = {
    queued:         { module: 'Hopper',     matter: 'ore',        color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Waiting to be assayed' },
    classifying:    { module: 'Refinery',    matter: 'essence',    color: '#1fc2c9', deep: '#0c5c60', light: '#a9f3f6', hint: 'Why do I want this?' },
    decomposing:    { module: 'Alembic',    matter: 'distillate', color: '#e9c43b', deep: '#6e5a12', light: '#f8e7a6', hint: 'How do I do this?' },
    constructing:   { module: 'Crucible',   matter: 'alloy',      color: '#f28a2e', deep: '#7a3a0c', light: '#ffd3a3', hint: 'What can I do right now?' },
    consuming:      { module: 'Arena',      matter: 'animus',     color: '#ef3e4a', deep: '#7a1a20', light: '#ffb0b6', hint: 'Doing it' },
    completed:      { module: 'Treasury',   matter: 'artifact',   color: '#a855f7', deep: '#4c1d80', light: '#dcb8ff', hint: 'Done' },
    killed:         { module: 'Necropolis', matter: 'vestige',    color: '#6e4a4a', deep: '#2e1e1e', light: '#9a7a7a', hint: 'Killed or missed; can be revived' },
    decommissioned: { module: 'Archive',    matter: 'relic',      color: '#7a6a55', deep: '#2f281f', light: '#a89a85', hint: 'Old and out of sight' },
};

/**
 * Adventure types. Only events have a when/where: items and songs are exempt from the
 * calendar, map, date/proximity filters and the missed-adventure sweeper (the server
 * sends their when/where as null). Same list in backend/db/models.py.
 * @type {Record<AdventureType, { label: string, glyph: string, hint: string }>}
 */
export const ADVENTURE_TYPES = {
    event: { label: 'Event', glyph: '◷', hint: 'Happens at a time and place' },
    item: { label: 'Item', glyph: '◆', hint: 'A thing to make or get: no when/where' },
    song: { label: 'Song', glyph: '♪', hint: 'A song to write or learn: no when/where' },
};

/**
 * Virtual object types (the Codex). Only sites have a location. Same list in
 * backend/db/models.py.
 * @type {Record<ObjectType, { label: string, plural: string, glyph: string, hint: string }>}
 */
export const OBJECT_TYPES = {
    pillar: { label: 'Pillar', plural: 'Pillars', glyph: '⟁', hint: 'A theme or project adventures serve' },
    site: { label: 'Site', plural: 'Sites', glyph: '⌖', hint: 'A place: shows on the Atlas, anchors the proximity ring' },
    contact: { label: 'Contact', plural: 'Contacts', glyph: '☉', hint: 'A person' },
};

/** True if this item can have a when/where (a raw event, or an event-type adventure). @param {PoolItem} item */
export function hasWhenWhere(item) {
    return item.kind !== 'adventure' || item.type === 'event';
}

/** Matter name -> color, for titles that name a matter (e.g. "ore ⟶ essence"). */
export const MATTER_COLORS = Object.fromEntries(
    [...Object.values(REVIEW_STAGES), ...Object.values(PHASE_STAGES)].map((s) => [s.matter, s.light]),
);

/**
 * Signal chain node of each phase (the twin; same map as PHASE_NODES in
 * backend/db/models.py). Other nodes: "harvester:<source>", centrifuge, sump, forge, codex.
 * @type {Record<Phase, string>}
 */
export const PHASE_NODES = {
    queued: 'hopper', classifying: 'refinery', decomposing: 'alembic', constructing: 'crucible',
    consuming: 'arena', completed: 'treasury', killed: 'necropolis', decommissioned: 'archive',
};

/** The main route, set by hand from the node card. @type {Phase[]} */
export const MAIN_ROUTE = ['queued', 'classifying', 'decomposing', 'constructing', 'consuming', 'completed'];

/**
 * Stage of a pool record: its phase if it's an adventure, else its review state.
 * @param {PoolRecord} item
 * @returns {Stage | null}
 */
export function stageOf(item) {
    if (item.kind === 'adventure') return item.phase ? PHASE_STAGES[item.phase] : null;
    return item.review ? REVIEW_STAGES[item.review] : null;
}

/** The display color of a pool record: its stage's color. @param {PoolRecord} item */
export function stageColor(item) {
    return stageOf(item)?.color ?? '#7d838d';
}
