// Signal Chain topology (pure): the twin's nodes, its pipes, and how a logged transition
// travels along them. See resources/signal chain digital twin/BUILD_PLAN.md.
//
// Node ids match the transitions log (backend/db/models.py): PHASE_NODES for adventures,
// "harvester:<source>", centrifuge, sump, forge, codex, plus "outside" (where harvested
// events come from; not drawn as a machine).

import { MAIN_ROUTE, PHASE_NODES, PHASE_STAGES } from '../lifecycle.js';

/** @typedef {'net' | 'core' | 'viewer'} TwinZone */
/** @typedef {'harvester' | 'processor' | 'vessel' | 'dynamo' | 'cabinet' | 'viewer'} TwinKind */
/**
 * @typedef {object} TwinNode
 * @property {string} id
 * @property {string} label
 * @property {TwinZone} zone
 * @property {TwinKind} kind
 * @property {'events' | 'adventures' | 'objects' | null} holds  which rows its level counts
 * @property {string | null} matter      what it holds, by name (lifecycle.js matter)
 * @property {boolean} locked            shown, but does nothing yet
 * @property {TwinAction | null} action  what clicking the machine does
 */
/**
 * What clicking a machine does: open a panel, maybe after switching mode or opening the
 * create dialog. `label` (the panel's name) is filled in by the panel.
 * @typedef {{ panel: PanelId, mode?: PoolMode, shades?: boolean, create?: boolean, label?: string }} TwinAction
 */
/** @typedef {{ id: string, a: string, b: string, kind: 'pipe' | 'conveyor' }} TwinPipe */

export const OUTSIDE = 'outside';
export const CENTRIFUGE = 'centrifuge';
export const SUMP = 'sump';
export const FORGE = 'forge';
export const CODEX = 'codex';
export const NECROPOLIS = PHASE_NODES.killed;
export const REFINERY = PHASE_NODES.classifying;

/** Harvesters drawn even before their crawler exists (locked until then). */
export const KNOWN_HARVESTERS = ['luma', '19hz', 'ra', 'eventbrite'];

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
            action: { panel: 'classifier', mode: 'discovery' } }),
        node({ id: SUMP, label: 'Sump', zone: 'net', kind: 'vessel', holds: 'events', matter: 'shade',
            action: { panel: 'classifier', mode: 'discovery', shades: true } }),
        node({ id: FORGE, label: 'Forge', zone: 'net', kind: 'dynamo', action: { panel: 'node', create: true } }),
        core('queued', 'vessel', 'Hopper'),
        core('classifying', 'processor', 'Refinery', { panel: 'node', mode: 'adventures' }),
        core('decomposing', 'processor', 'Alembic', { panel: 'alembic', mode: 'adventures' }),
        core('constructing', 'processor', 'Crucible', { panel: 'quests', mode: 'adventures' }),
        core('consuming', 'processor', 'Arena'),
        core('completed', 'vessel', 'Treasury'),
        core('decommissioned', 'vessel', 'Archive'),
        core('killed', 'vessel', 'Necropolis'),
        node({ id: CODEX, label: 'Codex', zone: 'core', kind: 'cabinet', holds: 'objects', action: { panel: 'codex' } }),
        node({ id: 'entropy_market', label: 'Entropy Market', zone: 'core', kind: 'dynamo', locked: true }),
        node({ id: 'nexus', label: 'Nexus', zone: 'viewer', kind: 'viewer', action: { panel: 'classifier' } }),
        node({ id: 'atlas', label: 'Atlas', zone: 'viewer', kind: 'viewer', action: { panel: 'map' } }),
        node({ id: 'calendar', label: 'Calendar', zone: 'viewer', kind: 'viewer', action: { panel: 'calendar' } }),
    ];
}

/** @param {string} a @param {string} b @param {TwinPipe['kind']} [kind] @returns {TwinPipe} */
const pipe = (a, b, kind = 'pipe') => ({ id: `${a}~${b}`, a, b, kind });

/**
 * Every pipe. Pipes are two-way (siphon runs back up the feed pipe, revive back up the
 * kill pipe); `a` -> `b` is the usual direction.
 * @param {string[]} sourceNames
 * @returns {TwinPipe[]}
 */
export function twinPipes(sourceNames) {
    const harvesters = [...new Set([...KNOWN_HARVESTERS, ...sourceNames])].map(harvesterId);
    return [
        ...harvesters.flatMap((h) => [pipe(OUTSIDE, h), pipe(h, CENTRIFUGE)]),
        pipe(CENTRIFUGE, SUMP),
        pipe(CENTRIFUGE, MAIN_CHAIN[0]),
        pipe(SUMP, MAIN_CHAIN[0]),
        pipe(FORGE, MAIN_CHAIN[0]),
        ...MAIN_CHAIN.slice(1).map((b, i) => pipe(MAIN_CHAIN[i], b)),
        ...MAIN_CHAIN.map((n) => pipe(n, NECROPOLIS)),
        pipe(CODEX, REFINERY, 'conveyor'),
    ];
}

/**
 * The pipe steps a move from `from` to `to` travels: the pipe joining them, else the
 * main chain walked forward or back (a phase set by hand can skip stages). Null when
 * there's no way (drawn as a jump; counted on no pipe).
 * @param {Map<string, TwinPipe>} pipesByEnds  from pipeIndex()
 * @param {string} from @param {string} to
 * @returns {{ pipe: TwinPipe, forward: boolean }[] | null}
 */
export function route(pipesByEnds, from, to) {
    const direct = pipesByEnds.get(`${from}~${to}`) ?? pipesByEnds.get(`${to}~${from}`);
    if (direct) return [{ pipe: direct, forward: direct.a === from }];
    const i = MAIN_CHAIN.indexOf(from), j = MAIN_CHAIN.indexOf(to);
    if (i < 0 || j < 0) return null;
    const step = j > i ? 1 : -1;
    const steps = [];
    for (let k = i; k !== j; k += step) {
        const a = MAIN_CHAIN[k], b = MAIN_CHAIN[k + step];
        const p = pipesByEnds.get(`${a}~${b}`) ?? pipesByEnds.get(`${b}~${a}`);
        if (!p) return null;
        steps.push({ pipe: p, forward: p.a === a });
    }
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
