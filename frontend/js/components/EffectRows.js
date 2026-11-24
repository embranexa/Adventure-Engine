import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { targetLabel } from '../lib/targets.js';
import { TargetPicker } from './TargetPicker.js';

export const MAX_AMP = 5; // same as backend/services/items.py

/** An amp: how much something is amplified, "2/5" (below 0 is a debuff). `total`: several added up, "+7".
 *  @param {{ rating: number, total?: boolean }} props */
export function Amp({ rating, total = false }) {
    const sign = rating < 0 ? '−' : total ? '+' : '';
    return html`<b className=${`fx-pips ${rating < 0 ? 'down' : 'up'}`} title=${rating < 0 ? 'Debuff' : 'Amp'}>${sign}${Math.abs(rating)}${total ? '' : `/${MAX_AMP}`}</b>`;
}

/** An amp with steps down and up (past 0: a debuff). @param {{ rating: number, name: string, onChange: (rating: number) => void }} props */
export function AmpStep({ rating, name, onChange }) {
    const step = (/** @type {1 | -1} */ way) => onChange(rating + way === 0 ? way : rating + way);
    return html`
        <button className="cls-layer amp-step" aria-label=${`Lower ${name}`} disabled=${rating <= -MAX_AMP} onClick=${() => step(-1)}>−</button>
        <${Amp} rating=${rating} />
        <button className="cls-layer amp-step" aria-label=${`Raise ${name}`} disabled=${rating >= MAX_AMP} onClick=${() => step(1)}>+</button>
    `;
}

/**
 * An item's effects: attributes and skills it amplifies (or dampens).
 * @param {{ effects: ItemEffect[], onChange: (effects: ItemEffect[]) => void }} props
 */
export function EffectRows({ effects, onChange }) {
    const entities = useWorkspaceStore((s) => s.entities);
    return html`
        <div className="fx-rows">
            ${effects.map((e) => {
                const name = targetLabel(e.target, entities);
                return html`
                    <div key=${e.target} className="fx-row">
                        <span>${name}</span>
                        <${AmpStep} rating=${e.rating} name=${name} onChange=${(/** @type {number} */ rating) => onChange(effects.map((x) => (x.target === e.target ? { ...x, rating } : x)))} />
                        <button className="pclose" aria-label=${`Remove ${name}`} onClick=${() => onChange(effects.filter((x) => x.target !== e.target))}>✕</button>
                    </div>
                `;
            })}
            <${TargetPicker} ids=${effects.map((e) => e.target)} placeholder="+ An attribute or skill it affects…"
                onPick=${(/** @type {string} */ target) => onChange([...effects, { target, rating: 1, text: '' }])} />
        </div>
    `;
}
