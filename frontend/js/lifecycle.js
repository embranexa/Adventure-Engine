// The refinery: display names and colors for raw event review states and adventure
// phases. The database stores the plain values (keys below); see resources/classifier.md.
//
// Matter colors run cold -> warm along the lifecycle (slate, blue, cyan, amber, orange,
// red in the Arena, violet once it's an artifact); side paths are desaturated.

/**
 * @typedef {{ module: string, matter: string, color: string, deep: string, light: string, hint: string }} Stage
 */

/** Raw event review states (Discovery mode). @type {Record<ReviewState, Stage>} */
export const REVIEW_STAGES = {
    new:     { module: 'Sensorium', matter: 'omen',  color: '#4b5a86', deep: '#1f2640', light: '#b6c1e2', hint: 'Not reviewed yet' },
    passed:  { module: 'Hopper',    matter: 'ore',   color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Became an adventure' },
    ignored: { module: 'Limbo',     matter: 'shade', color: '#5d6070', deep: '#25262d', light: '#8a8d9a', hint: 'Rejected; can be revived' },
};

/** Adventure phases, in lifecycle order. @type {Record<Phase, Stage>} */
export const PHASE_STAGES = {
    queued:         { module: 'Hopper',     matter: 'ore',        color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Waiting to be assayed' },
    classifying:    { module: 'Nexus',      matter: 'essence',    color: '#1fc2c9', deep: '#0c5c60', light: '#a9f3f6', hint: 'Why do I want this?' },
    decomposing:    { module: 'Alembic',    matter: 'distillate', color: '#e9c43b', deep: '#6e5a12', light: '#f8e7a6', hint: 'How do I do this?' },
    constructing:   { module: 'Crucible',   matter: 'alloy',      color: '#f28a2e', deep: '#7a3a0c', light: '#ffd3a3', hint: 'What can I do right now?' },
    consuming:      { module: 'Arena',      matter: 'animus',     color: '#ef3e4a', deep: '#7a1a20', light: '#ffb0b6', hint: 'Doing it' },
    completed:      { module: 'Treasury',   matter: 'artifact',   color: '#a855f7', deep: '#4c1d80', light: '#dcb8ff', hint: 'Done' },
    killed:         { module: 'Necropolis', matter: 'vestige',    color: '#6e4a4a', deep: '#2e1e1e', light: '#9a7a7a', hint: 'Killed or missed; can be revived' },
    decommissioned: { module: 'Archive',    matter: 'relic',      color: '#7a6a55', deep: '#2f281f', light: '#a89a85', hint: 'Old and out of sight' },
};

/** Matter name -> color, for titles that name a matter (e.g. "ore ⟶ essence"). */
export const MATTER_COLORS = Object.fromEntries(
    [...Object.values(REVIEW_STAGES), ...Object.values(PHASE_STAGES)].map((s) => [s.matter, s.light]),
);

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
