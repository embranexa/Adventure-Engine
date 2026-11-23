// A magic circle that identifies one thing: its points, rings and runes vary, so no two
// adventures share one. Drawn in white (a material tints it). See also ../magicCircle.js.

const TAU = Math.PI * 2;
const RUNES = [
    [[0, -1, 0, 1], [-0.6, -0.3, 0.6, -0.3]],
    [[-0.6, 1, 0, -1], [0, -1, 0.6, 1]],
    [[-0.5, -1, -0.5, 1], [-0.5, 0, 0.5, -1], [-0.5, 0, 0.5, 1]],
    [[0, -1, 0, 1], [0, -0.2, 0.6, -0.8], [0, -0.2, -0.6, -0.8]],
    [[-0.6, -1, 0.6, -1], [0.6, -1, -0.6, 1], [-0.6, 1, 0.6, 1]],
    [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]],
];

/** A stable number from a string. @param {string} s */
export function hash(s) {
    let h = 7;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
}

/**
 * @param {{ seed: string, points?: number, rings?: number, open?: boolean, size?: number }} o
 *   open: a broken circle (something unfinished)
 * @returns {HTMLCanvasElement}
 */
export function sigilCanvas({ seed, points = 5, rings = 0, open = false, size = 320 }) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const R = size / 2 - 6, k = hash(seed) % 997, part = open ? 0.62 : 1;
    g.translate(size / 2, size / 2);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineCap = 'round';
    const arc = (/** @type {number} */ r, /** @type {number} */ w, f = 1) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, -TAU / 4, -TAU / 4 + TAU * f); g.stroke(); };
    arc(R, 2.5, part); arc(R * 0.95, 1, part); arc(R * 0.77, 1.6, part);
    for (let i = 0; i < 20 * part; i++) {
        g.save(); g.rotate((i / 20) * TAU); g.translate(0, -R * 0.86); g.lineWidth = 1.5;
        for (const [x0, y0, x1, y1] of RUNES[(k + i * 5) % RUNES.length]) { g.beginPath(); g.moveTo(x0 * R * 0.035, y0 * R * 0.05); g.lineTo(x1 * R * 0.035, y1 * R * 0.05); g.stroke(); }
        g.restore();
    }
    if (open) { g.globalAlpha = 0.45; g.setLineDash([5, 7]); }
    const step = points > 4 ? 2 : 1;
    const at = (/** @type {number} */ i) => { const a = -TAU / 4 + (i / points) * TAU; return [Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74]; };
    g.lineWidth = 1.8;
    for (let i = 0; i < points; i++) {
        const [x, y] = at(i), [u, v] = at((i + step) % points);
        g.beginPath(); g.moveTo(x, y); g.lineTo(u, v); g.stroke();
        g.beginPath(); g.arc(x, y, R * 0.04, 0, TAU); g.stroke();
    }
    for (let i = 0; i < rings; i++) arc(R * (0.42 - i * 0.055), 1.2);
    return c;
}
