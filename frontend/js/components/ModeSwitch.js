import { useEffect, useMemo, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { freshMinutes, freshTitle } from '../lib/harvest.js';

/** "just now", "5m ago", "3h ago", "2d ago". @param {string | null} iso @param {number} now */
function ago(iso, now) {
    if (!iso) return 'never';
    const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Per-source counts of raw events by review state.
 * @param {EventRecord[]} events @returns {Record<string, Partial<Record<ReviewState, number>>>}
 */
function countBySource(events) {
    /** @type {Record<string, Partial<Record<ReviewState, number>>>} */
    const out = {};
    for (const e of events) {
        const row = (out[e.source] ??= {});
        row[e.review] = (row[e.review] ?? 0) + 1;
    }
    return out;
}

/**
 * Discovery's controls for the net (until the Signal Chain twin has them in 3D): each
 * source's Harvester (harvest, feed into the Centrifuge, siphon back) and the
 * Centrifuge's purge into the Sump.
 */
function HarvesterBar() {
    const sources = useWorkspaceStore((s) => s.sources);
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const syncSource = useWorkspaceStore((s) => s.syncSource);
    const feedSource = useWorkspaceStore((s) => s.feedSource);
    const siphonSource = useWorkspaceStore((s) => s.siphonSource);
    const purgeCentrifuge = useWorkspaceStore((s) => s.purgeCentrifuge);

    const counts = useMemo(() => countBySource(rawEvents), [rawEvents]);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000); // a fresh harvest goes stale
        return () => clearInterval(timer);
    }, []);
    const spinning = rawEvents.reduce((n, e) => n + (e.review === 'new' ? 1 : 0), 0);

    const purge = () => {
        if (spinning && window.confirm(`Purge ${spinning} event${spinning === 1 ? '' : 's'} from the Centrifuge into the Sump? (Each can be revived.)`)) {
            purgeCentrifuge();
        }
    };

    return html`
        <div className="harvesters" role="group" aria-label="Harvesters">
            ${Object.values(sources).map((src) => {
                const flux = counts[src.name]?.harvested ?? 0;
                const fed = counts[src.name]?.new ?? 0;
                const syncing = src.status === 'syncing';
                const fresh = syncing ? null : freshMinutes(src, now);
                return html`
                    <div key=${src.name} className=${`hv ${src.status}`}
                        title=${src.status === 'failed' ? `Last harvest failed: ${src.last_error ?? ''}` : `${flux} flux waiting · ${fed} in the Centrifuge${fresh != null ? ` · ${freshTitle(fresh)}` : ''}`}>
                        <span className="hv-name">${src.name}</span>
                        <b className="hv-count">${flux}</b>
                        <button className=${`btn hv-btn ${fresh != null ? 'fresh' : ''}`} disabled=${syncing || fresh != null} onClick=${() => syncSource(src.name)}
                            title="Crawl the source: events not harvested before fill this harvester">${syncing ? 'Harvesting…' : 'Harvest'}</button>
                        <button className="btn hv-btn" disabled=${!flux} onClick=${() => feedSource(src.name)}
                            title="Pour this harvester's events into the Centrifuge, to review them">Feed ⟶</button>
                        <button className="btn hv-btn" disabled=${!fed} onClick=${() => siphonSource(src.name)}
                            title="Draw this source's events back out of the Centrifuge">⟵ Siphon</button>
                    </div>
                `;
            })}
            <div className="hv centrifuge" title="Events being reviewed in Discovery">
                <span className="hv-name">Centrifuge</span>
                <b className="hv-count">${spinning}</b>
                <button className="btn hv-btn" disabled=${!spinning} onClick=${purge}
                    title="Send everything left in the Centrifuge to the Sump">Purge</button>
            </div>
        </div>
    `;
}

/**
 * Adventures / Discovery switch, the inbox (prima materia in the Centrifuge + last
 * harvest), and, in Discovery, the harvesters and the toggle for showing dross.
 */
export function ModeSwitch() {
    const mode = useWorkspaceStore((s) => s.mode);
    const setMode = useWorkspaceStore((s) => s.setMode);
    const showShades = useWorkspaceStore((s) => s.showShades);
    const toggleShades = useWorkspaceStore((s) => s.toggleShades);
    const spinning = useWorkspaceStore((s) => s.rawEvents.reduce((n, e) => n + (e.review === 'new' ? 1 : 0), 0));
    const adventureCount = useWorkspaceStore((s) => s.adventures.length);
    const lastSync = useWorkspaceStore((s) => Object.values(s.sources)
        .map((src) => src.last_sync_time)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null);

    // re-render periodically so "5m ago" stays current
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);

    return html`
        <div className="mode-switch" role="group" aria-label="Pool">
            <button
                className=${`mode-btn ${mode === 'adventures' ? 'active' : ''}`}
                onClick=${() => setMode('adventures')}
                title="Your adventures"
            >Adventures <b>${adventureCount}</b></button>
            <button
                className=${`mode-btn discovery ${mode === 'discovery' ? 'active' : ''}`}
                onClick=${() => setMode('discovery')}
                title=${`Review the prima materia in the Centrifuge (last harvest ${ago(lastSync, now)})`}
            >
                Discovery
                <span className=${`inbox ${spinning ? 'has-prima' : ''}`}>${spinning} in centrifuge</span>
                <small>harvested ${ago(lastSync, now)}</small>
            </button>
        </div>
        ${mode === 'discovery' && html`
            <${HarvesterBar} />
            <label className="shade-toggle" title="Also show ignored events (dross) so they can be revived">
                <input type="checkbox" checked=${showShades} onChange=${toggleShades} />
                Show dross
            </label>
        `}
    `;
}
