import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { occurrences, pastDates, weekdaysLabel } from '../lib/occurrences.js';
import { confirmHere } from '../lib/windows.js';

/** @param {Date} d */
const label = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const MONTH_MS = 31 * 864e5;

/**
 * A weekly adventure's dates, in the Arena: the ones you did become artifacts, one each; the
 * ones you didn't are left alone.
 * @param {{ adventure: AdventureRecord }} props
 */
export function SeriesDates({ adventure: a }) {
    const enshrineDate = useWorkspaceStore((s) => s.enshrineDate);
    const endSeries = useWorkspaceStore((s) => s.endSeries);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const error = useWorkspaceStore((s) => s.actionError);
    const [busy, setBusy] = useState(/** @type {string | null} */ (null));
    const [tried, setTried] = useState(false);   // the error is this one's
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
    const past = pastDates(a, now), next = occurrences(a, now, new Date(now.getTime() + MONTH_MS)).find((o) => o.start > now);
    const did = async (/** @type {(typeof past)[number]} */ o) => { setTried(true); setBusy(o.key); await enshrineDate(a.id, o.key, o.start, o.allDay ? new Date(o.end.getTime() - 864e5) : o.end); setBusy(null); };
    return html`
        <div className="sd">
            <div className="sd-head"><span>↻ ${a.recurrence && weekdaysLabel(a.recurrence)}</span>${next && html`<small>next ${label(next.start)}</small>`}
                ${a.done_dates.length > 0 && html`<button className="cls-layer" onClick=${() => showPanel('treasury')}>${a.done_dates.length} artifact${a.done_dates.length === 1 ? '' : 's'} ⟶</button>`}</div>
            ${past.length > 0 && html`<div className="sd-dates" role="group" aria-label="Dates you did">${past.map((o) => html`
                <button key=${o.key} className=${`sd-date ${o.done ? 'done' : ''}`} disabled=${o.done || busy === o.key} title=${o.done ? 'An artifact in the Treasury' : 'You did it: it becomes an artifact'} onClick=${() => did(o)}>${o.done ? '✓' : '✦'} ${label(o.start)}</button>`)}</div>`}
            ${!past.length && html`<small className="nec-dim">Its dates appear here once they begin</small>`}
            ${tried && error && html`<div className="nc-error" role="alert">${error}</div>`}
            ${a.done_dates.length > 0 && html`<div className="pr-foot"><button className="btn ghost" title="No more dates: the series goes to the Archive, its artifacts stay" onClick=${() => { if (confirmHere(`End “${a.title}”? Its artifacts stay in the Treasury.`)) { setTried(true); endSeries(a.id); } }}>⌛ End the series</button></div>`}
        </div>
    `;
}
