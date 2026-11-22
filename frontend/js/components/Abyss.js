import { html } from '../html.js';

// The world outside the window: a fixed background behind every module's glass, as if the
// control panel sat in the window of a submarine or a spaceship. Purely decorative, faint
// and slow; animations pause while a splitter is dragged and stop under reduced motion.
//
//   abyss       the deep: light shafts and a vast leviathan swimming across
//   aquarium    shallower water: kelp, schools of small fish, rising bubbles
//   terrarium   a misty green dark: ferns and moss, drifting fireflies
//   astrarium   space: stars, a nebula, an orrery of orbit rings turning slowly

/** @typedef {'abyss' | 'aquarium' | 'terrarium' | 'astrarium'} World */

export const WORLDS = /** @type {{ key: World, label: string }[]} */ ([
    { key: 'abyss', label: 'Abyss' },
    { key: 'aquarium', label: 'Aquarium' },
    { key: 'terrarium', label: 'Terrarium' },
    { key: 'astrarium', label: 'Astrarium' },
]);

const WORLD_KEY = 'backdrop-world';

/** @returns {World} */
export function savedWorld() {
    try {
        const v = localStorage.getItem(WORLD_KEY);
        return WORLDS.some((w) => w.key === v) ? /** @type {World} */ (v) : 'abyss';
    } catch { return 'abyss'; }
}

/** @param {World} world */
export function saveWorld(world) {
    try { localStorage.setItem(WORLD_KEY, world); } catch { /* still switches for this session */ }
}

/** A small deterministic random (the same scene on every load). @param {number} seed */
function rng(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Bioluminescent lights along the leviathan's body: [x, y, radius, delay seconds]
const LIGHTS = [
    [150, 392, 5, 0], [310, 352, 2.6, 0.6], [440, 344, 2.6, 1.2], [580, 372, 2.6, 1.8],
    [720, 412, 2.6, 2.4], [880, 448, 2.6, 3], [1040, 440, 2.6, 3.6], [1200, 414, 2.6, 4.2],
    [1360, 372, 2.6, 4.8], [1520, 352, 2.6, 1.5], [1660, 356, 2.2, 2.7],
];

function AbyssWorld() {
    return html`
        <div className="abyss-shaft" style=${{ left: '8%', width: '30%', transform: 'skewX(-18deg)' }}></div>
        <div className="abyss-shaft" style=${{ left: '56%', width: '18%', transform: 'skewX(-12deg)', opacity: 0.8 }}></div>
        <div className="leviathan bd-anim">
            <div className="leviathan-bob bd-anim">
                <svg width="1900" height="760" viewBox="0 0 1900 760">
                    <defs>
                        <linearGradient id="lev-skin" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stop-color="#1b4252"></stop>
                            <stop offset="0.55" stop-color="#0f2a35"></stop>
                            <stop offset="1" stop-color="#071820"></stop>
                        </linearGradient>
                    </defs>
                    <g className="leviathan-body bd-anim">
                        <path d="M60 400 C 180 290, 390 280, 570 345 S 910 470, 1130 408 S 1450 296, 1680 348 L 1800 372 C 1580 342, 1390 432, 1170 462 S 790 528, 560 432 S 220 382, 92 444 Q 36 432, 60 400 Z" fill="url(#lev-skin)" opacity="0.85"></path>
                        <path d="M420 330 L 476 236 L 506 338 Z" fill="#0f2a35" opacity="0.8"></path>
                        <path d="M980 432 L 1046 532 L 1066 444 Z" fill="#0f2a35" opacity="0.8"></path>
                        <path d="M1680 348 L 1880 290 L 1800 372 L 1880 446 Z" fill="#0f2a35" opacity="0.8"></path>
                        <g fill="#7ff3f7">
                            ${LIGHTS.map(([x, y, r, d]) => html`
                                <circle key=${x} className="lume bd-anim" cx=${x} cy=${y} r=${r} style=${{ animationDelay: `${d}s` }}></circle>
                            `)}
                        </g>
                    </g>
                </svg>
            </div>
        </div>
    `;
}

// --- aquarium ---------------------------------------------------------------

const AQ = (() => {
    const r = rng(7);
    const kelp = Array.from({ length: 11 }, (_, i) => ({ x: 4 + i * 9 + r() * 5, h: 26 + r() * 30, d: -r() * 9, w: 0.8 + r() * 0.8 }));
    const schools = [
        { top: 22, size: 1, dur: 70, delay: -18, dir: 1, n: 9 },
        { top: 48, size: 0.7, dur: 95, delay: -60, dir: -1, n: 12 },
        { top: 64, size: 1.3, dur: 120, delay: -5, dir: 1, n: 6 },
    ].map((s) => ({ ...s, fish: Array.from({ length: s.n }, () => ({ x: r() * 160, y: r() * 60, s: 0.7 + r() * 0.6 })) }));
    const bubbles = Array.from({ length: 16 }, () => ({ x: r() * 100, s: 3 + r() * 6, dur: 14 + r() * 16, d: -r() * 30 }));
    return { kelp, schools, bubbles };
})();

function AquariumWorld() {
    return html`
        <div className="abyss-shaft aq-shaft" style=${{ left: '14%', width: '22%', transform: 'skewX(-14deg)' }}></div>
        <div className="abyss-shaft aq-shaft" style=${{ left: '48%', width: '14%', transform: 'skewX(-10deg)' }}></div>
        <div className="abyss-shaft aq-shaft" style=${{ left: '70%', width: '20%', transform: 'skewX(-16deg)', opacity: 0.6 }}></div>
        ${AQ.schools.map((s, k) => html`
            <div key=${k} className="aq-school bd-anim" style=${{ top: `${s.top}%`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, animationName: s.dir > 0 ? 'aq-swim-r' : 'aq-swim-l' }}>
                <svg width="200" height="80" viewBox="0 0 200 80" style=${{ transform: `scale(${s.size}) scaleX(${s.dir})` }}>
                    ${s.fish.map((f, i) => html`
                        <path key=${i} d="M0 0 C 6 -5, 16 -5, 22 0 C 16 5, 6 5, 0 0 Z M22 0 L 28 -5 L 28 5 Z" fill="#2c6b78" opacity="0.55"
                            transform=${`translate(${f.x} ${f.y + 10}) scale(${f.s})`}></path>
                    `)}
                </svg>
            </div>
        `)}
        <svg className="aq-kelp" viewBox="0 0 100 60" preserveAspectRatio="none">
            ${AQ.kelp.map((k, i) => html`
                <path key=${i} className="aq-strand bd-anim" style=${{ animationDelay: `${k.d}s` }}
                    d=${`M${k.x} 60 C ${k.x - 3} ${60 - k.h * 0.35}, ${k.x + 3} ${60 - k.h * 0.65}, ${k.x - 1} ${60 - k.h}`}
                    stroke="#0c3a33" stroke-width=${k.w} fill="none" stroke-linecap="round" opacity="0.8"></path>
            `)}
        </svg>
        ${AQ.bubbles.map((b, i) => html`
            <i key=${i} className="aq-bubble bd-anim" style=${{ left: `${b.x}%`, width: `${b.s}px`, height: `${b.s}px`, animationDuration: `${b.dur}s`, animationDelay: `${b.d}s` }}></i>
        `)}
    `;
}

// --- terrarium --------------------------------------------------------------

const TE = (() => {
    const r = rng(23);
    const ferns = Array.from({ length: 9 }, (_, i) => ({ x: 3 + i * 11 + r() * 6, h: 18 + r() * 22, lean: (r() - 0.5) * 12, side: r() > 0.5 ? 1 : -1 }));
    const flies = Array.from({ length: 22 }, () => ({ x: r() * 100, y: 30 + r() * 60, dur: 9 + r() * 12, d: -r() * 20, s: 2 + r() * 2.5 }));
    return { ferns, flies };
})();

/** A fern frond as a path: a curved stem with leaflets. */
function frond(x, h, lean, side) {
    let d = `M${x} 60 Q ${x + lean * 0.4} ${60 - h * 0.6}, ${x + lean} ${60 - h}`;
    for (let k = 1; k < 7; k++) {
        const t = k / 7, px = x + lean * t * t, py = 60 - h * t, len = (1 - t) * 6 + 1.5;
        d += ` M${px} ${py} q ${side * len * 0.6} ${-len * 0.5}, ${side * len} ${-len * 0.2} M${px} ${py} q ${-side * len * 0.6} ${-len * 0.5}, ${-side * len} ${-len * 0.2}`;
    }
    return d;
}

function TerrariumWorld() {
    return html`
        <div className="te-mist bd-anim"></div>
        <svg className="te-plants" viewBox="0 0 100 60" preserveAspectRatio="none">
            <path d="M0 60 C 8 50, 18 52, 26 56 S 44 50, 54 55 S 76 49, 86 54 S 98 52, 100 53 L 100 60 Z" fill="#0b1a10" opacity="0.9"></path>
            ${TE.ferns.map((f, i) => html`
                <path key=${i} className="te-fern bd-anim" style=${{ animationDelay: `${-i * 1.3}s` }} d=${frond(f.x, f.h, f.lean, f.side)}
                    stroke="#163322" stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.85"></path>
            `)}
        </svg>
        ${TE.flies.map((f, i) => html`
            <i key=${i} className="te-fly bd-anim" style=${{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.s}px`, height: `${f.s}px`, animationDuration: `${f.dur}s, ${3 + (i % 4)}s`, animationDelay: `${f.d}s, ${-i * 0.7}s` }}></i>
        `)}
    `;
}

// --- astrarium --------------------------------------------------------------

const AS = (() => {
    const r = rng(41);
    const stars = Array.from({ length: 150 }, () => ({ x: r() * 100, y: r() * 100, s: r() < 0.9 ? 0.6 + r() * 0.8 : 1.6 + r(), tw: r() < 0.3, d: -r() * 6 }));
    const orbits = [120, 190, 270, 360].map((rad, i) => ({ rad, dur: 160 + i * 90, planet: 3 + (i % 3) * 2, start: r() * 360 }));
    return { stars, orbits };
})();

function AstrariumWorld() {
    return html`
        <div className="as-nebula"></div>
        ${AS.stars.map((st, i) => html`
            <i key=${i} className=${`as-star ${st.tw ? 'as-twinkle bd-anim' : ''}`}
                style=${{ left: `${st.x}%`, top: `${st.y}%`, width: `${st.s * 1.6}px`, height: `${st.s * 1.6}px`, opacity: st.tw ? 0.8 : 0.45, animationDelay: st.tw ? `${st.d}s` : undefined }}></i>
        `)}
        <div className="as-orrery">
            <svg width="800" height="800" viewBox="-400 -400 800 800">
                <circle r="34" fill="none" stroke="#e9c43b" stroke-opacity="0.25" stroke-width="1"></circle>
                <circle r="16" fill="#e9c43b" opacity="0.2"></circle>
                ${AS.orbits.map((o, i) => html`
                    <g key=${i}>
                        <circle r=${o.rad} fill="none" stroke="#8fb3ff" stroke-opacity="0.14" stroke-width="1" stroke-dasharray=${i % 2 ? '2 6' : 'none'}></circle>
                        <g className="as-orbit bd-anim" style=${{ animationDuration: `${o.dur}s`, animationDelay: `${-(o.start / 360) * o.dur}s` }}>
                            <circle cx=${o.rad} cy="0" r=${o.planet} fill="#a9c4ff" opacity="0.5"></circle>
                            ${i === 2 && html`<ellipse cx=${o.rad} cy="0" rx=${o.planet * 2.6} ry=${o.planet * 0.8} fill="none" stroke="#a9c4ff" stroke-opacity="0.35"></ellipse>`}
                        </g>
                    </g>
                `)}
                <g className="as-runes bd-anim">
                    ${Array.from({ length: 48 }, (_, k) => html`
                        <line key=${k} x1="0" y1=${-392} x2="0" y2=${k % 4 ? -384 : -376} stroke="#8fb3ff" stroke-opacity="0.18" transform=${`rotate(${k * 7.5})`}></line>
                    `)}
                    <circle r="392" fill="none" stroke="#8fb3ff" stroke-opacity="0.12"></circle>
                </g>
            </svg>
        </div>
    `;
}

/**
 * The world outside the window.
 * @param {{ world?: World }} props
 */
export function Abyss({ world = 'abyss' }) {
    return html`
        <div className=${`abyss world-${world}`} aria-hidden="true">
            ${world === 'aquarium' ? html`<${AquariumWorld} />`
                : world === 'terrarium' ? html`<${TerrariumWorld} />`
                : world === 'astrarium' ? html`<${AstrariumWorld} />`
                : html`<${AbyssWorld} />`}
        </div>
    `;
}
