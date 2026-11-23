import { html } from '../html.js';
import { GRADES } from '../lib/analysis.js';

const W = '#fff';
/** Drawn symbols; the others are set as text. @type {Partial<Record<MoveGrade, any>>} */
const SYMBOLS = {
    best: html`<path d="M12 4.6l2.2 4.9 5.2.6-3.9 3.5 1.1 5.2-4.6-2.6-4.6 2.6 1.1-5.2-3.9-3.5 5.2-.6z"></path>`,
    excellent: html`<path d="M6 11h2.6v7H6zM9.600 11.200l2.600-6c1.600 0 2.200 1.200 1.800 2.800l-.5 2h3.600c1.200 0 1.800 1 1.500 2l-1.300 4.700c-.2.8-.8 1.300-1.600 1.300H9.600z"></path>`,
    good: html`<path d="M6 12.600l4 4 8-8.800" fill="none" stroke=${W} strokeWidth="3"></path>`,
    book: html`<path d="M11.300 8C9.800 6.800 7.600 6.500 5.400 6.700v9.800c2.200-.2 4.400.1 5.900 1.300zM12.700 8c1.500-1.200 3.700-1.500 5.900-1.300v9.800c-2.200-.2-4.400.1-5.900 1.300z"></path>`,
    forced: html`<path d="M5 10h7V6.500l7 5.500-7 5.500V14H5z"></path>`,
    miss: html`<path d="M7.500 7.500l9 9m0-9l-9 9" fill="none" stroke=${W} strokeWidth="3.200"></path>`,
};
/** @type {Partial<Record<MoveGrade, string>>} */
const TEXT = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** A grade's icon: a white symbol on a coloured disc. @param {{ grade: MoveGrade, size?: number }} props */
export function GradeIcon({ grade, size = 24 }) {
    const text = TEXT[grade];
    return html`
        <svg className="grade-icon" aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24">
            <circle cx="12" cy="12.600" r="11.200" fill="#0007"></circle>
            <circle cx="12" cy="12" r="11.200" fill=${GRADES[grade].color}></circle>
            <g fill=${W}>
                ${text
                    ? html`<text x="12" y="17.300" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize=${text.length > 1 ? 14 : 16} letterSpacing="-.6">${text}</text>`
                    : SYMBOLS[grade]}
            </g>
        </svg>
    `;
}
