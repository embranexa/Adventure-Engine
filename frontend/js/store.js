import { create } from 'zustand';
import * as feed from './feed.js';
import { indexItems, sameList } from './events.js';
import { DEFAULT_FILTERS, KM_PER_MI, applyFilters, nextMode, passes, setEntityNames } from './filters.js';

/** Radius of a newly placed proximity ring. */
export const DEFAULT_RING_RADIUS_KM = 5 * KM_PER_MI;

// --- Pure Tree Helpers ---
/** @template T @param {T} obj @returns {T} */
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/** @param {LayoutNode} node @param {string} nodeId @param {number} newRatio @returns {LayoutNode} */
function updateSplitRatio(node, nodeId, newRatio) {
    if (!node) return node;
    if (node.id === nodeId && node.type === 'split') {
        return { ...node, ratio: Math.max(12, Math.min(88, newRatio)) };
    }
    if (node.type === 'split') {
        const first = updateSplitRatio(node.first, nodeId, newRatio);
        const second = updateSplitRatio(node.second, nodeId, newRatio);
        // Keep untouched branches referentially equal so memoized nodes skip rendering
        if (first === node.first && second === node.second) return node;
        return { ...node, first, second };
    }
    return node;
}

/** @param {LayoutNode} node @param {string} leafId @param {PanelId} panelId @returns {LayoutNode} */
function updateActiveTab(node, leafId, panelId) {
    if (!node) return node;
    if (node.type === 'leaf') {
        return node.id === leafId && node.activeTab !== panelId ? { ...node, activeTab: panelId } : node;
    }
    const first = updateActiveTab(node.first, leafId, panelId);
    const second = updateActiveTab(node.second, leafId, panelId);
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
}

/** @param {LayoutNode | null} node @param {PanelId} panelId @returns {LayoutNode | null} Null when no panels remain. */
function removePanelFromTree(node, panelId) {
    if (!node) return null;
    if (node.type === 'leaf') {
        const nextTabs = node.tabs.filter((t) => t !== panelId);
        if (nextTabs.length === 0) return null;
        const nextActive = node.activeTab === panelId ? nextTabs[0] : node.activeTab;
        return { ...node, tabs: nextTabs, activeTab: nextActive };
    }
    if (node.type === 'split') {
        const first = removePanelFromTree(node.first, panelId);
        const second = removePanelFromTree(node.second, panelId);
        if (!first && !second) return null;
        if (!first) return second;
        if (!second) return first;
        return { ...node, first, second };
    }
    return node;
}

/** @param {LayoutNode} node @param {string | null} targetLeafId @param {PanelId} panelId @param {DropZone} zone @returns {LayoutNode} */
function insertPanelAtTarget(node, targetLeafId, panelId, zone) {
    if (node.type === 'leaf' && node.id === targetLeafId) {
        if (zone === 'center') {
            const tabs = node.tabs.includes(panelId) ? node.tabs : [...node.tabs, panelId];
            return { ...node, tabs, activeTab: panelId };
        }
        /** @type {LeafNode} */
        const newLeaf = {
            id: `leaf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'leaf',
            tabs: [panelId],
            activeTab: panelId,
        };
        const isHorizontal = zone === 'left' || zone === 'right';
        const isFirst = zone === 'left' || zone === 'top';
        return {
            id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'split',
            direction: isHorizontal ? 'horizontal' : 'vertical',
            ratio: 50,
            first: isFirst ? newLeaf : node,
            second: isFirst ? node : newLeaf,
        };
    }
    if (node.type === 'split') {
        return {
            ...node,
            first: insertPanelAtTarget(node.first, targetLeafId, panelId, zone),
            second: insertPanelAtTarget(node.second, targetLeafId, panelId, zone),
        };
    }
    return node;
}

/** @param {LayoutNode | null} node @param {Set<PanelId>} [out] @returns {Set<PanelId>} */
export function collectMountedPanels(node, out = new Set()) {
    if (!node) return out;
    if (node.type === 'leaf') node.tabs.forEach((t) => out.add(t));
    if (node.type === 'split') {
        collectMountedPanels(node.first, out);
        collectMountedPanels(node.second, out);
    }
    return out;
}

/**
 * The tree the main dock shows: popped-out panels left out, and any group they leave
 * empty collapsed into its sibling. Untouched subtrees keep their identity (DockNode is
 * memoized). The saved tree keeps popped-out panels in place, so on reload, or when a
 * window closes, they're back where they were.
 * @param {LayoutNode | null} node @param {ReadonlySet<PanelId>} popped @returns {LayoutNode | null}
 */
export function dockedTree(node, popped) {
    if (!node || popped.size === 0) return node;
    if (node.type === 'leaf') {
        const tabs = node.tabs.filter((t) => !popped.has(t));
        if (tabs.length === node.tabs.length) return node;
        if (tabs.length === 0) return null;
        return { ...node, tabs, activeTab: tabs.includes(node.activeTab) ? node.activeTab : tabs[0] };
    }
    const first = dockedTree(node.first, popped);
    const second = dockedTree(node.second, popped);
    if (first === node.first && second === node.second) return node;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
}

/** @param {LayoutNode | null} node @returns {string | null} */
function findFirstLeafId(node) {
    if (!node) return null;
    if (node.type === 'leaf') return node.id;
    return findFirstLeafId(node.first) || findFirstLeafId(node.second);
}

/** The id of the leaf holding a panel, or null. @param {LayoutNode | null} node @param {PanelId} panelId @returns {string | null} */
function findLeafWithPanel(node, panelId) {
    if (!node) return null;
    if (node.type === 'leaf') return node.tabs.includes(panelId) ? node.id : null;
    return findLeafWithPanel(node.first, panelId) || findLeafWithPanel(node.second, panelId);
}

/** The leaf with this id, or null. @param {LayoutNode | null} node @param {string | null} id @returns {LeafNode | null} */
function findLeaf(node, id) {
    if (!node || !id) return null;
    if (node.type === 'leaf') return node.id === id ? node : null;
    return findLeaf(node.first, id) || findLeaf(node.second, id);
}

/**
 * The panel in use: the focused pop-out window's panel, else the active tab of the dock
 * group the user last clicked or focused. Null before any. (The Signal Chain's machines
 * work while their panel is in use: PHASE7_PLAN.md, stage 7d.)
 * @param {WorkspaceState} s @returns {PanelId | null}
 */
export function panelInUse(s) {
    if (s.focusedPopout && s.poppedOut.includes(s.focusedPopout)) return s.focusedPopout;
    const leaf = findLeaf(dockedTree(s.tree, new Set(s.poppedOut)), s.focusedGroup);
    if (!leaf) return null;
    return leaf.tabs.includes(leaf.activeTab) ? leaf.activeTab : leaf.tabs[0] ?? null;
}

/** Selections made by clicking an item's card in a panel: they bring up the Refinery. */
const CARD_CLICK_SOURCES = new Set(['classifier', 'calendar', 'map', 'quests', 'codex', 'ledger']);

/**
 * Ids of the events in the centrifuge (new) that the filters leave out: what a Discovery
 * pass-through siphons or purges.
 * @param {EventRecord[]} rawEvents @param {FilterState} filters @param {number} now @returns {string[]}
 */
export function excludedFromCentrifuge(rawEvents, filters, now) {
    return rawEvents
        .filter((e) => e.review === 'new' && !passes(/** @type {PoolItem} */ ({ ...e, kind: 'omen' }), filters, 'discovery', now))
        .map((e) => e.id);
}

/**
 * The prima materia in the Centrifuge in comb order: earliest first, undated ones last.
 * @param {EventRecord[]} rawEvents @param {Record<string, PoolItem>} itemsById @returns {string[]}
 */
export function centrifugeOrder(rawEvents, itemsById) {
    const time = (/** @type {EventRecord} */ e) => { const t = e.start ? new Date(e.start).getTime() : NaN; return Number.isNaN(t) ? Infinity : t; };
    return rawEvents.filter((e) => e.review === 'new' && itemsById[e.id])
        .sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id))
        .map((e) => e.id);
}

/** Set by components/Popout.js (the store can't import it: it imports the store). */
export const popoutHooks = { focus: (/** @type {PanelId} */ _panelId) => {} };

const PERSIST_DEBOUNCE_MS = 300;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let persistTimer;

/**
 * Route feed messages into the store. Subscribed once, before the socket opens,
 * so the snapshot sent on connect is never missed.
 * @param {() => WorkspaceState} get
 */
let feedWired = false;
function startFeed(get) {
    if (feedWired) return;
    feedWired = true;
    feed.on('events', (msg) => get().setRawEvents(msg.events));
    feed.on('adventures', (msg) => get().setAdventures(msg.adventures));
    feed.on('entities', (msg) => get().setEntities(msg.entities));
    feed.on('ambrosia', (msg) => get().setAmbrosia(msg.ambrosia));
    feed.on('source_status', (msg) => get().setSourceStatus(msg.source));
    feed.on('transitions', (msg) => get().addTransitions(msg.transitions));
}

/** How many recent transitions the store keeps (the twin replays these). */
const MAX_TRANSITIONS = 500;
const FLOWS_REFRESH_MS = 1500;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let flowsTimer;

/** Fetch JSON, or null on any failure (logged). @param {string} url */
async function getJson(url) {
    try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
        console.error(`[${url}]`, res.status, await res.text());
    } catch (err) {
        console.error(`[${url}] request failed`, err);
    }
    return null;
}

// --- the pool: what every view shows, depending on the mode ---

/** @param {WorkspaceState} state @returns {PoolRecord[]} */
function poolRecords(state) {
    if (state.mode === 'discovery') {
        return state.rawEvents
            .filter((e) => e.review === 'new' || (state.showShades && e.review === 'ignored'))
            .map((e) => /** @type {PoolRecord} */ ({ ...e, kind: 'omen' }));
    }
    return state.adventures.map((a) => /** @type {PoolRecord} */ ({ ...a, kind: 'adventure' }));
}

/**
 * Store changes that bring the pool in line with `state` (pass the state *after* the
 * change being made). Unchanged items keep their objects; a selection or hover on an
 * item that left the pool is cleared.
 * @param {WorkspaceState} state
 * @returns {Partial<WorkspaceState>}
 */
function poolUpdate(state) {
    const next = indexItems(poolRecords(state), state.itemsById);
    /** @type {Partial<WorkspaceState>} */
    const update = sameList(next.items, state.items) ? {} : next;
    if (state.selectedItemId != null && !next.itemsById[state.selectedItemId]) {
        update.selectedItemId = null;
        update.selectionSource = null;
    }
    if (state.hoveredItemId != null && !next.itemsById[state.hoveredItemId]) update.hoveredItemId = null;
    return update;
}

/**
 * Add `visibleItems` (the filtered pool) to a store update, computed from the state as
 * it will be after the update. Keeps the previous array when nothing changed.
 * @param {WorkspaceState} state @param {Partial<WorkspaceState>} update
 * @returns {Partial<WorkspaceState>}
 */
function withVisible(state, update) {
    const next = { ...state, ...update };
    const visibleItems = applyFilters(next.items, next.filters, next.mode, Date.now(), state.visibleItems);
    return visibleItems === state.visibleItems ? update : { ...update, visibleItems };
}

const FILTER_SAVE_DEBOUNCE_MS = 500;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let filterSaveTimer;

/**
 * @param {string} key @param {unknown} value
 * @param {boolean} [keepalive] let the request finish even if the page is closing
 */
async function saveState(key, value, keepalive = false) {
    try {
        const res = await fetch(`/api/state/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value),
            keepalive,
        });
        if (!res.ok) console.error(`[state:${key}] save failed`, res.status, await res.text());
    } catch (err) {
        console.error(`[state:${key}] save failed`, err);
    }
}

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const saveTimers = {};
/** @type {Record<string, () => unknown>} */
const pendingSaves = {};

/**
 * Save `key` after a short pause (rapid edits collapse into one request). Anything
 * still waiting is sent right away when the page goes away, so no edit is lost.
 * @param {string} key @param {() => unknown} value
 */
function scheduleSave(key, value) {
    clearTimeout(saveTimers[key]);
    pendingSaves[key] = value;
    saveTimers[key] = setTimeout(() => {
        delete pendingSaves[key];
        saveState(key, value());
    }, FILTER_SAVE_DEBOUNCE_MS);
    if (!flushOnExit) {
        flushOnExit = () => {
            for (const [k, v] of Object.entries(pendingSaves)) {
                clearTimeout(saveTimers[k]);
                delete pendingSaves[k];
                saveState(k, v(), true);
            }
        };
        window.addEventListener('pagehide', flushOnExit);
    }
}
/** @type {(() => void) | undefined} */
let flushOnExit;

/** @param {() => WorkspaceState} get */
const saveApplied = (get) => scheduleSave('filters', () => get().filters);
/** @param {() => WorkspaceState} get */
const saveDraft = (get) => scheduleSave('filters_draft', () => get().draftFilters);

/** How many bulk transfers can be undone. */
const UNDO_DEPTH = 20;

/**
 * Remember a bulk transfer (the server's response lists the ids it moved) so it can be
 * undone, and announce it. `filters`: the filters to restore on undo (a pass-through clears them).
 * @param {(fn: any) => void} set @param {any} res @param {Omit<TransferRecord, 'ids' | 'at'>} t
 */
function pushTransfer(set, res, t) {
    const ids = Array.isArray(res?.ids) ? res.ids : [];
    if (!ids.length) return;
    set((/** @type {WorkspaceState} */ state) => ({
        undoStack: [...state.undoStack, { ...t, ids, at: Date.now() }].slice(-UNDO_DEPTH),
    }));
}

/**
 * Call the API for a triage/phase action. Errors land in `actionError` (shown in the
 * node card); success needs no handling, since the server broadcasts the new pools.
 * @param {(partial: Partial<WorkspaceState>) => void} set
 * @param {string} url @param {'POST' | 'PUT'} [method] @param {unknown} [body]
 * @returns {Promise<boolean>} whether it succeeded
 */
async function callAction(set, url, method = 'POST', body = undefined) {
    set({ actionError: null });
    try {
        const res = await fetch(url, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.ok) return (await res.json().catch(() => null)) || {}; // the response (always truthy)
        const detail = (await res.json().catch(() => null))?.detail;
        set({ actionError: typeof detail === 'string' ? detail : `Request failed (${res.status})` });
    } catch {
        set({ actionError: 'Server unreachable' });
    }
    return false;
}

/**
 * Send a JSON request. Resolves to the parsed response, or to an error message.
 * @param {string} url @param {string} method @param {unknown} [body] @returns {Promise<unknown>}
 */
async function sendJson(url, method, body = undefined) {
    try {
        const res = await fetch(url, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) return data;
        const detail = data?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail) && detail[0]?.msg) return `${detail[0].loc?.at(-1) ?? 'field'}: ${detail[0].msg}`;
        return `Request failed (${res.status})`;
    } catch {
        return 'Server unreachable';
    }
}

/**
 * Run an action that removes `id` from the pool (pass/ignore/revive in Discovery), then
 * move the selection to its neighbour so you can keep reviewing.
 * @param {() => WorkspaceState} get @param {string} id @param {() => Promise<boolean>} action
 */
async function actAndAdvance(get, id, action) {
    const { items, selectedItemId } = get();
    const wasSelected = selectedItemId === id;
    const index = items.findIndex((item) => item.id === id);
    const neighbour = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    const ok = await action();
    const current = get().selectedItemId;
    // only if the user hasn't picked something else in the meantime
    if (ok && wasSelected && neighbour && (current === null || current === id) && get().itemsById[neighbour]) {
        get().selectItem(neighbour, 'triage');
    }
}

// --- roadmaps: shown at once, saved after a short pause (latest wins) ---

const ROADMAP_SAVE_DEBOUNCE_MS = 250;
/** Roadmaps edited here and not yet confirmed by the server, by adventure id. */
const pendingRoadmaps = new Map();
/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const roadmapTimers = {};

/**
 * Put local, unsaved roadmaps over a list from the server, so a broadcast of an older
 * save doesn't briefly undo a newer edit.
 * @param {AdventureRecord[]} records
 */
function withPendingRoadmaps(records) {
    if (!pendingRoadmaps.size) return records;
    return records.map((a) => (pendingRoadmaps.has(a.id) ? { ...a, roadmap: pendingRoadmaps.get(a.id) } : a));
}

/** @param {Roadmap} roadmap @returns {Roadmap | null} no actions means no roadmap */
const storedRoadmap = (roadmap) => (roadmap.actions.length ? roadmap : null);

/** @type {import('zustand').StateCreator<WorkspaceState>} */
const workspaceStore = (set, get) => ({
    panels: {},
    tree: null,
    draggingPanelId: null,
    poppedOut: [],
    focusedGroup: null,
    focusedPopout: null,
    layoutStatus: 'AWAITING LINK',

    // UI-level state subscriptions
    feedStatus: { state: 'connecting' },

    // the two pools from the server, and the one currently shown (see poolUpdate)
    rawEvents: [],
    excludedFate: 'siphon',
    undoStack: [],
    adventures: [],
    mode: 'adventures',
    showShades: false,
    items: [],
    itemsById: {},
    selectedItemId: null,
    hoveredItemId: null,
    selectionSource: null,
    sources: {},
    actionError: null,
    filters: DEFAULT_FILTERS,
    draftFilters: DEFAULT_FILTERS,
    visibleItems: [],
    entities: [],
    selectedEntityId: null,
    transitions: [],
    flows: [],

    initWorkspace: async () => {
        try {
            const res = await fetch('/api/workspace');
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, layoutStatus: 'AETHER-SYNCED' });
        } catch (e) {
            set({ layoutStatus: 'OFFLINE MODE' });
        }
        // saved filters, loaded before the first pool arrives
        try {
            const [filters, draft] = await Promise.all([
                fetch('/api/state/filters').then((r) => r.json()),
                fetch('/api/state/filters_draft?or_null=true').then((r) => r.json()),
            ]);
            const applied = { ...DEFAULT_FILTERS, ...filters };
            set((state) => withVisible(state, {
                filters: applied,
                draftFilters: draft ? { ...DEFAULT_FILTERS, ...draft } : applied, // never saved: start equal
            }));
        } catch (err) {
            console.error('[state] could not load saved filters', err);
        }
        get().loadLayoutPresets();
        // items become past (and fall behind the Hermetic Seal) as time passes
        setInterval(() => set((state) => withVisible(state, {})), 60_000);
        startFeed(get);
        feed.start((feedStatus) => {
            // (re)connected: catch up on moves made while the socket was down
            if (feedStatus.state === 'online' && get().feedStatus.state !== 'online') get().loadTransitions();
            set({ feedStatus });
        });
    },

    // --- the transitions log (the Signal Chain's packets and pipe flows) ---

    loadTransitions: async () => {
        const last = get().transitions.at(-1)?.id;
        const [recent, flows] = await Promise.all([
            getJson(last == null ? '/api/transitions' : `/api/transitions?since_id=${last}`),
            getJson('/api/transitions/flows'),
        ]);
        if (recent) get().addTransitions(recent, { refreshFlows: false });
        if (flows) set({ flows });
    },

    addTransitions: (records, { refreshFlows = true } = {}) => {
        if (!records.length) return;
        set((state) => {
            const known = new Set(state.transitions.map((t) => t.id));
            const fresh = records.filter((t) => !known.has(t.id));
            if (!fresh.length) return {};
            const transitions = [...state.transitions, ...fresh].sort((a, b) => a.id - b.id).slice(-MAX_TRANSITIONS);
            return { transitions };
        });
        if (refreshFlows) {
            clearTimeout(flowsTimer);
            flowsTimer = setTimeout(async () => {
                const flows = await getJson('/api/transitions/flows');
                if (flows) set({ flows });
            }, FLOWS_REFRESH_MS);
        }
    },

    // --- events & sources ---

    setRawEvents: (records) =>
        set((state) => withVisible(state, { rawEvents: records, ...poolUpdate({ ...state, rawEvents: records }) })),

    setAdventures: (incoming) => {
        const records = withPendingRoadmaps(incoming);
        set((state) => withVisible(state, { adventures: records, ...poolUpdate({ ...state, adventures: records }) }));
    },

    setMode: (mode) =>
        set((state) => (state.mode === mode
            ? {}
            : withVisible(state, { mode, actionError: null, ...poolUpdate({ ...state, mode }) }))),

    selectFirstPrima: () => {
        const { rawEvents, itemsById } = get();
        const first = centrifugeOrder(rawEvents, itemsById)[0];
        if (first) get().selectItem(first, 'triage');
    },

    toggleShades: () =>
        set((state) => {
            const showShades = !state.showShades;
            return withVisible(state, { showShades, ...poolUpdate({ ...state, showShades }) });
        }),

    // --- filters ---
    // Facets and the Seal are edited in the Nexus as a draft (pending until passFilters).
    // Ranges (date, ring) and units apply immediately, to both the draft and the applied set.

    cycleFacet: (facet, value) => {
        set((state) => {
            const current = { ...(state.draftFilters.facets[facet] ?? {}) };
            const mode = nextMode(current[value]);
            if (mode) current[value] = mode;
            else delete current[value];
            const facets = { ...state.draftFilters.facets, [facet]: current };
            if (!Object.keys(current).length) delete facets[facet];
            return { draftFilters: { ...state.draftFilters, facets } };
        });
        saveDraft(get);
    },

    removeFacet: (facet, value) => {
        set((state) => {
            const current = { ...(state.draftFilters.facets[facet] ?? {}) };
            delete current[value];
            const facets = { ...state.draftFilters.facets, [facet]: current };
            if (!Object.keys(current).length) delete facets[facet];
            return { draftFilters: { ...state.draftFilters, facets } };
        });
        saveDraft(get);
    },

    toggleSeal: () => {
        set((state) => ({ draftFilters: { ...state.draftFilters, seal: !state.draftFilters.seal } }));
        saveDraft(get);
    },

    // In Discovery the centrifuge is narrowed too: the events the filters leave out are
    // siphoned back to their harvesters, or purged to the Sump (excludedFate), so filters
    // stack: each pass isolates further, and Feed brings everything back.
    // Once the transfer is done the filters are cleared (lens, Seal and units stay): what
    // they selected is now simply what's in the centrifuge. Undo brings both back.
    passFilters: async () => {
        const { mode, excludedFate, rawEvents, draftFilters, filters: before } = get();
        const excluded = mode === 'discovery' && excludedFate !== 'keep'
            ? excludedFromCentrifuge(rawEvents, draftFilters, Date.now()) : [];
        set((state) => withVisible(state, { filters: { ...state.draftFilters } }));
        saveApplied(get);
        if (!excluded.length) return;
        const siphon = excludedFate === 'siphon';
        const res = await callAction(set, siphon ? '/api/events/siphon' : '/api/events/purge', 'POST', { ids: excluded });
        if (!res) return;
        pushTransfer(set, res, {
            label: `${siphon ? 'Siphoned' : 'Purged'} ${res.moved} left out by the filters`,
            from: 'new', to: siphon ? 'harvested' : 'ignored',
            filters: { applied: before, draft: draftFilters },
        });
        set((state) => {
            const clear = (/** @type {FilterState} */ f) => ({ ...f, facets: {}, date_range: null, ring: null });
            return withVisible(state, { filters: clear(state.filters), draftFilters: clear(state.draftFilters) });
        });
        saveApplied(get); saveDraft(get);
    },

    // Step back through bulk transfers: the events still where the transfer put them go back
    // (any moved on since stay put), and a pass-through's filters return.
    undoTransfer: async () => {
        const t = get().undoStack.at(-1);
        if (!t) return;
        set((state) => ({ undoStack: state.undoStack.slice(0, -1) }));
        const res = await callAction(set, '/api/events/move', 'POST', { ids: t.ids, from_review: t.to, to_review: t.from });
        if (!res) { set((state) => ({ undoStack: [...state.undoStack, t] })); return; }
        if (t.filters) {
            set((state) => withVisible(state, {
                filters: { ...t.filters.applied, lens: state.filters.lens },
                draftFilters: { ...t.filters.draft, lens: state.draftFilters.lens },
            }));
            saveApplied(get); saveDraft(get);
        }
    },

    setExcludedFate: (fate) => set({ excludedFate: fate }),

    discardDraft: () => {
        set((state) => ({ draftFilters: { ...state.filters } }));
        saveDraft(get);
    },

    setLens: (lens) => {
        set((state) => (state.filters.lens === lens ? {} : {
            filters: { ...state.filters, lens },
            draftFilters: { ...state.draftFilters, lens },
        }));
        saveApplied(get); saveDraft(get);
    },

    // The twin's base rings: cycle one stage (phase or review) include -> exclude -> off,
    // applied at once (like the ranges), and mirrored into the draft.
    cycleStage: (facet, value) => {
        set((state) => {
            const current = { ...(state.filters.facets[facet] ?? {}) };
            const mode = nextMode(current[value]);
            if (mode) current[value] = mode;
            else delete current[value];
            const applied = { ...state.filters.facets, [facet]: current };
            if (!Object.keys(current).length) delete applied[facet];
            const draftCurrent = { ...(state.draftFilters.facets[facet] ?? {}) };
            if (mode) draftCurrent[value] = mode;
            else delete draftCurrent[value];
            const draft = { ...state.draftFilters.facets, [facet]: draftCurrent };
            if (!Object.keys(draftCurrent).length) delete draft[facet];
            return withVisible(state, {
                filters: { ...state.filters, facets: applied },
                draftFilters: { ...state.draftFilters, facets: draft },
            });
        });
        saveApplied(get); saveDraft(get);
    },

    setDateRange: (range) => {
        set((state) => withVisible(state, {
            filters: { ...state.filters, date_range: range },
            draftFilters: { ...state.draftFilters, date_range: range },
        }));
        saveApplied(get); saveDraft(get);
    },

    setRing: (ring) => {
        set((state) => withVisible(state, {
            filters: { ...state.filters, ring },
            draftFilters: { ...state.draftFilters, ring },
        }));
        saveApplied(get); saveDraft(get);
    },

    toggleRangeMode: (which) => {
        set((state) => {
            const range = state.filters[which];
            if (!range) return {};
            /** @type {FilterMode} */
            const mode = range.mode === 'include' ? 'exclude' : 'include';
            const next = { ...range, mode };
            return withVisible(state, {
                filters: { ...state.filters, [which]: next },
                draftFilters: { ...state.draftFilters, [which]: next },
            });
        });
        saveApplied(get); saveDraft(get);
    },

    setUnits: (units) => {
        set((state) => ({
            filters: { ...state.filters, units },
            draftFilters: { ...state.draftFilters, units },
        }));
        saveApplied(get); saveDraft(get);
    },

    // Back to no filters at once, applied and draft alike (the Seal back on); the lens and
    // units stay. Moves no matter: nothing is siphoned or purged.
    resetFilters: () => {
        set((state) => {
            const reset = (/** @type {FilterState} */ f) => ({ ...DEFAULT_FILTERS, lens: f.lens, units: f.units });
            return withVisible(state, { filters: reset(state.filters), draftFilters: reset(state.draftFilters) });
        });
        saveApplied(get); saveDraft(get);
    },

    // --- entities (the Codex) ---

    setEntities: (entities) => {
        setEntityNames(entities);
        set((state) => ({
            entities,
            selectedEntityId: entities.some((o) => o.id === state.selectedEntityId) ? state.selectedEntityId : null,
        }));
        // a ring anchored on a site follows it (moved), or lets go (deleted / no location)
        const ring = get().filters.ring;
        const siteId = ring?.center.site_id;
        if (ring && siteId) {
            const site = entities.find((o) => o.id === siteId);
            if (!site || site.lat == null || site.lon == null) {
                get().setRing({ ...ring, center: { ...ring.center, site_id: null } });
            } else if (site.lat !== ring.center.lat || site.lon !== ring.center.lon || site.name !== ring.center.label) {
                get().setRing({ ...ring, center: { lat: site.lat, lon: site.lon, label: site.name, site_id: site.id } });
            }
        }
    },

    anchorRingOnSite: (siteId) => {
        const site = get().entities.find((o) => o.id === siteId);
        if (!site || site.lat == null || site.lon == null) return;
        const ring = get().filters.ring;
        const radius_km = ring?.radius_km ?? DEFAULT_RING_RADIUS_KM;
        get().setRing({
            center: { lat: site.lat, lon: site.lon, label: site.name, site_id: site.id },
            radius_km,
            mode: ring?.mode ?? 'include',
        });
        // the Atlas frames the site and its ring
        set({ atlasFocus: { lat: site.lat, lon: site.lon, radius_km, at: Date.now() } });
    },

    atlasFocus: null,
    focusOnAtlas: (lat, lon) => {
        get().showPanel('map');
        set({ atlasFocus: { lat, lon, at: Date.now() } });
    },

    selectEntity: (entityId) => set({ selectedEntityId: entityId }),

    createEntity: async (type, fields = {}) => {
        const res = await sendJson('/api/entities', 'POST', { type, ...fields });
        if (typeof res === 'string') return res;
        const obj = /** @type {Entity} */ (res);
        if (!get().entities.some((o) => o.id === obj.id)) get().setEntities([...get().entities, obj]); // before the broadcast
        return obj;
    },

    updateEntity: async (entityId, changes) => {
        const res = await sendJson(`/api/entities/${entityId}`, 'PATCH', changes);
        if (typeof res === 'string') return res;
        get().setEntities(get().entities.map((o) => (o.id === entityId ? /** @type {Entity} */ (res) : o)));
        return null;
    },

    deleteEntity: async (entityId) => {
        const res = await sendJson(`/api/entities/${entityId}`, 'DELETE');
        return typeof res === 'string' ? res : null;
    },

    linkEntity: async (adventureId, entityId) => {
        const res = await sendJson(`/api/adventures/${adventureId}/entities/${entityId}`, 'PUT');
        return typeof res === 'string' ? res : null;
    },

    unlinkEntity: async (adventureId, entityId) => {
        const res = await sendJson(`/api/adventures/${adventureId}/entities/${entityId}`, 'DELETE');
        return typeof res === 'string' ? res : null;
    },

    selectItem: (id, source) => {
        if (id !== get().selectedItemId) set({ selectedItemId: id, selectionSource: id == null ? null : source, actionError: null });
        // clicking a card in a panel brings the Refinery up (reopened if it was closed)
        if (id != null && CARD_CLICK_SOURCES.has(source)) get().showPanel('node');
    },

    hoverItem: (id) => {
        if (id !== get().hoveredItemId) set({ hoveredItemId: id });
    },

    // --- triage & phases (the server broadcasts both pools after each change) ---

    passEvent: (eventId) =>
        actAndAdvance(get, eventId, () => callAction(set, `/api/events/${eventId}/pass`)),

    ignoreEvent: (eventId) =>
        actAndAdvance(get, eventId, () => callAction(set, `/api/events/${eventId}/ignore`)),

    reviveEvent: (eventId) =>
        actAndAdvance(get, eventId, () => callAction(set, `/api/events/${eventId}/revive`)),

    killAdventure: async (adventureId) => {
        if (!await callAction(set, `/api/adventures/${adventureId}/kill`)) return;
        const title = get().adventures.find((a) => a.id === adventureId)?.title ?? 'it';
        set({ epitaphPrompt: { adventureId, title, at: Date.now() } });
    },

    epitaphPrompt: null,
    dismissEpitaphPrompt: () => set({ epitaphPrompt: null }),

    saveEpitaph: async (adventureId, cause, note) => {
        const res = await sendJson(`/api/adventures/${adventureId}/epitaph`, 'PUT', { cause, note });
        return typeof res === 'string' ? res : null;
    },

    ambrosia: { balance: 0, entries: [], by_kind: {} },
    setAmbrosia: (ambrosia) => set({ ambrosia }),

    saveBounty: async (adventureId, bounty) => {
        const res = await sendJson(`/api/adventures/${adventureId}/bounty`, 'PUT', bounty ? { effort: bounty.effort, resistance: bounty.resistance, ratio: bounty.ratio } : undefined);
        return typeof res === 'string' ? res : null;
    },

    forgeModel: async (adventureId, text) => {
        const res = await sendJson(`/api/adventures/${adventureId}/forge`, 'POST', { text });
        return typeof res === 'string' ? res : null;
    },

    acceptModel: async (adventureId) => {
        const res = await sendJson(`/api/adventures/${adventureId}/forge/accept`, 'POST');
        return typeof res === 'string' ? res : null;
    },

    dismissModel: async (adventureId) => {
        const res = await sendJson(`/api/adventures/${adventureId}/forge`, 'DELETE');
        return typeof res === 'string' ? res : null;
    },

    saveItem: async (adventureId, changes) => {
        const res = await sendJson(`/api/adventures/${adventureId}/item`, 'PUT', changes);
        return typeof res === 'string' ? res : null;
    },

    saveEnshrining: async (adventureId, analysis, seal) => {
        const res = await sendJson(`/api/adventures/${adventureId}/enshrining`, 'PUT', { ...analysis, seal });
        return typeof res === 'string' ? res : /** @type {{ discovered: string[] }} */ (res);
    },

    abandonAdventure: async (adventureId) => {
        const res = await sendJson(`/api/adventures/${adventureId}`, 'DELETE');
        return typeof res === 'string' ? res : null;
    },

    clearEpitaph: async (adventureId) => {
        const res = await sendJson(`/api/adventures/${adventureId}/epitaph`, 'DELETE');
        return typeof res === 'string' ? res : null;
    },

    reviveAdventure: async (adventureId) => {
        await callAction(set, `/api/adventures/${adventureId}/revive`);
    },

    setPhase: async (adventureId, phase) => {
        await callAction(set, `/api/adventures/${adventureId}/phase`, 'PUT', { phase });
    },

    editingAdventureId: null,
    setEditingAdventure: (adventureId) => set({ editingAdventureId: adventureId }),

    createAdventure: async (type) => {
        set({ actionError: null });
        let record;
        try {
            const res = await fetch('/api/adventures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
            if (!res.ok) {
                const detail = (await res.json().catch(() => null))?.detail;
                set({ actionError: typeof detail === 'string' ? detail : `Not created (${res.status})` });
                return;
            }
            record = /** @type {AdventureRecord} */ (await res.json());
        } catch {
            set({ actionError: 'Server unreachable' });
            return;
        }
        // hand-made adventures live in the Adventures pool; don't wait for the broadcast
        get().setMode('adventures');
        const { adventures } = get();
        if (!adventures.some((a) => a.id === record.id)) get().setAdventures([...adventures, record]);
        set({ editingAdventureId: record.id });
        get().selectItem(record.id, 'create');
    },

    updateAdventure: async (adventureId, changes) => {
        try {
            const res = await fetch(`/api/adventures/${adventureId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes),
            });
            if (!res.ok) {
                const detail = (await res.json().catch(() => null))?.detail;
                if (typeof detail === 'string') return detail;
                if (Array.isArray(detail) && detail[0]?.msg) return `${detail[0].loc?.at(-1) ?? 'field'}: ${detail[0].msg}`;
                return `Not saved (${res.status})`;
            }
            const record = /** @type {AdventureRecord} */ (await res.json());
            get().setAdventures(get().adventures.map((a) => (a.id === record.id ? record : a)));
            return null;
        } catch {
            return 'Not saved: server unreachable';
        }
    },

    roadmapError: null,

    saveRoadmap: (adventureId, roadmap) => {
        const local = storedRoadmap(roadmap);
        pendingRoadmaps.set(adventureId, local);
        set((state) => {
            const adventures = state.adventures.map((a) => (a.id === adventureId ? { ...a, roadmap: local } : a));
            return withVisible(state, { adventures, roadmapError: null, ...poolUpdate({ ...state, adventures }) });
        });
        clearTimeout(roadmapTimers[adventureId]);
        roadmapTimers[adventureId] = setTimeout(async () => {
            delete roadmapTimers[adventureId];
            const sent = pendingRoadmaps.get(adventureId);
            let error = null;
            try {
                const res = await fetch(`/api/adventures/${adventureId}/roadmap`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sent ?? { actions: [], edges: [], done: [] }),
                });
                if (!res.ok) {
                    const detail = (await res.json().catch(() => null))?.detail;
                    error = typeof detail === 'string' ? detail : `Roadmap not saved (${res.status})`;
                }
            } catch {
                error = 'Roadmap not saved: server unreachable';
            }
            if (pendingRoadmaps.get(adventureId) !== sent) return; // edited again meanwhile: that save follows
            pendingRoadmaps.delete(adventureId);
            if (error) {
                set({ roadmapError: error });
                // fall back to what the server has
                fetch('/api/adventures').then((r) => r.json()).then((list) => get().setAdventures(list)).catch(() => {});
            }
        }, ROADMAP_SAVE_DEBOUNCE_MS);
    },

    setSourceStatus: (source) =>
        set((state) => ({ sources: { ...state.sources, [source.name]: source } })),

    syncSource: async (name) => {
        try {
            const res = await fetch(`/api/sources/${encodeURIComponent(name)}/sync`, { method: 'POST' });
            // 409 = already syncing, which is fine: status updates are on their way
            if (!res.ok && res.status !== 409) console.error(`[sync:${name}]`, res.status, await res.text());
        } catch (err) {
            console.error(`[sync:${name}] request failed`, err);
        }
    },

    feedSource: async (name) => {
        const res = await callAction(set, `/api/sources/${encodeURIComponent(name)}/feed`);
        pushTransfer(set, res, { label: `Fed ${res?.moved} from ${name}`, from: 'harvested', to: 'new', filters: null });
    },

    siphonSource: async (name) => {
        const res = await callAction(set, `/api/sources/${encodeURIComponent(name)}/siphon`);
        pushTransfer(set, res, { label: `Siphoned ${res?.moved} back to ${name}`, from: 'new', to: 'harvested', filters: null });
    },

    purgeCentrifuge: async () => {
        const res = await callAction(set, '/api/events/purge');
        pushTransfer(set, res, { label: `Purged ${res?.moved} to the Sump`, from: 'new', to: 'ignored', filters: null });
    },

    // Updates the tree immediately; the server PUT is debounced so rapid
    // changes collapse into one request and can't land out of order.
    persistLayout: (nextTree) => {
        set({ tree: nextTree, layoutStatus: 'INSCRIBING...' });
        clearTimeout(persistTimer);
        persistTimer = setTimeout(async () => {
            const sentTree = get().tree;
            try {
                await fetch('/api/workspace/layout', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tree: sentTree }),
                });
                // Only report synced if nothing changed while the request was in flight
                if (get().tree === sentTree) set({ layoutStatus: 'AETHER-SYNCED' });
            } catch (_) {
                set({ layoutStatus: 'LOCAL ONLY' });
            }
        }, PERSIST_DEBOUNCE_MS);
    },

    setDraggingPanel: (panelId) => set({ draggingPanelId: panelId }),

    // --- the panel in use (see panelInUse) ---
    focusGroup: (groupId) => {
        const popout = groupId.startsWith('popout:') ? /** @type {PanelId} */ (groupId.slice(7)) : null;
        if (popout) { if (get().focusedPopout !== popout) set({ focusedPopout: popout }); return; }
        if (get().focusedGroup !== groupId || get().focusedPopout) set({ focusedGroup: groupId, focusedPopout: null });
    },
    blurPopout: (panelId) => {
        if (get().focusedPopout === panelId) set({ focusedPopout: null });
    },

    // --- pop-out windows (components/Popout.js opens and closes the windows) ---
    popOut: (panelId) => {
        if (!get().poppedOut.includes(panelId)) set({ poppedOut: [...get().poppedOut, panelId] });
    },
    dockPopout: (panelId) => {
        if (get().poppedOut.includes(panelId)) set({ poppedOut: get().poppedOut.filter((id) => id !== panelId) });
    },

    resizeSplit: (splitId, ratio) => {
        const { tree } = get();
        if (!tree) return;
        const nextTree = updateSplitRatio(tree, splitId, ratio);
        if (nextTree !== tree) set({ tree: nextTree });
    },

    commitResize: () => {
        const { tree, persistLayout } = get();
        if (tree) persistLayout(tree);
    },

    selectTab: (leafId, panelId) => {
        const { tree, persistLayout } = get();
        if (!tree) return;
        const nextTree = updateActiveTab(tree, leafId, panelId);
        if (nextTree !== tree) persistLayout(nextTree);
    },

    dockPanel: (panelId, targetLeafId, zone) => {
        const currentTree = clone(get().tree);
        if (!currentTree || !panelId) return;
        const strippedTree = removePanelFromTree(currentTree, panelId);
        if (!strippedTree) {
            get().persistLayout({ id: 'leaf-root', type: 'leaf', tabs: [panelId], activeTab: panelId });
            return;
        }
        const nextTree = insertPanelAtTarget(strippedTree, targetLeafId, panelId, zone);
        get().persistLayout(nextTree);
    },

    closePanel: (panelId) => {
        get().dockPopout(panelId); // closing a popped-out panel closes its window
        const nextTree = removePanelFromTree(clone(get().tree), panelId);
        get().persistLayout(nextTree);
    },

    reopenPanel: (panelId) => {
        const currentTree = clone(get().tree);
        if (!currentTree) {
            get().persistLayout({ id: 'leaf-root', type: 'leaf', tabs: [panelId], activeTab: panelId });
            return;
        }
        const firstLeafId = findFirstLeafId(currentTree);
        const nextTree = insertPanelAtTarget(currentTree, firstLeafId, panelId, 'right');
        get().persistLayout(nextTree);
    },

    showPanel: (panelId) => {
        if (get().poppedOut.includes(panelId)) { popoutHooks.focus(panelId); return; }
        const leafId = findLeafWithPanel(get().tree, panelId);
        if (leafId) get().selectTab(leafId, panelId);
        else get().reopenPanel(panelId);
        // the panel just shown is the one in use
        const shown = findLeafWithPanel(get().tree, panelId);
        if (shown) get().focusGroup(shown);
    },

    // --- layout presets (the Layouts menu): saved on the server, survive restarts ---
    layoutPresets: [],
    loadLayoutPresets: async () => {
        const data = await getJson('/api/state/layout_presets');
        if (data && Array.isArray(data.presets)) set({ layoutPresets: data.presets });
    },
    /** @param {LayoutPreset[]} presets */
    _storeLayoutPresets: async (presets) => {
        set({ layoutPresets: presets });
        try {
            await fetch('/api/state/layout_presets', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presets }),
            });
        } catch (err) {
            console.error('[layouts] not saved', err);
        }
    },
    saveLayoutPreset: (name) => {
        const clean = name.trim().slice(0, 60);
        const { tree, layoutPresets } = get();
        if (!clean || !tree) return;
        const preset = { name: clean, tree: clone(tree) };
        const rest = layoutPresets.filter((p) => p.name !== clean); // same name: replaced
        get()._storeLayoutPresets([...rest, preset]);
    },
    deleteLayoutPreset: (name) => {
        get()._storeLayoutPresets(get().layoutPresets.filter((p) => p.name !== name));
    },
    applyLayoutPreset: (name) => {
        const preset = get().layoutPresets.find((p) => p.name === name);
        if (!preset) return;
        // panels that no longer exist are left out; windows come back into the dock
        /** @type {LayoutNode | null} */
        let tree = clone(preset.tree);
        for (const id of collectMountedPanels(tree)) if (!get().panels[id]) tree = removePanelFromTree(tree, id);
        set({ poppedOut: [] });
        get().persistLayout(tree);
    },

    resetWorkspace: async () => {
        clearTimeout(persistTimer); // a pending layout save must not overwrite the reset
        try {
            const res = await fetch('/api/workspace/reset', { method: 'POST' });
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, poppedOut: [], layoutStatus: 'RUNES RESTORED' });
        } catch (_) {}
    },
});

export const useWorkspaceStore = create(workspaceStore);
