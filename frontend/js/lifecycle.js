// The refinery: display names for raw event review states and adventure phases.
// The database stores the plain values (keys below); see resources/classifier.md.

/**
 * @typedef {{ module: string, matter: string, color: string, hint: string }} Stage
 */

/** Raw event review states (Discovery mode). @type {Record<ReviewState, Stage>} */
export const REVIEW_STAGES = {
    new:     { module: 'Sensorium', matter: 'omen',  color: '#c084fc', hint: 'Not reviewed yet' },
    passed:  { module: 'Hopper',    matter: 'ore',   color: '#94a3b8', hint: 'Became an adventure' },
    ignored: { module: 'Limbo',     matter: 'shade', color: '#64748b', hint: 'Rejected; can be revived' },
};

/** Adventure phases, in lifecycle order. @type {Record<Phase, Stage>} */
export const PHASE_STAGES = {
    queued:         { module: 'Hopper',     matter: 'ore',        color: '#94a3b8', hint: 'Waiting to be assayed' },
    classifying:    { module: 'Assay',      matter: 'essence',    color: '#38bdf8', hint: 'Why do I want this?' },
    decomposing:    { module: 'Alembic',    matter: 'distillate', color: '#a78bfa', hint: 'How do I do this?' },
    constructing:   { module: 'Crucible',   matter: 'alloy',      color: '#f59e0b', hint: 'What can I do right now?' },
    consuming:      { module: 'Arena',      matter: 'animus',     color: '#ff2a85', hint: 'Doing it' },
    completed:      { module: 'Treasury',   matter: 'artifact',   color: '#fcee0a', hint: 'Done' },
    killed:         { module: 'Necropolis', matter: 'vestige',    color: '#ef4444', hint: 'Killed or missed; can be revived' },
    decommissioned: { module: 'Archive',    matter: 'relic',      color: '#78716c', hint: 'Old and out of sight' },
};

/** The main route, set by hand from the node card. @type {Phase[]} */
export const MAIN_ROUTE = ['queued', 'classifying', 'decomposing', 'constructing', 'consuming', 'completed'];

/**
 * Stage of a pool item: its phase if it's an adventure, else its review state.
 * @param {PoolItem} item
 * @returns {Stage | null}
 */
export function stageOf(item) {
    if (item.kind === 'adventure') return item.phase ? PHASE_STAGES[item.phase] : null;
    return item.review ? REVIEW_STAGES[item.review] : null;
}
