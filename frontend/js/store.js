import { create } from 'zustand';
import * as feed from './feed.js';
import { indexItems, sameList } from './events.js';
import { DEFAULT_FILTERS, applyFilters, nextMode } from './filters.js';

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
    feed.on('source_status', (msg) => get().setSourceStatus(msg.source));
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
        if (res.ok) return true;
        const detail = (await res.json().catch(() => null))?.detail;
        set({ actionError: typeof detail === 'string' ? detail : `Request failed (${res.status})` });
    } catch {
        set({ actionError: 'Server unreachable' });
    }
    return false;
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
    layoutStatus: 'AWAITING LINK',

    // UI-level state subscriptions
    feedStatus: { state: 'connecting' },

    // the two pools from the server, and the one currently shown (see poolUpdate)
    rawEvents: [],
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
    places: [],

    initWorkspace: async () => {
        try {
            const res = await fetch('/api/workspace');
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, layoutStatus: 'AETHER-SYNCED' });
        } catch (e) {
            set({ layoutStatus: 'OFFLINE MODE' });
        }
        // saved filters and places, loaded before the first pool arrives
        try {
            const [filters, draft, places] = await Promise.all([
                fetch('/api/state/filters').then((r) => r.json()),
                fetch('/api/state/filters_draft?or_null=true').then((r) => r.json()),
                fetch('/api/state/places').then((r) => r.json()),
            ]);
            const applied = { ...DEFAULT_FILTERS, ...filters };
            set((state) => withVisible(state, {
                filters: applied,
                draftFilters: draft ? { ...DEFAULT_FILTERS, ...draft } : applied, // never saved: start equal
                places: places.places ?? [],
            }));
        } catch (err) {
            console.error('[state] could not load saved filters/places', err);
        }
        // items become past (and fall behind the Hermetic Seal) as time passes
        setInterval(() => set((state) => withVisible(state, {})), 60_000);
        startFeed(get);
        feed.start((feedStatus) => set({ feedStatus }));
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

    passFilters: () => {
        set((state) => withVisible(state, { filters: { ...state.draftFilters } }));
        saveApplied(get);
    },

    discardDraft: () => {
        set((state) => ({ draftFilters: { ...state.filters } }));
        saveDraft(get);
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

    clearFilters: () => {
        // facets go pending (draft); ranges clear immediately everywhere
        set((state) => withVisible(state, {
            filters: { ...state.filters, date_range: null, ring: null },
            draftFilters: { ...state.draftFilters, facets: {}, date_range: null, ring: null },
        }));
        saveApplied(get); saveDraft(get);
    },

    savePlace: (label, lat, lon) => {
        const place = { id: `place-${Date.now().toString(36)}`, label: label.trim().slice(0, 100) || 'Place', lat, lon };
        set((state) => ({ places: [...state.places, place] }));
        saveState('places', { places: get().places });
    },

    deletePlace: (id) => {
        set((state) => ({ places: state.places.filter((p) => p.id !== id) }));
        saveState('places', { places: get().places });
    },

    selectItem: (id, source) => {
        if (id === get().selectedItemId) return;
        set({ selectedItemId: id, selectionSource: id == null ? null : source, actionError: null });
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
        await callAction(set, `/api/adventures/${adventureId}/kill`);
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
        const leafId = findLeafWithPanel(get().tree, panelId);
        if (leafId) get().selectTab(leafId, panelId);
        else get().reopenPanel(panelId);
    },

    resetWorkspace: async () => {
        clearTimeout(persistTimer); // a pending layout save must not overwrite the reset
        try {
            const res = await fetch('/api/workspace/reset', { method: 'POST' });
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, layoutStatus: 'RUNES RESTORED' });
        } catch (_) {}
    },
});

export const useWorkspaceStore = create(workspaceStore);
