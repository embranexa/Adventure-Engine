import { html } from '../html.js';
import { MATTER_COLORS } from '../lifecycle.js';

/** SVG paths for panel icons (16×16, stroked). */
const ICON_PATHS = {
    eye: html`<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"></path><circle cx="8" cy="8" r="2.2"></circle>`,
    flask: html`<path d="M6 1.5h4M6.8 1.5v4.2L2.6 12.6A1.3 1.3 0 0 0 3.7 14.5h8.6a1.3 1.3 0 0 0 1.1-1.9L9.2 5.7V1.5"></path><path d="M4.4 10h7.2"></path>`,
    compass: html`<circle cx="8" cy="8" r="6.3"></circle><path d="M8 3.6l1.6 4.4L8 12.4 6.4 8z"></path>`,
    clock: html`<circle cx="8" cy="8" r="6.3"></circle><path d="M8 4.3V8l2.6 1.6"></path>`,
};

/** @param {{ name: PanelIcon | string, size?: number }} props */
export function Icon({ name, size = 16 }) {
    return html`
        <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 16 16" fill="none" stroke="#dfe2e7" stroke-width="1.3">
            ${ICON_PATHS[/** @type {keyof typeof ICON_PATHS} */ (name)] ?? ICON_PATHS.eye}
        </svg>
    `;
}

/** The brand sigil: circle, triangle and a breathing core. */
export function Sigil() {
    return html`
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#c9cdd4" stroke-width="1.3">
            <circle cx="13" cy="13" r="11.5"></circle>
            <polygon points="13,3.5 21.2,18 4.8,18"></polygon>
            <circle cx="13" cy="13.5" r="3" fill="#1fc2c9" stroke="none" className="breathe"></circle>
        </svg>
    `;
}

/** One ornate corner bracket: steel plate, gear, brass triangle and rivets, circuit traces. */
function Corner({ pos }) {
    return html`
        <svg aria-hidden="true" className=${`corner ${pos}`} viewBox="0 0 46 46">
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#1a1c20" stroke-width="7" stroke-linejoin="bevel"></path>
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#5c626c" stroke-width="3" stroke-linejoin="bevel"></path>
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#aab0b9" stroke-width="0.8" stroke-linejoin="bevel" opacity="0.7"></path>
            <circle cx="15" cy="15" r="8.5" fill="#111317" stroke="#4a4f58" stroke-width="3" stroke-dasharray="2.2 1.8"></circle>
            <circle cx="15" cy="15" r="5" fill="#16181c" stroke="#7a808a" stroke-width="0.8"></circle>
            <polygon points="15,11.6 18.2,17 11.8,17" fill="none" stroke="#c8a46a" stroke-width="0.9"></polygon>
            <path className="trace" d="M25 15 H33 L36 12 H43" fill="none" stroke-width="1"></path>
            <path className="trace" d="M15 25 V33 L12 36 V43" fill="none" stroke-width="1"></path>
            <circle className="node" cx="43" cy="12" r="1.6"></circle>
            <circle className="node" cx="12" cy="43" r="1.6"></circle>
            <circle cx="7" cy="40" r="1.4" fill="#c8a46a"></circle>
            <circle cx="40" cy="7" r="1.4" fill="#c8a46a"></circle>
        </svg>
    `;
}

/** All four corners of a module housing. */
export function Corners() {
    return html`
        <${Corner} pos="tl" /><${Corner} pos="tr" /><${Corner} pos="bl" /><${Corner} pos="br" />
    `;
}

/**
 * Two-line panel title: [icon] NAME / QUESTION · INPUT ⟶ OUTPUT.
 * Input/output words that name a matter take its color.
 * @param {{ meta: PanelMeta, input?: string }} props  `input` overrides the meta (e.g. "omen" in Discovery)
 */
export function PanelTitle({ meta, input }) {
    const [inWord, outWord] = [input ?? meta.flow[0], meta.flow[1]];
    const color = (/** @type {string} */ w) => MATTER_COLORS[w] ?? '#b4b9c1';
    return html`
        <div className="vial"><${Icon} name=${meta.icon} /></div>
        <div className="ptitle">
            <span className="ptitle-name">${meta.name}</span>
            <span className="ptitle-flow">
                ${meta.question} · <b style=${{ color: color(inWord) }}>${inWord}</b>
                ${' '}<span className="arrow" style=${{ color: '#e6e8ec' }}>⟶</span>${' '}
                <b style=${{ color: color(outWord) }}>${outWord}</b>
            </span>
        </div>
    `;
}
