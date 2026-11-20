import { html } from '../html.js';

// Bioluminescent lights along the leviathan's body: [x, y, radius, delay seconds]
const LIGHTS = [
    [150, 392, 5, 0], [310, 352, 2.6, 0.6], [440, 344, 2.6, 1.2], [580, 372, 2.6, 1.8],
    [720, 412, 2.6, 2.4], [880, 448, 2.6, 3], [1040, 440, 2.6, 3.6], [1200, 414, 2.6, 4.2],
    [1360, 372, 2.6, 4.8], [1520, 352, 2.6, 1.5], [1660, 356, 2.2, 2.7],
];

/**
 * The deep: a fixed background behind every module's glass. Faint light shafts and
 * a vast leviathan slowly swimming across, its lights pulsing. Purely decorative.
 */
export function Abyss() {
    return html`
        <div className="abyss" aria-hidden="true">
            <div className="abyss-shaft" style=${{ left: '8%', width: '30%', transform: 'skewX(-18deg)' }}></div>
            <div className="abyss-shaft" style=${{ left: '56%', width: '18%', transform: 'skewX(-12deg)', opacity: 0.8 }}></div>
            <div className="leviathan">
                <div className="leviathan-bob">
                    <svg width="1900" height="760" viewBox="0 0 1900 760">
                        <defs>
                            <linearGradient id="lev-skin" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stop-color="#1b4252"></stop>
                                <stop offset="0.55" stop-color="#0f2a35"></stop>
                                <stop offset="1" stop-color="#071820"></stop>
                            </linearGradient>
                        </defs>
                        <g className="leviathan-body">
                            <path d="M60 400 C 180 290, 390 280, 570 345 S 910 470, 1130 408 S 1450 296, 1680 348 L 1800 372 C 1580 342, 1390 432, 1170 462 S 790 528, 560 432 S 220 382, 92 444 Q 36 432, 60 400 Z" fill="url(#lev-skin)" opacity="0.85"></path>
                            <path d="M420 330 L 476 236 L 506 338 Z" fill="#0f2a35" opacity="0.8"></path>
                            <path d="M980 432 L 1046 532 L 1066 444 Z" fill="#0f2a35" opacity="0.8"></path>
                            <path d="M1680 348 L 1880 290 L 1800 372 L 1880 446 Z" fill="#0f2a35" opacity="0.8"></path>
                            <g fill="#7ff3f7">
                                ${LIGHTS.map(([x, y, r, d]) => html`
                                    <circle key=${x} className="lume" cx=${x} cy=${y} r=${r} style=${{ animationDelay: `${d}s` }}></circle>
                                `)}
                            </g>
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    `;
}
