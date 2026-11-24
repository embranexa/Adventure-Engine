import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { effectsAtWork, gearFor, readied, sumBySkill } from '../lib/items.js';
import { EffectRows, Pips } from './EffectRows.js';

/**
 * What you ready for an adventure: owned items of its gear set (its deities' items), and
 * anything else. Checked ones' effects on skills add up below. Nothing else applies them.
 * @param {{ adventure: AdventureRecord }} props
 */
export function Preparations({ adventure }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const [text, setText] = useState('');
    const [openId, setOpenId] = useState(/** @type {string | null} */ (null));
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const list = adventure.preparations, rows = readied(adventure, adventures);
    const gear = gearFor(adventure, adventures).filter((a) => !list.some((p) => p.item === a.id));
    const totals = sumBySkill(effectsAtWork(adventure, adventures).flatMap((e) => (e.skill ? [{ skill: e.skill, rating: e.rating }] : [])));
    const deities = adventure.entities.filter((e) => e.type === 'deity').map((e) => e.name).join(', ');
    const save = async (/** @type {Preparation[]} */ preparations) => { const err = await updateAdventure(adventure.id, { preparations }); setError(err); return err; };
    const put = (/** @type {string} */ id, /** @type {Partial<Preparation>} */ c) => save(list.map((p) => (p.id === id ? { ...p, ...c } : p)));
    const add = (/** @type {Partial<Preparation>} */ p) => save([...list, { id: Date.now().toString(36), item: null, text: '', checked: false, effects: [], ...p }]);
    const addText = async () => { if (text.trim() && !(await add({ text: text.trim() }))) setText(''); };

    return html`
        <div className="obj" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
            <div className="ol-head">Preparations</div>
            ${rows.map(({ prep, label, effects, lost }) => html`
                <div key=${prep.id} className=${`prep ${prep.checked ? 'on' : ''} ${lost ? 'lost' : ''}`}>
                    <div className="prep-row">
                        <input type="checkbox" checked=${prep.checked} aria-label=${label} onChange=${(/** @type {any} */ e) => put(prep.id, { checked: e.target.checked })} />
                        <span title=${lost ? 'No longer in this adventure’s gear set' : ''}>${prep.item ? '◆ ' : ''}${label}</span>
                        ${effects.map((e) => html`<small key=${e.skill}>${entities.find((x) => x.id === e.skill)?.name ?? '?'} <${Pips} rating=${e.rating} /></small>`)}
                        ${!prep.item && html`<button className="cls-layer" aria-expanded=${openId === prep.id} title="The skills it affects" onClick=${() => setOpenId(openId === prep.id ? null : prep.id)}>✧</button>`}
                        <button className="ol-chip-x" aria-label=${`Remove ${label}`} onClick=${() => save(list.filter((p) => p.id !== prep.id))}>✕</button>
                    </div>
                    ${openId === prep.id && html`<${EffectRows} effects=${prep.effects} onChange=${(/** @type {ItemEffect[]} */ e) => put(prep.id, { effects: e })} />`}
                </div>
            `)}
            <div className="prep-add">
                <input className="ol-input" value=${text} maxLength=${300} placeholder="+ A preparation…" aria-label="New preparation"
                    onInput=${(/** @type {any} */ e) => setText(e.target.value)} onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') addText(); }} />
                ${gear.length > 0 && html`
                    <select className="pl-select" value="" aria-label="Add gear" title=${`Owned items of ${deities}`} onChange=${(/** @type {any} */ e) => e.target.value && add({ item: e.target.value, checked: true })}>
                        <option value="">◆ Gear…</option>
                        ${gear.map((a) => html`<option key=${a.id} value=${a.id}>${a.title}</option>`)}
                    </select>`}
            </div>
            ${totals.length > 0 && html`<div className="fx-totals">${totals.map(([skill, n]) => html`<span key=${skill}>✧ ${entities.find((x) => x.id === skill)?.name ?? '?'} <${Pips} rating=${n} /></span>`)}</div>`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
