import { create } from 'zustand';

// --- Pure Tree Helpers ---
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function updateSplitRatio(node, nodeId, newRatio) {
    if (!node) return node;
    if (node.id === nodeId && node.type === 'split') {
        return { ...node, ratio: Math.max(12, Math.min(88, newRatio)) };
    }
    if (node.type === 'split') {
        return {
            ...node,
            first: updateSplitRatio(node.first, nodeId, newRatio),
            second: updateSplitRatio(node.second, nodeId, newRatio),
        };
    }
    return node;
}

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

function insertPanelAtTarget(node, targetLeafId, panelId, zone) {
    if (!node) return null;
    if (node.type === 'leaf' && node.id === targetLeafId) {
        if (zone === 'center') {
            const tabs = node.tabs.includes(panelId) ? node.tabs : [...node.tabs, panelId];
            return { ...node, tabs, activeTab: panelId };
        }
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

function collectMountedPanels(node, out = new Set()) {
    if (!node) return out;
    if (node.type === 'leaf') node.tabs.forEach((t) => out.add(t));
    if (node.type === 'split') {
        collectMountedPanels(node.first, out);
        collectMountedPanels(node.second, out);
    }
    return out;
}

function findFirstLeafId(node) {
    if (!node) return null;
    if (node.type === 'leaf') return node.id;
    return findFirstLeafId(node.first) || findFirstLeafId(node.second);
}

// Global telemetry buffer for decoupled 60 FPS canvas consumption
window.rawTelemetry = {
    sweepAngle: 0,
    aetherFlux: 88.4,
    entities: [
        { id: "VALKYRIE-01", name: "Seraphim Cyber-Knight", faction: "AETHER-CORP", mana: 92, x: 0.5, y: 0.5, color: "#00f0ff" },
        { id: "WRAITH-09", name: "Void Netrunner", faction: "SHADOW-SYNTH", mana: 74, x: 0.4, y: 0.6, color: "#ff2a85" },
        { id: "ARCHON-04", name: "Chrono-Weaver", faction: "SOLARIS-ORDER", mana: 85, x: 0.6, y: 0.4, color: "#f59e0b" },
        { id: "DRACONIC-X", name: "Elder AI Node", faction: "ABYSSAL-NET", mana: 99, x: 0.55, y: 0.65, color: "#a855f7" }
    ],
    spectrum: [50, 65, 80, 45, 90, 70, 60, 85, 40, 75, 95, 55]
};

export const useWorkspaceStore = create((set, get) => ({
    panels: {},
    tree: null,
    draggingPanelId: null,
    syncStatus: 'AWAITING LINK',

    // UI-level state subscriptions
    wsConnected: false,
    selectedEntityId: 'VALKYRIE-01',
    mapFilterIds: {},

    setSelectedEntity: (entityId) => set({ selectedEntityId: entityId }),

    togglePanelMapMode: (panelId) =>
        set((state) => ({
            mapFilterIds: {
                ...state.mapFilterIds,
                [panelId]: !state.mapFilterIds[panelId],
            },
        })),

    initWorkspace: async () => {
        try {
            const res = await fetch('/api/workspace');
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, syncStatus: 'AETHER-SYNCED' });
        } catch (e) {
            set({ syncStatus: 'OFFLINE MODE' });
        }
        get().connectTelemetrySocket();
    },

    connectTelemetrySocket: () => {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);

        ws.onopen = () => set({ wsConnected: true });
        ws.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                // Zero React re-renders: update non-reactive ref directly
                window.rawTelemetry = packet;
            } catch (_) {}
        };
        ws.onclose = () => {
            set({ wsConnected: false });
            setTimeout(() => get().connectTelemetrySocket(), 2000);
        };
    },

    persistLayout: async (nextTree) => {
        set({ tree: nextTree, syncStatus: 'INSCRIBING...' });
        try {
            await fetch('/api/workspace/layout', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: nextTree }),
            });
            set({ syncStatus: 'AETHER-SYNCED' });
        } catch (_) {
            set({ syncStatus: 'LOCAL ONLY' });
        }
    },

    setDraggingPanel: (panelId) => set({ draggingPanelId: panelId }),

    resizeSplit: (splitId, ratio) => {
        const nextTree = updateSplitRatio(get().tree, splitId, ratio);
        set({ tree: nextTree });
    },

    commitResize: () => {
        const { tree, persistLayout } = get();
        if (tree) persistLayout(tree);
    },

    selectTab: (leafId, panelId) => {
        const walk = (node) => {
            if (!node) return node;
            if (node.type === 'leaf' && node.id === leafId) {
                return { ...node, activeTab: panelId };
            }
            if (node.type === 'split') {
                return { ...node, first: walk(node.first), second: walk(node.second) };
            }
            return node;
        };
        get().persistLayout(walk(get().tree));
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
        try {
            const res = await fetch('/api/workspace/reset', { method: 'POST' });
            const data = await res.json();
            set({ panels: data.panels, tree: data.tree, syncStatus: 'RUNES RESTORED' });
        } catch (_) {}
    },

    getUnmountedPanels: () => {
        const { panels, tree } = get();
        const mounted = collectMountedPanels(tree);
        return Object.keys(panels).filter((id) => !mounted.has(id));
    }
}));