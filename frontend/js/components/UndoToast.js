import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';

/** How long a transfer's toast stays up. Ctrl+Z works for longer: the whole undo stack. */
const SHOW_MS = 10_000;

/** Typing in a field: Ctrl+Z belongs to the field. @param {EventTarget | null} t */
const typing = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * After a bulk transfer (feed, siphon, purge, a pass-through's), a toast says what moved
 * and offers Undo. Ctrl+Z (outside text fields) steps back through the undo stack.
 */
export function UndoToast() {
    const stack = useWorkspaceStore((s) => s.undoStack);
    const undo = useWorkspaceStore((s) => s.undoTransfer);
    const [now, setNow] = useState(Date.now());
    const last = stack.at(-1);
    const shown = last && now - last.at < SHOW_MS;

    // tick while a toast is up, so it leaves on time
    useEffect(() => {
        if (!last) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [last]);

    useEffect(() => {
        const onKey = (/** @type {KeyboardEvent} */ e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing(e.target)
                && useWorkspaceStore.getState().undoStack.length) {
                e.preventDefault();
                undo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo]);

    if (!shown) return null;
    return html`
        <div className="undo-toast" role="status">
            <span className="undo-label">${last.label}</span>
            <button className="btn undo-btn" onClick=${undo} title="Ctrl+Z also undoes, step by step">↶ Undo</button>
            ${stack.length > 1 && html`<span className="undo-depth">${stack.length} steps</span>`}
        </div>
    `;
}
