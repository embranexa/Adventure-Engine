// Icons for the Nexus's parent stars: a medallion (dark disc, ring) with a line drawing of
// what the star is: a source, a tag, a city / region / metro, a type, a matter, an object type, the date range,
// the proximity ring, the Hermetic Seal. Drawn white on a canvas so each star tints its
// own (the disc stays dark under any tint). Pure canvas, no three.js.
//
//   starIconKey(star)   which drawing a star gets
//   starIconCanvas(key) the drawing (cached per key)

/** @typedef {{ kind: string, facet?: string, value?: string }} StarLike */

const SIZE = 128;
const C = SIZE / 2;

/** Which drawing a star gets. @param {StarLike} star @returns {string} */
export function starIconKey(star) {
    if (star.kind !== 'facet') return star.kind; // date | ring | seal
    if (star.facet === 'type') return `type:${star.value}`;
    return star.facet ?? 'facet';
}

/** @type {Map<string, HTMLCanvasElement>} */
const cache = new Map();

/** The medallion for a key, white on transparent. @param {string} key */
export function starIconCanvas(key) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    // the medallion: a dark disc, a ring, a fine inner ring
    g.fillStyle = 'rgba(0,0,0,0.82)';
    g.beginPath(); g.arc(C, C, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 5; g.beginPath(); g.arc(C, C, 56, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.globalAlpha = 0.6; g.beginPath(); g.arc(C, C, 48, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 5;
    g.fillStyle = '#fff';
    (DRAW[key] ?? DRAW.facet)(g);
    cache.set(key, c);
    return c;
}

/** @param {CanvasRenderingContext2D} g @param {[number, number][]} pts @param {boolean} [close] */
function poly(g, pts, close = false) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (close) g.closePath();
    g.stroke();
}

/** @type {Record<string, (g: CanvasRenderingContext2D) => void>} */
const DRAW = {
    // a harvester's rotor: three curved blades round a hub
    source(g) {
        for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
            g.beginPath();
            g.moveTo(C, C);
            g.quadraticCurveTo(C + Math.cos(a + 0.9) * 30, C + Math.sin(a + 0.9) * 30, C + Math.cos(a) * 32, C + Math.sin(a) * 32);
            g.stroke();
        }
        g.beginPath(); g.arc(C, C, 6, 0, Math.PI * 2); g.fill();
    },
    // three towers
    city(g) {
        poly(g, [[36, 92], [36, 58], [50, 58], [50, 92]]);
        poly(g, [[52, 92], [52, 38], [70, 38], [70, 92]]);
        poly(g, [[72, 92], [72, 66], [90, 66], [90, 92]]);
        poly(g, [[30, 92], [98, 92]]);
    },
    // a region: a folded map, three panels
    region(g) {
        poly(g, [[32, 44], [52, 36], [76, 44], [96, 36], [96, 84], [76, 92], [52, 84], [32, 92]], true);
        poly(g, [[52, 36], [52, 84]]);
        poly(g, [[76, 44], [76, 92]]);
    },
    // a metro: a hub with its cities around it
    metro(g) {
        g.beginPath(); g.arc(C, C, 9, 0, Math.PI * 2); g.fill();
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
            const x = C + Math.cos(a) * 30, y = C + Math.sin(a) * 30;
            g.globalAlpha = 0.55; poly(g, [[C + Math.cos(a) * 12, C + Math.sin(a) * 12], [x - Math.cos(a) * 6, y - Math.sin(a) * 6]]);
            g.globalAlpha = 1; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        }
    },
    // a tag: a label with its eyelet
    tag(g) {
        poly(g, [[36, 40], [70, 40], [94, 64], [70, 88], [36, 88]], true);
        g.beginPath(); g.arc(72, 64, 6, 0, Math.PI * 2); g.stroke();
    },
    // a flask: matter
    phase(g) { DRAW.flask(g); },
    review(g) { DRAW.flask(g); },
    flask(g) {
        poly(g, [[54, 34], [54, 56], [36, 88], [92, 88], [74, 56], [74, 34]]);
        poly(g, [[48, 34], [80, 34]]);
        g.globalAlpha = 0.5; poly(g, [[44, 76], [84, 76]]); g.globalAlpha = 1;
    },
    // types: a clock (event), a gem (item), a note (song)
    'type:event'(g) {
        g.beginPath(); g.arc(C, C, 28, 0, Math.PI * 2); g.stroke();
        poly(g, [[C, 46], [C, C], [78, 72]]);
    },
    'type:item'(g) { poly(g, [[C, 34], [90, C], [C, 94], [38, C]], true); poly(g, [[38, C], [90, C]]); },
    'type:song'(g) {
        poly(g, [[56, 86], [56, 40], [86, 34], [86, 78]]);
        g.beginPath(); g.ellipse(48, 86, 9, 7, -0.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(78, 78, 9, 7, -0.4, 0, Math.PI * 2); g.fill();
    },
    // object types
    pillar(g) { poly(g, [[C, 34], [92, 88], [36, 88]], true); poly(g, [[C, 52], [C, 88]]); },
    site(g) {
        g.beginPath(); g.arc(C, C, 22, 0, Math.PI * 2); g.stroke();
        /** @type {[number, number][][]} */
        const ticks = [[[C, 32], [C, 48]], [[C, 80], [C, 96]], [[32, C], [48, C]], [[80, C], [96, C]]];
        for (const t of ticks) poly(g, t);
        g.beginPath(); g.arc(C, C, 5, 0, Math.PI * 2); g.fill();
    },
    contact(g) {
        g.beginPath(); g.arc(C, 50, 13, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(C, 96, 28, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    },
    organization(g) {
        const pts = /** @type {[number, number][]} */ ([[C, 38], [38, 84], [90, 84]]);
        poly(g, [pts[0], pts[1], pts[2]], true);
        for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
    },
    skill(g) {
        const pts = [];
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 12 : 30; pts.push(/** @type {[number, number]} */ ([C + Math.cos(a) * r, C + Math.sin(a) * r])); }
        poly(g, pts, true);
    },
    // the date range: a calendar page
    date(g) {
        poly(g, [[36, 44], [92, 44], [92, 90], [36, 90]], true);
        poly(g, [[36, 58], [92, 58]]);
        poly(g, [[50, 36], [50, 50]]); poly(g, [[78, 36], [78, 50]]);
        for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(50 + k * 14, 70 + r * 12, 3, 0, Math.PI * 2); g.fill(); }
    },
    // the proximity ring: a target
    ring(g) {
        for (const r of [10, 20, 30]) { g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke(); }
    },
    // the Hermetic Seal: a hexagram
    seal(g) {
        for (const rot of [0, Math.PI]) {
            poly(g, [0, 1, 2].map((k) => { const a = rot + (k / 3) * Math.PI * 2 - Math.PI / 2; return /** @type {[number, number]} */ ([C + Math.cos(a) * 30, C + Math.sin(a) * 30]); }), true);
        }
    },
    // anything else: a dot in a ring
    facet(g) { g.beginPath(); g.arc(C, C, 14, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(C, C, 5, 0, Math.PI * 2); g.fill(); },
};
