// Editor-only type definitions. The browser never loads this file; VS Code reads it
// (via frontend/jsconfig.json) to type-check the plain JS in frontend/js/.
// Types here are global, so JSDoc can use them directly: /** @param {LayoutNode} node */

type PanelId = string;
type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center';

interface LeafNode {
    id: string;
    type: 'leaf';
    tabs: PanelId[];
    activeTab: PanelId;
}

interface SplitNode {
    id: string;
    type: 'split';
    direction: 'horizontal' | 'vertical';
    /** Size of `first` as a percentage (clamped to 12–88). */
    ratio: number;
    first: LayoutNode;
    second: LayoutNode;
}

type LayoutNode = LeafNode | SplitNode;

interface PanelMeta {
    id: PanelId;
    title: string;
    category: string;
    status: string;
}

interface Entity {
    id: string;
    name: string;
    faction: string;
    mana: number;
    /** Normalized map position, 0–1. */
    x: number;
    y: number;
    color: string;
}

/** One message from the /api/ws telemetry socket. */
interface TelemetryPacket {
    timestamp?: number;
    aetherFlux: number;
    entities: Entity[];
}

interface WorkspaceState {
    panels: Record<PanelId, PanelMeta>;
    /** null when every panel has been closed. */
    tree: LayoutNode | null;
    draggingPanelId: PanelId | null;
    syncStatus: string;
    wsConnected: boolean;
    selectedEntityId: string;
    /** Per-panel map/HUD override; panels without an entry use their default. */
    mapModes: Record<PanelId, boolean>;

    setSelectedEntity(entityId: string): void;
    togglePanelMapMode(panelId: PanelId): void;
    initWorkspace(): Promise<void>;
    connectTelemetrySocket(): void;
    persistLayout(nextTree: LayoutNode | null): void;
    setDraggingPanel(panelId: PanelId | null): void;
    resizeSplit(splitId: string, ratio: number): void;
    commitResize(): void;
    selectTab(leafId: string, panelId: PanelId): void;
    dockPanel(panelId: PanelId, targetLeafId: string, zone: DropZone): void;
    closePanel(panelId: PanelId): void;
    reopenPanel(panelId: PanelId): void;
    resetWorkspace(): Promise<void>;
}
