// @ts-nocheck -- three.js geometry; untyped like the scenes.
// The cabinet's housing: frosted panes with an opening per alcove, slender columns, glass
// shelves edged with light, and a crest. Opening shapes: 'arch' | 'lancet' | 'octagon' |
// 'battered'. A group may have a theme of its own (themes.js).

import * as THREE from 'three';
import { V } from './kit.js';
import { LABEL_H } from './layout.js';
import { archetypeRune } from './runes.js';
import { THEMES, dress } from './themes.js';

/** The alcove's opening, as a path around its centre. */
function opening(shape, nw, y0, y1) {
    const p = new THREE.Path(), a = nw / 2;
    p.moveTo(-a, y0); p.lineTo(a, y0);
    if (shape === 'octagon') {
        const k = a * 0.42;
        p.lineTo(a, y1 - k); p.lineTo(a - k, y1); p.lineTo(-a + k, y1); p.lineTo(-a, y1 - k);
    } else if (shape === 'battered') {   // sloping jambs under a flat, chamfered lintel
        const k = a * 0.2;
        p.lineTo(a * 0.86, y1 - k); p.lineTo(a * 0.86 - k, y1); p.lineTo(-a * 0.86 + k, y1); p.lineTo(-a * 0.86, y1 - k);
    } else if (shape === 'lancet') {
        const k = Math.min(a * 1.25, (y1 - y0) * 0.6);
        p.lineTo(a, y1 - k); p.quadraticCurveTo(a * 0.86, y1 - k * 0.35, 0, y1); p.quadraticCurveTo(-a * 0.86, y1 - k * 0.35, -a, y1 - k);
    } else {
        const r = Math.min(a, (y1 - y0) * 0.55);
        p.lineTo(a, y1 - r); p.absellipse(0, y1 - r, a, r, 0, Math.PI, false);
    }
    p.lineTo(-a, y0);
    return p;
}

/** The inside of an alcove, around its centre: the shelf's height, the top, and its width. */
export function inside(w, h) {
    const y0 = -h / 2 + LABEL_H + 2, y1 = h / 2 - 16;
    return { y0, y1, h: y1 - y0, nw: Math.min(w * 0.8, h * 0.84) };
}

/**
 * One alcove's frame, added to `group`. Returns its keystone gem (lit by the scene).
 * @param {ReturnType<import('./kit.js').makeKit>} K
 * @param rune  { id, color }: its rune in the corners, instead of curls (runes.js)
 */
export function alcoveFrame(K, group, shape, w, h, rune = null) {
    const { M, mesh, wire, gem, curl } = K, { y0, y1 } = inside(w, h), nw = Math.min(w * 0.9, h * 0.96);
    const hole = opening(shape, nw, y0, y1), s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
    s.holes.push(hole);
    mesh(new THREE.ShapeGeometry(s, 24), M.pane, group, 0, 0, -2);
    const pts = hole.getPoints(20);
    wire(pts, 0.95, M.trim, group, 0);
    wire(pts, 0.4, M.steel, group, -98);      // its echo at the back
    if (rune) {
        const size = Math.max(13, Math.min(32, nw * 0.14)), map = K.texture(archetypeRune(rune.id));
        for (const f of [-1, 1]) { const x = f * (nw / 2 - size * 0.34), y = y1 - size * 0.3; mesh(new THREE.PlaneGeometry(size * 1.9, size * 1.9), K.light(K.tex.haze, rune.color, 0.3), group, x, y, 2); mesh(new THREE.PlaneGeometry(size, size), K.light(map, rune.color, 1), group, x, y, 4); }
    } else for (const f of [-1, 1]) curl(shape === 'lancet' ? 6 : 7, M.trim, group, f * (nw / 2 - 2), y1 - 9, 2, f, 1.4);
    return gem(4.2, M.steel, group, 0, y1 + 1, 3);
}

/**
 * The carcass around every group of rows, and the crest over the first. Content
 * coordinates: x from the left, y negative downward.
 * @returns {{ seal: THREE.Mesh }} the turning seal in the crest
 */
export function carcass(K, group, layout, { sealTexture, sealColor }) {
    const { M, mesh, cyl, ring, finial, tube, curl, light, tex } = K;
    const L = layout.cols[0], R = layout.cols.at(-1), w = R - L, mid = (L + R) / 2;
    const bar = (y, ww, h, mat, z = 4, d = 14) => mesh(new THREE.BoxGeometry(ww, h, d), mat, group, mid, y, z - d / 2);
    for (const g of layout.groups) {
        const top = -g.y, bot = -(g.y + g.h), theme = THEMES[g.theme], edge = theme?.color ?? '#e2e4e6';
        layout.cols.forEach((x, i) => {
            const end = i === 0 || i === layout.cols.length - 1, r = theme?.column ?? (end ? 1.9 : 1.1);
            cyl(r, r, g.h, M.steel, group, x, (top + bot) / 2, 3);
            for (const y of [top - 3, ...g.rows.map((ry) => -(ry + layout.cellH) + 3)]) ring(r + 0.9, 0.8, M.trim, group, x, y, 3);
            if (end) finial(3.2, M.bright, group, x, top + 6, 3);
        });
        bar(top + 2, w + 6, 2, M.steel); bar(top + 5, w + 12, 1.2, M.trim); bar(bot - 2, w + 6, 2, M.steel);
        for (const ry of g.rows) {
            const rowBottom = -(ry + layout.cellH), y = rowBottom + LABEL_H;
            if (rowBottom > bot + 1) bar(rowBottom, w, 0.9, M.steel, 2, 6);
            mesh(new THREE.BoxGeometry(w + 8, 2.2, 78), M.shelf, group, mid, y, -36);
            mesh(new THREE.PlaneGeometry(w + 30, 1.6), light(tex.line, edge, 0.85), group, mid, y, 4);
            mesh(new THREE.PlaneGeometry(w + 30, 1), light(tex.line, edge, 0.2), group, mid, y, -74);
            mesh(new THREE.PlaneGeometry(w, 46), light(tex.wash, edge, theme ? 0.16 : 0.07), group, mid, y - 23, 3);
        }
    }
    for (const g of layout.groups) dress(K, group, layout, g);
    // the crest
    const cy = -layout.crestY;
    mesh(new THREE.CircleGeometry(30, 48), M.pane, group, mid, cy, 2);
    const seal = mesh(new THREE.PlaneGeometry(58, 58), light(sealTexture, sealColor, 0.95), group, mid, cy, 8);
    ring(31, 1.1, M.trim, group, mid, cy, 5, false); ring(34, 0.4, M.steel, group, mid, cy, 3, false);
    const reach = Math.min(w / 2 - 20, 280);
    for (const f of [-1, 1]) {
        const a = [], base = cy - 35;
        for (let i = 0; i <= 40; i++) { const q = i / 40; a.push(V(mid + f * (32 + q * (reach - 32)), base + (1 - q) ** 2 * 30, 4)); }
        tube(a, 0.95, M.trim, group);
        for (const [q, s] of [[0.12, 10], [0.42, 8], [0.72, 6]]) { const p = a[Math.round(q * 40)]; curl(s, M.bright, group, p.x + f * s * 0.5, p.y + s * 0.55, 5, f, 1.5); }
    }
    return { seal };
}
