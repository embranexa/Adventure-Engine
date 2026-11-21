// Magic circles (sacred geometry), drawn on a 2D canvas in white so a material can tint
// them. Shared: any scene that needs a marker or a flourish can reuse these layers.
//
//   const { outer, inner } = magicCircleCanvases(512);
//   new THREE.CanvasTexture(outer) ...
//
// The two layers are meant to counter-rotate: `outer` holds the rings and the rune band,
// `inner` the polygram (a hexagram in a circle, with a square and nodes).

const TAU = Math.PI * 2;

/** Rune-like marks for the band: short strokes, each its own little glyph. */
const RUNES = [
    [[0, -1, 0, 1], [-0.6, -0.3, 0.6, -0.3]],
    [[-0.6, 1, 0, -1], [0, -1, 0.6, 1]],
    [[-0.5, -1, -0.5, 1], [-0.5, 0, 0.5, -1], [-0.5, 0, 0.5, 1]],
    [[0, -1, 0, 1], [0, -0.2, 0.6, -0.8], [0, -0.2, -0.6, -0.8]],
    [[-0.6, -1, 0.6, -1], [0.6, -1, -0.6, 1], [-0.6, 1, 0.6, 1]],
    [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.4], [0.5, -0.4, -0.5, 0.2]],
    [[0, -1, 0, 1], [-0.6, 0.4, 0.6, 0.4], [-0.6, -0.4, 0.6, -0.4]],
    [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]],
];

/** @param {number} size @returns {[HTMLCanvasElement, CanvasRenderingContext2D, number]} */
function canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.translate(size / 2, size / 2);
    g.strokeStyle = g.fillStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    return [c, g, size / 2];
}

/** @param {CanvasRenderingContext2D} g @param {number} r @param {number} w */
function ring(g, r, w) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
}

/** A regular polygon (or star with `step` > 1) through `n` points on radius r. */
function poly(g, n, r, rot, step = 1, w = 2) {
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
        const a = rot + ((i * step) % n) * (TAU / n);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
    }
    g.stroke();
}

/**
 * The two layers of a magic circle, white on transparent.
 * @param {number} [size] canvas size in px
 * @returns {{ outer: HTMLCanvasElement, inner: HTMLCanvasElement }}
 */
export function magicCircleCanvases(size = 512) {
    // outer: double ring, rune band, ticks, an outer dotted ring
    const [outer, o, R] = canvas(size);
    const s = R / 256; // design at radius 256
    ring(o, 250 * s, 3 * s);
    ring(o, 238 * s, 1.5 * s);
    ring(o, 196 * s, 2.5 * s);
    ring(o, 188 * s, 1 * s);
    for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU;
        const r0 = (i % 6 === 0 ? 226 : 232) * s, r1 = 238 * s;
        o.lineWidth = (i % 6 === 0 ? 2.2 : 1.2) * s;
        o.beginPath();
        o.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        o.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        o.stroke();
    }
    const runes = 24;
    for (let i = 0; i < runes; i++) {
        const a = (i / runes) * TAU;
        o.save();
        o.rotate(a);
        o.translate(0, -212 * s);
        o.lineWidth = 2 * s;
        for (const [x0, y0, x1, y1] of RUNES[(i * 5 + 3) % RUNES.length]) {
            o.beginPath();
            o.moveTo(x0 * 7 * s, y0 * 9 * s);
            o.lineTo(x1 * 7 * s, y1 * 9 * s);
            o.stroke();
        }
        o.restore();
    }
    for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        o.beginPath();
        o.arc(Math.cos(a) * 252 * s, Math.sin(a) * 252 * s, 1.6 * s, 0, TAU);
        o.fill();
    }

    // inner: hexagram in a circle, a square, small node circles, a centre seal
    const [inner, g] = canvas(size);
    poly(g, 6, 186 * s, -Math.PI / 2, 2, 2.4 * s); // first triangle
    poly(g, 6, 186 * s, -Math.PI / 2 + Math.PI / 3, 2, 2.4 * s); // second triangle -> hexagram
    poly(g, 6, 186 * s, -Math.PI / 2, 1, 1.2 * s); // hexagon through the points
    ring(g, 93 * s, 2 * s); // circle inside the hexagram
    poly(g, 4, 93 * s, Math.PI / 4, 1, 1.6 * s);
    poly(g, 4, 93 * s, 0, 1, 1 * s);
    ring(g, 40 * s, 1.6 * s);
    ring(g, 14 * s, 2.4 * s);
    for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        const x = Math.cos(a) * 186 * s, y = Math.sin(a) * 186 * s;
        g.lineWidth = 1.8 * s;
        g.beginPath();
        g.arc(x, y, 11 * s, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(x, y, 3 * s, 0, TAU);
        g.fill();
    }
    return { outer, inner };
}
