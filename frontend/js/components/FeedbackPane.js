import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { effectsAtWork } from '../lib/items.js';
import { targetLabel } from '../lib/targets.js';
import { Amp } from './EffectRows.js';

const RESULTS = /** @type {const} */ ([['helped', 'Helped'], ['none', 'No effect'], ['hurt', 'Hurt']]);

/**
 * What helped and what hurt: every effect that was at work, judged, and any you add. Part of
 * the analysis; recorded only.
 * @param {{ adventure: AdventureRecord, rows: FeedbackRow[], editing: boolean, onChange: (rows: FeedbackRow[]) => void }} props
 */
export function FeedbackPane({ adventure, rows, editing, onChange }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    // judged ones stay even if their preparation is gone
    const judged = new Set(rows.map((r) => r.key));
    /** @type {FeedbackRow[]} */
    const fresh = effectsAtWork(adventure, adventures).filter((e) => !judged.has(e.key)).map((e) => ({ ...e, result: null }));
    const all = editing ? [...rows, ...fresh] : rows.filter((r) => r.result || r.label);
    const put = (/** @type {FeedbackRow} */ row, /** @type {Partial<FeedbackRow>} */ c) => onChange(judged.has(row.key) ? rows.map((r) => (r.key === row.key ? { ...r, ...c } : r)) : [...rows, { ...row, ...c }]);
    if (!editing && !all.length) return null;

    return html`
        <section className="nec-pane">
            <h4>Buffs and debuffs</h4>
            ${all.map((r) => {
                const own = r.key.startsWith('own:'), target = r.target && targetLabel(r.target, entities);
                return html`
                    <div key=${r.key} className="fb">
                        ${own && editing
                            ? html`<input type="text" value=${r.label} maxLength=${500} placeholder="What helped or hurt" aria-label="What helped or hurt" onInput=${(/** @type {any} */ e) => put(r, { label: e.target.value })} />`
                            : html`<span>${r.label}${target && html` <small>${target} <${Amp} rating=${r.rating} /></small>`}</span>`}
                        ${editing
                            ? html`<div className="fb-choices" role="group" aria-label=${`How ${r.label || 'it'} went`}>
                                ${RESULTS.map(([k, label]) => html`<button key=${k} className=${`cls-layer r-${k} ${r.result === k ? 'on' : ''}`} aria-pressed=${r.result === k} onClick=${() => put(r, { result: r.result === k ? null : k })}>${label}</button>`)}
                                ${own && html`<button className="pclose" aria-label="Remove" onClick=${() => onChange(rows.filter((x) => x.key !== r.key))}>✕</button>`}</div>`
                            : html`<b className=${`r-${r.result}`}>${RESULTS.find(([k]) => k === r.result)?.[1] ?? ''}</b>`}
                    </div>
                `;
            })}
            ${editing && html`<div><button className="cls-layer" onClick=${() => onChange([...rows, { key: `own:${Date.now().toString(36)}`, label: '', target: null, rating: 0, result: null }])}>+ Buff or debuff</button></div>`}
        </section>
    `;
}
