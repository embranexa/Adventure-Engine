import { useEffect, useRef } from 'react';
import { html } from '../html.js';
import { drawUnfold } from '../lib/cabinet/unfold.js';
import { viewOf } from '../lib/resizing.js';

const UNFOLD_MS = 4200;

/**
 * A ceremony over its panel: the seal unfolds, and what it brought is listed.
 * @param {{ title: string, subtitle: string, color: string, seed: string, points: number, rings: number,
 *           lines: [string, string][], onDone: () => void }} props
 */
export function Ceremony({ title, subtitle, color, seed, points, rings, lines, onDone }) {
    const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
    const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const view = viewOf(canvas), o = { color, seed, points, rings };
        buttonRef.current?.focus();
        if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) { drawUnfold(canvas, o, 1, 0); return; }
        let raf = 0;
        const t0 = view.performance.now();
        const frame = (/** @type {number} */ t) => { drawUnfold(canvas, o, Math.max(0, Math.min(1, (t - t0) / UNFOLD_MS)), t); raf = view.requestAnimationFrame(frame); };
        raf = view.requestAnimationFrame(frame);
        return () => view.cancelAnimationFrame(raf);
    }, []);

    return html`
        <div className="ceremony" role="dialog" aria-modal="true" aria-label=${title}
            onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') onDone(); }}>
            <canvas ref=${canvasRef} width="680" height="680" aria-hidden="true"></canvas>
            <h3 style=${{ color }}>${title}</h3>
            <p>${subtitle}</p>
            <dl>${lines.map(([k, v]) => html`<div key=${k + v}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
            <button className="btn" ref=${buttonRef} onClick=${onDone}>Continue</button>
        </div>
    `;
}
