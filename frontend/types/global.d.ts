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
type PanelKind = 'node' | 'calendar' | 'map' | 'filters';

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
    review: ReviewState;
}

// --- the refinery (stored values; display names in js/lifecycle.js) ---

/** Raw event review: new (omen, Sensorium) | passed (became an adventure) | ignored (shade, Limbo). */
type ReviewState = 'new' | 'passed' | 'ignored';

/** Adventure phase: Hopper, Assay, Alembic, Crucible, Arena, Treasury, Necropolis, Archive. */
type Phase =
    | 'queued' | 'classifying' | 'decomposing' | 'constructing'
    | 'consuming' | 'completed' | 'killed' | 'decommissioned';

/**
 * An adventure as sent by the server: its linked raw event's fields (read through) plus
 * its own. `id` is the adventure's id; the raw event's is `event_id`. Adventures without
 * an event (made by hand, later) have null event fields.
 */
interface AdventureRecord extends Omit<EventRecord, 'source' | 'api_id' | 'start' | 'url' | 'review'> {
    source: string | null;
    api_id: string | null;
    start: string | null;
    url: string | null;
    review: ReviewState | null;
    event_id: string | null;
    type: string;
    phase: Phase;
    phase_before_kill: Phase | null;
    stats: Record<string, unknown>;
}

/** Something in the current pool: an omen (Discovery mode) or an adventure. */
type PoolRecord =
    | (EventRecord & { kind: 'omen'; event_id?: undefined; phase?: undefined })
    | (AdventureRecord & { kind: 'adventure' });

/** A pool record in the store, plus a stable display color. */
type PoolItem = PoolRecord & { color: string };

/** adventures = normal use; discovery = reviewing raw events (the Augur). */
type PoolMode = 'adventures' | 'discovery';

// --- filters (logic in js/filters.js; persisted via /api/state/filters) ---

type FilterMode = 'include' | 'exclude';
type FacetKey = 'source' | 'city' | 'registration' | 'phase' | 'review';

/** Local calendar days, inclusive. */
interface DateRange { start: string; end: string; mode: FilterMode }

interface Ring {
    center: { lat: number; lon: number; label?: string | null };
    radius_km: number;
    mode: FilterMode;
}

interface FilterState {
    /** facet -> { value: include | exclude }; values not listed are off. */
    facets: Partial<Record<FacetKey, Record<string, FilterMode>>>;
    date_range: DateRange | null;
    ring: Ring | null;
    /** Hermetic Seal: hide past / Treasury / Necropolis / Archive (Adventures mode). */
    seal: boolean;
    units: 'mi' | 'km';
}

interface SavedPlace { id: string; label: string; lat: number; lon: number }

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
    adventures: { type: 'adventures'; adventures: AdventureRecord[] };
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

    /** Every raw event (all review states), as last sent by the server. */
    rawEvents: EventRecord[];
    adventures: AdventureRecord[];
    mode: PoolMode;
    /** Discovery mode: also show ignored raw events (shades), so they can be revived. */
    showShades: boolean;

    /** The current pool (depends on mode), sorted by start time. Every view shows this. */
    items: PoolItem[];
    itemsById: Record<string, PoolItem>;
    selectedItemId: string | null;
    hoveredItemId: string | null;
    /** Who made the current selection; null when nothing is selected. */
    selectionSource: SelectionSource | null;
    sources: Record<string, SourceStatus>;
    /** Last triage/phase action error, shown in the node card; cleared by the next action. */
    actionError: string | null;

    filters: FilterState;
    /** The pool after filtering: what the calendar and map show. */
    visibleItems: PoolItem[];
    places: SavedPlace[];

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

    /** From an `events` message. */
    setRawEvents(records: EventRecord[]): void;
    /** From an `adventures` message. */
    setAdventures(records: AdventureRecord[]): void;
    setMode(mode: PoolMode): void;
    toggleShades(): void;
    selectItem(id: string | null, source: SelectionSource): void;
    hoverItem(id: string | null): void;

    // triage (raw events) and phases (adventures); the server broadcasts the result
    passEvent(eventId: string): Promise<void>;
    ignoreEvent(eventId: string): Promise<void>;
    reviveEvent(eventId: string): Promise<void>;
    killAdventure(adventureId: string): Promise<void>;
    reviveAdventure(adventureId: string): Promise<void>;
    setPhase(adventureId: string, phase: Phase): Promise<void>;

    // filters (saved to the server, debounced)
    /** Cycle one facet value: off -> include -> exclude -> off. */
    cycleFacet(facet: FacetKey, value: string): void;
    setDateRange(range: DateRange | null): void;
    setRing(ring: Ring | null): void;
    /** Flip a range filter between include and exclude. */
    toggleRangeMode(which: 'date_range' | 'ring'): void;
    toggleSeal(): void;
    setUnits(units: 'mi' | 'km'): void;
    /** Clear every filter except the Seal and units. */
    clearFilters(): void;
    savePlace(label: string, lat: number, lon: number): void;
    deletePlace(id: string): void;
    setSourceStatus(source: SourceStatus): void;
    /** Ask the server to crawl a source; progress arrives as source_status messages. */
    syncSource(name: string): Promise<void>;
}
