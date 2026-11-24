// An archetype's card (the Cohort), drawn on a canvas: an ornate frame, a magic circle, rays,
// and the idol's emblem in gilt line. See idols.js (what it says) and cabinet/idols.js (the statue).

import { ARCHETYPES, ARCHETYPE_GROUPS } from '../lifecycle.js';
import { sigilCanvas } from './cabinet/sigil.js';
import { magicCircleCanvases } from './magicCircle.js';
import { IDOLS } from './idols.js';

export const CARD_W = 480, CARD_H = 760;
const TAU = Math.PI * 2;

/** @typedef {CanvasRenderingContext2D} G */
const path = (/** @type {G} */ g, /** @type {number[][]} */ pts, close = false, fill = false) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); if (fill) g.fill(); g.stroke(); };
const circle = (/** @type {G} */ g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r, fill = false) => { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) g.fill(); g.stroke(); };
const curve = (/** @type {G} */ g, /** @type {string} */ d, fill = false) => { const p = new Path2D(d); if (fill) g.fill(p); g.stroke(p); };
const both = (/** @type {G} */ g, /** @type {() => void} */ f) => { f(); g.save(); g.scale(-1, 1); f(); g.restore(); };

/** Emblems, drawn within about 120 of the origin; fills are the dark ground, so parts overlap cleanly.
 *  @type {Record<Archetype, (g: G) => void>} */
const EMBLEMS = {
    vanguard(g) {
        both(g, () => { for (let i = 5; i >= 0; i--) curve(g, `M6 ${-26 + i * 9} C40 ${-62 + i * 13} 78 ${-76 + i * 18} ${116 - i * 13} ${-70 + i * 22} C92 ${-44 + i * 17} 50 ${-20 + i * 11} 6 ${-10 + i * 8} Z`, true); });
        path(g, [[-10, -118], [26, -118], [8, -36], [34, -36], [-22, 120], [-6, 6], [-32, 6]], true, true);
        both(g, () => { for (let i = 0; i < 6; i++) { g.save(); g.translate(30 + i * 13, 102 - i * 15); g.rotate(-0.8 - i * 0.08); g.beginPath(); g.ellipse(0, 0, 15, 5.5, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); } });
    },
    performer(g) {
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = i % 2 ? 100 : 118; path(g, [[Math.cos(a - 0.05) * 78, Math.sin(a - 0.05) * 78], [Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a + 0.05) * 78, Math.sin(a + 0.05) * 78]]); }
        circle(g, 0, 0, 74, true);
        both(g, () => curve(g, 'M0 58 C46 54 56 18 34 -8 C22 -26 34 -46 54 -50 C42 -58 18 -50 20 -22 C22 4 40 22 20 38 L0 44', true));
        path(g, [[-30, -34], [30, -34]]); path(g, [[-30, -28], [30, -28]]);
        for (let i = -2; i <= 2; i++) path(g, [[i * 8, -28], [i * 6, 44]]);
    },
    enchanter(g) {
        for (let i = 0; i < 11; i++) { const a = Math.PI + 0.16 + (i / 10) * (Math.PI - 0.32), b = a + 0.283, r = 112; g.beginPath(); g.moveTo(0, 74); g.lineTo(Math.cos(a) * r, 50 + Math.sin(a) * r * 1.35); g.quadraticCurveTo(Math.cos((a + b) / 2) * (r + 16), 50 + Math.sin((a + b) / 2) * (r + 16) * 1.35, Math.cos(b) * r, 50 + Math.sin(b) * r * 1.35); g.closePath(); if (i < 10) { g.fill(); g.stroke(); } }
        path(g, [[-30, 68], [-38, 96], [38, 96], [30, 68]], true, true);
        curve(g, 'M0 54 C-46 20 -40 -26 -14 -22 C-4 -20 0 -10 0 -4 C0 -10 4 -20 14 -22 C40 -26 46 20 0 54 Z', true);
        circle(g, 0, -62, 7, true);
    },
    juggernaut(g) {
        for (const s of [1, -1]) { g.save(); g.rotate(s * 0.6); path(g, [[0, 118], [0, -92]]); path(g, [[-9, -84], [0, -122], [9, -84], [0, -74]], true, true); g.restore(); }
        circle(g, 0, 8, 66, true); circle(g, 0, 8, 56); circle(g, 0, 8, 22);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; path(g, [[Math.cos(a) * 22, 8 + Math.sin(a) * 22], [Math.cos(a + 0.26) * 40, 8 + Math.sin(a + 0.26) * 40], [Math.cos(a) * 56, 8 + Math.sin(a) * 56]]); }
        curve(g, 'M-22 24 L-22 -2 C-22 -26 22 -26 22 -2 L22 24 L10 24 L10 8 L3 2 L3 26 L-3 26 L-3 2 L-10 8 L-10 24 Z', true);
    },
    rogue(g) {
        curve(g, 'M-34 -66 A44 44 0 1 0 34 -66 A34 34 0 1 1 -34 -66 Z', true);
        curve(g, 'M-96 60 C-70 -44 70 -44 96 60 C62 -14 -62 -14 -96 60 Z', true);
        path(g, [[-96, 60], [0, 96], [96, 60]]);
        path(g, [[0, 112], [0, -74]]); path(g, [[-10, -62], [0, -96], [10, -62], [0, -70]], true, true);
        both(g, () => { path(g, [[0, 100], [12, 112]]); path(g, [[0, 92], [12, 104]]); });
    },
    summoner(g) {
        both(g, () => curve(g, 'M14 -52 C40 -60 62 -82 50 -112 C76 -88 70 -44 24 -30 Z', true));
        for (let i = 0; i < 7; i++) { const x = -54 + i * 16, l = 132 - i * 13; curve(g, `M${x} -34 L${x} ${-34 + l} A7 5 0 0 0 ${x + 14} ${-34 + l} L${x + 14} -34 Z`, true); g.beginPath(); g.ellipse(x + 7, -34, 7, 4, 0, 0, TAU); g.fill(); g.stroke(); }
        path(g, [[-58, -8], [62, -8], [62, 6], [-58, 6]], true, true);
        for (const [x, y] of [[-96, -10], [96, -20], [-84, 78], [92, 62]]) { circle(g, x, y, 9, true); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 15, y - 4, 9, 3, 0, 0, TAU); g.stroke(); } }
    },
    resonator(g) {
        for (let i = 0; i < 13; i++) { const a = Math.PI + 0.1 + (i / 12) * (Math.PI - 0.2), r = i % 2 ? 90 : 112, x = Math.cos(a) * r, y = 40 + Math.sin(a) * r * 1.2; path(g, [[0, 44], [x, y]]); g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath(); g.ellipse(0, 0, 10, 15, 0, 0, TAU); g.fill(); g.stroke(); circle(g, 0, 2, 5); circle(g, 0, 2, 1.5); g.restore(); }
        curve(g, 'M0 -34 C-10 -34 -14 -22 -8 -14 C-12 6 -34 28 -26 62 C-18 92 18 92 26 62 C34 28 12 6 8 -14 C14 -22 10 -34 0 -34 Z', true);
        path(g, [[-6, -24], [-2, -14], [2, -24]]); for (const x of [-8, 0, 8]) { path(g, [[x * 0.4, -34], [x, -50]]); circle(g, x, -53, 3, true); }
        path(g, [[-10, 84], [-14, 112]]); path(g, [[10, 84], [14, 112]]);
    },
    merchant(g) {
        both(g, () => { for (let i = 0; i < 4; i++) curve(g, `M6 ${-70 + i * 9} C50 ${-104 + i * 12} 84 ${-100 + i * 14} ${112 - i * 16} ${-84 + i * 14} C80 ${-70 + i * 10} 44 ${-66 + i * 10} 6 ${-62 + i * 9} Z`, true); });
        path(g, [[0, -84], [0, 118]]); circle(g, 0, -94, 12, true);
        both(g, () => curve(g, 'M0 104 C34 88 34 66 0 52 C-38 38 -38 12 0 -2 C30 -14 36 -34 14 -46 C6 -50 2 -44 6 -40'));
        both(g, () => circle(g, 12, -44, 4, true));
    },
    artificer(g) {
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.save(); g.rotate(a); path(g, [[-9, -96], [-7, -114], [7, -114], [9, -96]]); g.restore(); }
        circle(g, 0, 0, 96, false); circle(g, 0, 0, 84);
        curve(g, 'M-76 22 L-28 14 L60 14 L60 34 L26 40 L20 60 L40 78 L-34 78 L-14 60 L-20 42 C-44 42 -66 36 -76 22 Z', true);
        g.save(); g.translate(8, -16); g.rotate(0.55); path(g, [[-4, 24], [-4, -34], [4, -34], [4, 24]], true, true); path(g, [[-28, -62], [28, -62], [28, -34], [-28, -34]], true, true); path(g, [[16, -62], [16, -34]]); g.restore();
        for (const [x, y] of [[-40, -10], [-54, -28], [-26, -30], [52, -2], [66, -20]]) path(g, [[x, y - 5], [x, y + 5]]);
    },
    wizard(g) {
        both(g, () => { for (let i = 0; i < 4; i++) curve(g, `M${12 + i * 6} -6 C${62 - i * 4} -22 ${104 - i * 14} 10 ${100 - i * 16} ${72 - i * 4} C${70 - i * 8} ${58} ${40} ${40} 20 60 Z`, true); });
        curve(g, 'M-46 -92 L-30 -78 L30 -78 L46 -92 C52 -52 44 -30 34 -16 C50 40 26 84 0 92 C-26 84 -50 40 -34 -16 C-44 -30 -52 -52 -46 -92 Z', true);
        both(g, () => { circle(g, 18, -48, 17, true); circle(g, 18, -48, 8); circle(g, 18, -48, 2.5); });
        path(g, [[-6, -38], [0, -22], [6, -38]], true, true);
        for (let r = 0; r < 4; r++) for (let i = -2 + (r % 2) / 2; i <= 2; i++) curve(g, `M${i * 12 - 6} ${4 + r * 17} Q${i * 12} ${16 + r * 17} ${i * 12 + 6} ${4 + r * 17}`);
        path(g, [[-90, 100], [90, 100]]); both(g, () => { for (const x of [8, 14, 20]) path(g, [[x, 88], [x, 104]]); });
    },
    cleric(g) {
        curve(g, 'M0 -116 C30 -70 54 -50 46 -10 C42 18 22 30 0 30 C-22 30 -42 18 -46 -10 C-50 -36 -26 -44 -18 -74 C-8 -62 -8 -52 -4 -42 C6 -62 6 -88 0 -116 Z', true);
        curve(g, 'M0 -44 C16 -20 24 -10 20 6 C16 20 6 24 0 24 C-6 24 -16 20 -20 6 C-24 -10 -8 -20 0 -44 Z', true);
        curve(g, 'M-78 34 L78 34 C74 66 44 78 0 78 C-44 78 -74 66 -78 34 Z', true); path(g, [[-84, 26], [84, 26], [84, 36], [-84, 36]], true, true);
        for (const x of [-48, -16, 16, 48]) curve(g, `M${x - 12} 46 Q${x} 66 ${x + 12} 46`);
        path(g, [[-20, 78], [-32, 112], [32, 112], [20, 78]], true, true);
    },
    patron(g) {
        curve(g, 'M-46 -116 C-50 -62 -32 -46 0 -44 C32 -46 50 -62 46 -116 L36 -96 C38 -68 24 -58 0 -58 C-24 -58 -38 -68 -36 -96 Z', true);
        path(g, [[-4, -46], [-4, 118], [4, 118], [4, -46]], true, true);
        g.save(); g.rotate(-0.95); circle(g, 0, -70, 24, true); circle(g, 0, -70, 13); path(g, [[-5, -46], [5, -46], [5, 78], [-5, 78]], true, true); path(g, [[5, 46], [28, 46], [28, 54], [16, 54], [16, 62], [28, 62], [28, 72], [5, 72]], true, true); g.restore();
        for (const [x, y] of [[-52, 52], [-70, 74], [-40, 82]]) { circle(g, x, y, 13, true); circle(g, x, y, 8); }
    },
};

/** A picture tinted one colour. @param {HTMLCanvasElement} c @param {string} color */
function tinted(c, color) {
    const out = document.createElement('canvas');
    out.width = c.width; out.height = c.height;
    const g = /** @type {G} */ (out.getContext('2d'));
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, out.width, out.height);
    return out;
}

/** @param {HTMLCanvasElement} canvas @param {Archetype} id */
export function drawIdolCard(canvas, id) {
    const W = CARD_W, H = CARD_H, a = ARCHETYPES[id], d = IDOLS[id], gold = '#e6c98a';
    canvas.width = W; canvas.height = H;
    const g = /** @type {G} */ (canvas.getContext('2d'));
    const cx = W / 2, cy = 330;
    g.fillStyle = '#07080b'; g.beginPath(); g.roundRect(0, 0, W, H, 26); g.fill(); g.save(); g.clip();
    const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 420);
    glow.addColorStop(0, `${d.color}66`); glow.addColorStop(0.5, `${d.color}1c`); glow.addColorStop(1, '#0000');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // rays, stars and the circles
    g.strokeStyle = `${d.color}2e`; g.lineWidth = 1.2;
    for (let i = 0; i < 72; i++) { const t = (i / 72) * TAU, r0 = i % 2 ? 214 : 200; g.beginPath(); g.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0); g.lineTo(cx + Math.cos(t) * 620, cy + Math.sin(t) * 620); g.stroke(); }
    let seed = d.numeral.length * 977 + id.charCodeAt(0) * 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.2, 0, TAU); g.fill(); }
    const circles = magicCircleCanvases(800);
    g.globalAlpha = 0.8; g.drawImage(tinted(circles.outer, d.color), cx - 198, cy - 198, 396, 396);
    g.globalAlpha = 0.16; g.drawImage(tinted(sigilCanvas({ seed: id, points: Object.keys(ARCHETYPES).indexOf(id) + 3, rings: 2, size: 700 }), d.color), cx - 150, cy - 150, 300, 300);
    g.globalAlpha = 1;
    g.restore();
    // the emblem: gilt line over dark fills, with a glow
    g.save(); g.translate(cx, cy); g.scale(1.12, 1.12);
    g.lineJoin = g.lineCap = 'round'; g.lineWidth = 2.6; g.fillStyle = 'rgba(9,10,14,0.94)';
    const ink = g.createLinearGradient(0, -120, 0, 120); ink.addColorStop(0, '#fff3d6'); ink.addColorStop(0.5, gold); ink.addColorStop(1, '#a8834a');
    g.strokeStyle = ink; g.shadowColor = d.color; g.shadowBlur = 14;
    EMBLEMS[id](g);
    g.restore();
    // the frame: double rule, corner curls, an arch over the circle
    g.strokeStyle = gold; g.lineWidth = 2.5; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 18); g.stroke();
    g.lineWidth = 1; g.beginPath(); g.roundRect(23, 23, W - 46, H - 46, 12); g.stroke();
    for (const [x, y, sx, sy] of [[23, 23, 1, 1], [W - 23, 23, -1, 1], [23, H - 23, 1, -1], [W - 23, H - 23, -1, -1]]) {
        g.save(); g.translate(x, y); g.scale(sx, sy); g.lineWidth = 1.6;
        curve(g, 'M0 74 C2 30 30 2 74 0'); curve(g, 'M0 58 C22 56 30 44 26 32 C22 22 10 26 14 34'); curve(g, 'M58 0 C56 22 44 30 32 26 C22 22 26 10 34 14'); circle(g, 12, 12, 4);
        g.restore();
    }
    g.lineWidth = 1.4; curve(g, `M40 560 L40 300 C40 160 130 96 ${cx} 84 C${W - 130} 96 ${W - 40} 160 ${W - 40} 300 L${W - 40} 560`);
    // words
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = gold;
    g.font = '600 25px "Saira Condensed", sans-serif'; g.fillText(d.numeral, cx, 56);
    g.beginPath(); g.moveTo(44, 566); g.lineTo(W - 44, 566); g.moveTo(44, 570); g.lineTo(W - 44, 570); g.stroke();
    g.fillStyle = '#f6efe0'; g.font = '600 52px "Saira Condensed", sans-serif'; g.letterSpacing = '8px'; g.fillText(a.label.toUpperCase(), cx + 4, 614);
    g.fillStyle = d.color; g.font = '500 21px "Saira Condensed", sans-serif'; g.letterSpacing = '4px'; g.fillText(`${a.idol.toUpperCase()}  ·  ${ARCHETYPE_GROUPS[a.group].toUpperCase()}`, cx + 2, 658);
    g.fillStyle = '#a9a496'; g.letterSpacing = '1px'; g.font = '500 18px "Saira Condensed", sans-serif'; g.fillText(a.medium, cx, 692);
    g.letterSpacing = '0px';
}
