import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { OUTCOMES, named } from '../lib/assay.js';

/** What was found, and from where. @param {{ record: AssayRecord }} props */
function Result({ record }) {
    const o = record.outcome ? OUTCOMES[record.outcome] : null, found = named(Object.keys(record.sources ?? {}));
    return html`<span className="as-result">${o && html`<b style=${{ color: o.color }}>${o.label}</b>`}${record.why && ` · ${record.why}`}${found && html` · <span title=${Object.entries(record.sources ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')}>${found}</span>`}</span>`;
}

/**
 * A specimen's reading, a button to read it (again), and a cover by hand; or, for an
 * adventure with a link, filling its blanks.
 * @param {{ item: PoolItem }} props
 */
export function AssayRow({ item }) {
    const assayEvents = useWorkspaceStore((s) => s.assayEvents);
    const setEventCover = useWorkspaceStore((s) => s.setEventCover);
    const fillFromLink = useWorkspaceStore((s) => s.fillFromLink);
    const [cover, setCover] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(/** @type {string | null} */ (null));
    useEffect(() => { setCover(''); setNote(null); }, [item.id]);

    if (item.kind === 'adventure') {
        const places = item.type !== 'item';
        const blank = !item.cover_url || !item.description || (places && (!item.start || item.lat == null || item.location_approximate));
        if (!item.url || (!blank && !item.assay)) return null;
        const fill = async () => {
            setBusy(true); setNote(null);
            const r = await fillFromLink(item.id);
            setBusy(false);
            setNote(r.error ?? (r.filled?.length ? `Filled ${named(r.filled)}` : r.why ?? 'Nothing to fill'));
        };
        return html`<div className="as-row">${blank && html`<button className="cls-layer" disabled=${busy} title="Read its link and fill what’s blank" onClick=${fill}>⚖ ${busy ? 'Reading…' : 'Assay'}</button>`}
            ${note ? html`<span className="as-result">${note}</span>` : item.assay && html`<${Result} record=${item.assay} />`}</div>`;
    }
    if (item.review !== 'new') return null;
    const byHand = item.assay?.sources?.cover_url === 'by hand', wants = item.missing.includes('cover') || byHand;
    if (!item.missing.length && !item.assay) return null;
    return html`
        <div className="as-row">
            ${item.missing.length > 0 && html`<button className="cls-layer" title="Into the Assayer: its page is read" onClick=${() => assayEvents([item.id], true)}>⚖ Assay</button>`}
            ${item.assay && html`<${Result} record=${item.assay} />`}
        </div>
        ${wants && html`<form className="lk-row" onSubmit=${(/** @type {Event} */ e) => { e.preventDefault(); if (cover.trim()) { setEventCover(item.id, cover.trim()); setCover(''); } }}>
            <input className="ol-input" type="url" value=${cover} placeholder=${byHand ? 'Another cover: paste an image’s link…' : 'A cover by hand: paste an image’s link…'} aria-label="Cover link" onInput=${(/** @type {any} */ e) => setCover(e.target.value)} />
            <button className="btn" type="submit" disabled=${!cover.trim()}>Set</button>
            ${byHand && html`<button className="btn ghost" type="button" onClick=${() => setEventCover(item.id, null)}>Remove</button>`}
        </form>`}
    `;
}
