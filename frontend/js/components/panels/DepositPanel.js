import { useEffect, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { siteOf } from '../../lib/assay.js';

/** @typedef {{ id: string, url: string, status: 'waiting' | 'held', why: string | null, title: string | null }} Link */

/**
 * The Deposit: drop links in, and each page is read into an event in its harvester. Links
 * whose pages don't say enough are held, to make by hand or forget.
 */
export function DepositPanel() {
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const createFromLink = useWorkspaceStore((s) => s.createFromLink);
    const feedSource = useWorkspaceStore((s) => s.feedSource);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [text, setText] = useState('');
    const [links, setLinks] = useState(/** @type {Link[]} */ ([]));
    const [note, setNote] = useState(/** @type {string | null} */ (null));
    const load = () => fetch('/api/deposit').then((r) => (r.ok ? r.json() : null)).then((l) => l && setLinks(l)).catch(() => {});
    const waiting = links.filter((l) => l.status === 'waiting'), held = links.filter((l) => l.status === 'held');
    const inside = rawEvents.filter((e) => e.source === 'deposit' && e.review === 'harvested');
    useEffect(() => { load(); }, [inside.length]);
    useEffect(() => {
        if (!waiting.length) return;
        const t = setInterval(load, 1500);
        return () => clearInterval(t);
    }, [waiting.length > 0]);

    const drop = async () => {
        if (!text.trim()) return;
        const res = await fetch('/api/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
        if (!res?.ok) { setNote('Not saved'); return; }
        const r = await res.json();
        setText('');
        setNote([`${r.added} added`, r.skipped && `${r.skipped} dropped in before`, r.bad.length && `not links: ${r.bad.join(', ')}`].filter(Boolean).join(' · '));
        load();
    };
    const forget = async (/** @type {Link} */ l) => { await fetch(`/api/deposit/${l.id}`, { method: 'DELETE' }).catch(() => {}); load(); };
    const make = async (/** @type {Link} */ l) => {
        const res = await createFromLink(l.url, true);
        if (res.error) { setNote(res.error); return; }
        await forget(l);
        showPanel('node');
    };
    return html`
        <div className="panel-body assayer">
            <section className="nec-pane">
                <textarea className="ana-notes dp-box" rows=${4} value=${text} placeholder="Links, one per line…" aria-label="Links" onInput=${(/** @type {any} */ e) => setText(e.target.value)}
                    onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); drop(); } }}></textarea>
                <div className="cx-detail-head"><span className="as-result">${note ?? ''}</span><button className="btn" disabled=${!text.trim()} onClick=${drop} title="Ctrl+Enter">⤓ Deposit</button></div>
            </section>
            ${waiting.length > 0 && html`<section className="nec-pane"><h4>Reading ${waiting.length}</h4>
                ${waiting.slice(0, 10).map((l, i) => html`<div key=${l.id} className=${`as-item ${i ? '' : 'now'}`}><i></i><b>${l.url}</b><em>${siteOf(l.url)}</em></div>`)}</section>`}
            ${inside.length > 0 && html`<section className="nec-pane"><div className="cx-detail-head"><h4>In the harvester</h4><button className="cls-layer" onClick=${() => feedSource('deposit')}>Feed ⟶</button></div>
                ${inside.map((e) => html`<div key=${e.id} className="as-item"><i></i><b>${e.title}</b><em>${e.missing.length ? `lacks ${e.missing.join(', ')}` : 'ore'}</em></div>`)}</section>`}
            ${held.length > 0 && html`<section className="nec-pane"><h4>Held</h4>
                ${held.map((l) => html`<div key=${l.id} className="as-item dp-held"><b title=${l.url}>${l.title ?? l.url}<small>${siteOf(l.url)} · ${l.why}</small></b>
                    <button className="cls-layer" title="Make an adventure with what there is" onClick=${() => make(l)}>✦ Make</button><button className="pclose" aria-label="Forget this link" title="Forget it" onClick=${() => forget(l)}>✕</button></div>`)}</section>`}
        </div>
    `;
}
