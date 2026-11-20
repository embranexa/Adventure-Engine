import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { FACETS } from '../../filters.js';
import { buildModel } from '../../lib/classifierGraph.js';

const LAYERS_KEY = 'adventure-engine.classifier.layers';
/** @type {import('../../lib/classifierGraph.js').Layers} */
const DEFAULT_LAYERS = { source: true };

function loadLayers() {
    try {
        return JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') ?? DEFAULT_LAYERS;
    } catch {
        return DEFAULT_LAYERS; // storage blocked (private window etc.)
    }
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

/**
 * The Assay: a 3D knowledge graph of the whole pool. Stars are parents (facet values,
 * range filters, the Hermetic Seal), galaxies are Venn regions, and the portal at the
 * centre holds what passes every filter (the subset the calendar and map show).
 */
export function ClassifierPanel() {
    const items = useWorkspaceStore((s) => s.items); // the whole pool: filtered-out items show dimmed
    const filters = useWorkspaceStore((s) => s.filters);
    const mode = useWorkspaceStore((s) => s.mode);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const [layers, setLayers] = useState(loadLayers);
    const [collapsed, setCollapsed] = useState(() => new Set(/** @type {string[]} */ ([])));
    const [tick, setTick] = useState(0); // items become past (sealed) as time passes

    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(timer);
    }, []);

    const model = useMemo(
        () => buildModel(items, filters, mode, layers, collapsed, Date.now()),
        [items, filters, mode, layers, collapsed, tick],
    );

    // Load three.js + the scene only when this panel opens.
    useEffect(() => {
        let disposed = false;
        import('../../lib/classifierScene.js')
            .then(({ ClassifierScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new ClassifierScene(hostRef.current, {
                    onSelect: (/** @type {string} */ id) => useWorkspaceStore.getState().selectItem(id, 'classifier'),
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

    /** @param {FacetKey} key */
    const toggleLayer = (key) => {
        const next = { ...layers, [key]: !layers[key] };
        setLayers(next);
        try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    };

    return html`
        <div className="panel-body classifier">
            <div className="cls-host" ref=${hostRef} />
            ${status === 'ready' && html`
                <div className="cls-layers" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                    <span className="cls-layers-title">Layers</span>
                    ${FACETS.filter((f) => f.modes.includes(mode)).map((f) => html`
                        <button key=${f.key} className=${`cls-layer ${layers[f.key] ? 'on' : ''}`} onClick=${() => toggleLayer(f.key)}
                            title=${`Show every ${f.label.toLowerCase()} as a star (active filters always show)`}>
                            ${f.label}
                        </button>
                    `)}
                </div>
                <div className="cls-hint">
                    Click a star: include → exclude → off · right-click: collapse · click a galaxy to fly in · drag to orbit · scroll to zoom
                </div>
            `}
            ${status !== 'ready' && html`
                <div className="map-status">${status === 'loading' ? 'Opening the Assay…' : 'Classifier failed to load (see console)'}</div>
            `}
        </div>
    `;
}
