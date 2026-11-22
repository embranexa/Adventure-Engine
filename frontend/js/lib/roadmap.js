// Action roadmaps (the Alembic): one dependency graph of actions per adventure.
// Pure functions shared by the Alembic panel, the quest log and the store. The server
// keeps the same rules (backend/services/roadmap.py).
//
// Script format (one statement per line, Mermaid-like):
//     # comment                      (also //)
//     A1[Buy tickets] --> A2[Book hotel] --> A3[Pack]
//     A1 --> A4[Ask Sam]             (a bare id reuses the title given elsewhere)
//     A5[Something on its own]

import { MAIN_ROUTE, PHASE_STAGES } from '../lifecycle.js';

/** @type {Roadmap} */
export const EMPTY_ROADMAP = { actions: [], edges: [], done: [] };

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const TOKEN_RE = /^([A-Za-z0-9_-]{1,40})(?:\[([^\]]*)\])?$/;
export const MAX_TITLE = 200;

/** Titles can't hold square brackets (they delimit titles in the script). @param {string} title */
export function cleanTitle(title) {
    return title.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
}

/** @param {Roadmap | null | undefined} roadmap @returns {Roadmap} */
export function orEmpty(roadmap) {
    return roadmap && Array.isArray(roadmap.actions) ? roadmap : EMPTY_ROADMAP;
}

/**
 * A cycle as a list of ids (first repeated at the end), or null.
 * @param {string[]} ids @param {[string, string][]} edges @returns {string[] | null}
 */
export function findCycle(ids, edges) {
    /** @type {Map<string, string[]>} */
    const children = new Map(ids.map((id) => [id, []]));
    for (const [a, b] of edges) children.get(a)?.push(b);
    /** @type {Map<string, number>} */
    const state = new Map(); // 1 = on the current path, 2 = finished
    /** @type {string[]} */
    const path = [];
    /** @param {string} node @returns {string[] | null} */
    const visit = (node) => {
        state.set(node, 1);
        path.push(node);
        for (const child of children.get(node) ?? []) {
            if (state.get(child) === 1) return [...path.slice(path.indexOf(child)), child];
            if (!state.has(child)) {
                const found = visit(child);
                if (found) return found;
            }
        }
        path.pop();
        state.set(node, 2);
        return null;
    };
    for (const id of ids) {
        if (!state.has(id)) {
            const found = visit(id);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Drop "done" from any action behind an unfinished prerequisite.
 * @param {Roadmap} roadmap @returns {Roadmap}
 */
function cascade(roadmap) {
    const done = new Set(roadmap.done);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [a, b] of roadmap.edges) {
            if (done.has(b) && !done.has(a)) { done.delete(b); changed = true; }
        }
    }
    return done.size === roadmap.done.length ? roadmap : { ...roadmap, done: roadmap.done.filter((id) => done.has(id)) };
}

/**
 * @typedef {'done' | 'ready' | 'locked'} ActionState
 * @typedef {{ id: string, title: string, parents: string[], children: string[],
 *             state: ActionState, layer: number, row: number }} ActionInfo
 * @typedef {{ actions: ActionInfo[], byId: Map<string, ActionInfo>, layers: string[][],
 *             total: number, doneCount: number, bottlenecks: ActionInfo[], complete: boolean }} RoadmapAnalysis
 */

/**
 * Everything the views need: each action's state and grid position, the bottlenecks
 * (incomplete actions whose prerequisites are all done) and whether it's complete.
 * @param {Roadmap | null | undefined} input @returns {RoadmapAnalysis}
 */
export function analyze(input) {
    const roadmap = orEmpty(input);
    const done = new Set(roadmap.done);
    /** @type {Map<string, ActionInfo>} */
    const byId = new Map();
    for (const a of roadmap.actions) {
        byId.set(a.id, { id: a.id, title: a.title, parents: [], children: [], state: 'locked', layer: 0, row: 0 });
    }
    for (const [a, b] of roadmap.edges) {
        const src = byId.get(a), tgt = byId.get(b);
        if (!src || !tgt) continue;
        src.children.push(b);
        tgt.parents.push(a);
    }
    const actions = [...byId.values()];
    for (const info of actions) {
        info.state = done.has(info.id) ? 'done' : info.parents.every((p) => done.has(p)) ? 'ready' : 'locked';
    }

    // Longest-path layers (Kahn). Anything left in a cycle stays in layer 0.
    /** @type {Map<string, number>} */
    const inDegree = new Map(actions.map((a) => [a.id, a.parents.length]));
    const queue = actions.filter((a) => a.parents.length === 0).map((a) => a.id);
    while (queue.length) {
        const node = /** @type {ActionInfo} */ (byId.get(/** @type {string} */ (queue.shift())));
        for (const childId of node.children) {
            const child = /** @type {ActionInfo} */ (byId.get(childId));
            child.layer = Math.max(child.layer, node.layer + 1);
            const left = /** @type {number} */ (inDegree.get(childId)) - 1;
            inDegree.set(childId, left);
            if (left === 0) queue.push(childId);
        }
    }
    /** @type {string[][]} */
    const layers = [];
    for (const a of actions) (layers[a.layer] ??= []).push(a.id);
    // Order each layer by its parents' average row, to keep links from crossing.
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i] ?? (layers[i] = []);
        if (i > 0) {
            const score = (/** @type {string} */ id) => {
                const ps = /** @type {ActionInfo} */ (byId.get(id)).parents.map((p) => /** @type {ActionInfo} */ (byId.get(p)).row);
                return ps.length ? ps.reduce((s, r) => s + r, 0) / ps.length : Infinity;
            };
            const scores = new Map(layer.map((id) => [id, score(id)]));
            layer.sort((x, y) => /** @type {number} */ (scores.get(x)) - /** @type {number} */ (scores.get(y)));
        }
        layer.forEach((id, row) => { /** @type {ActionInfo} */ (byId.get(id)).row = row; });
    }

    const doneCount = actions.filter((a) => a.state === 'done').length;
    return {
        actions, byId, layers,
        total: actions.length,
        doneCount,
        bottlenecks: actions.filter((a) => a.state === 'ready'),
        complete: actions.length > 0 && doneCount === actions.length,
    };
}

// --- edits (each returns a new roadmap) ---

/** @param {Roadmap} roadmap */
export function nextActionId(roadmap) {
    const used = new Set(roadmap.actions.map((a) => a.id));
    let n = roadmap.actions.length + 1;
    while (used.has(`A${n}`)) n++;
    return `A${n}`;
}

/**
 * Complete a ready action, or undo a done one (which re-locks everything after it).
 * Locked actions are left alone.
 * @param {Roadmap} roadmap @param {string} id @returns {Roadmap}
 */
export function toggleDone(roadmap, id) {
    const info = analyze(roadmap).byId.get(id);
    if (!info || info.state === 'locked') return roadmap;
    const done = info.state === 'done' ? roadmap.done.filter((d) => d !== id) : [...roadmap.done, id];
    return cascade({ ...roadmap, done });
}

/**
 * Add an action, after `parentId` when given.
 * @param {Roadmap} roadmap @param {string} title @param {string | null} [parentId]
 * @returns {{ roadmap: Roadmap, id: string }}
 */
export function addAction(roadmap, title, parentId = null) {
    const id = nextActionId(roadmap);
    const next = {
        ...roadmap,
        actions: [...roadmap.actions, { id, title: cleanTitle(title) || id }],
        edges: parentId ? [...roadmap.edges, /** @type {[string, string]} */ ([parentId, id])] : roadmap.edges,
    };
    return { roadmap: next, id };
}

/** @param {Roadmap} roadmap @param {string} id @param {string} title @returns {Roadmap} */
export function renameAction(roadmap, id, title) {
    const clean = cleanTitle(title) || id;
    return { ...roadmap, actions: roadmap.actions.map((a) => (a.id === id ? { ...a, title: clean } : a)) };
}

/** Remove an action and its links. @param {Roadmap} roadmap @param {string} id @returns {Roadmap} */
export function removeAction(roadmap, id) {
    return cascade({
        actions: roadmap.actions.filter((a) => a.id !== id),
        edges: roadmap.edges.filter(([a, b]) => a !== id && b !== id),
        done: roadmap.done.filter((d) => d !== id),
    });
}

/**
 * Link `from` --> `to`, or unlink if they're already linked. Refuses a link that
 * would make a cycle.
 * @param {Roadmap} roadmap @param {string} from @param {string} to
 * @returns {{ roadmap: Roadmap, error: string | null }}
 */
export function toggleLink(roadmap, from, to) {
    if (from === to) return { roadmap, error: null };
    const has = roadmap.edges.some(([a, b]) => a === from && b === to);
    if (has) return { roadmap: { ...roadmap, edges: roadmap.edges.filter(([a, b]) => !(a === from && b === to)) }, error: null };
    /** @type {[string, string][]} */
    const edges = [...roadmap.edges, [from, to]];
    const cycle = findCycle(roadmap.actions.map((a) => a.id), edges);
    if (cycle) return { roadmap, error: `That would loop: ${cycle.join(' → ')}` };
    return { roadmap: cascade({ ...roadmap, edges }), error: null };
}

// --- script ---

/**
 * The roadmap as script text: each link on its own line, titles on first mention.
 * @param {Roadmap | null | undefined} input
 */
export function toScript(input) {
    const roadmap = orEmpty(input);
    const titles = new Map(roadmap.actions.map((a) => [a.id, a.title]));
    const named = new Set();
    const token = (/** @type {string} */ id) => {
        if (named.has(id)) return id;
        named.add(id);
        return `${id}[${titles.get(id) ?? id}]`;
    };
    /** @type {string[]} */
    const lines = [];
    for (const action of roadmap.actions) {
        const out = roadmap.edges.filter(([a]) => a === action.id);
        const linked = out.length || roadmap.edges.some(([, b]) => b === action.id);
        if (!linked) lines.push(token(action.id));
        for (const [a, b] of out) lines.push(`${token(a)} --> ${token(b)}`);
    }
    return lines.join('\n');
}

/**
 * Parse script text. Actions that keep their id keep their done mark from `previous`.
 * @param {string} text @param {Roadmap | null} [previous]
 * @returns {{ roadmap: Roadmap, error: null } | { roadmap: null, error: string }}
 */
export function parseScript(text, previous = null) {
    /** @type {Map<string, string>} */
    const titles = new Map();
    /** @type {[string, string][]} */
    const edges = [];
    const lines = text.split('\n');
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n].trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const parts = line.split('-->').map((p) => p.trim());
        /** @type {string[]} */
        const ids = [];
        for (const part of parts) {
            const m = part.match(TOKEN_RE);
            if (!m) {
                return { roadmap: null, error: `Line ${n + 1}: "${part.slice(0, 40)}" — write an id, optionally with a [title], e.g. A1[Buy tickets]` };
            }
            const [, id, title] = m;
            if (title !== undefined && cleanTitle(title)) titles.set(id, cleanTitle(title));
            else if (!titles.has(id)) titles.set(id, '');
            ids.push(id);
        }
        for (let i = 0; i < ids.length - 1; i++) {
            if (ids[i] === ids[i + 1]) return { roadmap: null, error: `Line ${n + 1}: ${ids[i]} can't depend on itself` };
            if (!edges.some(([a, b]) => a === ids[i] && b === ids[i + 1])) edges.push([ids[i], ids[i + 1]]);
        }
    }
    // keep the previous order (so stills don't jump around); new actions go last
    const order = new Map((previous?.actions ?? []).map((a, i) => [a.id, i]));
    const actions = [...titles]
        .map(([id, title]) => ({ id, title: title || id }))
        .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    if (actions.length > 200) return { roadmap: null, error: 'At most 200 actions' };
    const cycle = findCycle(actions.map((a) => a.id), edges);
    if (cycle) return { roadmap: null, error: `Cycle: ${cycle.join(' --> ')}` };
    const keep = new Set(previous?.done ?? []);
    return { roadmap: cascade({ actions, edges, done: actions.map((a) => a.id).filter((id) => keep.has(id)) }), error: null };
}

/** @param {string} id */
export function isValidId(id) {
    return ID_RE.test(id);
}

// --- lifecycle ---

/**
 * The colours of a roadmap's actions, from its adventure's matter (the user's rule):
 * distillate (still distilling actions): everything yellow; alloy (building): incomplete
 * actions orange, complete ones red; animus, artifact, relic (and the rest): every action
 * in that matter's colour. The server moves the phase as actions are completed
 * (backend/services/roadmap.py), so the colours follow.
 * @param {Phase} phase @returns {{ todo: string, done: string }}
 */
export function roadmapColors(phase) {
    if (phase === 'constructing') return { todo: PHASE_STAGES.constructing.color, done: PHASE_STAGES.consuming.color };
    if (phase === 'consuming' || phase === 'completed') return { todo: PHASE_STAGES[phase].color, done: PHASE_STAGES[phase].color };
    if (phase === 'decommissioned' || phase === 'killed') return { todo: PHASE_STAGES[phase].light, done: PHASE_STAGES[phase].light };
    return { todo: PHASE_STAGES.decomposing.color, done: PHASE_STAGES.decomposing.color };
}

/**
 * The phase a completed roadmap promotes its adventure to (next on the main route),
 * or null when there is none (already in the Treasury, killed, archived).
 * @param {Phase} phase @returns {Phase | null}
 */
export function promotionTarget(phase) {
    const i = MAIN_ROUTE.indexOf(phase);
    return i >= 0 && i < MAIN_ROUTE.length - 1 ? MAIN_ROUTE[i + 1] : null;
}
