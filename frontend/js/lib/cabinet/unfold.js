// The seal: a magic circle that unfolds from its centre, petal by petal, drawn on a 2D
// canvas for a moment in [0, 1]. Used by the sealing ceremony (components/Ceremony.js).

import { RUNES, hash } from './sigil.js';

const TAU = Math.PI * 2;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ color: string, seed: string, points: number, rings: number }} o
 * @param {number} p  progress 0..1
 * @param {number} t  time in ms (it turns slowly once open)
 */
export function drawUnfold(canvas, { color, seed, points: n, rings }, p, t) {
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), Z = canvas.width, R = Z / 2 - 26, k0 = hash(seed) % 997;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, Z, Z);
    g.translate(Z / 2, Z / 2);
    g.strokeStyle = g.fillStyle = color;
    g.lineCap = g.lineJoin = 'round';
    const seg = (/** @type {number} */ a, /** @type {number} */ b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
    const out = (/** @type {number} */ x) => 1 - (1 - x) ** 3;
    const spring = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2);
    const at = (/** @type {number} */ r, /** @type {number} */ a) => [Math.cos(a) * r, Math.sin(a) * r];
    const ring = (/** @type {number} */ r, /** @type {number} */ w, alpha = 1) => { if (r <= 0) return; g.globalAlpha = alpha; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.globalAlpha = 1; };
    const step = n > 4 ? 2 : 1, A = -TAU / 4;

    // the light behind it, and the spark it starts from
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, R);
    glow.addColorStop(0, `${color}55`); glow.addColorStop(1, `${color}00`);
    g.globalAlpha = out(seg(0, 0.3)) * (0.55 + 0.2 * Math.sin(t / 700));
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.globalAlpha = 1; g.fillStyle = color;
    g.beginPath(); g.arc(0, 0, Math.max(0, R * 0.03 * spring(seg(0, 0.1))), 0, TAU); g.fill();

    // 1: the core polygon opens
    const core = Math.max(0, spring(seg(0.06, 0.24))), ri = (R * 0.74 * Math.cos(Math.PI / n)) / (1 + Math.cos(Math.PI / n)) * 1.04;
    const settle = (t / 9000) * seg(0.95, 1);
    g.save(); g.rotate((1 - out(seg(0.06, 0.3))) * -1.6 - settle);
    g.lineWidth = 2.4; g.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = at(ri * core, A + ((i + 0.5) / n) * TAU); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // 2: each edge hinges a petal outward, one after another
    const tips = [];
    for (let i = 0; i < n; i++) {
        const k = seg(0.2 + (0.16 * i) / n, 0.36 + (0.16 * i) / n), f = k <= 0 ? -1 : -Math.cos(Math.PI * out(k)), a = A + (i / n) * TAU;
        const [x0, y0] = at(ri * core, a - Math.PI / n), [x1, y1] = at(ri * core, a + Math.PI / n), ap = ri * core * Math.cos(Math.PI / n);
        const [tx, ty] = at(ap + (R * 0.74 - ap) * f * (f < 0 ? 0.75 : 1), a);
        tips.push([tx, ty]);
        if (core < 0.05) continue;
        g.globalAlpha = 0.1 + 0.16 * Math.abs(f);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(tx, ty); g.lineTo(x1, y1); g.closePath(); g.fill();
        g.globalAlpha = 1; g.lineWidth = 1.8; g.stroke();
        if (k >= 1) { g.beginPath(); g.arc(tx, ty, R * 0.035, 0, TAU); g.stroke(); }
    }
    // 3: the star threads between the petals' tips
    const s3 = out(seg(0.5, 0.68));
    if (s3 > 0) tips.forEach(([x, y], i) => { const [u, v] = tips[(i + step) % n]; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (u - x) * s3, y + (v - y) * s3); g.stroke(); });
    g.restore();
    // 4: rings swell out of the tips, and the rune band fans open
    const r1 = Math.max(0, spring(seg(0.54, 0.72))), r2 = Math.max(0, spring(seg(0.62, 0.82)));
    if (r1 > 0) ring(R * (0.5 + 0.27 * r1), 2, Math.min(1, r1 * 2));
    if (r2 > 0) { ring(R * (0.77 + 0.18 * r2), 1.4, Math.min(1, r2)); ring(R * (0.77 + 0.23 * r2), 3, Math.min(1, r2)); }
    const N = 24;
    g.save(); g.rotate(settle * 0.7);
    for (let i = 0; i < N; i++) {
        const side = i <= N / 2 ? i : i - N, delay = (0.14 * Math.abs(side)) / (N / 2), k = spring(seg(0.64 + delay, 0.78 + delay));
        if (k <= 0) continue;
        g.save(); g.rotate((side / N) * TAU * out(seg(0.62, 0.9))); g.translate(0, -R * (0.77 + 0.09 * k)); g.scale(k, k); g.globalAlpha = Math.min(1, k); g.lineWidth = 2;
        for (const [a, b, c, d] of RUNES[(k0 + i * 5) % RUNES.length]) { g.beginPath(); g.moveTo(a * R * 0.036, b * R * 0.052); g.lineTo(c * R * 0.036, d * R * 0.052); g.stroke(); }
        g.restore();
    }
    g.restore();
    // 5: the verdict's rings, then the seal strikes
    for (let i = 0; i < rings; i++) { const k = Math.max(0, spring(seg(0.8 + i * 0.025, 0.9 + i * 0.025))); ring(R * (0.06 + i * 0.045) * k, 1.6, Math.min(1, k)); }
    const hit = seg(0.9, 1);
    if (hit > 0 && hit < 1) {
        ring(R * (1 + 0.1 * hit), 6 * (1 - hit), 1 - hit);
        g.globalAlpha = (1 - hit) * 0.5; g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, R * 0.5 * hit, 0, TAU); g.fill(); g.globalAlpha = 1;
    }
}
