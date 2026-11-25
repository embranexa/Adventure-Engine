import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';

/**
 * The Lode's link box: paste a page's link and its adventure is made already filled in. A
 * link that's already here is offered instead.
 */
export function LinkBox() {
    const createFromLink = useWorkspaceStore((s) => s.createFromLink);
    const setMode = useWorkspaceStore((s) => s.setMode);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const passEvent = useWorkspaceStore((s) => s.passEvent);
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [there, setThere] = useState(/** @type {Awaited<ReturnType<typeof createFromLink>>['existing'] | null} */ (null));

    const send = async (force = false) => {
        if (!url.trim() || busy) return;
        setBusy(true); setError(null); setThere(null);
        const res = await createFromLink(url.trim(), force);
        setBusy(false);
        if (res.error) setError(res.error);
        else if (res.existing) setThere(res.existing);
        else setUrl('');
    };
    const open = () => { if (!there) return; setMode(there.kind === 'adventure' ? 'adventures' : 'discovery'); setTimeout(() => selectItem(there.id, 'create'), 0); };
    return html`
        <form className="lk" onSubmit=${(/** @type {Event} */ e) => { e.preventDefault(); send(); }}>
            <div className="lk-row">
                <input className="ol-input" type="text" inputMode="url" value=${url} disabled=${busy} placeholder="Paste a link: an event, or a thing…" aria-label="Link"
                    onInput=${(/** @type {any} */ e) => { setUrl(e.target.value); setThere(null); setError(null); }} />
                <button className="btn" type="submit" disabled=${busy || !url.trim()}>${busy ? 'Reading…' : '⚖ Make'}</button>
            </div>
            ${there && html`<div className="lk-there"><span>Already here: <b>${there.title}</b></span>
                ${(there.kind === 'adventure' || there.review === 'new' || there.review === 'ignored') && html`<button type="button" className="cls-layer" onClick=${open}>Open</button>`}
                ${there.kind === 'event' && there.review === 'new' && html`<button type="button" className="cls-layer" onClick=${() => { passEvent(there.id); setThere(null); setUrl(''); }}>✦ Pass it</button>`}
                <button type="button" className="cls-layer" onClick=${() => send(true)}>Make another</button></div>`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </form>
    `;
}
