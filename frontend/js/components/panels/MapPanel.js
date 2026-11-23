import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { DEFAULT_RING_RADIUS_KM, useWorkspaceStore } from '../../store.js';
import { LevelMap, loadMapLibraries } from '../../lib/levelMap.js';
import { KM_PER_MI, formatDistance } from '../../filters.js';
import { byMatter, itemLensColor } from '../../lib/lens.js';

/**
 * Proximity ring controls: place by clicking the map or anchor it on a site; set radius,
 * units and include/exclude; save the center as a new site; clear.
 * @param {{ mapRef: { current: LevelMap | null }, placing: boolean, setPlacing: (v: boolean) => void }} props
 */
function RingControl({ mapRef, placing, setPlacing }) {
    const ring = useWorkspaceStore((s) => s.filters.ring);
    const units = useWorkspaceStore((s) => s.filters.units);
    const entities = useWorkspaceStore((s) => s.entities);
    const setRing = useWorkspaceStore((s) => s.setRing);
    const setUnits = useWorkspaceStore((s) => s.setUnits);
    const toggleRangeMode = useWorkspaceStore((s) => s.toggleRangeMode);
    const anchorRingOnSite = useWorkspaceStore((s) => s.anchorRingOnSite);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const sites = entities.filter((o) => o.type === 'site' && o.lat != null && o.lon != null);
    const anchored = ring?.center.site_id ? entities.find((o) => o.id === ring.center.site_id) : null;

    const togglePlacing = () => {
        if (placing) { mapRef.current?.cancelPlacing(); setPlacing(false); }
        else { mapRef.current?.startPlacing(); setPlacing(true); }
    };

    /** Make the ring's center a new site, and anchor the ring on it. @param {string} siteName */
    const saveAsSite = async (siteName) => {
        if (!ring) return;
        const res = await createEntity('site', { name: siteName || 'Site', lat: ring.center.lat, lon: ring.center.lon });
        if (typeof res === 'string') { setError(res); return; }
        setError(null);
        setNaming(false); setName('');
        anchorRingOnSite(res.id);
    };

    const radiusInUnits = ring ? (units === 'mi' ? ring.radius_km / KM_PER_MI : ring.radius_km) : 0;
    /** @param {number} v */
    const setRadius = (v) => {
        if (!ring || !(v > 0)) return;
        setRing({ ...ring, radius_km: units === 'mi' ? v * KM_PER_MI : v });
    };


    return html`
        <div className="ring-ctl" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
            <div className="ring-ctl-title">◎ Proximity</div>
            <div className="ring-ctl-row">
                <button className=${`btn ring-btn ${placing ? 'active' : ''}`} onClick=${togglePlacing}
                    title="Then click the map to set the ring's center">
                    ${placing ? 'Click the map…' : ring ? 'Move center' : 'Place ring'}
                </button>
                ${sites.length > 0 && html`
                    <select className="btn ring-btn" value="" title="Center the ring on a site (from the Codex)"
                        onChange=${(/** @type {any} */ e) => e.target.value && anchorRingOnSite(e.target.value)}>
                        <option value="">⌖ Site…</option>
                        ${sites.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
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
                    ${anchored
                        ? html`<button className="ring-link" onClick=${() => { selectEntity(anchored.id); showPanel('codex'); }}
                            title="The ring is anchored on this site and follows it">⌖ open site</button>`
                        : naming
                            ? html`
                                <form className="ring-name" onSubmit=${(/** @type {Event} */ e) => { e.preventDefault(); saveAsSite(name.trim()); }}>
                                    <input autoFocus placeholder="Site name" value=${name} maxLength="200"
                                        onInput=${(/** @type {any} */ e) => setName(e.target.value)} />
                                    <button className="ring-link" type="submit">save</button>
                                </form>`
                            : html`<button className="ring-link" onClick=${() => setNaming(true)} title="Make the center a site in the Codex">save as site</button>`}
                </div>
                ${error && html`<div className="ring-ctl-row ring-ctl-error">${error}</div>`}
            `}
        </div>
    `;
}

/**
 * What to do with a site pin clicked on the Atlas.
 * @param {{ site: Entity, x: number, y: number, onClose: () => void }} props
 */
function SiteMenu({ site, x, y, onClose }) {
    const anchorRingOnSite = useWorkspaceStore((s) => s.anchorRingOnSite);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const linked = useWorkspaceStore((s) => s.adventures.filter((a) => a.entities.some((o) => o.id === site.id)).length);
    return html`
        <div className="site-menu" style=${{ left: `${x}px`, top: `${y}px` }} onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
            <div className="site-menu-head">
                <b>⌖ ${site.name}</b>
                <button className="pclose" onClick=${onClose} aria-label="Close">✕</button>
            </div>
            ${(site.address || site.city) && html`<div className="site-menu-sub">${[site.address, site.city].filter(Boolean).join(', ')}</div>`}
            <div className="site-menu-sub">${linked} linked ${linked === 1 ? 'adventure' : 'adventures'}</div>
            <div className="site-menu-actions">
                <button className="btn" onClick=${() => { anchorRingOnSite(site.id); onClose(); }}
                    title="Center the proximity ring here; it follows the site">◎ Anchor ring</button>
                <button className="btn ghost" onClick=${() => { selectEntity(site.id); showPanel('codex'); onClose(); }}>Open in Codex</button>
            </div>
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
    const entities = useWorkspaceStore((s) => s.entities);
    const atlasFocus = useWorkspaceStore((s) => s.atlasFocus);
    const lens = useWorkspaceStore((s) => s.filters.lens);
    // pins in the lens colour (Matter: the stage colour each item already has)
    const tinted = useMemo(
        () => (byMatter(lens) ? events : events.map((e) => ({ ...e, color: itemLensColor(e, lens) }))),
        [events, lens, entities],
    );
    const [siteMenu, setSiteMenu] = useState(/** @type {{ site: Entity, x: number, y: number } | null} */ (null));

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
                            center: { lat: p.lat, lon: p.lon, label: null, site_id: null },
                            radius_km: current?.radius_km ?? DEFAULT_RING_RADIUS_KM,
                            mode: current?.mode ?? 'include',
                        });
                        setPlacing(false);
                    },
                    onSiteClick: (/** @type {Entity} */ site, /** @type {{ x: number, y: number }} */ point) => setSiteMenu({ site, ...point }),
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
        mapRef.current?.updateNodes(tinted);
    }, [tinted, status]);

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

    useEffect(() => {
        mapRef.current?.setSites(entities.filter((o) => o.type === 'site'), ring?.center.site_id ?? null);
    }, [entities, ring?.center.site_id, status]);

    useEffect(() => {
        if (!atlasFocus) return;
        if (atlasFocus.radius_km) mapRef.current?.fitArea(atlasFocus.lat, atlasFocus.lon, atlasFocus.radius_km);
        else mapRef.current?.flyTo(atlasFocus.lat, atlasFocus.lon);
    }, [atlasFocus, status]);

    const menuSite = siteMenu && entities.find((o) => o.id === siteMenu.site.id);

    return html`
        <div className="panel-body map-panel">
            <div className="map-host" ref=${hostRef} onPointerDown=${() => setSiteMenu(null)} />
            ${status === 'ready' && html`<${RingControl} mapRef=${mapRef} placing=${placing} setPlacing=${setPlacing} />`}
            ${status === 'ready' && html`<button className="btn view-home" title="Frame everything" onClick=${() => mapRef.current?.fitAll()}>⌂</button>`}
            ${menuSite && siteMenu && html`<${SiteMenu} site=${menuSite} x=${siteMenu.x} y=${siteMenu.y} onClose=${() => setSiteMenu(null)} />`}
            ${status !== 'ready' && html`
                <div className="map-status">
                    ${status === 'loading' ? 'Opening the Atlas…' : 'Atlas failed to load (see console)'}
                </div>
            `}
        </div>
    `;
}
