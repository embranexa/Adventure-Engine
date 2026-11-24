import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { EntityPicker } from './EntityPicker.js';

const MAX_RATING = 3; // same as backend/services/items.py
const SKILL = /** @type {EntityType[]} */ (['skill']);

/** How strong a buff (▲) or debuff (▼) is. @param {{ rating: number }} props */
export function Pips({ rating }) {
    const n = Math.abs(rating);
    return html`<b className=${`fx-pips ${rating < 0 ? 'down' : 'up'}`} title=${`${rating > 0 ? 'Buff' : 'Debuff'} of ${n}`}>${n > 4 ? `${rating < 0 ? '▼' : '▲'}${n}` : (rating < 0 ? '▼' : '▲').repeat(n)}</b>`;
}

/**
 * Buffs and debuffs to skills, each rated 1 to 3 either way.
 * @param {{ effects: ItemEffect[], onChange: (effects: ItemEffect[]) => void }} props
 */
export function EffectRows({ effects, onChange }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const put = (/** @type {string} */ skill, /** @type {number} */ rating) => onChange(effects.map((e) => (e.skill === skill ? { ...e, rating } : e)));
    /** The next rating that way, skipping 0. @param {number} r @param {1 | -1} way */
    const step = (r, way) => Math.max(-MAX_RATING, Math.min(MAX_RATING, r + way === 0 ? way : r + way));
    return html`
        <div className="fx-rows">
            ${effects.map((e) => {
                const name = entities.find((x) => x.id === e.skill)?.name ?? 'Unknown skill';
                return html`
                    <div key=${e.skill} className="fx-row">
                        <span>✧ ${name}</span>
                        <button className="cls-layer" aria-label=${`Lower ${name}`} disabled=${e.rating <= -MAX_RATING} onClick=${() => put(e.skill, step(e.rating, -1))}>−</button>
                        <${Pips} rating=${e.rating} />
                        <button className="cls-layer" aria-label=${`Raise ${name}`} disabled=${e.rating >= MAX_RATING} onClick=${() => put(e.skill, step(e.rating, 1))}>+</button>
                        <button className="pclose" aria-label=${`Remove ${name}`} onClick=${() => onChange(effects.filter((x) => x.skill !== e.skill))}>✕</button>
                    </div>
                `;
            })}
            <${EntityPicker} ids=${effects.map((e) => e.skill)} chips=${false} types=${SKILL} placeholder="+ A skill it affects…"
                onAdd=${(/** @type {string} */ skill) => onChange([...effects, { skill, rating: 1, text: '' }])} />
        </div>
    `;
}
