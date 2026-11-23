import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { excludedFromCentrifuge, useWorkspaceStore } from '../../store.js';
import { DEFAULT_FILTERS, FACETS, facetLabel, formatDistance, hasActiveFilters, parseDay, pendingChanges } from '../../filters.js';
import { buildModel } from '../../lib/classifierGraph.js';
import { LENSES, lensRuns } from '../../lib/lens.js';

/**
 * The lens is also the Nexus's layer: the facet it colours by shows as stars (Matter shows
 * the stage: phases in Adventures, review states in Discovery). Active filters always show.
 * @param {LensKey} lens @param {PoolMode} mode
 * @returns {import('../../lib/classifierGraph.js').Layers}
 */
function lensLayers(lens, mode) {
    if (lens === 'none') return {};   // no lens: only the active filters show as stars
    if (lens === 'stage') return mode === 'adventures' ? { phase: true } : { review: true };
    return { [lens]: true };
}

/**
 * Star clicked: cycle its filter. Facets and ranges go include -> exclude -> off;
 * the Seal toggles. Reads the store at click time so it never acts on stale state.
 * @param {import('../../lib/classifierGraph.js').Star | undefined} star
 */
function cycleStar(star) {
    if (!star) return;
    const s = useWorkspaceStore.getState();
    if (star.kind === 'facet' && star.facet && star.value != null) s.cycleFacet(star.facet, star.value);
    else if (star.kind === 'seal') s.toggleSeal();
    else if (star.kind === 'date') {
        if (s.filters.date_range?.mode === 'include') s.toggleRangeMode('date_range');
        else s.setDateRange(null);
    } else if (star.kind === 'ring') {
        if (s.filters.ring?.mode === 'include') s.toggleRangeMode('ring');
        else s.setRing(null);
    }
}

/** Where a Discovery pass-through sends the centrifuge events the filters leave out. */
const FATES = /** @type {{ key: ExcludedFate, label: string, title: string }[]} */ ([
    { key: 'siphon', label: '⟵ Siphon', title: 'Back to their harvesters (Feed brings them back)' },
    { key: 'purge', label: '↓ Purge', title: 'Into the Sump as dross (each can be revived)' },
    { key: 'keep', label: 'Keep', title: 'Leave them in the centrifuge (only the calendar and map are filtered)' },
]);

/**
 * One lens button. Clicking the active lens turns the lens off (None).
 * @param {{ key: LensKey, label: string }} l @param {LensKey} lens @param {(lens: LensKey) => void} setLens
 */
function lensButton(l, lens, setLens) {
    return html`
        <button key=${l.key} className=${`cls-layer ${lens === l.key ? 'on' : ''}`}
            onClick=${() => setLens(lens === l.key && l.key !== 'none' ? 'none' : l.key)}
            title=${l.key === 'none'
                ? 'No lens: no stars but the active filters; colours fall back to matter'
                : `Colour the matter by ${l.label.toLowerCase()} in the Signal Chain, and show each ${l.key === 'stage' ? 'stage' : l.label.toLowerCase()} as a star. Active filters always show. Click again to turn the lens off.`}>
            ${l.label}
        </button>
    `;
}

const fmtDay = (/** @type {string} */ d) => parseDay(d).toLocaleDateString([], { month: 'short', day: 'numeric' });

/**
 * The filter tray under the Nexus: the draft's filters as chips, what the calendar and
 * map currently show, and Pass through. Facet / Seal edits are pending until passed;
 * ranges (from the calendar and map) already apply.
 * @param {{ passCount: number }} props
 */
function FilterTray({ passCount }) {
    const draft = useWorkspaceStore((s) => s.draftFilters);
    const applied = useWorkspaceStore((s) => s.filters);
    const mode = useWorkspaceStore((s) => s.mode);
    const shown = useWorkspaceStore((s) => s.visibleItems.length);
    const removeFacet = useWorkspaceStore((s) => s.removeFacet);
    const toggleSeal = useWorkspaceStore((s) => s.toggleSeal);
    const setDateRange = useWorkspaceStore((s) => s.setDateRange);
    const setRing = useWorkspaceStore((s) => s.setRing);
    const passFilters = useWorkspaceStore((s) => s.passFilters);
    const discardDraft = useWorkspaceStore((s) => s.discardDraft);
    const resetFilters = useWorkspaceStore((s) => s.resetFilters);
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const fate = useWorkspaceStore((s) => s.excludedFate);
    const setFate = useWorkspaceStore((s) => s.setExcludedFate);
    const pending = pendingChanges(draft, applied);
    // Discovery: the centrifuge events this pass leaves out, and where they'll go
    const excluded = useMemo(
        () => (mode === 'discovery' ? excludedFromCentrifuge(rawEvents, draft, Date.now()).length : 0),
        [mode, rawEvents, draft],
    );
    const moving = fate !== 'keep' ? excluded : 0;
    const canPass = pending > 0 || moving > 0;
    // anything to reset: a filter (draft or applied) or a broken Seal
    const canReset = [draft, applied].some((f) => hasActiveFilters(f) || f.seal !== DEFAULT_FILTERS.seal);

    const facetChips = FACETS.filter((f) => f.modes.includes(mode)).flatMap((facet) =>
        Object.entries(draft.facets[facet.key] ?? {}).map(([value, fmode]) => ({
            key: `${facet.key}:${value}`, facet: facet.key, value, mode: fmode,
            label: facetLabel(facet, value),
            pending: applied.facets[facet.key]?.[value] !== fmode,
        })));
    const removedPending = FACETS.flatMap((facet) =>
        Object.keys(applied.facets[facet.key] ?? {}).filter((v) => !(draft.facets[facet.key] ?? {})[v]));
    const { date_range: range, ring } = draft;
    const hasChips = facetChips.length || range || ring || mode === 'adventures';

    return html`
        <div className="tray">
            <span className="tray-title">Filters</span>
            ${facetChips.map((c) => html`
                <span key=${c.key} className=${`chip ${c.mode}`}>
                    <span className="chip-label">${c.mode === 'include' ? '＋' : '－'} ${c.label}</span>
                    ${c.pending && html`<span className="chip-tag">PENDING</span>`}
                    <button className="chip-x" aria-label=${`Remove ${c.label} filter`} onClick=${() => removeFacet(c.facet, c.value)}>✕</button>
                </span>
            `)}
            ${range && html`
                <span className=${`chip ${range.mode === 'exclude' ? 'exclude' : ''}`}>
                    <span className="chip-label">◷ ${range.start === range.end ? fmtDay(range.start) : `${fmtDay(range.start)} – ${fmtDay(range.end)}`}</span>
                    <button className="chip-x" aria-label="Remove date filter" onClick=${() => setDateRange(null)}>✕</button>
                </span>
            `}
            ${ring && html`
                <span className=${`chip ${ring.mode === 'exclude' ? 'exclude' : ''}`}>
                    <span className="chip-label">◎ ${formatDistance(ring.radius_km, draft.units)} ${ring.center.label || ''}</span>
                    <button className="chip-x" aria-label="Remove proximity filter" onClick=${() => setRing(null)}>✕</button>
                </span>
            `}
            ${mode === 'adventures' && html`
                <button className=${`chip ${draft.seal ? 'seal' : ''}`} onClick=${toggleSeal}
                    title="Hermetic Seal: hides past adventures, artifacts, vestiges and relics">
                    ⛬ ${draft.seal ? 'Sealed' : 'Seal broken'}
                    ${draft.seal !== applied.seal && html`<span className="chip-tag">PENDING</span>`}
                </button>
            `}
            ${removedPending.length > 0 && html`<span className="chip-tag">${removedPending.length} REMOVED · PENDING</span>`}
            ${!hasChips && html`<span className="tray-hint">Click a star to filter</span>`}
            <span className="tray-spacer"></span>
            <span className="tray-applied">map + calendar show <b>${shown}</b></span>
            ${canReset && html`<button className="btn" onClick=${resetFilters} title="Clear every filter now (applied and pending); the lens stays">↺ Reset</button>`}
            ${pending > 0 && html`<button className="btn" onClick=${discardDraft} title="Throw away pending changes">Discard</button>`}
            ${mode === 'discovery' && html`
                <span className="fate" title="What Pass through does with the centrifuge events the filters leave out">
                    <span className="fate-title">Rest ${excluded}</span>
                    ${FATES.map((f) => html`
                        <button key=${f.key} className=${`fate-btn ${fate === f.key ? 'on' : ''}`} onClick=${() => setFate(f.key)} title=${f.title}>
                            ${f.label}
                        </button>
                    `)}
                </span>
            `}
            <button className="pass-btn" disabled=${!canPass} onClick=${passFilters}
                title=${!canPass ? 'Nothing pending' : moving ? `Send this subset to the Calendar and Atlas, and ${fate} the ${moving} left out` : 'Send this subset to the Calendar and Atlas'}>
                Pass through <span className="arrow">⟶</span> ${passCount}
                ${moving > 0 && html`<span className="pass-rest">${fate === 'siphon' ? '⟵' : '↓'} ${moving}</span>`}
            </button>
        </div>
    `;
}

/**
 * The Nexus: a 3D knowledge graph of the whole pool. Parents float as particles
 * (facet values, range filters, the Hermetic Seal), adventures are cards grouped into
 * Venn clusters, and the core holds what passes the draft filters. Pass through sends
 * that subset to the calendar and map.
 */
export function ClassifierPanel() {
    const items = useWorkspaceStore((s) => s.items); // the whole pool: filtered-out items show dimmed
    const filters = useWorkspaceStore((s) => s.draftFilters); // the Nexus works on the draft
    const mode = useWorkspaceStore((s) => s.mode);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const entities = useWorkspaceStore((s) => s.entities); // entity stars' names and colours

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const lens = useWorkspaceStore((s) => s.filters.lens);
    const setLens = useWorkspaceStore((s) => s.setLens);
    const layers = useMemo(() => lensLayers(lens, mode), [lens, mode]);
    // Which stars are collapsed: all of them (but `except`), or only `except`. A new lens,
    // mode or applied filter starts again from all collapsed, so a big pool opens tidy.
    const [fold, setFold] = useState(() => ({ all: true, except: new Set(/** @type {string[]} */ ([])) }));
    const applied = useWorkspaceStore((s) => s.filters);
    const isCollapsed = useMemo(() => (/** @type {string} */ id) => fold.all !== fold.except.has(id), [fold]);
    const [tick, setTick] = useState(0); // items become past (sealed) as time passes

    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(timer);
    }, []);

    const model = useMemo(
        () => buildModel(items, filters, mode, layers, isCollapsed, Date.now()),
        [items, filters, mode, layers, isCollapsed, tick, entities],
    );

    // collapse all, and reframe, whenever the lens, the mode or the applied filters change
    useEffect(() => {
        setFold({ all: true, except: new Set() });
        const timer = setTimeout(() => sceneRef.current?.fit(), 120);
        return () => clearTimeout(timer);
    }, [applied, mode]);

    // Load three.js + the scene only when this panel opens.
    useEffect(() => {
        let disposed = false;
        import('../../lib/classifierScene.js')
            .then(({ ClassifierScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new ClassifierScene(hostRef.current, {
                    onSelect: (/** @type {string | null} */ id) => useWorkspaceStore.getState().selectItem(id, 'classifier'),
                    onHover: (/** @type {string | null} */ id) => useWorkspaceStore.getState().hoverItem(id),
                    onStarClick: cycleStar,
                    onStarContext: (/** @type {{ id: string } | undefined} */ star) => {
                        if (!star) return;
                        setFold((prev) => {
                            const except = new Set(prev.except);
                            if (except.has(star.id)) except.delete(star.id);
                            else except.add(star.id);
                            return { all: prev.all, except };
                        });
                    },
                });
                setStatus('ready');
            })
            .catch((err) => {
                console.error('[classifier] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            sceneRef.current?.dispose();
            sceneRef.current = null;
        };
    }, []);

    useEffect(() => {
        sceneRef.current?.update(model);
    }, [model, status]);

    useEffect(() => {
        sceneRef.current?.setSelection(selectedId, { fly: selectionSource !== 'classifier' });
    }, [selectedId, selectionSource, status]);

    useEffect(() => {
        sceneRef.current?.setHover(hoveredId);
    }, [hoveredId, status]);

    // every shown parent collapsed: the button expands them all, else it collapses them all
    const allCollapsed = model.stars.length > 0 && model.stars.every((s) => s.collapsed);

    // the lenses that mean something in this mode (Matter always does)
    const lenses = LENSES.filter((l) => l.key === 'stage' || l.key === 'none' || FACETS.find((f) => f.key === l.key)?.modes.includes(mode));

    return html`
        <div className="panel-body classifier">
          <div className="cls-stage">
            <div className="cls-host" ref=${hostRef} />
            ${status === 'ready' && html`
                <div className="cls-layers" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                    <span className="cls-layers-title">Lens</span>
                    ${lensRuns(lenses).map((run) => (run.group
                        ? html`<span key=${run.group} className=${`cls-layer-group ${run.items.some((l) => l.key === lens) ? 'on' : ''}`}
                            style=${{ minWidth: `${14 + run.group.length * 7}px` }}>
                            <span className="cls-layer-group-name">${run.group}</span>
                            ${run.items.map((l) => lensButton(l, lens, setLens))}
                        </span>`
                        : lensButton(run.items[0], lens, setLens)))}
                </div>
                <button className="btn view-home" title="Frame everything" onClick=${() => sceneRef.current?.fit()}>⌂</button>
                <button className="btn view-collapse" disabled=${model.stars.length === 0}
                    title=${allCollapsed ? 'Expand every parent' : 'Collapse every parent (hides the clusters linked to them)'}
                    onClick=${() => {
                        setFold({ all: !allCollapsed, except: new Set() });
                        setTimeout(() => sceneRef.current?.fit(), 60); // reframe once the scene has the new model
                    }}>
                    ${allCollapsed ? '⊕ Expand all' : '⊖ Collapse all'}
                </button>
                <div className="cls-hint">
                    Click a parent: include → exclude → off · right-click: collapse · click a cluster to fly in
                </div>
            `}
            ${status !== 'ready' && html`
                <div className="map-status">${status === 'loading' ? 'Opening the Nexus…' : 'Nexus failed to load (see console)'}</div>
            `}
          </div>
          <${FilterTray} passCount=${model.passCount} />
        </div>
    `;
}
