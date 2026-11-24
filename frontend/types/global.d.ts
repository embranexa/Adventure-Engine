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
type PanelKind = 'node' | 'calendar' | 'map' | 'classifier' | 'alembic' | 'scripter' | 'quests' | 'codex' | 'twin' | 'ledger' | 'necropolis' | 'treasury' | 'inventory' | 'agora' | 'complex' | 'arena' | 'cohort';

/** Icon names drawn by components/PanelTitle.js. */
type PanelIcon = 'eye' | 'flask' | 'compass' | 'clock' | 'alembic' | 'quill' | 'scroll' | 'codex' | 'gear' | 'ledger' | 'tomb' | 'crown' | 'satchel' | 'amphora' | 'molecule' | 'swords' | 'cohort';

/** A panel's definition (backend/services/workspace.py). Its title reads:
 *  [icon] NAME / QUESTION · INPUT ⟶ OUTPUT */
interface PanelMeta {
    id: PanelId;
    kind: PanelKind;
    icon: PanelIcon;
    name: string;
    question: string;
    flow: [string, string];
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
    /** Whole days: start/end are the first and last day's local midnights (lib/occurrences.js). */
    all_day: boolean | null;
    /** Repeats weekly; start/end are the first occurrence. Crawled events never do. */
    recurrence: Recurrence | null;
}

/** A saved dock arrangement. */
interface LayoutPreset { name: string; tree: LayoutNode }

/** A weekly rule: weekdays (Monday = 0 ... Sunday = 6), until a day (inclusive) or forever. */
interface Recurrence {
    freq: 'weekly';
    days: number[];
    until: string | null;
}

// --- the refinery (stored values; display names in js/lifecycle.js) ---

/**
 * Raw event review: harvested (flux, in its Harvester) | new (prima materia, in the Centrifuge)
 * | passed (became an adventure) | ignored (dross, in the Sump).
 */
type ReviewState = 'harvested' | 'new' | 'passed' | 'ignored';

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
    type: AdventureType;
    description: string | null;
    /** The adventure's own values (set by hand), which win over its event's; null = not set.
     *  On a hand-made adventure (no event_id) they're all there is. */
    own: AdventureOwnFields;
    phase: Phase;
    phase_before_kill: Phase | null;
    /** When it last changed phase (for a killed one: when it died). */
    phase_changed_at: string | null;
    /** Why it died, if written; kept through a revive, so only meaningful while killed. */
    /** What it's worth in ambrosia; null without a bounty. */
    bounty: { effort: number; resistance: number; ratio: number; locked_at: string | null;
        total: number; action_share: number; paid_actions: number; paid_seal: number } | null;
    /** Its sheet (the Inventory): items only. */
    item: ItemSheet | null;
    /** Its analysis (the Treasury): a draft until sealed. */
    enshrining: (Omit<Analysis, 'link' | 'moves'> & { link: string | null; moves: (Omit<AnalysisMove, 'better'> & { better: string | null })[];
        sealed_at: string | null; amended_at: string | null }) | null;
    epitaph: { cause: EpitaphCause; note: string | null } | null;
    stats: Record<string, unknown>;
    /** Set by hand (js/lifecycle.js ADVENTURE_FLAGS). */
    flags: AdventureFlag[];
    /** Action roadmap (Alembic), or null before one is drafted. */
    roadmap: Roadmap | null;
    /** Linked entities (the Codex). */
    entities: LinkedEntity[];
    /** Heralds and commissioners; wardens are its site's. */
    stewards: { id: string; type: EntityType; name: string; role: 'herald' | 'commissioner' }[];
    /** Someone is bonded, emergent or in the aftermath. */
    collaboration: boolean;
    /** Its linked site, if any; a hand-made event takes its where from it. */
    site_id: string | null;
    objectives: Objective[];
    preparations: Preparation[];
    /** Battles only. */
    adversaries: Adversary[];
    /** Free text for now (the Agora later). */
    costs: string | null;
    rewards: string | null;
}

interface AmbrosiaLedger {
    balance: number;
    entries: { id: number; at: string; adventure_id: string; kind: 'action' | 'enshrined' | 'reversal'; amount: number; label: string; balance: number }[];
    by_kind: Record<string, number>;
}

/** A part of a model recipe (backend/services/items.py checks it; lib/cabinet/recipe.js draws it). */
interface ModelPart {
    name: string; shape: string; mat: string; on: boolean; k: number;
    /** the roadmap action that makes it */
    act?: string | null;
    [size: string]: unknown;
}
/** A buff (or debuff) to a skill, rated 1 to 3 (or -1 to -3). */
interface ItemEffect { skill: string; rating: number; text: string }
interface Objective { id: string; text: string; kind: 'primary' | 'bonus'; state: 'open' | 'achieved' | 'failed' }
/** Something readied: an owned item of the gear set, or free text with its own effects. */
interface Preparation { id: string; item: string | null; text: string; checked: boolean; effects: ItemEffect[] }
interface Adversary { entity_id: string | null; name: string }
/** An effect judged after the fact; keys of ones added by hand start with "own:". */
interface FeedbackRow { key: string; label: string; skill: string | null; rating: number; result: 'helped' | 'none' | 'hurt' | null }
/** An action laid on the anvil. */
interface Pin { adventure: string; action: string }
/** What you wrote about an archetype; null description: the built-in one. */
interface IdolNotes { description: string | null; skills: string[] }
interface ItemSheet { purpose: string; effects: ItemEffect[]; model: ModelPart[] | null; forge: ForgeState | null }
/** Claude's work on an item's model (backend/services/forge.py). */
interface ForgeState { status: 'forging' | 'ready' | 'failed'; text: string; at: string; proposal: ModelPart[] | null; error?: string | null }

/** How a move is graded (js/lib/analysis.js GRADES). */
type MoveGrade = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'forced' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';
interface AnalysisMove { text: string; grade: MoveGrade; better: string; /** a spell entity's id */ spell: string | null; /** skill entity ids */ skills: string[] }
interface AnalysisLine { name: string; qty: string; unit: string }
interface Discovery { type: EntityType; name: string; entity_id: string | null }
/** A completed adventure's analysis, as edited. */
interface Analysis {
    /** [outcome 0 defeat..2 success, thrill 0 boring..2 exciting] */
    verdict: [number, number] | null;
    link: string;
    notes: string;
    gains: AnalysisLine[];
    losses: AnalysisLine[];
    discoveries: Discovery[];
    moves: AnalysisMove[];
    feedback: FeedbackRow[];
}

/** Why an adventure died (js/lifecycle.js EPITAPH_CAUSES). */
type EpitaphCause = 'lost_interest' | 'no_time' | 'too_costly' | 'blocked' | 'superseded' | 'outside_control' | 'missed';

/** event | item | performance | battle; items have no when/where (js/lifecycle.js ADVENTURE_TYPES). */
type AdventureType = 'event' | 'item' | 'performance' | 'battle';

/** Fields an adventure can set itself (backend/services/adventures.py). */
interface AdventureOwnFields {
    title: string | null;
    description: string | null;
    url: string | null;
    cover_url: string | null;
    start: string | null;
    end: string | null;
    timezone: string | null;
    all_day: boolean | null;
    recurrence: Recurrence | null;
    venue: string | null;
    address: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
}

/** A change sent to PATCH /api/adventures/{id}: only the keys present change; null clears. */
type AdventureChanges = Partial<{
    type: AdventureType; title: string | null; description: string | null; url: string | null;
    cover_url: string | null; start_time: string | null; end_time: string | null; timezone: string | null;
    venue: string | null; address: string | null; city: string | null; lat: number | null; lon: number | null;
    all_day: boolean | null; recurrence: { days: number[]; until: string | null } | null;
    costs: string | null; rewards: string | null; flags: AdventureFlag[];
    objectives: Objective[]; preparations: Preparation[]; adversaries: Adversary[];
}>;

/** An adventure's action roadmap: a dependency graph (backend/services/roadmap.py). */
interface Roadmap {
    /** notes: optional free text per action (the Alembic's action bar; shown in the Crucible). */
    actions: { id: string; title: string; notes?: string }[];
    /** [a, b]: a must be done before b. */
    edges: [string, string][];
    /** Ids of completed actions. */
    done: string[];
}

/** Something in the current pool: a raw event (kind 'omen', Discovery mode) or an adventure. */
type PoolRecord =
    | (EventRecord & { kind: 'omen'; event_id?: undefined; phase?: undefined })
    | (AdventureRecord & { kind: 'adventure' });

/** A pool record in the store, plus a stable display color. */
type PoolItem = PoolRecord & { color: string };

/** adventures = normal use; discovery = reviewing raw events in the Centrifuge. */
type PoolMode = 'adventures' | 'discovery';

// --- filters (logic in js/filters.js; persisted via /api/state/filters) ---

type FilterMode = 'include' | 'exclude';
/** A bulk transfer of raw events (feed, siphon, purge, a pass-through's), for undo. */
interface TransferRecord {
    label: string;
    ids: string[];
    from: 'harvested' | 'new' | 'ignored';
    to: 'harvested' | 'new' | 'ignored';
    /** Filters before a pass-through (which clears them); restored on undo. */
    filters: { applied: FilterState; draft: FilterState } | null;
    at: number;
}

/** siphon: back to their harvesters · purge: to the Sump · keep: stay in the centrifuge */
type ExcludedFate = 'siphon' | 'purge' | 'keep';

type AdventureFlag = 'important' | 'urgent' | 'favorite' | 'maybe' | 'waiting';

type FacetKey = 'source' | 'tag' | 'city' | 'region' | 'metro' | 'flag' | 'collaboration' | 'type' | 'phase' | 'review';

/** Local calendar days, inclusive. */
interface DateRange { start: string; end: string; mode: FilterMode }

interface Ring {
    /** site_id: set when the ring is anchored on a site (the Atlas). */
    center: { lat: number; lon: number; label?: string | null; site_id?: string | null };
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
    /** What colors the matter (applies at once, never pending). See js/lib/lens.js. */
    lens: LensKey;
}

/** "stage" (Matter) or a facet that can color rows. */
type LensKey = 'none' | 'stage' | 'source' | 'tag' | 'city' | 'region' | 'metro' | 'flag' | 'collaboration' | 'type' | 'deity' | 'site' | 'player' | 'organization' | 'skill' | 'spell';

/** One move between signal chain nodes (backend/services/transitions.py). */
interface TransitionRecord {
    id: number;
    at: string;
    /** event (row_id = event id) | adventure (row_id = adventure id) | link (row_id = entity id, ref_id = adventure id) */
    subject: 'event' | 'adventure' | 'link';
    row_id: string;
    ref_id: string | null;
    from: string;
    to: string;
}

/** Packets along one edge over the flows window (GET /api/transitions/flows). */
interface FlowRecord {
    from: string;
    to: string;
    count: number;
}

/** deity | site | player | organization | skill (js/lifecycle.js ENTITY_TYPES); only sites have a location. */
type EntityType = 'deity' | 'site' | 'player' | 'organization' | 'skill' | 'spell';

/** ids in js/lifecycle.js ARCHETYPES */
type Archetype = 'vanguard' | 'performer' | 'enchanter' | 'juggernaut' | 'rogue' | 'summoner' | 'resonator' | 'merchant' | 'artificer' | 'wizard' | 'cleric' | 'patron';
interface PlayerDetails { email?: string; phone?: string; handle?: string; archetype?: Archetype; warmth?: number; tags?: string[] }
type PartyStatus = 'resonant' | 'charging' | 'attuning' | 'resisted' | 'bonded' | 'emergent' | 'annealed' | 'neutralized' | 'repelled';
type StewardRole = 'herald' | 'commissioner' | 'warden';
/** An entity linked to an adventure; a player's link is its place in the party. */
interface LinkedEntity { id: string; type: EntityType; name: string; status?: PartyStatus; status_at?: string | null; role?: string | null; note?: string | null; impact?: string | null; follow_up?: string | null }
interface PartyLogEntry { id: number; at: string; player_id: string; from: PartyStatus | null; to: PartyStatus | null }

/** An entity (the Codex): something adventures link to (backend/services/entities.py). */
interface Entity {
    id: string;
    type: EntityType;
    name: string;
    description: string | null;
    url: string | null;
    /** sites only */
    address: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
    /** players only */
    details: PlayerDetails;
    /** players: ids of what it resonates with */
    affinities: string[];
    /** spells: ids of the skills they're cast with */
    skills: string[];
    /** sites: ids of the players and organizations that keep it */
    wardens: string[];
    /** "#rrggbb" chosen in the Codex; null = default (entityColor in lib/lens.js) */
    color: string | null;
    created_at: string;
}

/** A change sent to PATCH /api/entities/{id}: only the keys present change; null clears. */
type EntityChanges = Partial<{
    name: string | null; description: string | null; url: string | null; address: string | null;
    city: string | null; lat: number | null; lon: number | null; details: { [K in keyof PlayerDetails]: PlayerDetails[K] | null };
    color: string | null;
}>;

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
    entities: { type: 'entities'; entities: Entity[] };
    source_status: { type: 'source_status'; source: SourceStatus };
    transitions: { type: 'transitions'; transitions: TransitionRecord[] };
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
    /** Panels shown in their own window; they stay in `tree`, hidden from the main dock. */
    poppedOut: PanelId[];
    /** Saved dock arrangements (the Layouts menu), persisted on the server. */
    layoutPresets: LayoutPreset[];
    loadLayoutPresets(): Promise<void>;
    _storeLayoutPresets(presets: LayoutPreset[]): Promise<void>;
    /** Save the current layout under a name (an existing one with that name is replaced). */
    saveLayoutPreset(name: string): void;
    deleteLayoutPreset(name: string): void;
    applyLayoutPreset(name: string): void;
    /** The dock group (leaf id) the user last clicked or focused; see panelInUse in store.js. */
    focusedGroup: string | null;
    /** The popped-out panel whose window has focus. */
    focusedPopout: PanelId | null;
    /** Whether the dock layout is saved to the server. */
    layoutStatus: string;
    feedStatus: FeedStatus;

    /** Every raw event (all review states), as last sent by the server. */
    rawEvents: EventRecord[];
    adventures: AdventureRecord[];
    mode: PoolMode;
    /** Discovery mode: also show ignored raw events (dross), so they can be revived. */
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

    /** Applied filters: what the calendar and map show. */
    filters: FilterState;
    /** The Nexus's working copy. Facet/Seal edits wait here until passFilters(). */
    draftFilters: FilterState;
    /** The pool after the applied filters: what the calendar and map show. */
    visibleItems: PoolItem[];
    /** Entities (the Codex), kept current by the feed. */
    entities: Entity[];
    /** The entity open in the Codex (separate from the adventure selection). */
    selectedEntityId: string | null;
    /** Recent observed moves, oldest first (at most 500): the twin's packets. */
    transitions: TransitionRecord[];
    /** Packets per edge over the last 7 days: the twin's pipe widths. */
    flows: FlowRecord[];
    /** Fetch moves since the last one held (or the last 24 h), and the flows. */
    loadTransitions(): Promise<void>;
    /** Add moves (from the feed or a fetch); refreshes the flows shortly after, unless told not to. */
    addTransitions(records: TransitionRecord[], options?: { refreshFlows?: boolean }): void;
    /** Pick what colors the matter. Applies at once (to the draft too) and is saved. */
    setLens(lens: LensKey): void;
    cycleStage(facet: 'phase' | 'review', value: string): void;

    initWorkspace(): Promise<void>;
    persistLayout(nextTree: LayoutNode | null): void;
    setDraggingPanel(panelId: PanelId | null): void;
    /** A dock group (leaf id) or a pop-out (`popout:<panel>`) got the user's attention. */
    focusGroup(groupId: string): void;
    /** A pop-out window lost focus. */
    blurPopout(panelId: PanelId): void;
    resizeSplit(splitId: string, ratio: number): void;
    commitResize(): void;
    selectTab(leafId: string, panelId: PanelId): void;
    dockPanel(panelId: PanelId, targetLeafId: string, zone: DropZone): void;
    closePanel(panelId: PanelId): void;
    reopenPanel(panelId: PanelId): void;
    /** Bring a panel to the front: select its tab, or reopen it if it was closed. */
    showPanel(panelId: PanelId): void;
    popOut(panelId: PanelId): void;
    dockPopout(panelId: PanelId): void;
    resetWorkspace(): Promise<void>;

    /** From an `events` message. */
    setRawEvents(records: EventRecord[]): void;
    /** From an `adventures` message. */
    setAdventures(records: AdventureRecord[]): void;
    setMode(mode: PoolMode): void;
    /** Select the first prima materia in the Centrifuge (comb order), if any. */
    selectFirstPrima(): void;
    toggleShades(): void;
    selectItem(id: string | null, source: SelectionSource): void;
    hoverItem(id: string | null): void;

    // triage (raw events) and phases (adventures); the server broadcasts the result
    passEvent(eventId: string): Promise<void>;
    ignoreEvent(eventId: string): Promise<void>;
    reviveEvent(eventId: string): Promise<void>;
    killAdventure(adventureId: string): Promise<void>;
    reviveAdventure(adventureId: string): Promise<void>;
    /** The adventure just killed, for the toast that asks why; null otherwise. */
    epitaphPrompt: { adventureId: string; title: string; at: number } | null;
    dismissEpitaphPrompt(): void;
    /** Write a killed adventure's epitaph. Resolves to an error message, or null. */
    saveEpitaph(adventureId: string, cause: EpitaphCause, note: string): Promise<string | null>;
    clearEpitaph(adventureId: string): Promise<string | null>;
    /** The Agora's ledger (backend/services/ledger.py), newest first. */
    ambrosia: AmbrosiaLedger;
    setAmbrosia(ambrosia: AmbrosiaLedger): void;
    /** Add a player to a party or change its place there. These resolve to an error message, or null. */
    setPartyMember(adventureId: string, playerId: string, changes: { status?: PartyStatus; role?: string | null; note?: string | null; impact?: string | null; follow_up?: string | null }): Promise<string | null>;
    setSteward(adventureId: string, entityId: string, role: 'herald' | 'commissioner', on: boolean): Promise<string | null>;
    setAffinity(playerId: string, entityId: string, on: boolean): Promise<string | null>;
    setWarden(siteId: string, entityId: string, on: boolean): Promise<string | null>;
    setSpellSkill(spellId: string, skillId: string, on: boolean): Promise<string | null>;
    /** Actions laid on the anvil (the Crucible), in order. */
    pins: Pin[];
    setPins(pins: Pin[]): void;
    /** What you wrote about each archetype (the Cohort). */
    idols: Partial<Record<Archetype, IdolNotes>>;
    setIdol(id: Archetype, changes: Partial<IdolNotes>): void;
    /** The player the Complex should open (set by openInComplex). */
    complexFocus: { adventureId: string; playerId: string; at: number } | null;
    /** Select an adventure and show one of its players in the Complex. */
    openInComplex(adventureId: string, playerId: string | null): void;
    /** Status changes in a party, newest first. */
    partyHistory(adventureId: string): Promise<PartyLogEntry[]>;
    /** Set what an adventure is worth; null clears it. Resolves to an error message, or null. */
    saveBounty(adventureId: string, bounty: { effort: number; resistance: number; ratio: number } | null): Promise<string | null>;
    /** Ask Claude for an item's model, or changes to it. These resolve to an error message, or null. */
    forgeModel(adventureId: string, text: string): Promise<string | null>;
    acceptModel(adventureId: string): Promise<string | null>;
    dismissModel(adventureId: string): Promise<string | null>;
    /** Set an item's purpose, effects or model. Resolves to an error message, or null. */
    saveItem(adventureId: string, changes: Partial<ItemSheet>): Promise<string | null>;
    /** Save the draft analysis, or seal (or amend) it. Resolves to the names new to the Codex, or an error message. */
    saveEnshrining(adventureId: string, analysis: Analysis, seal: boolean): Promise<{ discovered: string[] } | string>;
    /** Delete a killed adventure for good. Resolves to an error message, or null. */
    abandonAdventure(adventureId: string): Promise<string | null>;
    setPhase(adventureId: string, phase: Phase): Promise<void>;
    /** Make a hand-made adventure (in ore), switch to Adventures and select it for editing. */
    createAdventure(type: AdventureType): Promise<void>;
    /** Set or clear the adventure's own fields. Resolves to an error message, or null. */
    updateAdventure(adventureId: string, changes: AdventureChanges): Promise<string | null>;
    /** The adventure whose node card opened in edit mode (just created); null otherwise. */
    editingAdventureId: string | null;
    setEditingAdventure(adventureId: string | null): void;
    /** Replace an adventure's roadmap: shown at once, saved shortly after (latest wins). */
    saveRoadmap(adventureId: string, roadmap: Roadmap): void;
    /** Last roadmap save error (shown in the Alembic); cleared by the next save. */
    roadmapError: string | null;

    // filters (saved to the server, debounced)
    /** Draft: cycle one facet value off -> include -> exclude -> off. */
    cycleFacet(facet: FacetKey, value: string): void;
    /** Draft: turn one facet value off. */
    removeFacet(facet: FacetKey, value: string): void;
    /** Apply the draft: the calendar and map switch to its subset. */
    passFilters(): Promise<void>;
    /** What a Discovery pass-through does with centrifuge events the filters leave out. */
    excludedFate: ExcludedFate;
    setExcludedFate(fate: ExcludedFate): void;
    /** Bulk transfers that can be undone, latest last. */
    undoStack: TransferRecord[];
    undoTransfer(): Promise<void>;
    /** Throw away pending draft edits. */
    discardDraft(): void;
    setDateRange(range: DateRange | null): void;
    setRing(ring: Ring | null): void;
    /** Flip a range filter between include and exclude. */
    toggleRangeMode(which: 'date_range' | 'ring'): void;
    /** Draft: seal / break the Hermetic Seal. */
    toggleSeal(): void;
    setUnits(units: 'mi' | 'km'): void;
    /** Clear facets (pending) and ranges (immediately); keeps the Seal and units. */
    /** Clear every filter, applied and draft (lens and units stay). */
    resetFilters(): void;
    setEntities(entities: Entity[]): void;
    /** Center the proximity ring on a site (keeps the radius and mode); it follows the site. */
    anchorRingOnSite(siteId: string): void;
    /** A point the Atlas should fly to (set by focusOnAtlas, e.g. from the Codex). */
    atlasFocus: { lat: number; lon: number; at: number; radius_km?: number } | null;  // radius_km: frame that circle (a site's ring)
    /** Bring the Atlas to the front and fly to a point. */
    focusOnAtlas(lat: number, lon: number): void;
    selectEntity(entityId: string | null): void;
    /** Create an entity; resolves to it, or to an error message. */
    createEntity(type: EntityType, fields?: EntityChanges): Promise<Entity | string>;
    /** Resolves to an error message, or null. */
    updateEntity(entityId: string, changes: EntityChanges): Promise<string | null>;
    deleteEntity(entityId: string): Promise<string | null>;
    linkEntity(adventureId: string, entityId: string): Promise<string | null>;
    unlinkEntity(adventureId: string, entityId: string): Promise<string | null>;
    setSourceStatus(source: SourceStatus): void;
    /** Harvest: crawl the source; new events fill its Harvester (progress: source_status messages). */
    syncSource(name: string): Promise<void>;
    /** Harvester -> Centrifuge: the source's harvested events show in Discovery. */
    feedSource(name: string): Promise<void>;
    /** Centrifuge -> Harvester: the source's events leave Discovery. */
    siphonSource(name: string): Promise<void>;
    /** Centrifuge -> Sump: every event still in the Centrifuge is ignored. */
    purgeCentrifuge(): Promise<void>;
}
