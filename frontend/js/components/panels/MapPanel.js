import { useEffect, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { LevelMap, loadMapLibraries } from '../../lib/levelMap.js';

/**
 * 3D event map. Owns one imperative LevelMap and keeps it in sync with the store:
 *   store -> map: events, selection (flies there unless the map made it), hover
 *   map -> store: clicks select (source 'map'), pointer hover
 * The map libraries (~1.7 MB) load the first time a map panel opens.
 */
export function MapPanel() {
    const events = useWorkspaceStore((s) => s.events);
    const selectedId = useWorkspaceStore((s) => s.selectedEventId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredEventId);

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const mapRef = useRef(/** @type {LevelMap | null} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));

    // Create the map once; dispose it when the panel unmounts (tab switch, close).
    useEffect(() => {
        let disposed = false;
        loadMapLibraries()
            .then(() => {
                if (disposed || !hostRef.current) return;
                mapRef.current = new LevelMap(hostRef.current, {
                    onSelect: (id) => useWorkspaceStore.getState().selectEvent(id, 'map'),
                    onHover: (id) => useWorkspaceStore.getState().hoverEvent(id),
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

    return html`
        <div className="panel-body map-panel">
            <div className="map-host" ref=${hostRef} />
            ${status !== 'ready' && html`
                <div className="map-status">
                    ${status === 'loading' ? 'Loading map…' : 'Map failed to load (see console)'}
                </div>
            `}
        </div>
    `;
}
