// @ts-nocheck -- canvas drawing for three.js textures; untyped like the scenes.
// Canvas textures for the Signal Chain twin (phase 7): runes, zone sigils, the floor
// plaques and the engraved zone floors. Ported from the approved prototype
// (resources/signal chain digital twin/atelier.html); see PHASE7_PLAN.md.

import * as THREE from 'three';

const TAU = Math.PI * 2;

/** Rune-like marks: short strokes, each its own little glyph (same set as magicCircle.js). */
const RUNES = [
    [[0, -1, 0, 1], [-0.6, -0.3, 0.6, -0.3]], [[-0.6, 1, 0, -1], [0, -1, 0.6, 1]],
    [[-0.5, -1, -0.5, 1], [-0.5, 0, 0.5, -1], [-0.5, 0, 0.5, 1]], [[0, -1, 0, 1], [0, -0.2, 0.6, -0.8], [0, -0.2, -0.6, -0.8]],
    [[-0.6, -1, 0.6, -1], [0.6, -1, -0.6, 1], [-0.6, 1, 0.6, 1]], [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.4], [0.5, -0.4, -0.5, 0.2]],
    [[0, -1, 0, 1], [-0.6, 0.4, 0.6, 0.4], [-0.6, -0.4, 0.6, -0.4]], [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]],
];

/** Draw rune `i` centred on (x, y) at size `s`. */
export function rune(g, i, x, y, s) {
    for (const [x1, y1, x2, y2] of RUNES[i % RUNES.length]) { g.beginPath(); g.moveTo(x + x1 * s, y + y1 * s); g.lineTo(x + x2 * s, y + y2 * s); g.stroke(); }
}

/** A white-on-transparent canvas with round line caps. */
export function canvas2d(w, h = w) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    return [c, g];
}

export function texture(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

/** A strip of runes to wrap around a band (repeat it along u). */
export function runeStrip() {
    const [c, g] = canvas2d(1024, 64); g.lineWidth = 4;
    for (let i = 0; i < 32; i++) rune(g, i * 5 + 3, 16 + i * 32, 32, 14);
    const t = texture(c); t.wrapS = THREE.RepeatWrapping;
    return t;
}

/** Each zone's sigil, for its plaque: a sieve (Net), an athanor (Core), a temple front (Sanctum), an eye in a lens (Gallery). */
const SIGIL = {
    net(g, s) {
        g.lineWidth = s * 0.05; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.stroke();
        g.save(); g.beginPath(); g.arc(0, 0, s * 0.92, 0, TAU); g.clip(); g.lineWidth = s * 0.03;
        for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(i * s * 0.28 - s, -s); g.lineTo(i * s * 0.28 + s, s); g.stroke(); g.beginPath(); g.moveTo(i * s * 0.28 + s, -s); g.lineTo(i * s * 0.28 - s, s); g.stroke(); }
        g.restore();
    },
    core(g, s) {
        g.lineWidth = s * 0.06;
        g.beginPath(); g.moveTo(-s * 0.6, s); g.lineTo(-s * 0.6, -s * 0.1); g.arc(0, -s * 0.1, s * 0.6, Math.PI, 0); g.lineTo(s * 0.6, s); g.closePath(); g.stroke();
        g.beginPath(); g.moveTo(0, -s * 0.7); g.lineTo(0, -s); g.stroke();
        g.beginPath(); g.moveTo(-s * 0.18, s * 0.75); g.quadraticCurveTo(-s * 0.3, s * 0.35, 0, s * 0.15); g.quadraticCurveTo(s * 0.3, s * 0.35, s * 0.18, s * 0.75); g.stroke();
        g.beginPath(); g.arc(0, -s * 0.15, s * 0.18, 0, TAU); g.stroke();
    },
    sanctum(g, s) {
        g.lineWidth = s * 0.06;
        g.beginPath(); g.moveTo(-s, -s * 0.3); g.lineTo(0, -s); g.lineTo(s, -s * 0.3); g.closePath(); g.stroke();
        for (const x of [-0.75, -0.25, 0.25, 0.75]) { g.beginPath(); g.moveTo(x * s, -s * 0.15); g.lineTo(x * s, s * 0.7); g.stroke(); }
        g.beginPath(); g.moveTo(-s, s * 0.85); g.lineTo(s, s * 0.85); g.stroke();
        g.beginPath(); g.arc(0, -s * 0.52, s * 0.13, 0, TAU); g.fill();
    },
    viewer(g, s) {
        g.lineWidth = s * 0.06;
        g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.9, s, 0); g.quadraticCurveTo(0, s * 0.9, -s, 0); g.stroke();
        g.beginPath(); g.arc(0, 0, s * 0.32, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, s * 0.12, 0, TAU); g.fill();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * s * 1.1, Math.sin(a) * s * 1.1); g.lineTo(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3); g.stroke(); }
    },
};

/** A zone's floor plaque: its name between two sigils, in a double frame. */
export function plaqueTexture(zone, name) {
    const [c, g] = canvas2d(1024, 256);
    g.lineWidth = 3; g.beginPath(); g.roundRect(6, 6, 1012, 244, 18); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.roundRect(20, 20, 984, 216, 10); g.stroke();
    for (const x of [128, 896]) { g.save(); g.translate(x, 128); SIGIL[zone](g, 70); g.restore(); }
    g.font = '600 104px "Saira Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '34px'; g.fillText(name.toUpperCase(), 529, 134);
    return texture(c);
}

/**
 * A zone's engraved floor: a rune frieze around the rectangle, then one composition
 * spanning it. Net: a web-and-sieve oval. Core: an oval of seven interlocking circles for
 * the metals. Gallery: a compass rose, a web of nodes and the zodiac under the viewers.
 * @param {'net' | 'core' | 'sanctum' | 'viewer'} zone
 * @param {{ x0: number, x1: number, z0: number, z1: number }} r  the zone's rectangle (world units)
 * @param {Record<string, [number, number]>} viewers  atlas / nexus / calendar positions (x, z)
 * @param {{ x: number, z: number, w: number, h: number } | null} [plaque]  where the plaque lies
 *   (world units): the frame opens there into a cartouche that holds it
 */
export function zoneFloor(zone, r, viewers = {}, plaque = null) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, k = 2048 / Math.max(w, d), W = Math.round(w * k), H = Math.round(d * k);
    const [c, g] = canvas2d(W, H);
    const P = (x, z) => [(x - r.x0) * k, (z - r.z0) * k], S = Math.min(W, H);
    const ring = (x, y, rad, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke(); };
    const poly = (x, y, rad, n, step, rot, lw) => { g.lineWidth = lw; g.beginPath(); for (let i = 0; i <= n; i++) { const a = ((i * step) / n) * TAU + rot; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); };
    const runeRing = (x, y, rad, count, size) => { g.lineWidth = Math.max(1.5, size * 0.2); for (let i = 0; i < count; i++) { g.save(); g.translate(x, y); g.rotate((i / count) * TAU); rune(g, i * 7 + 3, 0, -rad, size); g.restore(); } };
    const glyphs = (x, y, rad, list, size, rot = -Math.PI / 2) => { g.font = `${Math.round(size)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; list.forEach((s, i) => { const a = (i / list.length) * TAU + rot; g.fillText(s, x + Math.cos(a) * rad, y + Math.sin(a) * rad); }); };
    const medallion = (x, y, rad) => { ring(x, y, rad, 4); ring(x, y, rad * 0.95, 1.5); runeRing(x, y, rad * 0.885, Math.max(12, Math.round(rad / 12)), rad * 0.03); ring(x, y, rad * 0.82, 2); };
    const rays = (x, y, r0, r1, n, lw) => { g.lineWidth = lw; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke(); } };
    const blackDisc = (x, y, rad) => { g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); g.fillStyle = '#fff'; };

    // the frame: a double rule, a frieze of runes, rosettes at the corners
    const m = S * 0.035;
    g.lineWidth = 4; g.strokeRect(m, m, W - 2 * m, H - 2 * m); g.lineWidth = 1.5; g.strokeRect(m * 2.2, m * 2.2, W - 4.4 * m, H - 4.4 * m);
    g.lineWidth = 2;
    for (let x = m * 4; x < W - m * 4; x += m * 1.3) { rune(g, Math.round(x / 7), x, m * 1.6, m * 0.3); rune(g, Math.round(x / 7) + 3, x, H - m * 1.6, m * 0.3); }
    for (let y = m * 4; y < H - m * 4; y += m * 1.3) { rune(g, Math.round(y / 7) + 1, m * 1.6, y, m * 0.3); rune(g, Math.round(y / 7) + 5, W - m * 1.6, y, m * 0.3); }
    for (const [x, y] of [[m * 1.6, m * 1.6], [W - m * 1.6, m * 1.6], [m * 1.6, H - m * 1.6], [W - m * 1.6, H - m * 1.6]]) { ring(x, y, m * 1.3, 2); poly(x, y, m * 1.3, 6, 2, 0, 1.5); poly(x, y, m * 1.3, 6, 2, Math.PI / 6, 1.5); }
    const cx = W / 2, cy = H / 2;

    if (zone !== 'viewer') {
        const ell = (x, y, rx, ry, lw) => { g.lineWidth = lw; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke(); };
        const ellPt = (rx, ry, t) => [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
        const ellRunes = (rx, ry, count, size) => { g.lineWidth = Math.max(1.5, size * 0.2); for (let i = 0; i < count; i++) { const t = (i / count) * TAU, [x, y] = ellPt(rx, ry, t); g.save(); g.translate(x, y); g.rotate(Math.atan2(ry * Math.cos(t), -rx * Math.sin(t))); rune(g, i * 5 + 2, 0, 0, size); g.restore(); } };
        const ellPoly = (rx, ry, nv, lw) => { g.lineWidth = lw; g.beginPath(); for (let i = 0; i <= nv; i++) { const [x, y] = ellPt(rx, ry, (i / nv) * TAU); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
        // the oval: a rune band between rings, ticks, then the zone's own geometry inside
        const RX = W / 2 - m * 4, RY = H / 2 - m * 4;
        ell(cx, cy, RX, RY, 4); ell(cx, cy, RX * 0.975, RY * 0.975, 1.5);
        ellRunes(RX * 0.94, RY * 0.94, Math.round((RX + RY) / 18), m * 0.32);
        ell(cx, cy, RX * 0.905, RY * 0.905, 2.5);
        g.lineWidth = 1.2;
        for (let i = 0; i < 96; i++) { const t = (i / 96) * TAU, [x1, y1] = ellPt(RX * 0.905, RY * 0.905, t), [x2, y2] = ellPt(RX * (i % 4 ? 0.885 : 0.86), RY * (i % 4 ? 0.885 : 0.86), t); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        const IX = RX * 0.84, IY = RY * 0.84;
        if (zone === 'net') {
            // the great net: a web strung across the oval, a sieve in its lobes, the earth medallion at its heart
            const C = Math.min(IX, IY) * 0.5;
            g.save(); g.beginPath(); g.ellipse(cx, cy, IX, IY, 0, 0, TAU); g.arc(cx, cy, C * 1.15, 0, TAU, true); g.clip('evenodd');
            g.lineWidth = 1.1; const step = Math.min(W, H) * 0.035;
            for (let i = -60; i <= 60; i++) { g.beginPath(); g.moveTo(cx + i * step - H, cy - H); g.lineTo(cx + i * step + H, cy + H); g.stroke(); g.beginPath(); g.moveTo(cx + i * step + H, cy - H); g.lineTo(cx + i * step - H, cy + H); g.stroke(); }
            g.restore();
            for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU, [x, y] = ellPt(IX, IY, t); g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx + Math.cos(t) * C * 1.15, cy + Math.sin(t) * C * 1.15); g.lineTo(x, y); g.stroke(); }
            for (let k2 = 1; k2 <= 4; k2++) ellPoly(IX * (0.4 + k2 * 0.15), IY * (0.4 + k2 * 0.15), 24, 1.6);
            medallion(cx, cy, C);
            poly(cx, cy, C * 0.66, 3, 1, Math.PI / 2, 3); g.lineWidth = 3; g.beginPath(); g.moveTo(cx - C * 0.29, cy - C * 0.16); g.lineTo(cx + C * 0.29, cy - C * 0.16); g.stroke();
            ring(cx, cy, C * 0.14, 2.5);
            // salt and mercury at the two foci
            const f = Math.sqrt(Math.abs(IY * IY - IX * IX)) * 0.82, alongY = IY > IX;
            [[-1, '⊖'], [1, '☿']].forEach(([sg, sym]) => { const x = cx + (alongY ? 0 : sg * f), y = cy + (alongY ? sg * f : 0), rr = C * 0.42; blackDisc(x, y, rr); ring(x, y, rr, 3); ring(x, y, rr * 0.85, 1.2); glyphs(x, y, 0, [sym], rr); });
        } else if (zone === 'sanctum') {
            // five medallions, one under each machine (evenly spread, 46 units in from the sides),
            // threaded by two weaving lines; each holds a polygram with one more point than the last
            const x0 = 46 * k, step = (W - 2 * x0) / 4, rr = Math.min(IY * 0.92, step * 0.42);
            for (const s of [1, -1]) {
                g.lineWidth = 1.6; g.beginPath();
                for (let i = 0; i <= 160; i++) { const u = i / 160, x = x0 + u * (W - 2 * x0), y = cy + s * Math.sin(u * 4 * Math.PI) * rr * 0.62; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
                g.stroke();
            }
            for (let i = 0; i < 5; i++) {
                const x = x0 + i * step, n = 5 + i;
                blackDisc(x, cy, rr); medallion(x, cy, rr);
                poly(x, cy, rr * 0.76, n, 2, -Math.PI / 2, 2); ring(x, cy, rr * 0.3, 1.5);
            }
        } else {
            // the great work: seven interlocking circles for the seven metals along the oval, the heptagram at the centre
            const rc = IY * 0.46, span = IX - rc * 1.05, metals = ['♄', '♃', '♂', '☉', '♀', '☿', '☽'];
            g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - IX, cy); g.lineTo(cx, cy - IY); g.lineTo(cx + IX, cy); g.lineTo(cx, cy + IY); g.closePath(); g.stroke();
            g.setLineDash([6, 10]); ell(cx, cy, IX * 0.62, IY * 0.62, 1.2); g.setLineDash([]);
            metals.forEach((sym, i) => {
                const x = cx - span + (i / 6) * span * 2, rr = i === 3 ? rc * 1.25 : rc;
                ring(x, cy, rr, i === 3 ? 3 : 2);
                if (i === 3) { poly(x, cy, rr * 0.8, 7, 3, -Math.PI / 2, 2); poly(x, cy, rr * 0.8, 7, 1, -Math.PI / 2, 1); ring(x, cy, rr * 0.3, 2); rays(x, cy, rr * 0.32, rr * 0.45, 16, 1.4); }
                else { ring(x, cy, rr * 0.86, 1); poly(x, cy, rr * 0.7, i % 2 ? 3 : 4, 1, i % 2 ? Math.PI / 2 : Math.PI / 4, 1.2); }
                blackDisc(x, cy, rr * 0.24);
                glyphs(x, cy, 0, [sym], rr * 0.34);
            });
        }
    } else {
        // the observatory: a compass rose under the Atlas, a web of nodes under the Nexus, the zodiac under the Calendar
        const R = H * 0.4, at = (id) => (viewers[id] ? P(viewers[id][0], viewers[id][1]) : [cx, cy]);
        let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 160; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, 0, TAU); g.fill(); }
        const [ax, ay] = at('atlas'); medallion(ax, ay, R);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, l = i % 4 === 0 ? 0.78 : i % 2 === 0 ? 0.55 : 0.4, a1 = a + TAU / 32, a2 = a - TAU / 32; g.lineWidth = 1.8; g.beginPath(); g.moveTo(ax + Math.cos(a1) * R * 0.1, ay + Math.sin(a1) * R * 0.1); g.lineTo(ax + Math.cos(a) * R * l, ay + Math.sin(a) * R * l); g.lineTo(ax + Math.cos(a2) * R * 0.1, ay + Math.sin(a2) * R * 0.1); g.stroke(); }
        ring(ax, ay, R * 0.1, 2);
        const [nx, ny] = at('nexus'); medallion(nx, ny, R);
        const nodes = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * TAU - Math.PI / 2; return [nx + Math.cos(a) * R * 0.6, ny + Math.sin(a) * R * 0.6]; });
        g.lineWidth = 1.5;
        nodes.forEach(([x, y], i) => { for (const j of [i + 2, i + 3]) { const [x2, y2] = nodes[j % 7]; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); } g.beginPath(); g.moveTo(nx, ny); g.lineTo(x, y); g.stroke(); });
        nodes.forEach(([x, y]) => { ring(x, y, R * 0.06, 2); }); ring(nx, ny, R * 0.1, 2.5);
        const [kx, ky] = at('calendar'); medallion(kx, ky, R);
        rays(kx, ky, R * 0.5, R * 0.8, 12, 1.5); ring(kx, ky, R * 0.5, 2);
        glyphs(kx, ky, R * 0.65, ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'], R * 0.12, -Math.PI / 2 + TAU / 24);
        ring(kx, ky, R * 0.12, 3); rays(kx, ky, R * 0.15, R * 0.3, 8, 1.5);
        g.lineWidth = 1.2; g.setLineDash([6, 10]); g.beginPath(); g.moveTo(ax + R, ay); g.lineTo(nx - R, ny); g.moveTo(nx + R, ny); g.lineTo(kx - R, ky); g.stroke(); g.setLineDash([]);
        if (viewers.ledger) {   // a ruled page under the Ledger
            const [lx, ly] = at('ledger'); medallion(lx, ly, R);
            ring(lx, ly, R * 0.72, 1.5);
            for (let i = -3; i <= 3; i++) { const y = ly + i * R * 0.16, half = Math.sqrt(Math.max(0, (R * 0.6) ** 2 - (i * R * 0.16) ** 2)); g.lineWidth = i === -3 ? 2.5 : 1.3; g.beginPath(); g.moveTo(lx - half, y); g.lineTo(lx + half, y); g.stroke(); }
            ring(lx, ly, R * 0.1, 2.5);
            g.lineWidth = 1.2; g.setLineDash([6, 10]); g.beginPath(); g.moveTo(kx + R, ky); g.lineTo(lx - R, ly); g.stroke(); g.setLineDash([]);
        }
    }
    if (plaque) cartouche(g, P, k, plaque, W, H);
    return c;
}

/**
 * Open the floor where the plaque lies and frame the opening as part of the pattern: the
 * engraving is cleared under it, a double-ruled cartouche (like the frame's own double
 * rule) surrounds it, and a ring finial at each end ties it into the frieze.
 */
function cartouche(g, P, k, plaque, W, H) {
    const pad = 5 * k;
    const [px, py] = P(plaque.x, plaque.z);
    const hw = (plaque.w * k) / 2 + pad, hh = (plaque.h * k) / 2 + pad;
    const x0 = Math.max(4, px - hw), x1 = Math.min(W - 4, px + hw);
    const y0 = Math.max(4, py - hh), y1 = Math.min(H - 4, py + hh);
    const rad = Math.min(hh, (y1 - y0) / 2) * 0.55;
    const box = (inset, lw) => { g.lineWidth = lw; g.beginPath(); g.roundRect(x0 + inset, y0 + inset, x1 - x0 - 2 * inset, y1 - y0 - 2 * inset, Math.max(2, rad - inset)); g.stroke(); };
    // clear the engraving under the plaque (and a margin)
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.roundRect(x0 - pad * 0.5, y0 - pad * 0.5, x1 - x0 + pad, y1 - y0 + pad, rad + pad * 0.5); g.fill();
    g.restore();
    // the cartouche: a heavy rule and a fine one inside it
    box(0, 4); box(pad * 0.45, 1.5);
    // finials: a ring at each end, its stem reaching back into the frieze
    const cy = (y0 + y1) / 2, fr = Math.min(pad * 1.1, (y1 - y0) * 0.22);
    for (const [ex, dir] of [[x0, -1], [x1, 1]]) {
        const fx = ex + dir * (fr + pad * 0.6);
        g.lineWidth = 2.5; g.beginPath(); g.arc(fx, cy, fr, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(fx, cy, fr * 0.35, 0, Math.PI * 2); g.fill();
        g.lineWidth = 2; g.beginPath(); g.moveTo(ex, cy); g.lineTo(fx - dir * fr, cy); g.stroke();
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx + dir * fr, cy); g.lineTo(fx + dir * (fr + pad * 1.6), cy); g.stroke();
    }
}
