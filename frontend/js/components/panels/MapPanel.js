import { useEffect, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { LevelMap, loadMapLibraries } from '../../lib/levelMap.js';
import { KM_PER_MI, formatDistance } from '../../filters.js';

const DEFAULT_RADIUS_KM = 5 * KM_PER_MI;

/**
 * Proximity ring controls: place by clicking the map or from a saved place; set radius,
 * units and include/exclude; save the center as a place; clear.
 * @param {{ mapRef: { current: LevelMap | null }, placing: boolean, setPlacing: (v: boolean) => void }} props
 */
function RingControl({ mapRef, placing, setPlacing }) {
    const ring = useWorkspaceStore((s) => s.filters.ring);
    const units = useWorkspaceStore((s) => s.filters.units);
    const places = useWorkspaceStore((s) => s.places);
    const setRing = useWorkspaceStore((s) => s.setRing);
    const setUnits = useWorkspaceStore((s) => s.setUnits);
    const toggleRangeMode = useWorkspaceStore((s) => s.toggleRangeMode);
    const savePlace = useWorkspaceStore((s) => s.savePlace);
    const deletePlace = useWorkspaceStore((s) => s.deletePlace);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');

    const togglePlacing = () => {
        if (placing) { mapRef.current?.cancelPlacing(); setPlacing(false); }
        else { mapRef.current?.startPlacing(); setPlacing(true); }
    };

    /** @param {string} id */
    const useSavedPlace = (id) => {
        const p = places.find((x) => x.id === id);
        if (!p) return;
        setRing({
            center: { lat: p.lat, lon: p.lon, label: p.label },
            radius_km: ring?.radius_km ?? DEFAULT_RADIUS_KM,
            mode: ring?.mode ?? 'include',
        });
    };

    const radiusInUnits = ring ? (units === 'mi' ? ring.radius_km / KM_PER_MI : ring.radius_km) : 0;
    /** @param {number} v */
    const setRadius = (v) => {
        if (!ring || !(v > 0)) return;
        setRing({ ...ring, radius_km: units === 'mi' ? v * KM_PER_MI : v });
    };

    const matchingPlace = ring && places.find((p) => p.lat === ring.center.lat && p.lon === ring.center.lon);

    return html`
        <div className="ring-ctl" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
            <div className="ring-ctl-title">◎ Proximity</div>
            <div className="ring-ctl-row">
                <button className=${`btn ring-btn ${placing ? 'active' : ''}`} onClick=${togglePlacing}
                    title="Then click the map to set the ring's center">
                    ${placing ? 'Click the map…' : ring ? 'Move center' : 'Place ring'}
                </button>
                ${places.length > 0 && html`
                    <select className="btn ring-btn" value="" onChange=${(/** @type {any} */ e) => useSavedPlace(e.target.value)}>
                        <option value="">Saved place…</option>
                        ${places.map((p) => html`<option key=${p.id} value=${p.id}>${p.label}</option>`)}
                    </select>
                `}
            </div>
            ${ring && html`
                <div className="ring-ctl-row">
                    <input
                        className="ring-radius" type="number" min="0.1" step="0.5"
                        value=${Number(radiusInUnits.toFixed(1))}
                        onChange=${(/** @type {any} */ e) => setRadius(parseFloat(e.target.value))}
                        title="Radius"
                    />
                    <button className="btn ring-btn" onClick=${() => setUnits(units === 'mi' ? 'km' : 'mi')} title="Switch units">${units}</button>
                    <button className=${`btn ring-btn mode-${ring.mode}`} onClick=${() => toggleRangeMode('ring')}
                        title="Include = keep what's inside; exclude = keep what's outside">
                        ${ring.mode === 'include' ? 'inside' : 'outside'}
                    </button>
                    <button className="btn ring-btn" onClick=${() => setRing(null)} title="Remove the proximity filter">✕</button>
                </div>
                <div className="ring-ctl-row ring-ctl-meta">
                    <span>${ring.center.label || `${ring.center.lat.toFixed(4)}, ${ring.center.lon.toFixed(4)}`} · ${formatDistance(ring.radius_km, units)}</span>
                    ${matchingPlace
                        ? html`<button className="ring-link" onClick=${() => deletePlace(matchingPlace.id)}>forget place</button>`
                        : naming
                            ? html`
                                <form className="ring-name" onSubmit=${(/** @type {Event} */ e) => {
                                    e.preventDefault();
                                    savePlace(name || 'Place', ring.center.lat, ring.center.lon);
                                    setRing({ ...ring, center: { ...ring.center, label: name || 'Place' } });
                                    setNaming(false); setName('');
                                }}>
                                    <input autoFocus placeholder="Name" value=${name} maxLength="100"
                                        onInput=${(/** @type {any} */ e) => setName(e.target.value)} />
                                    <button className="ring-link" type="submit">save</button>
                                </form>`
                            : html`<button className="ring-link" onClick=${() => setNaming(true)}>save as place</button>`}
                </div>
            `}
        </div>
    `;
}

/**
 * 3D event map. Owns one imperative LevelMap and keeps it in sync with the store:
 *   store -> map: the filtered items, selection (flies there unless the map made it),
 *                 hover, the proximity ring
 *   map -> store: clicks select (source 'map'), pointer hover, ring placed / dragged
 * The map libraries (~1.7 MB) load the first time a map panel opens.
 */
export function MapPanel() {
    const events = useWorkspaceStore((s) => s.visibleItems); // the filtered subset
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const ring = useWorkspaceStore((s) => s.filters.ring);
    const units = useWorkspaceStore((s) => s.filters.units);

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const mapRef = useRef(/** @type {LevelMap | null} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const [placing, setPlacing] = useState(false);

    // Create the map once; dispose it when the panel unmounts (tab switch, close).
    useEffect(() => {
        let disposed = false;
        loadMapLibraries()
            .then(() => {
                if (disposed || !hostRef.current) return;
                const store = useWorkspaceStore.getState;
                mapRef.current = new LevelMap(hostRef.current, {
                    onSelect: (id) => store().selectItem(id, 'map'),
                    onHover: (id) => store().hoverItem(id),
                    onRingChange: (/** @type {Ring} */ r) => store().setRing(r),
                    onRingPlace: (/** @type {{ lat: number, lon: number }} */ p) => {
                        const current = store().filters.ring;
                        store().setRing({
                            center: { lat: p.lat, lon: p.lon, label: null },
                            radius_km: current?.radius_km ?? DEFAULT_RADIUS_KM,
                            mode: current?.mode ?? 'include',
                        });
                        setPlacing(false);
                    },
                });
                setStatus('ready'); // re-runs the sync effects below with the new map
            })
            .catch((err) => {
                console.error('[map] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            mapRef.current?.dispose();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        mapRef.current?.updateNodes(events);
    }, [events, status]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || map.selectedId === selectedId) return; // already in sync (e.g. the map made it)
        map.select(selectedId, { fly: selectionSource !== 'map', emit: false });
    }, [selectedId, selectionSource, status]);

    useEffect(() => {
        mapRef.current?.highlight(hoveredId);
    }, [hoveredId, status]);

    useEffect(() => {
        mapRef.current?.setRing(ring, units);
    }, [ring, units, status]);

    return html`
        <div className="panel-body map-panel">
            <div className="map-host" ref=${hostRef} />
            ${status === 'ready' && html`<${RingControl} mapRef=${mapRef} placing=${placing} setPlacing=${setPlacing} />`}
            ${status !== 'ready' && html`
                <div className="map-status">
                    ${status === 'loading' ? 'Loading map…' : 'Map failed to load (see console)'}
                </div>
            `}
        </div>
    `;
}
