import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ASPECTS, facing } from '../lib/paragons.js';
import { EntityPicker } from './EntityPicker.js';

const TYPES = /** @type {EntityType[]} */ (['player', 'organization']);

/** Who or what a battle is against: players, organizations, or anything named. @param {{ adventure: AdventureRecord }} props */
export function Adversaries({ adventure }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const [name, setName] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const list = adventure.adversaries;
    const save = async (/** @type {Adversary[]} */ adversaries) => { const err = await updateAdventure(adventure.id, { adversaries }); setError(err); return err; };
    const add = async () => { if (name.trim() && !(await save([...list, { entity_id: null, name: name.trim() }]))) setName(''); };
    return html`
        <div className="ol">
            <div className="ol-head">⚔ Adversaries</div>
            ${list.length > 0 && html`
                <div className="ol-chips">
                    ${list.map((a, i) => { const foe = entities.find((e) => e.id === a.entity_id), d = foe?.details; return html`
                        <span key=${(a.entity_id ?? '') + a.name} className="ol-chip foe">
                            <span className="ol-chip-name"><i>⚔</i>${foe?.name ?? a.name}${d?.archetype && d.aspect === 'exploitative' && html`<small style=${{ color: ASPECTS.exploitative.color }}>${facing(d.archetype, d.aspect).label}</small>`}</span>
                            <button className="ol-chip-x" aria-label=${`Remove ${a.name}`} onClick=${() => save(list.filter((_, j) => j !== i))}>✕</button>
                        </span>`; })}
                </div>`}
            <${EntityPicker} ids=${list.flatMap((a) => a.entity_id ?? [])} chips=${false} types=${TYPES} placeholder="+ A player or organization…"
                onAdd=${(/** @type {string} */ id) => save([...list, { entity_id: id, name: '' }])} />
            <input className="ol-input" value=${name} maxLength=${200} placeholder="+ Or anything else: doubt, the weather…" aria-label="Another adversary"
                onInput=${(/** @type {any} */ e) => setName(e.target.value)} onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') add(); }} />
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
