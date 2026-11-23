import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { panelInUse, useWorkspaceStore } from '../../store.js';
import { ENTITY_TYPES, PHASE_NODES, PHASE_STAGES, REVIEW_STAGES } from '../../lifecycle.js';
import { passes, pendingChanges } from '../../filters.js';
import { freshMinutes, freshTitle } from '../../lib/harvest.js';
import { LENSES, byMatter, lensColor, lensRuns, lensValues, sourceColor } from '../../lib/lens.js';
import { eventNode, pipeFlows, twinModel } from '../../lib/twinModel.js';
import { CENTRIFUGE, CODEX, FORGE, OUTSIDE, SUMP, nodeStage, twinNodes, twinPipes } from '../../lib/twinTopology.js';

const ZONE_LABELS = { net: 'Net · events', core: 'Core · adventures', sanctum: 'Sanctum', viewer: 'Viewers' };

/** The machines that work while a panel is in use (PHASE7_PLAN.md, stage 7d). @type {Partial<Record<PanelId, string[]>>} */
const PANEL_MACHINES = {
    classifier: ['nexus'],   // plus the Sump in Discovery; the Centrifuge spins all through Discovery (see below)
    node: [PHASE_NODES.classifying],
    alembic: [PHASE_NODES.decomposing],
    quests: [PHASE_NODES.constructing],
    scripter: [PHASE_NODES.constructing],
    codex: [CODEX],
    map: ['atlas'],
    calendar: ['calendar'],
    ledger: ['ledger'],
    necropolis: [PHASE_NODES.killed],
};
const RECENT = 15;
const VIEW_KEY = 'signal-chain-view';

/** Each machine's own color: the matter it holds, or its trade. @type {Record<string, string>} */
const NODE_COLORS = {
    [CENTRIFUGE]: REVIEW_STAGES.new.color,
    [SUMP]: REVIEW_STAGES.ignored.color,
    [FORGE]: '#ff7a3c',
    [CODEX]: '#c8a46a',
    inventory: '#cfd3da', agora: '#e9b949', pantheon: '#c86bf0', mastery: '#ff8f6b',
    enricher: '#c8a46a',
    sieve: '#c8a46a',
    nexus: '#9fb4c8', atlas: '#9fb4c8', calendar: '#9fb4c8', ledger: '#9fb4c8',
    ...Object.fromEntries(Object.entries(PHASE_NODES).map(([phase, id]) => [id, PHASE_STAGES[/** @type {Phase} */ (phase)].color])),
};
/** @param {string} id */
const nodeColor = (id) => (id.startsWith('harvester:') ? REVIEW_STAGES.harvested.light : NODE_COLORS[id] ?? '#888888');

/** @param {number} n */
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** @param {string} iso */
function clock(iso) {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** @returns {'3d' | 'table'} */
function savedView() {
    try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : '3d'; } catch { return '3d'; }
}

/**
 * Do what clicking a machine does: switch mode or show dross if needed, then open its panel.
 * @param {import('../../lib/twinTopology.js').TwinAction} action
 */
function runAction(action) {
    const s = useWorkspaceStore.getState();
    if (action.mode) s.setMode(action.mode);
    if (action.shades && !useWorkspaceStore.getState().showShades) s.toggleShades();
    if (action.firstPrima) s.selectFirstPrima();
    if (action.create) {
        s.setMode('adventures');
        s.selectItem(null, 'twin'); // the Refinery shows the create buttons when nothing is selected
    }
    s.showPanel(action.panel);
}

/** A harvester or centrifuge button on the twin. @param {string} command @param {string} nodeId */
function runCommand(command, nodeId) {
    const s = useWorkspaceStore.getState();
    const source = nodeId.replace(/^harvester:/, '');
    if (command === 'harvest') s.syncSource(source);
    else if (command === 'feed') s.feedSource(source);
    else if (command === 'siphon') s.siphonSource(source);
    else if (command === 'purge') {
        const n = s.rawEvents.reduce((k, e) => k + (e.review === 'new' ? 1 : 0), 0);
        if (n) s.purgeCentrifuge(); // no confirm: each event can be revived from the Sump
    }
}

/** The lantern's wheel: turn to the next (or previous) lens. @param {number} step */
function turnLens(step) {
    const s = useWorkspaceStore.getState();
    const i = LENSES.findIndex((l) => l.key === s.filters.lens);
    s.setLens(LENSES[(i + step + LENSES.length) % LENSES.length].key);
}

/** A vessel's base ring: cycle its stage in the filter, applied at once. @param {string} nodeId */
function toggleRing(nodeId) {
    const stage = nodeStage(nodeId);
    if (stage) useWorkspaceStore.getState().cycleStage(stage.facet, stage.value);
}

/** The lit part of a level as a stacked bar, one segment per lens value. @param {{ level: import('../../lib/twinModel.js').TwinLevel }} props */
function Bands({ level }) {
    if (!level.total) return html`<span className="sc-dim">—</span>`;
    return html`
        <div className="sc-bar" title=${level.bands.map((b) => `${b.label}: ${fmt(b.count)}`).join('\n') || 'nothing lit'}>
            ${level.bands.map((b) => html`
                <i key=${b.value} style=${{ flexGrow: b.count, background: b.color }}></i>
            `)}
            ${level.total > level.lit && html`<i className="ghost" style=${{ flexGrow: level.total - level.lit }}></i>`}
        </div>
    `;
}

/**
 * The model as tables: levels per machine, flows per pipe, the latest moves.
 * @param {{ nodes: import('../../lib/twinTopology.js').TwinNode[], pipes: import('../../lib/twinTopology.js').TwinPipe[],
 *           model: import('../../lib/twinModel.js').TwinModel, routed: ReturnType<typeof pipeFlows>,
 *           io: Record<string, { in: number, out: number }>, transitions: TransitionRecord[], titleOf: Map<string, string> }} props
 */
function TwinTable({ nodes, pipes, model, routed, io, transitions, titleOf }) {
    const zones = /** @type {const} */ (['net', 'core', 'sanctum', 'viewer']);
    const busyPipes = pipes.filter((p) => routed.byPipe[p.id].forward || routed.byPipe[p.id].backward);
    return html`
        <div className="sc-scroll">
            ${zones.map((zone) => html`
                <table key=${zone} className="sc-table sc-zone">
                    <colgroup>
                        <col className="c-name" /><col className="c-kind" /><col className="c-num" /><col className="c-num" />
                        <col /><col className="c-num" /><col className="c-num" />
                    </colgroup>
                    <thead>
                        <tr><th colSpan="2">${ZONE_LABELS[zone]}</th><th>Held</th><th>Lit</th><th>Lit by lens · ghost</th><th>In 7d</th><th>Out 7d</th></tr>
                    </thead>
                    <tbody>
                        ${nodes.filter((n) => n.zone === zone).map((n) => {
                            const level = model.levels[n.id] ?? { total: 0, lit: 0, bands: [] };
                            const flow = io[n.id] ?? { in: 0, out: 0 };
                            const action = n.action;
                            return html`
                                <tr key=${n.id} className=${n.locked ? 'locked' : ''}>
                                    <td className="sc-name">
                                        ${action && !n.locked
                                            ? html`<button className="sc-link" onClick=${() => runAction(action)}
                                                title=${`Open ${action.panel}${action.mode ? ` (${action.mode})` : ''}`}>${n.label}</button>`
                                            : n.label}
                                        ${n.locked && html`<span className="sc-lock" title="Not built yet">🔒</span>`}
                                    </td>
                                    <td className="sc-dim">${n.kind}${n.matter ? ` · ${n.matter}` : ''}</td>
                                    ${n.holds === 'entities'
                                        ? html`<td>${model.codex.total}</td><td colSpan="2" className="sc-dim">
                                            ${Object.entries(model.codex.byType).map(([t, c]) => `${ENTITY_TYPES[/** @type {EntityType} */ (t)].glyph} ${c}`).join('   ')}
                                          </td>`
                                        : n.holds
                                            ? html`<td>${level.total}</td><td>${level.lit}</td><td><${Bands} level=${level} /></td>`
                                            : html`<td className="sc-dim">—</td><td className="sc-dim">—</td><td></td>`}
                                    <td>${flow.in || ''}</td><td>${flow.out || ''}</td>
                                </tr>
                            `;
                        })}
                    </tbody>
                </table>
            `)}

            <table className="sc-table">
                <thead><tr><th>Pipe (7 days)</th><th>⟶</th><th>⟵</th></tr></thead>
                <tbody>
                    ${busyPipes.map((p) => html`
                        <tr key=${p.id}>
                            <td>${p.a === OUTSIDE ? 'outside' : p.a} ${p.kind === 'conveyor' ? '⛓' : p.kind === 'market' ? '¤' : '—'} ${p.b}</td>
                            <td>${routed.byPipe[p.id].forward || ''}</td>
                            <td>${routed.byPipe[p.id].backward || ''}</td>
                        </tr>
                    `)}
                    ${routed.unrouted.map((f) => html`
                        <tr key=${`${f.from}>${f.to}`} className="bad"><td>no pipe: ${f.from} → ${f.to}</td><td>${f.count}</td><td></td></tr>
                    `)}
                </tbody>
            </table>

            <table className="sc-table sc-moves">
                <thead><tr><th colSpan="3">Latest moves (${transitions.length} held)</th></tr></thead>
                <tbody>
                    ${transitions.slice(-RECENT).reverse().map((t) => html`
                        <tr key=${t.id}>
                            <td className="sc-dim">${clock(t.at)}</td>
                            <td>${t.from} → ${t.to}</td>
                            <td className="sc-dim">${titleOf.get(t.row_id) ?? t.subject}</td>
                        </tr>
                    `)}
                    ${!transitions.length && html`<tr><td colSpan="3" className="sc-dim">No moves in the last 24 hours</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * The Signal Chain: the whole pipeline as a 3D model of machines. 3D (machines, liquid levels, pipes,
 * packets for every move) or as tables. Machines open their panels; harvester and
 * centrifuge buttons sit on their labels. See BUILD_PLAN.md (same folder as ARCHITECTURE.md).
 */
export function SignalChainPanel() {
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const filters = useWorkspaceStore((s) => s.filters);
    const draftFilters = useWorkspaceStore((s) => s.draftFilters);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const sources = useWorkspaceStore((s) => s.sources);
    const transitions = useWorkspaceStore((s) => s.transitions);
    const flows = useWorkspaceStore((s) => s.flows);
    const panels = useWorkspaceStore((s) => s.panels);
    const setLens = useWorkspaceStore((s) => s.setLens);
    const inUsePanel = useWorkspaceStore(panelInUse);
    const poolMode = useWorkspaceStore((s) => s.mode);
    // the Refinery is editing an adventure it has just made: the Forge works too
    const creating = useWorkspaceStore((s) => s.editingAdventureId != null && s.editingAdventureId === s.selectedItemId);

    const [view, setView] = useState(savedView);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000); // fresh harvests go stale, events go past
        return () => clearInterval(timer);
    }, []);
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));

    const sourceNames = useMemo(() => Object.keys(sources), [sources]);
    const nodes = useMemo(() => twinNodes(sourceNames).map((n) => (n.action
        ? { ...n, action: { ...n.action, label: panels[n.action.panel]?.name ?? n.action.panel } } : n)), [sourceNames, panels]);
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    const pipes = useMemo(() => twinPipes(sourceNames), [sourceNames]);
    const model = useMemo(
        () => twinModel({ rawEvents, adventures, entities, filters, lens: filters.lens, now }),
        [rawEvents, adventures, entities, filters, now],
    );
    const routed = useMemo(() => pipeFlows(flows, pipes), [flows, pipes]);
    const io = useMemo(() => {
        /** @type {Record<string, { in: number, out: number }>} */
        const out = {};
        for (const f of flows) {
            (out[f.to] ??= { in: 0, out: 0 }).in += f.count;
            (out[f.from] ??= { in: 0, out: 0 }).out += f.count;
        }
        return out;
    }, [flows]);
    const centrifugeBySource = useMemo(() => {
        /** @type {Record<string, number>} */
        const out = {};
        for (const e of rawEvents) if (e.review === 'new') out[e.source] = (out[e.source] ?? 0) + 1;
        return out;
    }, [rawEvents]);
    const eventsById = useMemo(() => new Map(rawEvents.map((e) => [e.id, e])), [rawEvents]);
    const adventuresById = useMemo(() => new Map(adventures.map((a) => [a.id, a])), [adventures]);

    // the Nexus: its lens (on its label) and a pending draft (its prism pulses amber)
    const pending = pendingChanges(draftFilters, filters);
    const light = useMemo(() => ({
        lens: filters.lens, lensLabel: LENSES.find((l) => l.key === filters.lens)?.label ?? filters.lens, pending,
    }), [filters.lens, pending]);

    // which stage each vessel's base ring has in the applied filter
    const stageFilter = useMemo(() => {
        /** @type {Record<string, FilterMode>} */
        const out = {};
        for (const n of nodes) {
            const stage = nodeStage(n.id);
            const mode = stage && filters.facets[stage.facet]?.[stage.value];
            if (mode) out[n.id] = mode;
        }
        return out;
    }, [nodes, filters.facets]);

    // a packet's colour: its row's lens colour (the stage lens keeps the machine's colour),
    // dim when the row fails the applied filter
    const packetStyle = useMemo(() => (/** @type {TransitionRecord} */ t) => {
        const event = t.subject === 'event' ? eventsById.get(t.row_id) : undefined;
        const adventure = t.subject === 'adventure' ? adventuresById.get(t.row_id) : undefined;
        const item = /** @type {PoolItem | undefined} */ (event ? { ...event, kind: 'omen' } : adventure ? { ...adventure, kind: 'adventure' } : undefined);
        if (!item) return null; // row gone: the machine's colour
        const lit = passes(item, filters, event ? 'discovery' : 'adventures', now);
        if (byMatter(filters.lens)) return { color: null, lit };
        return { color: lensColor(filters.lens, lensValues(item, filters.lens)[0]), lit };
    }, [eventsById, adventuresById, filters, now]);

    // harvesters that ran recently: their Harvest button greys out
    const fresh = useMemo(() => {
        /** @type {Record<string, string>} */
        const out = {};
        for (const src of Object.values(sources)) {
            const m = freshMinutes(src, now);
            if (m != null) out[src.name] = freshTitle(m);
        }
        return out;
    }, [sources, now]);

    // the selection's magic circle: the machine holding the selected row, in the row's
    // matter colour (the colour of the machine that holds it)
    const selection = useMemo(() => {
        const none = { nodeId: /** @type {string | null} */ (null), color: '#ffffff' };
        if (!selectedId) return none;
        const adventure = adventuresById.get(selectedId);
        const event = adventure ? undefined : eventsById.get(selectedId);
        if (adventure) return { nodeId: PHASE_NODES[adventure.phase], color: nodeColor(PHASE_NODES[adventure.phase]) };
        if (!event) return none;
        const linked = new Set(adventures.map((a) => a.event_id).filter((id) => id != null));
        const nodeId = eventNode(event, /** @type {Set<string>} */ (linked));
        return { nodeId, color: nodeId ? nodeColor(nodeId) : '#ffffff' };
    }, [selectedId, adventuresById, eventsById, adventures]);

    const titleOf = useMemo(() => {
        /** @type {Map<string, string>} */
        const m = new Map();
        for (const e of rawEvents) m.set(e.id, e.title);
        for (const a of adventures) m.set(a.id, a.title);
        for (const o of entities) m.set(o.id, o.name);
        return m;
    }, [rawEvents, adventures, entities]);

    const chooseView = (/** @type {'3d' | 'table'} */ v) => {
        setView(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: not remembered */ }
    };

    // Load three.js + the scene only when the 3D view is showing.
    useEffect(() => {
        if (view !== '3d') return undefined;
        let disposed = false;
        setStatus('loading');
        // @ts-ignore -- the query string hides the module's path from the type checker
        import('../../lib/twin/twinScene.js?v=1')
            .then(({ TwinScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new TwinScene(hostRef.current, {
                    onActivate: (/** @type {string} */ id) => {
                        const action = nodesRef.current.find((n) => n.id === id)?.action;
                        if (action) runAction(action);
                    },
                    onCommand: runCommand,
                    onRing: toggleRing,
                    onLens: turnLens,
                });
                setStatus('ready');
            })
            .catch((err) => {
                console.error('[signal chain] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            sceneRef.current?.dispose();
            sceneRef.current = null;
        };
    }, [view]);

    // feed the scene; the first time, replay the latest moves so it doesn't open frozen
    const replayed = useRef(false);
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene || status !== 'ready') { replayed.current = false; return; }
        const colors = Object.fromEntries(nodes.map((n) => [n.id, nodeColor(n.id)]));
        // harvesters carry their source's colour as accents (their matter stays flux)
        const accents = Object.fromEntries(nodes.filter((n) => n.kind === 'harvester').map((n) => [n.id, sourceColor(n.label)]));
        scene.update({
            nodes, pipes, levels: model.levels, codex: model.codex, flows: routed.byPipe, colors, accents, sources, io,
            centrifugeBySource, stageFilter, light, packetStyle, fresh,
        });
        scene.play(transitions, { replay: !replayed.current });
        replayed.current = true;
    }, [status, nodes, pipes, model, routed, sources, io, centrifugeBySource, transitions, stageFilter, light, packetStyle, fresh]);

    useEffect(() => {
        if (status === 'ready') sceneRef.current?.setSelection(selection.nodeId, selection.color);
    }, [status, selection]);

    // the machines whose panel is in use work; everything else stands still
    useEffect(() => {
        if (status !== 'ready') return;
        const ids = [...(inUsePanel ? PANEL_MACHINES[inUsePanel] ?? [] : [])];
        if (inUsePanel === 'node' && creating) ids.push(FORGE);
        if (poolMode === 'discovery') ids.push(CENTRIFUGE);   // the Centrifuge spins all through Discovery, whatever panel is in use
        if (inUsePanel === 'classifier' && poolMode === 'discovery') ids.push(SUMP);   // events are reviewed only in Discovery
        sceneRef.current?.setInUse(ids);
    }, [status, inUsePanel, creating, poolMode]);

    return html`
        <div className="panel-body signal-chain">
            <div className="sc-head">
                <div className="sc-views" role="group" aria-label="View">
                    <button className=${`sc-view ${view === '3d' ? 'active' : ''}`} onClick=${() => chooseView('3d')}>3D</button>
                    <button className=${`sc-view ${view === 'table' ? 'active' : ''}`} onClick=${() => chooseView('table')}>Table</button>
                </div>
                <span className=${`sc-check ${model.check.ok ? 'ok' : 'bad'}`}
                    title=${model.check.ok ? 'Both counting rules hold' : model.check.problems.join('\n')}>
                    ${model.check.ok ? '✓ Counts balance' : `⚠ ${model.check.problems[0]}`}
                </span>
                <span className="sc-spacer"></span>
                ${view === '3d' && html`<button className="btn sc-home" title="Frame everything"
                    onClick=${() => sceneRef.current?.fit()}>⌂</button>`}
                ${view === 'table' && html`<label className="sc-lens">Lens
                    <select className="btn" value=${filters.lens}
                        onChange=${(/** @type {any} */ e) => setLens(e.target.value)}>
                        ${lensRuns(LENSES).map((run) => (run.group
                            ? html`<optgroup key=${run.group} label=${run.group}>${run.items.map((l) => html`<option key=${l.key} value=${l.key}>${l.label}</option>`)}</optgroup>`
                            : html`<option key=${run.items[0].key} value=${run.items[0].key}>${run.items[0].label}</option>`))}
                    </select>
                </label>`}
            </div>

            ${view === 'table'
                ? html`<${TwinTable} nodes=${nodes} pipes=${pipes} model=${model} routed=${routed} io=${io}
                    transitions=${transitions} titleOf=${titleOf} />`
                : html`
                    <div className="sc-stage">
                        <div className="twin-host" ref=${hostRef}></div>
                        ${status === 'loading' && html`<div className="sc-overlay">Starting the 3D view…</div>`}
                        ${status === 'error' && html`<div className="sc-overlay">The 3D view failed to start (see the console). The Table view still works.</div>`}
                    </div>
                `}
        </div>
    `;
}
