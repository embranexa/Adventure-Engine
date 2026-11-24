// @ts-nocheck -- three.js models; untyped like the scenes.
// The twelve idols (the Cohort): a robed silver figure on a pedestal, each with its own
// attributes. Built from code; origin on the shelf, about 100 units tall, facing +z. The
// magic parts glow in the idol's colour once someone has its archetype.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const HAND = { down: [13, 46, 8], out: [20, 58, 9], up: [19, 78, 6], chest: [5, 60, 11] };

/** Flat shape, extruded and centred in depth. */
function plate(K, pts, depth, mat, parent, x = 0, y = 0, z = 0) {
    const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    return K.mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 1 }), mat, parent, x, y, z - depth / 2);
}

/** The figure: pedestal, robe, folds, head and arms. Returns where its hands are. */
function figure(K, g, { left = 'down', right = 'down', veil = false, broad = 0 }, body, trim) {
    const { mesh, lathe, ring, ball, tube } = K, w = 1 + broad;
    lathe([[0, 0], [25, 0], [25, 2.4], [21, 4], [19, 10], [22, 12], [22, 14], [0, 14]], K.M.steel, g);
    ring(25, 0.6, trim, g, 0, 1.2); ring(22, 0.6, trim, g, 0, 13);
    const robe = lathe([[0, 14], [14, 14], [13, 18], [10.5, 34], [8.4, 48], [9.4, 56], [10.4, 64], [8.6, 69], [3.2, 72], [2.6, 75]].map(([r, y]) => [r * (y > 40 ? w : 1), y]), body, g);
    robe.scale.z = 0.72;
    for (let i = 0; i < 9; i++) {   // folds down the front
        const a = -0.25 + (i / 8) * (Math.PI + 0.5), x = Math.cos(a), z = Math.sin(a) * 0.72;
        tube([V(x * 13.6, 14.5, z * 13.6), V(x * 11, 30, z * 11), V(x * 8.6, 47, z * 8.6)], 0.55, body, g, 20);
    }
    ring(8.7 * w, 0.8, trim, g, 0, 48).scale.y = 0.72;
    tube([V(-9, 67, 3), V(-3, 60, 7.6), V(6, 51, 7)], 0.9, trim, g, 24);   // a sash
    const head = ball(5.2, body, g, 0, 80.5, 0.5); head.scale.set(0.86, 1.08, 0.94);
    if (veil) { const v = mesh(new THREE.SphereGeometry(6.6, 24, 18, 0, TAU, 0, 1.9), body, g, 0, 80.5, -1.1); v.scale.set(0.92, 1.12, 0.95); v.rotation.x = -0.35; lathe([[6, 77], [8.4, 70], [9.6, 56]], body, g).scale.z = 0.8; } else { const hair = mesh(new THREE.SphereGeometry(5.6, 24, 14, 0, TAU, 0, 1.7), trim, g, 0, 81.2, -0.7); hair.rotation.x = -0.4; }
    const hands = {};
    for (const [side, pose] of [[-1, left], [1, right]]) {
        const [hx, hy, hz] = HAND[pose], h = V(side * hx, hy, hz), sx = side * 9 * w;
        tube([V(sx, 67), V((sx + h.x) / 2 + side * 3, (66 + h.y) / 2 - 3, h.z * 0.4), h], 2.1, body, g, 24);
        ball(2.4, body, g, h.x, h.y, h.z);
        hands[side < 0 ? 'left' : 'right'] = h;
    }
    return hands;
}

const rod = (K, g, x, z, y0, y1, r, mat) => K.cyl(r, r, y1 - y0, mat, g, x, (y0 + y1) / 2, z);

/** Each: poses, and what it carries. `c`: { K, g, h (hands), body, trim, lit } ; may return a frame(t). */
const MAKE = {
    vanguard: [{ left: 'out', right: 'up', broad: 0.1 }, ({ K, g, h, trim, lit }) => {
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const s = K.mesh(new THREE.ConeGeometry(0.9, 4.4, 5), trim, g, Math.cos(a) * 4.8, 87, Math.sin(a) * 4.8); s.rotation.z = -Math.cos(a) * 0.3; }
        K.ring(4.8, 0.7, trim, g, 0, 85);
        const bolt = plate(K, [[-1, 15], [5, 15], [2, 4], [6, 4], [-3, -16], [-0.5, -2], [-5, -2]], 1.4, lit(), g, h.right.x, h.right.y + 4, h.right.z);
        for (const s of [-1, 1]) plate(K, [[0, 0], [s * 11, 6], [s * 9, 2], [s * 11, 0], [s * 8, -2], [s * 8, -5], [0, -4]], 0.8, trim, g, h.left.x, h.left.y + 7, h.left.z);   // an eagle
        K.ball(2.2, trim, g, h.left.x, h.left.y + 9.5, h.left.z + 1); const beak = K.mesh(new THREE.ConeGeometry(0.7, 2.4, 6), lit(), g, h.left.x, h.left.y + 9.6, h.left.z + 3.8); beak.rotation.x = Math.PI / 2;
        return (t) => { bolt.material.emissiveIntensity = 1.1 + 0.5 * Math.sin(t / 130) * Math.sin(t / 410); };
    }],
    performer: [{ left: 'out', right: 'chest' }, ({ K, g, h, trim, lit }) => {
        const sun = new THREE.Group(); sun.position.set(0, 81, -6); g.add(sun);
        K.ring(10, 0.5, trim, sun, 0, 0, 0, false);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, l = i % 2 ? 4 : 6.5, r = K.mesh(new THREE.ConeGeometry(0.8, l, 4), lit(), sun, Math.cos(a) * (11 + l / 2), Math.sin(a) * (11 + l / 2)); r.rotation.z = a - Math.PI / 2; }
        const [x, y, z] = [h.left.x, h.left.y + 4, h.left.z + 1];
        for (const s of [-1, 1]) K.tube([V(x + s * 1.5, y - 9, z), V(x + s * 7, y - 4, z), V(x + s * 5, y + 4, z), V(x + s * 7.5, y + 11, z)], 0.9, trim, g, 30);
        rod(K, g, x, z, y + 6.6, y + 7.8, 0.1, trim); const bar = K.cyl(0.7, 0.7, 14, trim, g, x, y + 8, z); bar.rotation.z = Math.PI / 2;
        for (let i = -2; i <= 2; i++) rod(K, g, x + i * 1.7, z, y - 8, y + 8, 0.2, lit());
        return (t) => { sun.rotation.z = t / 9000; };
    }],
    enchanter: [{ left: 'down', right: 'chest' }, ({ K, g, h, body, trim, lit }) => {
        for (let i = 0; i < 11; i++) { const a = 0.2 + (i / 10) * (Math.PI - 0.4), x = Math.cos(a), y = Math.sin(a); K.tube([V(x * 3, 46, -9), V(x * 17, 46 + y * 24, -11), V(x * 25, 47 + y * 43, -8)], 1.7 - Math.abs(i - 5) * 0.08, body, g, 22); K.ball(1.5, trim, g, x * 25.2, 47.4 + y * 43.4, -7.6); }
        const heart = plate(K, [[0, -5], [5, 0.5], [5, 3.6], [2.6, 5], [0, 3], [-2.6, 5], [-5, 3.6], [-5, 0.5]], 2, lit(), g, h.right.x, h.right.y + 5, h.right.z + 2);
        for (let i = 0; i < 3; i++) K.ball(1.3, lit(), g, h.left.x - 1 + i * 1.6, h.left.y - 4 + (i % 2) * 1.4, h.left.z + 1);
        return (t) => heart.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(t / 260)));
    }],
    juggernaut: [{ left: 'out', right: 'out', broad: 0.28 }, ({ K, g, h, body, trim, lit }) => {
        K.mesh(new THREE.SphereGeometry(6.2, 24, 14, 0, TAU, 0, 1.75), trim, g, 0, 81, 0);
        plate(K, [[-7, -1], [-8, 8], [-3, 12], [4, 11], [7, 5], [5, 4], [0, 7], [-4, 5], [-5, -1]], 1.4, lit(), g, 0, 85, 0).rotation.y = Math.PI / 2;
        rod(K, g, h.right.x, h.right.z, 16, 92, 0.8, trim); const tip = K.gem(3, lit(), g, h.right.x, 95, h.right.z, 2.2); tip.scale.z = 0.4;
        const shield = K.mesh(new THREE.SphereGeometry(15, 32, 12, 0, TAU, 0, 0.95), body, g, h.left.x + 1, h.left.y - 4, h.left.z - 6); shield.rotation.x = Math.PI / 2; shield.scale.y = 0.75;
        const sh = new THREE.Group(); sh.position.set(h.left.x + 1, h.left.y - 4, h.left.z + 1.8); g.add(sh);
        K.ring(12, 0.9, trim, sh, 0, 0, 0, false); K.ring(7, 0.5, lit(), sh, 0, 0, 2, false); K.gem(2, lit(), sh, 0, 0, 4, 1);
        for (const s of [-1, 1]) K.ball(4.6, trim, g, s * 11.6, 67.5, 0);
    }],
    rogue: [{ left: 'out', right: 'chest' }, ({ K, g, h, trim, lit }) => {
        const moon = K.mesh(new THREE.TorusGeometry(4.4, 0.8, 8, 30, Math.PI), lit(), g, 0, 92, 0); moon.rotation.z = Math.PI;
        const x = h.left.x - 1, y = h.left.y, z = h.left.z;
        K.tube([V(x + 5, y + 25, z), V(x - 3, y + 15, z), V(x - 5, y, z), V(x - 3, y - 15, z), V(x + 5, y - 25, z)], 0.9, trim, g, 40);
        K.tube([V(x + 5, y + 25, z), V(x + 8, y, z), V(x + 5, y - 25, z)], 0.2, lit(), g, 10);
        const arrow = K.cyl(0.4, 0.4, 30, trim, g, x + 4, y, z); arrow.rotation.z = Math.PI / 2; const tip = K.mesh(new THREE.ConeGeometry(1.4, 4, 6), lit(), g, x - 12, y, z); tip.rotation.z = Math.PI / 2;
        const q = K.cyl(2.6, 2, 18, trim, g, 6, 66, -8); q.rotation.z = -0.45; for (let i = 0; i < 4; i++) K.tube([V(8 + i, 73, -8), V(11 + i * 1.2, 82, -8)], 0.3, K.M.bright, g, 4);
    }],
    summoner: [{ left: 'out', right: 'chest' }, ({ K, g, h, trim, lit }) => {
        for (const s of [-1, 1]) K.tube([V(s * 2.6, 85), V(s * 6, 90, -1), V(s * 8.6, 95, -2), V(s * 6.6, 99, 0)], 1.1, trim, g, 24);
        for (let i = 0; i < 6; i++) { const l = 13 - i * 1.5; K.cyl(1, 1, l, trim, g, h.right.x - 6 + i * 2.1, h.right.y + 6 - l / 2 + 4, h.right.z + 3); }
        K.cyl(0.6, 0.6, 14, lit(), g, h.right.x - 1, h.right.y + 5, h.right.z + 4.4).rotation.z = Math.PI / 2;
        const swarm = new THREE.Group(); swarm.position.set(0, 66, 0); g.add(swarm);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, d = new THREE.Group(); d.position.set(Math.cos(a) * 25, Math.sin(i * 2.2) * 9, Math.sin(a) * 18); swarm.add(d); K.gem(2, lit(), d, 0, 0, 0, 0.7); K.ring(3.4, 0.3, trim, d); }
        return (t) => { swarm.rotation.y = t / 2600; swarm.children.forEach((d, i) => { d.position.y = Math.sin(t / 700 + i * 2.2) * 8; }); };
    }],
    resonator: [{ left: 'out', right: 'out' }, ({ K, g, body, trim, lit }) => {
        const fan = new THREE.Group(); fan.position.set(0, 48, -9); g.add(fan);
        for (let i = 0; i < 13; i++) {
            const a = 0.12 + (i / 12) * (Math.PI - 0.24), x = Math.cos(a), y = Math.sin(a), l = i % 2 ? 37 : 43;
            K.tube([V(x * 4, y * 4), V(x * l * 0.6, y * l * 0.6, -1), V(x * l, y * l, 1)], 0.5, body, fan, 14);
            const eye = K.mesh(new THREE.CircleGeometry(2.9, 20), trim, fan, x * l, y * l, 1.4); eye.scale.y = 1.3; eye.rotation.z = a - Math.PI / 2;
            K.mesh(new THREE.CircleGeometry(1.5, 16), lit(), fan, x * l, y * l, 1.7);
        }
        K.ring(5, 0.8, trim, g, 0, 85); K.gem(1.8, lit(), g, 0, 87.5, 4.6);
        return (t) => { fan.rotation.x = Math.sin(t / 1900) * 0.05; };
    }],
    merchant: [{ left: 'out', right: 'out' }, ({ K, g, h, trim, lit }) => {
        K.mesh(new THREE.SphereGeometry(6, 24, 10, 0, TAU, 0, 1.4), trim, g, 0, 82, 0); K.ring(7, 0.9, trim, g, 0, 82.4);
        const wing = (s, x, y, z, k) => { for (let i = 0; i < 3; i++) plate(K, [[0, 0], [s * (9 - i * 2) * k, (6 - i * 2.4) * k], [s * (7 - i * 2) * k, (2 - i * 2.4) * k]], 0.5, trim, g, x, y - i * 1.2 * k, z); };
        for (const s of [-1, 1]) wing(s, s * 5.6, 83, 0, 1);
        const x = h.right.x, z = h.right.z; rod(K, g, x, z, 34, 84, 0.7, trim); K.ball(2, lit(), g, x, 86, z);
        for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(V(x + s * Math.sin(u * 3 * Math.PI) * (2 + u * 4.4), 40 + u * 38, z + Math.cos(u * 3 * Math.PI) * 2)); } K.tube(pts, 0.7, lit(), g, 60); wing(s, x + s, 82, z, 0.8); }
        const purse = K.lathe([[0, 0], [4, 1], [4.8, 4], [3, 7.5], [1.4, 8.6], [2.2, 10]], K.M.steel, g); purse.position.set(h.left.x, h.left.y - 10, h.left.z);
    }],
    artificer: [{ left: 'down', right: 'up', broad: 0.16 }, ({ K, g, h, trim, lit }) => {
        const x = h.right.x, y = h.right.y, z = h.right.z; const ham = new THREE.Group(); ham.position.set(x, y, z); ham.rotation.z = -0.3; g.add(ham);
        K.cyl(0.9, 0.9, 24, trim, ham, 0, 3); K.mesh(new THREE.BoxGeometry(13, 6.4, 6.4), K.M.bright, ham, 0, 14.4); K.mesh(new THREE.BoxGeometry(0.8, 6.8, 6.8), lit(), ham, 6.6, 14.4);
        const an = new THREE.Group(); an.position.set(-17, 14, 9); g.add(an);
        K.mesh(new THREE.BoxGeometry(9, 4, 8), K.M.steel, an, 0, 2); K.mesh(new THREE.BoxGeometry(5, 7, 5), K.M.steel, an, 0, 7); K.mesh(new THREE.BoxGeometry(13, 4.6, 7.4), trim, an, 0, 12.4);
        const horn = K.mesh(new THREE.ConeGeometry(2.4, 7, 10), trim, an, -9.4, 12.6); horn.rotation.z = Math.PI / 2;
        K.mesh(new THREE.BoxGeometry(8, 1, 2), lit(), an, 1, 15.2);
        const gear = new THREE.Group(); gear.position.set(0, 80, -8); g.add(gear);
        K.ring(13, 1.1, trim, gear, 0, 0, 0, false); K.ring(9, 0.4, lit(), gear, 0, 0, 0, false);
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, tooth = K.mesh(new THREE.BoxGeometry(3, 3, 1.8), trim, gear, Math.cos(a) * 14.6, Math.sin(a) * 14.6); tooth.rotation.z = a; }
        return (t) => { gear.rotation.z = t / 5000; ham.rotation.z = -0.3 - Math.max(0, Math.sin(t / 900)) * 0.16; };
    }],
    wizard: [{ left: 'out', right: 'out' }, ({ K, g, h, body, trim, lit }) => {
        K.lathe([[0, 100], [1, 98], [4, 89], [6, 85], [10, 84], [10.4, 83.4], [0, 83.4]], trim, g);
        rod(K, g, h.right.x, h.right.z, 15, 86, 0.8, trim); const orb = K.ball(3.4, lit(), g, h.right.x, 90, h.right.z);
        for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; K.tube([V(h.right.x, 85, h.right.z), V(h.right.x + Math.cos(a) * 4.6, 88, h.right.z + Math.sin(a) * 4.6), V(h.right.x + Math.cos(a) * 2, 94, h.right.z + Math.sin(a) * 2)], 0.4, trim, g, 14); }
        const [x, y, z] = [h.left.x, h.left.y + 2, h.left.z];   // the owl
        const o = K.ball(4.6, body, g, x, y + 5, z); o.scale.set(0.9, 1.25, 0.85); K.ball(3.8, body, g, x, y + 11.6, z + 0.4);
        for (const s of [-1, 1]) { K.ring(1.5, 0.35, trim, g, x + s * 1.6, y + 12, z + 3.7, false); K.ball(0.8, lit(), g, x + s * 1.6, y + 12, z + 3.8); K.mesh(new THREE.ConeGeometry(0.9, 3, 5), body, g, x + s * 2.2, y + 15.6, z); }
        const beak = K.mesh(new THREE.ConeGeometry(0.6, 1.6, 5), trim, g, x, y + 10.6, z + 4.2); beak.rotation.x = Math.PI;
        return (t) => { orb.material.emissiveIntensity = 1 + 0.4 * Math.sin(t / 800); };
    }],
    cleric: [{ left: 'chest', right: 'chest', veil: true }, ({ K, g, h, trim, lit, glowOf }) => {
        const bowl = K.lathe([[0, 0], [2.4, 0.4], [6.4, 4], [7.4, 7], [6.8, 7.2], [5.4, 4.8], [0, 3.6]], trim, g); bowl.position.set(0, h.left.y - 1, 15);
        const flames = [[0, 0, 9], [-2.4, 0.5, 6], [2.4, -0.4, 6.6]].map(([x, z, l]) => K.mesh(new THREE.ConeGeometry(1.9, l, 10), lit(), g, x, h.left.y + 5 + l / 2, 15 + z));
        K.mesh(new THREE.PlaneGeometry(38, 38), K.light(K.tex.haze, glowOf, 0.5), g, 0, h.left.y + 10, 16);
        K.ring(12, 0.5, lit(), g, 0, 84, -5, false); K.ring(13.6, 0.3, trim, g, 0, 84, -5, false);
        return (t) => flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t / 110 + i * 2) * 0.14; });
    }],
    patron: [{ left: 'out', right: 'out', broad: 0.06 }, ({ K, g, h, body, trim, lit }) => {
        for (const s of [-1, 1]) { rod(K, g, s * 15, -10, 14, 84, 1.5, body); K.gem(2.6, lit(), g, s * 15, 88, -10); }
        plate(K, [[-15, 0], [15, 0], [15, 30], [8, 34], [0, 42], [-8, 34], [-15, 30]], 1.6, K.M.steel, g, 0, 46, -11);
        const x = h.right.x, z = h.right.z; rod(K, g, x, z, 15, 80, 0.8, trim); K.tube([V(x - 4.6, 96, z), V(x - 4.4, 84, z), V(x, 79, z), V(x + 4.4, 84, z), V(x + 4.6, 96, z)], 0.9, trim, g, 30); for (const s of [-1, 1]) K.mesh(new THREE.ConeGeometry(1.3, 4, 6), lit(), g, x + s * 4.6, 97.6, z);
        const kx = h.left.x, ky = h.left.y, kz = h.left.z + 1; K.ring(3.4, 0.8, lit(), g, kx, ky - 5, kz, false); rod(K, g, kx, kz, ky - 24, ky - 8, 0.8, lit()); for (const d of [0, 3.6]) K.mesh(new THREE.BoxGeometry(4, 1.4, 1.2), lit(), g, kx + 2, ky - 22 + d, kz);
        for (let i = 0; i < 5; i++) K.mesh(new THREE.ConeGeometry(0.9, 5, 5), trim, g, -4.4 + i * 2.2, 88.6 - Math.abs(i - 2) * 0.9, 2); K.ring(4.9, 0.8, trim, g, 0, 85.4);
    }],
};

/** @param m  { idol, color, on } */
export function idol(K, group, m) {
    const [pose, adorn] = MAKE[m.idol], body = m.on ? K.M.bright : K.M.trim, trim = m.on ? K.M.trim : K.M.steel;
    const g = new THREE.Group(); group.add(g);
    const lit = () => (m.on ? K.glow(m.color, 1.15) : K.glow(m.color, 0.28));
    const h = figure(K, g, pose, body, trim);
    const extra = adorn({ K, g, h, body, trim, lit, glowOf: m.color });
    return { frame(t, hover) {
        g.rotation.y = Math.sin(t / 2400) * 0.42 * (1 - 0.6 * hover);
        extra?.(t);
    } };
}
