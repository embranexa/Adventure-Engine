import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { EPITAPH_CAUSES } from '../lifecycle.js';

const SHOW_MS = 12_000;
const CAUSES = /** @type {EpitaphCause[]} */ (Object.keys(EPITAPH_CAUSES)).filter((c) => c !== 'missed'); // missed is the sweeper's

/**
 * After a kill, a toast asks why it died: one click writes the epitaph. Optional; it
 * leaves by itself (but not while you're pointing at it or working in it).
 */
export function EpitaphToast() {
    const prompt = useWorkspaceStore((s) => s.epitaphPrompt);
    const dismiss = useWorkspaceStore((s) => s.dismissEpitaphPrompt);
    const saveEpitaph = useWorkspaceStore((s) => s.saveEpitaph);
    const adventure = useWorkspaceStore((s) => s.adventures.find((a) => a.id === prompt?.adventureId));
    const [held, setHeld] = useState(false);
    const [note, setNote] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));

    useEffect(() => { setNote(''); setError(null); setHeld(false); }, [prompt?.at]);
    useEffect(() => {
        if (!prompt || held || note) return;
        const timer = setTimeout(dismiss, SHOW_MS);
        return () => clearTimeout(timer);
    }, [prompt, held, note]);
    // revived meanwhile (here or in another window): nothing to ask
    useEffect(() => { if (prompt && adventure && adventure.phase !== 'killed') dismiss(); }, [adventure?.phase]);

    if (!prompt) return null;
    const carve = async (/** @type {EpitaphCause} */ cause) => {
        const problem = await saveEpitaph(prompt.adventureId, cause, note);
        if (problem) setError(problem); else dismiss();
    };
    return html`
        <div className="epitaph-toast" role="dialog" aria-label="Epitaph"
            onPointerEnter=${() => setHeld(true)} onPointerLeave=${() => setHeld(false)} onFocus=${() => setHeld(true)} onBlur=${() => setHeld(false)}>
            <div className="epitaph-head"><span>Why did <b>${prompt.title}</b> die?</span><button className="pclose" onClick=${dismiss} title="No epitaph" aria-label="No epitaph">✕</button></div>
            <input type="text" value=${note} maxLength=${2000} placeholder="In your words (optional), then choose a cause" aria-label="Epitaph note"
                onInput=${(/** @type {any} */ e) => setNote(e.target.value)} />
            <div className="nec-causes">
                ${CAUSES.map((c) => html`<button key=${c} className="cls-layer" onClick=${() => carve(c)}>${EPITAPH_CAUSES[c]}</button>`)}
            </div>
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
