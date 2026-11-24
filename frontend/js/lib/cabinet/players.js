// @ts-nocheck -- three.js models; untyped like the scenes.
// A player in the Cohort: their magic circle standing in a silver ring, the archetype's
// glyph at its heart. Lit once you've collaborated.

import * as THREE from 'three';
import { sigilCanvas } from './sigil.js';

function glyphCanvas(glyph) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '84px "Noto Sans Symbols2", "Noto Sans Symbols", "Segoe UI Symbol", sans-serif';
    g.fillText(`${glyph}︎`, 64, 68); // as text, never as an emoji
    return c;
}

export function playerSigil(K, group, m) {
    const { M, glow, light, tex, mesh, lathe, ring, gem, texture } = K, k = m.on ? 1 : 0.4;
    lathe([[0, 0], [24, 0], [24, 2], [17, 4], [5, 7], [3.4, 13], [0, 13]], M.steel, group);
    ring(24, 0.7, M.trim, group, 0, 1.4);
    const hold = new THREE.Group(); hold.position.y = 55; group.add(hold);
    ring(39, 1.3, m.on ? M.bright : M.steel, hold, 0, 0, 0, false);
    const map = texture(sigilCanvas({ seed: m.id, points: m.points, rings: m.rings, open: !m.on, size: 420 }));
    const circle = mesh(new THREE.PlaneGeometry(76, 76), light(map, m.color, k), hold);
    mesh(new THREE.PlaneGeometry(70, 70), light(tex.haze, m.color, 0.4 * k), hold, 0, 0, -2);
    mesh(new THREE.PlaneGeometry(26, 26), light(texture(glyphCanvas(m.glyph)), '#ffffff', 0.55 + 0.45 * k), hold, 0, 0, 3);
    const top = gem(3, m.on ? glow(m.color, 1.2) : M.steel, hold, 0, 43, 0, 1.2);
    const phase = m.id.charCodeAt(0) % 9;
    return { frame(t, hover) {
        hold.rotation.y = Math.sin(t / 1800 + phase) * 0.35 * (1 - 0.7 * hover);
        circle.rotation.z = t / 9000;
        top.rotation.y = t / 1200;
    } };
}
