import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';

const NEXT = /** @type {const} */ ({ open: 'achieved', achieved: 'failed', failed: 'open' });
const MARK = /** @type {const} */ ({ open: '○', achieved: '✓', failed: '✕' });

/** The outcome its primary objectives point to: 0 defeat, 1 draw, 2 success; null while any is open, or with none.
 *  @param {Objective[]} objectives */
export function suggestedOutcome(objectives) {
    const primary = objectives.filter((o) => o.kind === 'primary');
    if (!primary.length || primary.some((o) => o.state === 'open')) return null;
    const won = primary.filter((o) => o.state === 'achieved').length;
    return won === primary.length ? 2 : won ? 1 : 0;
}

/**
 * What counts as winning: primary and bonus objectives. The mark cycles open, achieved,
 * failed. With `edit`, they can be added, reworded and removed.
 * @param {{ adventure: AdventureRecord, edit?: boolean, readOnly?: boolean }} props
 */
export function Objectives({ adventure, edit = false, readOnly = false }) {
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const [text, setText] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const list = adventure.objectives;
    if (!edit && !list.length) return null;

    const save = async (/** @type {Objective[]} */ objectives) => {
        const err = await updateAdventure(adventure.id, { objectives });
        setError(err);
        return err;
    };
    const put = (/** @type {string} */ id, /** @type {Partial<Objective>} */ c) => save(list.map((o) => (o.id === id ? { ...o, ...c } : o)));
    const add = async () => {
        const t = text.trim();
        if (!t) return;
        if (!(await save([...list, { id: Date.now().toString(36), text: t, kind: 'primary', state: 'open' }]))) setText('');
    };
    const sorted = [...list].sort((a, b) => Number(a.kind === 'bonus') - Number(b.kind === 'bonus'));

    return html`
        <div className="obj">
            <div className="ol-head">Objectives${list.length > 0 && html` <b>${list.filter((o) => o.state === 'achieved').length}/${list.length}</b>`}</div>
            ${sorted.map((o) => html`
                <div key=${o.id} className=${`obj-row s-${o.state} ${o.kind}`}>
                    <button className="obj-mark" disabled=${readOnly} aria-label=${`${o.text}: ${o.state}`} title=${readOnly ? o.state : `${o.state} · click for ${NEXT[o.state]}`}
                        onClick=${() => put(o.id, { state: NEXT[o.state] })}>${MARK[o.state]}</button>
                    ${edit
                        ? html`<input key=${o.text} className="obj-text" defaultValue=${o.text} maxLength=${300} aria-label="Objective"
                            onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') /** @type {HTMLElement} */ (e.target).blur(); }}
                            onBlur=${(/** @type {any} */ e) => { const t = e.target.value.trim(); if (!t) e.target.value = o.text; else if (t !== o.text) put(o.id, { text: t }); }} />`
                        : html`<span className="obj-text">${o.text}</span>`}
                    ${edit
                        ? html`<button className="cls-layer" title="Primary objectives decide it; bonus ones don’t" onClick=${() => put(o.id, { kind: o.kind === 'primary' ? 'bonus' : 'primary' })}>${o.kind}</button>
                            <button className="ol-chip-x" aria-label=${`Remove ${o.text}`} onClick=${() => save(list.filter((x) => x.id !== o.id))}>✕</button>`
                        : o.kind === 'bonus' && html`<small>bonus</small>`}
                </div>
            `)}
            ${edit && html`<input className="ol-input" value=${text} maxLength=${300} placeholder="+ An objective…" aria-label="New objective"
                onInput=${(/** @type {any} */ e) => setText(e.target.value)} onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') add(); }} onBlur=${add} />`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
