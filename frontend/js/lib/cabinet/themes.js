// @ts-nocheck -- three.js geometry; untyped like the scenes.
// A theme for one group of a cabinet: its alcoves' opening, its columns, the light on its
// shelves, and ornament on its housing. The metal stays silver; the colour is in the light.
// The four orders (the Cohort's idols):
//   kratos  a forge: battered openings, riveted plates, battlements, embers
//   logos   an observatory: octagons, an astrolabe, a constellation joined star to star
//   pathos  a garden under water: pointed arches, tendrils, drops hanging
//   ethos   a temple: round arches, fluted columns with capitals, a pediment, laurel

import * as THREE from 'three';
import { LABEL_H } from './layout.js';

const TAU = Math.PI * 2;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** Two lines of light crossing over (an additive plane), in the theme's colour. */
const glowBar = (c, x, y, w, h, o) => c.K.mesh(new THREE.PlaneGeometry(w, h), c.K.light(c.K.tex.line, c.color, o), c.group, x, y, 5);

/** A leafy or curling line through points. */
const vine = (c, pts, r, mat = c.K.M.trim) => c.K.tube(pts.map(([x, y]) => V(x, y, 5)), r, mat, c.group, 60);

export const THEMES = {
    kratos: {
        color: '#ff7a4a', shape: 'battered', column: 3.4,
        ornament(c) {
            const { K, group, L, R, top, bot, mid, w, columns, rows } = c, { M, mesh, gem, ball, cyl } = K;
            // battlements along the cornice, and a heavy plate under the shelf
            const step = 22, n = Math.floor((w * 0.5) / step);
            for (let i = -n; i <= n; i++) if (Math.abs(i * step) < w / 2 - 12) mesh(new THREE.BoxGeometry(11, 8, 8), i % 2 ? M.steel : M.trim, group, mid + i * step, top + 10, 2);
            for (const x of columns) {
                for (const y of [top - 8, bot + 8]) { mesh(new THREE.BoxGeometry(15, 13, 8), M.steel, group, x, y, 3); for (const [dx, dy] of [[-4.6, -3.8], [4.6, -3.8], [-4.6, 3.8], [4.6, 3.8]]) ball(1.2, M.bright, group, x + dx, y + dy, 7.4); }
            }
            for (const ry of rows) {   // rivets and embers along each shelf
                const y = ry + LABEL_H;
                mesh(new THREE.BoxGeometry(w, 6, 3), M.steel, group, mid, y - 5, 2);
                for (let x = L + 16; x < R - 8; x += 18) ball(1.1, M.trim, group, x, y - 5, 4.4);
                const ember = mesh(new THREE.PlaneGeometry(w * 0.98, 54), K.light(K.tex.beam, c.color, 0.2), group, mid, y + 24, -20);
                ember.renderOrder = -1;
            }
            // two crossed hammers at the crown
            for (const f of [-1, 1]) { const h = new THREE.Group(); h.position.set(mid, top + 19, 6); h.rotation.z = f * 0.85; group.add(h); cyl(1, 1, 34, M.trim, h); mesh(new THREE.BoxGeometry(12, 7, 6), M.bright, h, 0, 15); }
            gem(3.6, K.glow(c.color, 1.6), group, mid, top + 19, 11, 1);
        },
    },
    logos: {
        color: '#7fb6ff', shape: 'octagon', column: 1.2,
        ornament(c) {
            const { K, group, L, R, top, bot, mid, w, columns, rows } = c, { M, ring, gem, cyl, ball } = K;
            // an astrolabe at the crown
            for (const [r, t, m] of [[19, 1, M.trim], [14.5, 0.5, M.steel], [8.5, 0.6, M.trim]]) ring(r, t, m, group, mid, top + 15, 5, false);
            for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = i % 6 ? 17.2 : 15.6, tick = cyl(0.35, 0.35, i % 6 ? 2 : 4, M.bright, group, mid + Math.cos(a) * r, top + 15 + Math.sin(a) * r, 6); tick.rotation.z = a - Math.PI / 2; }
            const rule = cyl(0.6, 0.6, 36, M.bright, group, mid, top + 15, 7); rule.rotation.z = -0.7;
            gem(2.4, K.glow(c.color, 1.6), group, mid, top + 15, 9, 1);
            // a constellation along the cornice
            let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            for (const [a, b] of [[L + 8, mid - 30], [mid + 30, R - 8]]) {
                const stars = Array.from({ length: 6 }, (_, i) => V(a + (b - a) * (i / 5), top + 9 + rnd() * 10, 6));
                stars.forEach((p, i) => { gem(i % 2 ? 1.5 : 2.2, K.glow(c.color, 1.3), group, p.x, p.y, p.z, 1); if (i) K.tube([stars[i - 1], p], 0.28, M.trim, group, 2); });
            }
            for (const x of columns) {   // columns in pairs, beaded
                for (const f of [-1, 1]) cyl(0.5, 0.5, top - bot, M.trim, group, x + f * 4, (top + bot) / 2, 3);
                for (let y = top - 30; y > bot + 20; y -= 46) ball(1.8, M.bright, group, x, y, 5);
            }
            for (const ry of rows) for (let x = L + 10; x < R; x += 10) cyl(0.25, 0.25, Math.round((x - L) / 10) % 5 ? 3 : 6, M.trim, group, x, ry + LABEL_H - 5, 5);   // a ruler's ticks
        },
    },
    pathos: {
        color: '#ff8ac0', shape: 'lancet', column: 1.5,
        ornament(c) {
            const { K, group, top, bot, mid, w, columns, rows } = c, { M, curl, gem, ball } = K;
            // tendrils rising from the crown, a drop at its heart
            for (const f of [-1, 1]) {
                const pts = Array.from({ length: 40 }, (_, i) => { const q = i / 39; return [mid + f * (6 + q * (w / 2 - 22)), top + 9 + Math.sin(q * Math.PI * 3) * 6 * (1 - q * 0.5) + (1 - q) * 8]; });
                vine(c, pts, 0.9);
                [6, 15, 25, 34].forEach((k, i) => { const [x, y] = pts[k], up = i % 2 ? -1 : 1; curl(7 - i, M.trim, group, x + f * 3, y + up * 5, 6, f, 1.6); });
            }
            const drop = K.lathe([[0, 11], [1.4, 7], [4, 1.5], [4.4, -1.6], [2.6, -4.6], [0, -5.4]], K.glow(c.color, 1.3), group); drop.position.set(mid, top + 18, 7);
            curl(9, M.bright, group, mid - 9, top + 20, 6, -1, 1.5); curl(9, M.bright, group, mid + 9, top + 20, 6, 1, 1.5);
            for (const x of columns) {   // columns wound with a vine
                const h = top - bot, pts = Array.from({ length: 90 }, (_, i) => { const q = i / 89; return V(x + Math.cos(q * TAU * 5) * 4.6, top - q * h, 3 + Math.sin(q * TAU * 5) * 4.6); });
                K.tube(pts, 0.7, M.trim, group, 180);
                for (let i = 1; i < 6; i++) { const leaf = ball(2, M.bright, group, x + (i % 2 ? 5.4 : -5.4), top - (i / 6) * h, 7); leaf.scale.set(1.5, 0.6, 0.4); leaf.rotation.z = i % 2 ? 0.6 : -0.6; }
            }
            for (const ry of rows) {   // drops hanging under each shelf
                const y = ry + LABEL_H - 3;
                for (let i = -5; i <= 5; i++) { if (!i) continue; const x = mid + (i / 5.6) * (w / 2), l = 3 + ((i * i) % 3) * 2; K.cyl(0.2, 0.2, l, M.trim, group, x, y - l / 2, 5); gem(1.3, K.glow(c.color, 1), group, x, y - l - 1.6, 5, 1.7); }
            }
        },
    },
    ethos: {
        color: '#f2c866', shape: 'arch', column: 3.2,
        ornament(c) {
            const { K, group, L, R, top, bot, mid, w, columns, rows } = c, { M, mesh, gem, ball, cyl } = K;
            // a pediment on an entablature
            const half = Math.min(w / 2 - 10, 210), rise = 24, base = top + 7;
            for (const f of [-1, 1]) { const len = Math.hypot(half, rise), b = mesh(new THREE.BoxGeometry(len, 2.4, 9), M.trim, group, mid + (f * half) / 2, base + rise / 2, 2); b.rotation.z = -f * Math.atan2(rise, half); }
            const face = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
            mesh(new THREE.ShapeGeometry(face), M.pane, group, mid, base, 0);
            for (let x = L + 6; x < R; x += 9) mesh(new THREE.BoxGeometry(4.6, 3.4, 6), M.steel, group, x, top + 0.2, 6);   // dentils
            gem(3.4, K.glow(c.color, 1.6), group, mid, base + 9, 7, 1);
            for (const f of [-1, 1]) for (let i = 0; i < 7; i++) { const a = 0.5 + i * 0.26, leaf = ball(2.1, M.bright, group, mid + f * Math.sin(a) * 13 * (0.6 + i * 0.1), base + 1 + i * 2.1, 6); leaf.scale.set(1.5, 0.55, 0.4); leaf.rotation.z = f * (0.9 - i * 0.16); }   // laurel
            for (const f of [-1, 1]) K.finial(3.4, M.bright, group, mid + f * half, base + 2, 4);
            K.finial(4, M.bright, group, mid, base + rise, 4);
            for (const x of columns) {   // fluted columns with capitals and plinths
                for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; cyl(0.5, 0.5, top - bot - 22, M.bright, group, x + Math.cos(a) * 3.4, (top + bot) / 2, 3 + Math.sin(a) * 3.4); }
                for (const [y, s] of [[top - 6, 1], [bot + 6, 1.1]]) { mesh(new THREE.BoxGeometry(13 * s, 3, 12), M.trim, group, x, y, 3); mesh(new THREE.BoxGeometry(10 * s, 3, 10), M.steel, group, x, y + (y > (top + bot) / 2 ? -3 : 3), 3); }
                for (const f of [-1, 1]) K.curl(3.6, M.bright, group, x + f * 5.6, top - 10, 8, f, 1.6);   // volutes
            }
            for (const ry of rows) { const y = ry + LABEL_H; for (const d of [4, 7]) mesh(new THREE.BoxGeometry(w + 4 - d * 2, 1.2, 4), M.trim, group, mid, y - d, 3); }
        },
    },
};

/** Dress one group's housing. @param g the layout's group */
export function dress(K, group, layout, g) {
    const theme = THEMES[g.theme];
    if (!theme) return;
    const L = layout.cols[0], R = layout.cols.at(-1);
    const c = { K, group, color: theme.color, L, R, mid: (L + R) / 2, w: R - L, top: -g.y, bot: -(g.y + g.h), columns: layout.cols, rows: g.rows.map((ry) => -(ry + layout.cellH)) };
    theme.ornament(c);
    glowBar(c, c.mid, c.top + 7, c.w + 40, 1.6, 0.9);   // the cornice's line of light
}
