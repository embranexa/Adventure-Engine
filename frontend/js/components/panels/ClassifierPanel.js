import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { FACETS, facetLabel, formatDistance, parseDay, pendingChanges } from '../../filters.js';
import { buildModel } from '../../lib/classifierGraph.js';
import { LENSES } from '../../lib/lens.js';

/**
 * The lens is also the Nexus's layer: the facet it colours by shows as stars (Matter shows
 * the stage: phases in Adventures, review states in Discovery). Active filters always show.
 * @param {LensKey} lens @param {PoolMode} mode
 * @returns {import('../../lib/classifierGraph.js').Layers}
 */
function lensLayers(lens, mode) {
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
    const pending = pendingChanges(draft, applied);

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
            ${pending > 0 && html`<button className="btn" onClick=${discardDraft} title="Throw away pending changes">Discard</button>`}
            <button className="pass-btn" disabled=${pending === 0} onClick=${passFilters}
                title=${pending ? 'Send this subset to the Calendar and Atlas' : 'Nothing pending'}>
                Pass through <span className="arrow">⟶</span> ${passCount}
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
    const objects = useWorkspaceStore((s) => s.objects); // object stars' names and colours

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const lens = useWorkspaceStore((s) => s.filters.lens);
    const setLens = useWorkspaceStore((s) => s.setLens);
    const layers = useMemo(() => lensLayers(lens, mode), [lens, mode]);
    const [collapsed, setCollapsed] = useState(() => new Set(/** @type {string[]} */ ([])));
    const [tick, setTick] = useState(0); // items become past (sealed) as time passes

    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(timer);
    }, []);

    const model = useMemo(
        () => buildModel(items, filters, mode, layers, collapsed, Date.now()),
        [items, filters, mode, layers, collapsed, tick, objects],
    );

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
                        setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(star.id)) next.delete(star.id);
                            else next.add(star.id);
                            return next;
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

    // the lenses that mean something in this mode (Matter always does)
    const lenses = LENSES.filter((l) => l.key === 'stage' || FACETS.find((f) => f.key === l.key)?.modes.includes(mode));

    return html`
        <div className="panel-body classifier">
          <div className="cls-stage">
            <div className="cls-host" ref=${hostRef} />
            ${status === 'ready' && html`
                <div className="cls-layers" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                    <span className="cls-layers-title">Lens</span>
                    ${lenses.map((l) => html`
                        <button key=${l.key} className=${`cls-layer ${lens === l.key ? 'on' : ''}`} onClick=${() => setLens(l.key)}
                            title=${`Colour the matter by ${l.label.toLowerCase()} in the Signal Chain, and show each ${l.key === 'stage' ? 'stage' : l.label.toLowerCase()} as a star. Active filters always show.`}>
                            ${l.label}
                        </button>
                    `)}
                </div>
                <button className="btn view-home" title="Frame everything" onClick=${() => sceneRef.current?.fit()}>⌂</button>
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
