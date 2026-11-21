// The Signal Chain model (pure): how full each machine is, how much of that is lit by the
// applied filter, how the lit part splits under the lens, and how much flowed down each
// pipe. Levels come from the rows the store already holds; flows from the transitions log.
// See resources/signal chain digital twin/BUILD_PLAN.md, sections 1-3.

import { passes } from '../filters.js';
import { OBJECT_TYPES, PHASE_NODES } from '../lifecycle.js';
import { lensColor, lensLabel, lensValues } from './lens.js';
import { CENTRIFUGE, SUMP, harvesterId, pipeIndex, route } from './twinTopology.js';

/** @typedef {{ value: string, label: string, color: string, count: number }} TwinBand */
/**
 * total: rows held. lit: rows passing the applied filter (the rest are ghosts).
 * bands: the lit rows split by lens value, largest first. A row with several values adds
 * 1/n to each, so bands always sum to `lit`.
 * @typedef {{ total: number, lit: number, bands: TwinBand[] }} TwinLevel
 */
/**
 * @typedef {object} TwinModel
 * @property {Record<string, TwinLevel>} levels   by node id (only nodes that hold rows)
 * @property {{ total: number, byType: Record<ObjectType, number> }} codex
 * @property {{ ok: boolean, problems: string[] }} check   the counting rules
 */

/**
 * The node a raw event sits in, or null once it has an adventure (the adventure is the
 * packet from then on: a killed one's event is "ignored" but it lives in the Necropolis).
 * @param {EventRecord} e @param {Set<string>} linked event ids that have an adventure
 */
export function eventNode(e, linked) {
    if (linked.has(e.id)) return null;
    if (e.review === 'harvested') return harvesterId(e.source);
    if (e.review === 'new') return CENTRIFUGE;
    if (e.review === 'ignored') return SUMP;
    return null; // "passed" without an adventure: shouldn't exist (the check reports it)
}

/**
 * @param {{ rawEvents: EventRecord[], adventures: AdventureRecord[], objects: VObject[],
 *           filters: FilterState, lens: LensKey, now: number }} input
 * @returns {TwinModel}
 */
export function twinModel({ rawEvents, adventures, objects, filters, lens, now }) {
    /** @type {Map<string, { total: number, lit: number, bands: Map<string, number> }>} */
    const acc = new Map();
    /** @param {string} nodeId @param {PoolItem} item @param {boolean} lit */
    const add = (nodeId, item, lit) => {
        let level = acc.get(nodeId);
        if (!level) acc.set(nodeId, (level = { total: 0, lit: 0, bands: new Map() }));
        level.total += 1;
        if (!lit) return;
        level.lit += 1;
        const values = lensValues(item, lens);
        for (const v of values) level.bands.set(v, (level.bands.get(v) ?? 0) + 1 / values.length);
    };

    const linked = new Set(adventures.map((a) => a.event_id).filter((id) => id != null));
    let unplaced = 0;
    for (const e of rawEvents) {
        const nodeId = eventNode(e, /** @type {Set<string>} */ (linked));
        if (!nodeId) {
            if (!linked.has(e.id)) unplaced++;
            continue;
        }
        const item = /** @type {PoolItem} */ ({ ...e, kind: 'omen' });
        add(nodeId, item, passes(item, filters, 'discovery', now)); // net: Discovery's facets apply
    }
    for (const a of adventures) {
        const item = /** @type {PoolItem} */ ({ ...a, kind: 'adventure' });
        add(PHASE_NODES[a.phase], item, passes(item, filters, 'adventures', now)); // core: Adventures' facets
    }

    /** @type {Record<string, TwinLevel>} */
    const levels = {};
    for (const [nodeId, level] of acc) {
        const bands = [...level.bands.entries()]
            .map(([value, count]) => ({ value, count, label: lensLabel(lens, value), color: lensColor(lens, value) }))
            .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
        levels[nodeId] = { total: level.total, lit: level.lit, bands };
    }

    const byType = /** @type {Record<ObjectType, number>} */ (Object.fromEntries(Object.keys(OBJECT_TYPES).map((t) => [t, 0])));
    for (const o of objects) byType[o.type] = (byType[o.type] ?? 0) + 1;

    return { levels, codex: { total: objects.length, byType }, check: checkRules(levels, rawEvents, adventures, unplaced) };
}

/**
 * The counting rules (BUILD_PLAN.md, section 1):
 *   count(adventures) = sum of the core vessels
 *   count(events)     = harvesters + centrifuge + sump + adventures with an event
 * @param {Record<string, TwinLevel>} levels @param {EventRecord[]} rawEvents
 * @param {AdventureRecord[]} adventures @param {number} unplaced
 */
export function checkRules(levels, rawEvents, adventures, unplaced) {
    const problems = [];
    const count = (/** @type {string} */ id) => levels[id]?.total ?? 0;
    const core = Object.values(PHASE_NODES).reduce((n, id) => n + count(id), 0);
    if (core !== adventures.length) problems.push(`core vessels hold ${core}, but there are ${adventures.length} adventures`);
    const harvesters = Object.keys(levels).filter((id) => id.startsWith('harvester:')).reduce((n, id) => n + count(id), 0);
    const withEvent = adventures.filter((a) => a.event_id != null).length;
    const net = harvesters + count(CENTRIFUGE) + count(SUMP) + withEvent;
    if (net !== rawEvents.length) problems.push(`net holds ${net} (incl. ${withEvent} with adventures), but there are ${rawEvents.length} events`);
    if (unplaced) problems.push(`${unplaced} passed event(s) have no adventure`);
    return { ok: problems.length === 0, problems };
}

/**
 * Packets per pipe over the flows window, each direction separately. A move between two
 * stages without a pipe of their own (a phase set by hand can skip) counts on every pipe
 * of the main chain between them; moves with no route at all are listed in `unrouted`.
 * @param {FlowRecord[]} flows
 * @param {import('./twinTopology.js').TwinPipe[]} pipes
 * @returns {{ byPipe: Record<string, { forward: number, backward: number }>, unrouted: FlowRecord[] }}
 */
export function pipeFlows(flows, pipes) {
    const index = pipeIndex(pipes);
    /** @type {Record<string, { forward: number, backward: number }>} */
    const byPipe = Object.fromEntries(pipes.map((p) => [p.id, { forward: 0, backward: 0 }]));
    const unrouted = [];
    for (const f of flows) {
        const steps = route(index, f.from, f.to);
        if (!steps) { unrouted.push(f); continue; }
        for (const { pipe, forward } of steps) byPipe[pipe.id][forward ? 'forward' : 'backward'] += f.count;
    }
    return { byPipe, unrouted };
}
