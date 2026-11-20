import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';

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
 * Adventures / Discovery switch, the inbox (omens waiting for review + last sync),
 * and, in Discovery, the toggle for showing shades (ignored events) to revive.
 */
export function ModeSwitch() {
    const mode = useWorkspaceStore((s) => s.mode);
    const setMode = useWorkspaceStore((s) => s.setMode);
    const showShades = useWorkspaceStore((s) => s.showShades);
    const toggleShades = useWorkspaceStore((s) => s.toggleShades);
    const omenCount = useWorkspaceStore((s) => s.rawEvents.reduce((n, e) => n + (e.review === 'new' ? 1 : 0), 0));
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
                title=${`Review new omens from the Sensorium (last sync ${ago(lastSync, now)})`}
            >
                Discovery
                <span className=${`inbox ${omenCount ? 'has-omens' : ''}`}>${omenCount} omen${omenCount === 1 ? '' : 's'}</span>
                <small>synced ${ago(lastSync, now)}</small>
            </button>
        </div>
        ${mode === 'discovery' && html`
            <label className="shade-toggle" title="Also show ignored events (shades in Limbo) so they can be revived">
                <input type="checkbox" checked=${showShades} onChange=${toggleShades} />
                Show shades
            </label>
        `}
    `;
}
