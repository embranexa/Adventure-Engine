// Signal Chain topology (pure): the twin's nodes, its pipes, and how a logged transition
// travels along them. See resources/signal chain digital twin/BUILD_PLAN.md.
//
// Node ids match the transitions log (backend/db/models.py): PHASE_NODES for adventures,
// "harvester:<source>", centrifuge, sump, forge, codex, plus "outside" (where harvested
// events come from; not drawn, and no pipe leads from it). The manifold is a pipe junction
// where the harvesters' pipes merge into one trunk to the centrifuge; it holds nothing and
// never appears in the log. Phase 7 layout: resources/signal chain digital twin/PHASE7_PLAN.md.

import { MAIN_ROUTE, PHASE_NODES, PHASE_STAGES } from '../lifecycle.js';

/** @typedef {'net' | 'core' | 'sanctum' | 'viewer'} TwinZone */
/** @typedef {'harvester' | 'processor' | 'vessel' | 'dynamo' | 'cabinet' | 'viewer'} TwinKind */
/**
 * @typedef {object} TwinNode
 * @property {string} id
 * @property {string} label
 * @property {TwinZone} zone
 * @property {TwinKind} kind
 * @property {'events' | 'adventures' | 'entities' | null} holds  which rows its level counts
 * @property {string | null} matter      what it holds, by name (lifecycle.js matter)
 * @property {boolean} locked            shown, but does nothing yet
 * @property {TwinAction | null} action  what clicking the machine does
 */
/**
 * What clicking a machine does: open a panel, maybe after switching mode or opening the
 * create dialog, or selecting the first prima materia. `label` (the panel's name) is filled in by the panel.
 * @typedef {{ panel: PanelId, mode?: PoolMode, shades?: boolean, create?: boolean, firstPrima?: boolean, label?: string }} TwinAction
 */
/**
 * A pipe. `pipe` carries adventures and events. `conveyor` (entities) and `market` (costs and
 * rewards) are drawn by pipes.js but unused: the Sanctum has no pipes yet (its topology is
 * still open, see resources/core/ARCHITECTURE.md). Only plain pipes route moves between stages.
 * @typedef {{ id: string, a: string, b: string, kind: 'pipe' | 'conveyor' | 'market' }} TwinPipe
 */

export const OUTSIDE = 'outside';
export const CENTRIFUGE = 'centrifuge';
export const SUMP = 'sump';
export const FORGE = 'forge';
export const CODEX = 'codex';
export const MANIFOLD = 'manifold';
export const COHORT = 'cohort';
/** In the Core, before the Refinery; no pipes yet. */
export const COMPLEX = 'complex';
export const INVENTORY = 'inventory';
export const AGORA = 'agora';
export const PANTHEON = 'pantheon';
export const MASTERY = 'mastery';
/** The Sanctum: machines for what isn't primary matter, left to right. They have no pipes yet. */
export const SANCTUM = [CODEX, COHORT, INVENTORY, AGORA, PANTHEON, MASTERY];
/** Fills in what harvested events lack (cover, exact place, end time): not built yet. */
export const ENRICHER = 'enricher';
/** The autonomous filter: a tunable chain of rules between the harvesters and the Centrifuge: not built yet. */
export const SIEVE = 'sieve';
export const CRUCIBLE = PHASE_NODES.constructing;
export const ARENA = PHASE_NODES.consuming;
export const TREASURY = PHASE_NODES.completed;
export const NECROPOLIS = PHASE_NODES.killed;
export const REFINERY = PHASE_NODES.classifying;

/** Harvesters drawn even before their crawler exists (locked until then). */
// ig-collection: events you send in (Telegram); ig-profiles: watched Instagram accounts (resources/net/BUILD_PLAN.md)
export const KNOWN_HARVESTERS = ['luma', '19hz', 'ig-collection', 'ig-profiles'];

/** @param {string} source */
export const harvesterId = (source) => `harvester:${source}`;

/** hopper -> refinery -> alembic -> crucible -> arena -> treasury -> archive */
export const MAIN_CHAIN = [...MAIN_ROUTE.map((p) => PHASE_NODES[p]), PHASE_NODES.decommissioned];

/** @param {Partial<TwinNode> & Pick<TwinNode, 'id' | 'label' | 'zone' | 'kind'>} n @returns {TwinNode} */
const node = (n) => ({ holds: null, matter: null, locked: false, action: null, ...n });

/**
 * Every node, harvesters first. A harvester is unlocked when its source exists on the
 * server (a crawler is registered for it); unknown sources get a harvester too.
 * @param {string[]} sourceNames
 * @returns {TwinNode[]}
 */
export function twinNodes(sourceNames) {
    const live = new Set(sourceNames);
    const harvesters = [...new Set([...KNOWN_HARVESTERS, ...sourceNames])].map((name) => node({
        id: harvesterId(name), label: name, zone: 'net', kind: 'harvester',
        holds: 'events', matter: 'flux', locked: !live.has(name),
    }));
    const core = (/** @type {Phase} */ phase, /** @type {TwinKind} */ kind, /** @type {string} */ label,
        /** @type {TwinAction | null} */ action = null) =>
        node({ id: PHASE_NODES[phase], label, zone: 'core', kind, holds: 'adventures', matter: PHASE_STAGES[phase].matter, action });
    return [
        ...harvesters,
        node({ id: CENTRIFUGE, label: 'Centrifuge', zone: 'net', kind: 'processor', holds: 'events', matter: 'prima materia',
            action: { panel: 'classifier', mode: 'discovery', firstPrima: true } }),
        node({ id: SUMP, label: 'Sump', zone: 'net', kind: 'vessel', holds: 'events', matter: 'dross',
            action: { panel: 'classifier', mode: 'discovery', shades: true } }),
        node({ id: FORGE, label: 'Forge', zone: 'net', kind: 'dynamo', action: { panel: 'node', create: true } }),
        node({ id: ENRICHER, label: 'Enricher', zone: 'net', kind: 'dynamo', locked: true }),
        node({ id: SIEVE, label: 'Sieve', zone: 'net', kind: 'processor', locked: true }),
        core('queued', 'vessel', 'Hopper'),
        core('classifying', 'processor', 'Refinery', { panel: 'node', mode: 'adventures' }),
        core('decomposing', 'processor', 'Alembic', { panel: 'alembic', mode: 'adventures' }),
        core('constructing', 'processor', 'Crucible', { panel: 'quests', mode: 'adventures' }),
        core('consuming', 'processor', 'Arena', { panel: 'arena', mode: 'adventures' }),
        node({ id: COMPLEX, label: 'Complex', zone: 'core', kind: 'cabinet', action: { panel: 'complex', mode: 'adventures' } }),
        core('completed', 'vessel', 'Treasury', { panel: 'treasury' }),
        core('decommissioned', 'vessel', 'Archive'),
        core('killed', 'vessel', 'Necropolis', { panel: 'necropolis' }),
        node({ id: CODEX, label: 'Codex', zone: 'sanctum', kind: 'cabinet', holds: 'entities', action: { panel: 'codex' } }),
        node({ id: COHORT, label: 'Cohort', zone: 'sanctum', kind: 'cabinet', action: { panel: 'cohort' } }),
        node({ id: INVENTORY, label: 'Inventory', zone: 'sanctum', kind: 'cabinet', action: { panel: 'inventory' } }),
        node({ id: AGORA, label: 'Agora', zone: 'sanctum', kind: 'cabinet', action: { panel: 'agora' } }),
        node({ id: PANTHEON, label: 'Pantheon', zone: 'sanctum', kind: 'cabinet', locked: true }),
        node({ id: MASTERY, label: 'Mastery', zone: 'sanctum', kind: 'cabinet', locked: true }),
        node({ id: 'nexus', label: 'Nexus', zone: 'viewer', kind: 'viewer', action: { panel: 'classifier', mode: 'adventures' } }),
        node({ id: 'atlas', label: 'Atlas', zone: 'viewer', kind: 'viewer', action: { panel: 'map' } }),
        node({ id: 'calendar', label: 'Calendar', zone: 'viewer', kind: 'viewer', action: { panel: 'calendar' } }),
        node({ id: 'ledger', label: 'Ledger', zone: 'viewer', kind: 'viewer', action: { panel: 'ledger' } }),
    ];
}

/** @param {string} a @param {string} b @param {TwinPipe['kind']} [kind] @returns {TwinPipe} */
const pipe = (a, b, kind = 'pipe') => ({ id: `${a}~${b}`, a, b, kind });

/**
 * Every pipe. Pipes are two-way (siphon runs back up a harvester's pipe, revive back
 * through the centrifuge); `a` -> `b` is the usual direction. Harvesters merge at the
 * manifold; only the crucible has a pipe to the necropolis (kills from other stages run
 * along the chain to it); the sump reaches the hopper through the centrifuge.
 * @param {string[]} sourceNames
 * @returns {TwinPipe[]}
 */
export function twinPipes(sourceNames) {
    const harvesters = [...new Set([...KNOWN_HARVESTERS, ...sourceNames])].map(harvesterId);
    return [
        ...harvesters.map((h) => pipe(h, MANIFOLD)),
        pipe(MANIFOLD, CENTRIFUGE),
        pipe(CENTRIFUGE, SUMP),
        pipe(CENTRIFUGE, MAIN_CHAIN[0]),
        pipe(FORGE, MAIN_CHAIN[0]),
        ...MAIN_CHAIN.slice(1).map((b, i) => pipe(MAIN_CHAIN[i], b)),
        pipe(CRUCIBLE, NECROPOLIS),
    ];
}

/**
 * The pipe steps a move from `from` to `to` travels: the pipe joining them directly, else
 * the shortest way along plain pipes (a phase set by hand can skip stages; a kill runs to
 * the crucible and on; a revive from the sump runs through the centrifuge). Conveyors and
 * market pipes only carry moves between their own two ends. Moves from or to the outside
 * (harvest arrivals), and entity links (the Sanctum has no pipes yet), have no pipe: an
 * empty route, drawn and counted nowhere. Null when
 * there's no way at all.
 * @param {Map<string, TwinPipe>} pipesByEnds  from pipeIndex()
 * @param {string} from @param {string} to
 * @returns {{ pipe: TwinPipe, forward: boolean }[] | null}
 */
export function route(pipesByEnds, from, to) {
    if (from === OUTSIDE || to === OUTSIDE || SANCTUM.includes(from) || SANCTUM.includes(to)) return [];
    const direct = pipesByEnds.get(`${from}~${to}`) ?? pipesByEnds.get(`${to}~${from}`);
    if (direct) return [{ pipe: direct, forward: direct.a === from }];
    // breadth-first over plain pipes, so the shortest way wins (ties: pipe order)
    /** @type {Map<string, { pipe: TwinPipe, forward: boolean }[]>} */
    const next = new Map();
    for (const p of pipesByEnds.values()) {
        if (p.kind !== 'pipe') continue;
        if (!next.has(p.a)) next.set(p.a, []);
        if (!next.has(p.b)) next.set(p.b, []);
        next.get(p.a)?.push({ pipe: p, forward: true });
        next.get(p.b)?.push({ pipe: p, forward: false });
    }
    /** @type {Map<string, { from: string, step: { pipe: TwinPipe, forward: boolean } } | null>} */
    const seen = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const at = /** @type {string} */ (queue.shift());
        if (at === to) break;
        for (const step of next.get(at) ?? []) {
            const there = step.forward ? step.pipe.b : step.pipe.a;
            if (seen.has(there)) continue;
            seen.set(there, { from: at, step });
            queue.push(there);
        }
    }
    if (!seen.has(to)) return null;
    const steps = [];
    for (let at = to, prev = seen.get(at); prev; at = prev.from, prev = seen.get(at)) steps.unshift(prev.step);
    return steps;
}

/**
 * The stage a node's base ring toggles in the filter: a phase for the core vessels, a
 * review state for the net (every harvester shares "harvested"). Null for machines that
 * hold no rows.
 * @param {string} id
 * @returns {{ facet: 'phase' | 'review', value: string } | null}
 */
export function nodeStage(id) {
    if (id.startsWith('harvester:')) return { facet: 'review', value: 'harvested' };
    if (id === CENTRIFUGE) return { facet: 'review', value: 'new' };
    if (id === SUMP) return { facet: 'review', value: 'ignored' };
    const phase = Object.entries(PHASE_NODES).find(([, node]) => node === id)?.[0];
    return phase ? { facet: 'phase', value: phase } : null;
}

/** Look pipes up by "a~b". @param {TwinPipe[]} pipes */
export function pipeIndex(pipes) {
    return new Map(pipes.map((p) => [p.id, p]));
}
