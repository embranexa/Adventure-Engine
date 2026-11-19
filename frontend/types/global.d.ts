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

/** Which component renders a panel (frontend/js/components/panels/index.js). */
type PanelKind = 'node' | 'calendar';

interface PanelMeta {
    id: PanelId;
    title: string;
    category: string;
    status: string;
    kind: PanelKind;
}

// --- crawled events (shapes from backend/db/queries.py) ---

/** One event as sent by the server. Times are ISO 8601 strings with a UTC offset. */
interface EventRecord {
    id: string;
    source: string;
    api_id: string;
    title: string;
    start: string;
    end: string | null;
    /** IANA zone the event happens in, e.g. America/Los_Angeles. */
    timezone: string | null;
    url: string;
    venue: string | null;
    /** null when the source hides the exact location. */
    address: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
    location_approximate: boolean;
    cover_url: string | null;
    /** Source-specific extras (price, hosts, guest count, ...). */
    details: Record<string, unknown>;
}

/** An event in the store: the server record plus a stable display color. */
interface EventItem extends EventRecord {
    color: string;
}

interface SourceStatus {
    name: string;
    url: string;
    status: 'idle' | 'syncing' | 'failed';
    last_sync_time: string | null;
    last_error: string | null;
}

// --- WebSocket feed (types from backend/services/hub.py) ---

interface FeedMessages {
    events: { type: 'events'; events: EventRecord[] };
    source_status: { type: 'source_status'; source: SourceStatus };
}

type FeedMessage = FeedMessages[keyof FeedMessages];

interface FeedStatus {
    /** reconnecting = connecting again after a drop; retrying = waiting before the next attempt. */
    state: 'connecting' | 'online' | 'reconnecting' | 'retrying' | 'offline';
    retryInMs?: number;
}

/** Which view made a selection ('map', 'calendar', ...), so a view can ignore its own changes. */
type SelectionSource = string;

interface WorkspaceState {
    panels: Record<PanelId, PanelMeta>;
    /** null when every panel has been closed. */
    tree: LayoutNode | null;
    draggingPanelId: PanelId | null;
    /** Whether the dock layout is saved to the server. */
    layoutStatus: string;
    feedStatus: FeedStatus;

    /** Sorted by start time (server order). */
    events: EventItem[];
    eventsById: Record<string, EventItem>;
    selectedEventId: string | null;
    hoveredEventId: string | null;
    /** Who made the current selection; null when nothing is selected. */
    selectionSource: SelectionSource | null;
    sources: Record<string, SourceStatus>;

    initWorkspace(): Promise<void>;
    persistLayout(nextTree: LayoutNode | null): void;
    setDraggingPanel(panelId: PanelId | null): void;
    resizeSplit(splitId: string, ratio: number): void;
    commitResize(): void;
    selectTab(leafId: string, panelId: PanelId): void;
    dockPanel(panelId: PanelId, targetLeafId: string, zone: DropZone): void;
    closePanel(panelId: PanelId): void;
    reopenPanel(panelId: PanelId): void;
    resetWorkspace(): Promise<void>;

    /** Replace the event list (from an `events` message); drops a selection/hover whose event is gone. */
    setEvents(records: EventRecord[]): void;
    selectEvent(id: string | null, source: SelectionSource): void;
    hoverEvent(id: string | null): void;
    setSourceStatus(source: SourceStatus): void;
    /** Ask the server to crawl a source; progress arrives as source_status messages. */
    syncSource(name: string): Promise<void>;
}
