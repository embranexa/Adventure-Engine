// @ts-nocheck -- three.js models; untyped like the scenes.
// The Agora's vessels: the ambrosia amphora, filled to its level, and the locked flasks.

import * as THREE from 'three';

const PROFILE = {
    ambrosia: [[0, 0], [10, 0.5], [16, 6], [22, 18], [24, 32], [20, 46], [12, 56], [8, 62], [8, 72]],
    elixir: [[0, 0], [16, 0.5], [20, 5], [20, 10], [10, 34], [6, 42], [6, 58]],
    nectar: [[0, 0], [9, 1], [18, 8], [21, 19], [18, 30], [9, 38], [5, 44], [6, 58]],
};
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (pts) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48).map((q) => [Math.max(0, q.x), q.y]);

/** The vessel's radius at a height. */
function radiusAt(profile, y) {
    for (let i = 1; i < profile.length; i++) {
        const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
        if (y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return profile.at(-1)[0];
}

function foot({ M, lathe, ring }, group) {
    lathe([[0, 0], [27, 0], [27, 2], [23, 4.5], [23, 7.5], [0, 7.5]], M.steel, group);
    ring(23.4, 0.7, M.trim, group, 0, 6.6); ring(27, 0.6, M.trim, group, 0, 1);
}

function body(K, g, profile, { tint, liquid, level }) {
    const { M, std, lathe, ring } = K, top = profile.at(-1)[1];
    lathe(profile, std({ color: tint, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }), g);
    const h = top * 0.82 * Math.min(1, level);
    if (h > 0.5) lathe([...profile.filter(([, y]) => y < h).map(([r, y]) => [r * 0.9, y + 0.8]), [radiusAt(profile, h) * 0.9, h + 0.8], [0, h + 0.8]], liquid, g);
    ring(profile.at(-1)[0] + 1, 1.4, M.bright, g, 0, top);
    lathe([[0, 0], [5, 0], [6, 3], [4, 7], [2, 9], [0, 13]], M.bright, g, top);
    return top;
}

/** `m.level` 0..1 of the vessel; `m.marks` graduations, one per hundred. */
export function amphora(K, group, m) {
    const { M, std, tube, ring, curl } = K;
    foot(K, group);
    const g = new THREE.Group(); g.position.y = 8; group.add(g);
    const profile = smooth(PROFILE.ambrosia);
    const liquid = std({ color: m.color, emissive: m.color, emissiveIntensity: 0.75, roughness: 0.15, transparent: true, opacity: 0.92 });
    const top = body(K, g, profile, { tint: '#ffe7b0', liquid, level: m.level });
    for (let i = 1; i <= Math.min(m.marks, 20); i++) { const y = (top * 0.82 * i) / m.marks; ring(radiusAt(profile, y) + 0.5, 0.4, M.trim, g, 0, y); }
    for (const f of [-1, 1]) { tube([V(f * 9, 60), V(f * 26, 64), V(f * 34, 48), V(f * 24, 36)], 1.6, M.bright, g); curl(6, M.trim, g, f * 31, 64, 0, f, 1.2); }
    return { frame(t) { liquid.emissiveIntensity = 0.7 + 0.12 * Math.sin(t / 900); } };
}

/** A locked flask: bound with rings and a padlock. */
export function flask(K, group, m) {
    const { M, std, mesh, ring, ball } = K;
    foot(K, group);
    const g = new THREE.Group(); g.position.y = 8; group.add(g);
    body(K, g, smooth(PROFILE[m.id] ?? PROFILE.elixir), { tint: '#aab4bd', liquid: std({ color: m.color, transparent: true, opacity: 0.28, roughness: 0.3 }), level: 0.62 });
    for (const [y, tilt] of [[14, 0.3], [30, -0.3]]) for (const d of [-2.4, 2.4]) ring(26, 0.7, M.steel, g, 0, y + d, 0).rotation.y = tilt;
    const lock = new THREE.Group(); lock.position.set(0, 22, 28); g.add(lock);
    mesh(new THREE.BoxGeometry(17, 14, 6), M.trim, lock);
    mesh(new THREE.TorusGeometry(6, 1.6, 8, 20, Math.PI), M.steel, lock, 0, 7, 0);
    ball(2.2, M.stone, lock, 0, 1, 3); mesh(new THREE.BoxGeometry(1.6, 5, 1), M.stone, lock, 0, -2, 3);
    return null;
}
