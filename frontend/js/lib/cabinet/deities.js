// @ts-nocheck -- three.js models; untyped like the scenes.
// A deity in the Pantheon: what it is (its form, in its own colour) over an altar, with a ring
// in its favor's colour and a gem at the foot for each point of supply (up to seven). A
// deity without a form is a magic circle. The hungrier it is, the dimmer it burns.

import * as THREE from 'three';
import { sigilCanvas } from './sigil.js';

const GEMS = 7, TAU = Math.PI * 2;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** A card or die face drawn in white. */
function face(K, w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    draw(g, w, h);
    return K.texture(c);
}

/** Each builds on the altar's top (y 0, about 80 tall) and may return a frame(t). `lit(k)`: a fresh glow in its colour. */
const FORMS = {
    // computer music: a step sequencer's ring round an oscilloscope, over a keyboard
    music({ K, g, m, lit, silver }) {
        const { M, mesh, ring, tube, light, tex } = K;
        const deck = new THREE.Group(); deck.position.set(0, 4, 11); deck.rotation.x = 0.42; g.add(deck);
        mesh(new THREE.BoxGeometry(50, 3, 15), M.steel, deck);
        for (let i = 0; i < 12; i++) mesh(new THREE.BoxGeometry(3.5, 1.6, 11), M.bright, deck, -22 + i * 4, 2, 1.4);
        for (let i = 0; i < 11; i++) if (![2, 6, 9].includes(i)) mesh(new THREE.BoxGeometry(2.1, 1.8, 6.4), lit(0.5), deck, -20 + i * 4, 3.4, -1);
        const hold = new THREE.Group(); hold.position.y = 48; g.add(hold);
        mesh(new THREE.CylinderGeometry(22, 22, 3, 48), M.steel, hold, 0, 0, -3).rotation.x = Math.PI / 2;
        mesh(new THREE.CircleGeometry(19.5, 48), K.std({ color: '#03100f', roughness: 0.25, metalness: 0.4 }), hold, 0, 0, -1.2);
        ring(22, 1.1, silver, hold, 0, 0, 0, false); ring(31, 0.7, M.trim, hold, 0, 0, -1, false);
        for (const x of [-12, -6, 0, 6, 12]) mesh(new THREE.PlaneGeometry(0.25, 36 * Math.cos(x / 14)), light(tex.line, m.own, 0.2), hold, x, 0, -0.9);
        const N = 72, pos = new Float32Array(N * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const waves = [0, 0.5, -0.5].map((dy) => { const w = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: m.own, transparent: true, opacity: dy ? 0.45 : 1, toneMapped: false })); w.position.set(0, dy, 0); hold.add(w); return w; });
        waves[0].frustumCulled = waves[1].frustumCulled = waves[2].frustumCulled = false;
        const steps = Array.from({ length: 16 }, (_, i) => { const a = Math.PI / 2 - (i / 16) * TAU, mat = lit(0.3), b = mesh(new THREE.BoxGeometry(4.4, 4.4, 2.4), mat, hold, Math.cos(a) * 27, Math.sin(a) * 27, 0); b.rotation.z = a; return { mat, beat: [0, 3, 4, 6, 8, 11, 12, 14].includes(i) }; });
        for (const s of [-1, 1]) tube([V(s * 16, 8, 8), V(s * 30, 14, 6), V(s * 31, 30, 0), V(s * 20, 40, -4)], 0.8, s > 0 ? lit(0.6) : M.trim, g);
        return (t) => {
            for (let i = 0; i < N; i++) { const x = -17 + (34 * i) / (N - 1), env = Math.cos((x / 17) * Math.PI / 2); pos.set([x, env * (Math.sin(x * 0.55 + t / 260) * 6 + Math.sin(x * 1.5 - t / 190) * 3.4), 0], i * 3); }
            geo.attributes.position.needsUpdate = true;
            const at = Math.floor(t / 180) % 16;
            steps.forEach((s, i) => { s.mat.emissiveIntensity = (i === at ? 2.6 : s.beat ? 1 : 0.16) * (m.on ? 1 : 0.5); });
        };
    },
    // dance: a dancer on one foot, a ribbon winding round
    dance({ K, g, m, lit, silver }) {
        const { mesh, ball, tube, ring, M } = K;
        ring(17, 0.7, M.trim, g, 0, 1);
        const d = new THREE.Group(); g.add(d);
        const limb = (pts, r) => tube(pts.map((p) => V(...p)), r, silver, d, 24);
        limb([[0, 1, 0], [0.6, 8, 0.4], [-0.4, 18, 0.6], [0, 32, 0]], 2.3); ball(1.9, silver, d, 0, 1.6, 0.6);
        limb([[0, 32, 0], [8, 31, -2], [17, 38, 0], [27, 49, 2]], 2); ball(1.9, silver, d, 27, 49, 2);
        limb([[0, 31, 0], [-1, 40, 1.4], [-1.4, 49, 1.6], [-1, 55, 0.6]], 3.8);
        limb([[-1, 54, 0.6], [-8, 57, 2], [-15, 64, 3], [-18, 74, 2]], 1.6); limb([[-1, 54, 0.6], [6, 59, 1], [9, 67, 2], [3, 76, 2]], 1.6);
        const skirt = K.lathe([[3.6, 37], [8, 34], [15, 30], [19, 29.4]], K.std({ color: m.own, emissive: m.own, emissiveIntensity: m.on ? 0.5 : 0.15, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), d); skirt.rotation.z = -0.14;
        const head = ball(4.2, silver, d, -0.4, 61.5, 0.8); head.scale.y = 1.15; ball(2, silver, d, -2.6, 64.6, -1.6);
        const rib = new THREE.Group(); g.add(rib);
        const pts = []; for (let i = 0; i <= 90; i++) { const q = i / 90, a = q * TAU * 1.6; pts.push(V(Math.cos(a) * (31 - 7 * q), 4 + q * 74, Math.sin(a) * (30 - 7 * q))); }
        const curve = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(curve, 220, 0.85, 6);
        const silk = lit(1.1); silk.transparent = true; silk.opacity = 0.9; mesh(geo, silk, rib);
        const motes = Array.from({ length: 5 }, () => ball(1.1, lit(2), g, 0, 0, 0));
        return (t) => {
            d.rotation.y = t / 1900; rib.rotation.y = -t / 2600; d.position.y = Math.abs(Math.sin(t / 950)) * 1.6;
            motes.forEach((b, i) => { const q = (t / 5200 + i / 5) % 1, p = curve.getPoint(q); b.position.copy(p).applyAxisAngle(V(0, 1, 0), rib.rotation.y); });
        };
    },
    // family: four figures round a hearth, under one roof
    family({ K, g, m, lit, silver }) {
        const { M, mesh, ball, lathe, tube, light, tex, gem } = K;
        for (const s of [-1, 1]) {
            mesh(new THREE.BoxGeometry(2.4, 48, 2.4), M.trim, g, s * 27, 24, -10); mesh(new THREE.BoxGeometry(1.6, 46, 1.6), silver, g, s * 27, 23, 9);
            for (const z of [-10, 9]) { const r = mesh(new THREE.BoxGeometry(42, 2.2, 2.2), z < 0 ? M.steel : silver, g, s * 15, 59, z); r.rotation.z = -s * 0.68; }
            for (let i = 0; i < 4; i++) { const r = mesh(new THREE.BoxGeometry(0.9, 0.9, 20), M.trim, g, s * (30 - i * 8.4), 47 + i * 6.8, 0); r.rotation.z = -s * 0.68; }
        }
        mesh(new THREE.BoxGeometry(1.8, 1.8, 24), silver, g, 0, 72, 0); gem(3, lit(1.4), g, 0, 78, 0, 1.4);
        const person = (x, z, s, veil) => {
            const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(s); p.rotation.y = -x * 0.03; g.add(p);
            lathe([[0, 0], [7.4, 0], [6.8, 4], [5, 18], [4.4, 26], [5.2, 30], [4, 33.6], [1.6, 35]], silver, p);
            const h = ball(4, silver, p, 0, 38.6, 0.4); h.scale.y = 1.12;
            if (veil) { const v = mesh(new THREE.SphereGeometry(4.8, 20, 14, 0, TAU, 0, 1.8), M.trim, p, 0, 38.6, -0.8); v.rotation.x = -0.3; }
            for (const f of [-1, 1]) tube([V(f * 4.8, 29), V(f * 7, 22, 2), V(f * 4, 17, 6)], 1.2, silver, p, 14);
        };
        person(-15.5, -2, 1.02, false); person(15.5, -2, 0.97, true); person(-9, 10, 0.58, false); person(9, 10, 0.5, true);
        lathe([[0, 0], [7, 0], [7.6, 2.6], [6, 4], [0, 4]], M.stone, g).position.set(0, 0, 2);
        const flames = [[0, 9, 13], [-2.4, 7, 8], [2.6, 7, 9]].map(([x, y, h]) => mesh(new THREE.ConeGeometry(h * 0.2, h, 10), lit(2.2), g, x, 3.4 + h / 2, 2));
        for (const s of [-1, 1]) { const eave = mesh(new THREE.BoxGeometry(41, 0.5, 0.5), lit(0.9), g, s * 15, 58, 10.4); eave.rotation.z = -s * 0.68; }
        const haze = mesh(new THREE.PlaneGeometry(64, 64), light(tex.haze, m.own, 0.5), g, 0, 20, -4);
        return (t) => { flames.forEach((f, i) => { f.scale.y = 1 + 0.16 * Math.sin(t / 120 + i * 2); }); haze.material.opacity = (m.on ? 0.5 : 0.18) * (0.9 + 0.1 * Math.sin(t / 340)); };
    },
    // career: a stair winding up a column to a star
    career({ K, g, m, lit, silver }) {
        const { M, mesh, ring, cyl, gem, tube, light, tex } = K, N = 15;
        cyl(4.6, 6.4, 60, M.steel, g, 0, 30, 0); for (const y of [2, 30, 59]) ring(y === 2 ? 7 : 6, 0.8, silver, g, 0, y);
        const steps = [], rail = [];
        for (let i = 0; i < N; i++) {
            const q = i / (N - 1), a = 2.6 - q * TAU * 1.35, r = 17 - q * 4, y = 2.4 + q * 55, p = new THREE.Group(); p.rotation.y = a; p.position.y = y; g.add(p);
            mesh(new THREE.BoxGeometry(r + 4, 1.7, 7.4 - q * 1.6), silver, p, (r + 4) / 2 + 3, 0, 0);
            const edge = lit(0.6); mesh(new THREE.BoxGeometry(r + 3, 0.5, 0.6), edge, p, (r + 4) / 2 + 3, 1, 3.6 - q * 0.8); steps.push(edge);
            rail.push(V(Math.cos(a) * (r + 6.4), y + 8, -Math.sin(a) * (r + 6.4)));
            if (i % 2 === 0) cyl(0.35, 0.35, 8, M.trim, g, rail[i].x, y + 4, rail[i].z);
        }
        tube(rail, 0.6, M.bright, g, 120);
        ring(9, 0.9, silver, g, 0, 61);
        for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36, leaf = mesh(new THREE.SphereGeometry(2.4, 10, 8), M.trim, g, s * Math.cos(a) * 13, 72 + Math.sin(a) * 13, 0); leaf.scale.set(0.45, 1.1, 0.25); leaf.rotation.z = -s * (0.5 + a * 0.4); }
        const star = new THREE.Group(); star.position.y = 73; g.add(star);
        const glow = lit(1.8); for (let i = 0; i < 4; i++) { const r = gem(i % 2 ? 2.6 : 3, glow, star, 0, 0, 0, i % 2 ? 2 : 3.4); r.rotation.z = (i * Math.PI) / 4; }
        mesh(new THREE.PlaneGeometry(40, 40), light(tex.haze, m.own, m.on ? 0.5 : 0.15), star, 0, 0, -3);
        return (t) => {
            star.rotation.y = Math.sin(t / 1500) * 0.6;
            const at = (t / 240) % (N + 7);
            steps.forEach((s, i) => { s.emissiveIntensity = (0.35 + 2 * Math.max(0, 1 - Math.abs(at - i) / 2)) * (m.on ? 1 : 0.4); });
        };
    },
    // dark games: a fan of cards over two dice, hung in chains
    games({ K, g, m, lit, silver }) {
        const { M, mesh, ring, light, tex, gem } = K;
        const black = K.std({ color: '#15111a', metalness: 0.7, roughness: 0.32 });
        const fan = new THREE.Group(); fan.position.set(0, 30, -3); g.add(fan);
        const suits = ['\u2660', '\u2666', '\u2663', '\u2665', '\u2605'];
        const cards = suits.map((suit, i) => {
            const p = new THREE.Group(), a = (2 - i) * 0.33; p.rotation.z = a; p.position.z = i * 1.1; fan.add(p);
            mesh(new THREE.BoxGeometry(19, 29, 0.8), black, p, 0, 25);
            const map = face(K, 190, 290, (c, w, h) => { c.lineWidth = 5; c.strokeRect(10, 10, w - 20, h - 20); c.font = '110px "Noto Sans Symbols2", "Noto Sans Symbols", "DejaVu Sans", serif'; c.fillText(`${suit}\ufe0e`, w / 2, h / 2); c.font = '40px "Noto Sans Symbols2", "DejaVu Sans", serif'; c.fillText(`${suit}\ufe0e`, 38, 46); c.save(); c.translate(w - 38, h - 46); c.rotate(Math.PI); c.fillText(`${suit}\ufe0e`, 0, 0); c.restore(); });
            mesh(new THREE.PlaneGeometry(19, 29), light(map, i % 2 ? '#ff3b4e' : m.own, m.on ? 1 : 0.5), p, 0, 25, 0.6);
            return p;
        });
        const pip = (n) => face(K, 128, 128, (c) => { const at = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n]; for (const [x, y] of at) { c.beginPath(); c.arc(64 + x * 34, 64 + y * 34, 13, 0, TAU); c.fill(); } });
        const die = (x, y, z, s) => {
            const d = new THREE.Group(); d.position.set(x, y, z); g.add(d); mesh(new THREE.BoxGeometry(s, s, s), black, d);
            [[0, 0, 1], [0, Math.PI, 6], [0, Math.PI / 2, 3], [0, -Math.PI / 2, 4], [-Math.PI / 2, 0, 2], [Math.PI / 2, 0, 5]].forEach(([rx, ry, n]) => { const f = new THREE.Group(); f.rotation.set(rx, ry, 0); d.add(f); mesh(new THREE.PlaneGeometry(s, s), light(pip(n), m.own, m.on ? 1 : 0.5), f, 0, 0, s / 2 + 0.1); });
            return d;
        };
        const dice = [die(-9, 13, 14, 13), die(11, 10, 15, 11)];
        // chains, from the roof to the altar
        for (const s of [-1, 1]) for (let i = 0; i < 13; i++) { const q = i / 12, l = ring(2.5, 0.62, i % 4 ? M.steel : silver, g, s * (33 - Math.sin(q * Math.PI) * 5), 80 - q * 80, -2 + q * 8, false); l.scale.y = 1.45; l.rotation.y = i % 2 ? Math.PI / 2 : 0; }
        for (let i = 0; i < 9; i++) { const q = i / 8, l = ring(2.1, 0.55, M.steel, g, -29 + q * 58, 26 - Math.sin(q * Math.PI) * 9, 9, false); l.scale.x = 1.45; l.rotation.x = i % 2 ? Math.PI / 2 : 0; }
        const lock = gem(3.6, lit(1.6), g, 0, 16.4, 12, 1.3);
        const haze = mesh(new THREE.PlaneGeometry(80, 80), light(tex.haze, m.own, 0.3), g, 0, 46, -8);
        return (t) => {
            dice.forEach((d, i) => { d.rotation.set(t / (1700 + i * 500), t / (1300 - i * 250), 0.4); d.position.y = (i ? 10 : 13) + 1.6 * Math.sin(t / 700 + i * 2); });
            cards.forEach((p, i) => { p.rotation.z = (2 - i) * (0.31 + 0.03 * Math.sin(t / 1300)); });
            lock.rotation.y = t / 900; haze.material.opacity = (m.on ? 0.34 : 0.14) * (0.8 + 0.2 * Math.sin(t / 310) * Math.sin(t / 870));
        };
    },
};

/** No form: its magic circle, its own colour at the heart. */
function circle({ K, g, m, lit, silver, k }) {
    const { M, light, mesh, ring, gem, texture, curl } = K;
    const hold = new THREE.Group(); hold.position.y = 42; g.add(hold);
    ring(38, 1.3, silver, hold, 0, 0, 0, false); ring(34.5, 0.5, M.trim, hold, 0, 0, 0, false);
    for (const f of [-1, 1]) curl(8, M.trim, hold, f * 36, -24, 0, f, 1.4);
    const map = texture(sigilCanvas({ seed: m.id, points: m.points, rings: m.rings, open: !m.on, size: 420 }));
    const outer = mesh(new THREE.PlaneGeometry(74, 74), light(map, m.own, k), hold), inner = mesh(new THREE.PlaneGeometry(34, 34), light(map.clone(), m.own, 0.9 * k), hold, 0, 0, 3);
    const heart = gem(5, lit(1.5), hold, 0, 0, 6, 1.6);
    return (t) => { hold.rotation.y = Math.sin(t / 2000) * 0.3; outer.rotation.z = t / 9000; inner.rotation.z = -t / 6000; heart.rotation.y = t / 1100; };
}

/** @param m  { id, form, color (its favor's), own, on, points, rings, supply } */
export function deity(K, group, m) {
    const { M, glow, light, tex, mesh, lathe, ring, gem } = K, k = m.on ? 1 : 0.6;
    lathe([[0, 0], [31, 0], [31, 2.4], [27, 5], [24, 8], [24, 12], [27, 14], [0, 14]], m.on ? M.trim : M.steel, group);
    ring(24.4, 0.6, M.bright, group, 0, 10); ring(27, 0.8, glow(m.color, m.on ? 1.2 : 1.8), group, 0, 14);
    const n = Math.min(GEMS, m.supply);
    for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.36; gem(2.2, glow(m.color, 1.4), group, Math.cos(a) * 28, 6.4, Math.sin(a) * 28, 1.4); }
    const favor = mesh(new THREE.PlaneGeometry(96, 96), light(tex.haze, m.color, 0.3 * k), group, 0, 48, -30);
    const g = new THREE.Group(); g.position.y = 14; group.add(g);
    const lit = (x) => { const mat = glow(m.own, x * k); return mat; };
    const move = (FORMS[m.form] ?? circle)({ K, g, m, lit, silver: m.on ? M.bright : M.trim, k });
    const phase = m.id.charCodeAt(0) % 9;
    return { frame(t, hover) {
        move?.(t);
        g.rotation.y = m.form ? Math.sin(t / 2300 + phase) * 0.3 * (1 - 0.6 * hover) : 0;
        favor.material.opacity = (0.28 + 0.08 * Math.sin(t / (m.on ? 1400 : 420) + phase)) * k;   // the hungry flicker
    } };
}
