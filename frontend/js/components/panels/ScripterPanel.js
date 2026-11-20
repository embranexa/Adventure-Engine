import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { analyze, orEmpty, parseScript, toScript } from '../../lib/roadmap.js';

const SCRIPT_HELP = 'A1[Buy tickets] --> A2[Book hotel]   ·   A1 --> A3   ·   # comment';

/**
 * The Scripter: the selected adventure's roadmap as script text (the Alembic draws it).
 * Changes apply on Compile (or Ctrl+Enter); until then the text is yours, otherwise it
 * follows edits made in the Alembic.
 */
export function ScripterPanel() {
    const item = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId] : null));
    const saveRoadmap = useWorkspaceStore((s) => s.saveRoadmap);
    const showPanel = useWorkspaceStore((s) => s.showPanel);

    const adventure = item?.kind === 'adventure' ? item : null;
    const roadmap = orEmpty(adventure?.roadmap);
    const analysis = useMemo(() => analyze(roadmap), [roadmap]);

    const [text, setText] = useState(() => toScript(roadmap));
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    // another adventure: drop the draft
    useEffect(() => { setDirty(false); setError(null); }, [adventure?.id]);
    useEffect(() => { if (!dirty) setText(toScript(roadmap)); }, [roadmap, dirty]);

    if (!adventure) {
        return html`
            <div className="panel-body scripter">
                <div className="nc-empty">
                    ${item ? 'Omens have no roadmap' : 'Nothing selected'}
                    <small>${item ? 'Pass it first: it becomes ore' : 'Select an adventure to script its actions'}</small>
                </div>
            </div>
        `;
    }

    const compile = () => {
        const result = parseScript(text, roadmap);
        if (result.error !== null) { setError(result.error); return; }
        setError(null);
        setDirty(false);
        saveRoadmap(adventure.id, result.roadmap);
    };
    const revert = () => { setDirty(false); setError(null); };
    const resetProgress = () => saveRoadmap(adventure.id, { ...roadmap, done: [] });

    return html`
        <div className="panel-body scripter">
            <div className="scr-head">
                <span className="scr-title" title=${adventure.title}>${adventure.title}</span>
                <button className="cls-layer" onClick=${() => showPanel('alembic')} title="Show the roadmap in the Alembic">Alembic ⟶</button>
            </div>
            <textarea
                className="scr-text"
                spellCheck=${false}
                value=${text}
                placeholder=${'# One statement per line\nA1[First step] --> A2[Second step]\nA1 --> A3[In parallel]'}
                onInput=${(/** @type {any} */ e) => { setText(e.target.value); setDirty(true); setError(null); }}
                onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compile(); }
                    if (e.key === 'Escape' && dirty) { e.preventDefault(); revert(); }
                }}
            ></textarea>
            ${error
                ? html`<div className="scr-error">${error}</div>`
                : html`<div className="scr-help">${SCRIPT_HELP}</div>`}
            <div className="scr-actions">
                <button className="btn" onClick=${compile} disabled=${!dirty} title="Ctrl+Enter">⚡ Compile</button>
                ${dirty && html`<button className="btn ghost" onClick=${revert} title="Esc">Revert</button>`}
                <span className="scr-spacer"></span>
                <button className="btn ghost" onClick=${resetProgress} disabled=${!analysis.doneCount}
                    title="Mark every action as not done">↺ Reset progress</button>
            </div>
            <div className="scr-status">
                <span className=${dirty ? 'scr-dirty' : ''}>${dirty ? '● Edited, not compiled' : `${analysis.total} ${analysis.total === 1 ? 'action' : 'actions'}`}</span>
                <span><b>${analysis.doneCount}</b> / ${analysis.total} complete</span>
            </div>
        </div>
    `;
}
