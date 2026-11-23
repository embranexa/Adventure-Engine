// @ts-nocheck -- three.js models; untyped like the scenes.
// What stands in the alcoves. A builder fills `group` (its origin on the shelf, about 100
// units tall) and may return { frame(t) } for its own motion.

import * as THREE from 'three';
import { hash } from './sigil.js';

/** A dead adventure: one of three monuments between two candles, lit once it has an epitaph. */
function urn(K, group, m) {
    const { M, std, glow, light, tex, mesh, lathe, ring, cyl } = K, v = hash(m.id) % 3;
    const u = std({ color: ['#474747', '#3e3e3f', '#4b4a49'][v], roughness: 0.6, metalness: 0.25 });
    lathe([[0, 0], [27, 0], [27, 2], [23, 4.5], [23, 7.5], [0, 7.5]], M.stone, group);
    ring(23.4, 0.7, M.trim, group, 0, 6.6); ring(27, 0.6, M.trim, group, 0, 1);
    const g = new THREE.Group(); g.position.y = 8; group.add(g);
    if (v === 0) lathe([[0, 0], [14, 0], [12, 4], [8, 8], [20, 24], [23, 38], [17, 50], [11, 54], [14, 58], [15, 61], [6, 66], [3, 71], [0, 74]], u, g);
    else if (v === 1) {
        lathe([[0, 0], [18, 0], [18, 5], [13, 8], [13, 11], [0, 11]], u, g);
        const shaft = mesh(new THREE.CylinderGeometry(8, 12, 50, 4), u, g, 0, 36, 0), tip = mesh(new THREE.ConeGeometry(8, 12, 4), u, g, 0, 67, 0);
        shaft.rotation.y = tip.rotation.y = Math.PI / 4;
    } else lathe([[0, 0], [17, 0], [17, 4], [13, 8], [12, 44], [16, 48], [16, 52], [9, 56], [10, 62], [0, 60]], u, g);
    ring(v === 1 ? 12 : 17, 1, M.bright, g, 0, v === 0 ? 45 : v === 1 ? 11 : 48);
    const flames = [];
    for (const f of [-1, 1]) {
        const h = f > 0 ? 21 : 15;
        cyl(3.4, 3.8, h, M.wax, group, f * 30, h / 2, 12);
        if (!m.lit) continue;
        flames.push(mesh(new THREE.ConeGeometry(2, 8, 10), glow('#ffb45a', 2.2), group, f * 30, h + 5, 12));
        mesh(new THREE.PlaneGeometry(40, 40), light(tex.haze, '#ff9a3c', 0.45), group, f * 30, h + 6, 14);
    }
    return flames.length ? { frame: (t) => flames.forEach((x, i) => { x.scale.y = 1 + Math.sin(t / 90 + i * 2) * 0.1; }) } : null;
}

export const MODELS = { urn };
