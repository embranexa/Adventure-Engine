import { create } from 'zustand';
import * as feed from './feed.js';
import { indexEvents, sameList } from './events.js';

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
    feed.on('events', (msg) => get().setEvents(msg.events));
    feed.on('source_status', (msg) => get().setSourceStatus(msg.source));
}

/** @type {import('zustand').StateCreator<WorkspaceState>} */
const workspaceStore = (set, get) => ({
    panels: {},
    tree: null,
    draggingPanelId: null,
    layoutStatus: 'AWAITING LINK',

    // UI-level state subscriptions
    feedStatus: { state: 'connecting' },

    // crawled events + shared selection (every event view reads these)
    events: [],
    eventsById: {},
    selectedEventId: null,
    hoveredEventId: null,
    selectionSource: null,
    sources: {},

    initWorkspace: async () => {
        try {
            const res = await fetch('/api/workspace');
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, layoutStatus: 'AETHER-SYNCED' });
        } catch (e) {
            set({ layoutStatus: 'OFFLINE MODE' });
        }
        startFeed(get);
        feed.start((feedStatus) => set({ feedStatus }));
    },

    // --- events & sources ---

    setEvents: (records) => {
        const { events, eventsById, selectedEventId, hoveredEventId } = get();
        const next = indexEvents(records, eventsById);
        if (sameList(next.events, events)) return; // identical broadcast: nothing re-renders
        /** @type {Partial<WorkspaceState>} */
        const update = { ...next };
        if (selectedEventId != null && !next.eventsById[selectedEventId]) {
            update.selectedEventId = null;
            update.selectionSource = null;
        }
        if (hoveredEventId != null && !next.eventsById[hoveredEventId]) update.hoveredEventId = null;
        set(update);
    },

    selectEvent: (id, source) => {
        if (id === get().selectedEventId) return;
        set({ selectedEventId: id, selectionSource: id == null ? null : source });
    },

    hoverEvent: (id) => {
        if (id !== get().hoveredEventId) set({ hoveredEventId: id });
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
