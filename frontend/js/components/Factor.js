import { html } from '../html.js';

/** An adventure's fulfillment factor for a deity, 1 to 5 (unset: 1).
 *  @param {{ value: number | null | undefined, name: string, onChange?: (v: number) => void }} props */
export function Factor({ value, name, onChange }) {
    const v = value ?? 1;
    return html`<span className="factor" title=${`Fulfils ${name}: ${v} of 5`}>${[1, 2, 3, 4, 5].map((n) => (onChange
        ? html`<button key=${n} type="button" className=${n <= v ? 'on' : ''} aria-label=${`Fulfils ${name}: ${n}`} aria-pressed=${n === v} onClick=${() => onChange(n)}></button>`
        : html`<i key=${n} className=${n <= v ? 'on' : ''}></i>`))}</span>`;
}
