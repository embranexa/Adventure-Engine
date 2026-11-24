import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { effectsAtWork, gearFor, readied, sumByTarget } from '../lib/items.js';
import { fedBy, isAttribute, targetLabel } from '../lib/targets.js';
import { joinTitle, splitTitle } from '../lib/quests.js';
import { Amp, AmpStep } from './EffectRows.js';
import { TargetPicker } from './TargetPicker.js';
import { VerbSelect } from './VerbSelect.js';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** What a buff amplifies: picked, then shown with its ✕. @param {{ id: string | null, onPick: (id: string | null) => void }} props */
function TargetPick({ id, onPick }) {
    const entities = useWorkspaceStore((s) => s.entities);
    if (id) return html`<span className="ol-chip attr"><span className="ol-chip-name">${targetLabel(id, entities)}</span><button className="ol-chip-x" aria-label="Unlink" onClick=${() => onPick(null)}>✕</button></span>`;
    return html`<div className="attr"><${TargetPicker} placeholder="~ Attribute or skill…" onPick=${onPick} /></div>`;
}

/**
 * One buff of your own: verb, subject, and the attribute or skill it amplifies, by how much.
 * @param {{ buff: Preparation, put: (c: Partial<Preparation>) => void, remove: () => void }} props
 */
function Buff({ buff, put, remove }) {
    const { verb, subject } = splitTitle(buff.text, 'buff');
    const [editing, setEditing] = useState(false);
    const effect = buff.effects[0] ?? null;
    return html`
        <div className=${`prep ${buff.checked ? 'on' : ''}`}>
            <div className="prep-row">
                <input type="checkbox" checked=${buff.checked} aria-label=${buff.text} title="In effect" onChange=${(/** @type {any} */ e) => put({ checked: e.target.checked })} />
                ${editing || !verb
                    ? html`
                        <${VerbSelect} kind="buff" verb=${verb} onPick=${(/** @type {string} */ v) => put({ text: joinTitle(v, subject) })} />
                        <input key=${buff.text} className="ol-input" defaultValue=${subject} maxLength=${200} aria-label="Buff subject"
                            onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') { /** @type {HTMLElement} */ (e.target).blur(); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
                            onBlur=${(/** @type {any} */ e) => { const t = joinTitle(verb, e.target.value); if (verb && e.target.value.trim() && t !== buff.text) put({ text: t }); }} />
                        ${verb && html`<button className="cls-layer" onClick=${() => setEditing(false)}>Done</button>`}`
                    : html`<button className="prep-title" title="Edit" onClick=${() => setEditing(true)}><b className="ql-verb">${verb}</b> ${subject}</button>`}
                <button className="ol-chip-x" aria-label=${`Remove ${buff.text}`} onClick=${remove}>✕</button>
            </div>
            <div className="buff-skill">
                <${TargetPick} id=${effect?.target ?? null} onPick=${(/** @type {string | null} */ target) => put({ effects: target ? [{ target, rating: effect?.rating ?? 1, text: '' }] : [] })} />
                ${effect && html`<${AmpStep} rating=${effect.rating} name="amp" onChange=${(/** @type {number} */ rating) => put({ effects: [{ ...effect, rating }] })} />`}
            </div>
        </div>
    `;
}

/** The row that makes a buff. @param {{ onAdd: (b: Partial<Preparation>) => Promise<string | null> }} props */
function NewBuff({ onAdd }) {
    const [verb, setVerb] = useState(/** @type {string | null} */ (null));
    const [text, setText] = useState('');
    const [target, setTarget] = useState(/** @type {string | null} */ (null));
    const [rating, setRating] = useState(1);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const add = async () => {
        // the verb may be picked, or typed first
        const title = verb ? joinTitle(verb, text) : text.trim(), split = splitTitle(title, 'buff');
        if (!split.verb) { setError('Every buff needs a verb: pick one'); return; }
        if (!split.subject) { setError(`${split.verb} what?`); return; }
        const err = await onAdd({ text: title, checked: true, effects: target ? [{ target, rating, text: '' }] : [] });
        setError(err);
        if (!err) { setText(''); setVerb(null); setTarget(null); setRating(1); }
    };
    return html`
        <div className="buff-new">
            <${VerbSelect} kind="buff" verb=${verb} onPick=${(/** @type {string} */ v) => { setVerb(v); setError(null); }} />
            <input className="ol-input" value=${text} maxLength=${200} placeholder="Subject" aria-label="New buff subject"
                onInput=${(/** @type {any} */ e) => setText(e.target.value)} onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') add(); }} />
            <${TargetPick} id=${target} onPick=${setTarget} />
            <span className="amp"><${AmpStep} rating=${rating} name="amp" onChange=${setRating} /></span>
            <button className="cls-layer" onClick=${add}>+ Buff</button>
        </div>
        ${error && html`<div className="nc-error" role="alert">${error}</div>`}
    `;
}

/**
 * An adventure's buffs: your own, and equipped items of its gear set (its deities' items).
 * Checked ones add up below; nothing else uses them. Stored as `preparations`.
 * @param {{ adventure: AdventureRecord }} props
 */
export function Buffs({ adventure }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    useWorkspaceStore((s) => s.buffVerbs); // titles show them
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const list = adventure.preparations, rows = readied(adventure, adventures);
    const gear = gearFor(adventure, adventures), free = gear.filter((a) => !list.some((p) => p.item === a.id));
    const totals = sumByTarget(effectsAtWork(adventure, adventures).flatMap((e) => (e.target ? [{ target: e.target, rating: e.rating }] : [])));
    const deities = adventure.entities.filter((e) => e.type === 'deity').map((e) => e.name).join(', ');
    const save = async (/** @type {Preparation[]} */ preparations) => { const err = await updateAdventure(adventure.id, { preparations }); setError(err); return err; };
    const put = (/** @type {string} */ id, /** @type {Partial<Preparation>} */ c) => save(list.map((p) => (p.id === id ? { ...p, ...c } : p)));
    const remove = (/** @type {string} */ id) => save(list.filter((p) => p.id !== id));
    const add = (/** @type {Partial<Preparation>} */ p) => save([...list, { id: newId(), item: null, text: '', checked: false, effects: [], ...p }]);

    // what another adventure had that this one doesn't; gear only if it's in this one's set. Unchecked: do them again
    const same = (/** @type {Preparation} */ a, /** @type {Preparation} */ b) => (a.item ? a.item === b.item : !b.item && a.text.toLowerCase() === b.text.toLowerCase());
    const missing = (/** @type {AdventureRecord} */ a) => a.preparations.filter((p) => !list.some((q) => same(p, q)) && (!p.item || gear.some((x) => x.id === p.item)));
    const sources = adventures.filter((a) => a.id !== adventure.id && missing(a).length)
        .sort((a, b) => (b.phase_changed_at ?? '').localeCompare(a.phase_changed_at ?? ''));
    const copy = (/** @type {string} */ id) => {
        const from = sources.find((a) => a.id === id);
        if (from) save([...list, ...missing(from).map((p) => ({ ...p, id: newId(), checked: false }))]);
    };

    return html`
        <div className="obj buffs">
            <div className="ol-head">Buffs</div>
            ${rows.map(({ prep, label, effects, lost }) => (prep.item
                ? html`
                    <div key=${prep.id} className=${`prep ${prep.checked ? 'on' : ''} ${lost ? 'lost' : ''}`}>
                        <div className="prep-row">
                            <input type="checkbox" checked=${prep.checked} aria-label=${label} title="In effect" onChange=${(/** @type {any} */ e) => put(prep.id, { checked: e.target.checked })} />
                            <span title=${lost ? 'No longer in this adventure’s gear set' : 'Its effects are set in the Inventory'}><b className="ql-verb">Equip</b> ${label}</span>
                            ${effects.map((e) => html`<small key=${e.target}>~ ${targetLabel(e.target, entities)} <${Amp} rating=${e.rating} /></small>`)}
                            <button className="ol-chip-x" aria-label=${`Remove ${label}`} onClick=${() => remove(prep.id)}>✕</button>
                        </div>
                    </div>`
                : html`<${Buff} key=${prep.id} buff=${prep} put=${(/** @type {Partial<Preparation>} */ c) => put(prep.id, c)} remove=${() => remove(prep.id)} />`))}
            <${NewBuff} onAdd=${add} />
            <div className="prep-add">
                ${free.length > 0 && html`
                    <select className="pl-select buff-copy" value="" aria-label="Equip gear" title=${`Owned items of ${deities}`} onChange=${(/** @type {any} */ e) => e.target.value && add({ item: e.target.value, checked: true })}>
                        <option value="">◆ Equip gear…</option>
                        ${free.map((a) => html`<option key=${a.id} value=${a.id}>${a.title}</option>`)}
                    </select>`}
                ${sources.length > 0 && html`
                    <select className="pl-select buff-copy" value="" aria-label="Copy buffs" title="Add what another adventure had, unchecked" onChange=${(/** @type {any} */ e) => copy(e.target.value)}>
                        <option value="">⧉ Copy buffs from…</option>
                        ${sources.map((a) => html`<option key=${a.id} value=${a.id}>${a.title} (${missing(a).length})</option>`)}
                    </select>`}
            </div>
            ${totals.length > 0 && html`<div className="fx-totals" title="What's in effect">${totals.map(([id, n]) => {
                const fed = isAttribute(id) ? fedBy(id, entities) : [];
                return html`<span key=${id} title=${fed.length ? `Feeds ${fed.map((f) => f.name).join(', ')}` : ''}>${targetLabel(id, entities)} <${Amp} rating=${n} total=${true} />${fed.length > 0 && html` <small>→ ${fed.map((f) => f.name).join(', ')}</small>`}</span>`;
            })}</div>`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
