// @ts-nocheck -- three.js models; untyped like the scenes.
// How an adventure without a model of its own is shown: its cover as a 3D card (or a record)
// housed in glass, the way the machines house their liquid. Events stand in a lantern,
// performances spin as a record in a ring, battles hang before crossed blades, items sit under a dome. Finished ones are lit;
// the rest are grey. The card only sways, so the cover stays readable.

import * as THREE from 'three';
import { sigilCanvas } from './sigil.js';

const SWAY = 0.38;                 // radians each way (about 22 degrees)
const GLYPH = { event: '◷', item: '◆', performance: '♪', battle: '⚔' };

function rounded(w, h, r) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
}

/** The front: the cover, cropped to fill, else the adventure's own sigil. Redrawn when the image arrives. */
function drawFace(canvas, m, img, round) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    if (round) g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); else g.roundRect(0, 0, W, H, 22);
    g.clip();
    g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, W, H);
    if (img) {
        const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        g.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    } else {
        const q = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.7);
        q.addColorStop(0, `${m.color}aa`); q.addColorStop(1, '#0000');
        g.fillStyle = q; g.fillRect(0, 0, W, H);
        const z = Math.min(W, H) * 0.94, s = sigilCanvas({ seed: m.id, points: m.points, rings: m.rings });
        const tint = document.createElement('canvas'); tint.width = s.width; tint.height = s.height;
        const t = tint.getContext('2d'); t.drawImage(s, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = m.color; t.fillRect(0, 0, s.width, s.height);
        for (let i = 0; i < 2; i++) g.drawImage(tint, (W - z) / 2, (H - z) / 2, z, z);
        g.fillStyle = '#f2f3f5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${z * 0.2}px "Saira Condensed", sans-serif`;
        g.fillText(GLYPH[m.kind] ?? '', W / 2, H / 2);
    }
    if (!m.on) {   // not enshrined yet: grey
        g.globalCompositeOperation = 'saturation'; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = '#c2c5ca'; g.fillRect(0, 0, W, H);
    }
    g.restore();
}

function faceTexture(K, m, w, h, round) {
    const k = 512 / Math.max(w, h), canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    const texture = K.texture(canvas);
    drawFace(canvas, m, null, round);
    if (m.cover) {
        const img = new Image();
        img.onload = () => { drawFace(canvas, m, img, round); texture.needsUpdate = true; };
        img.src = m.cover;
    }
    return texture;
}

const flat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false });

/** A card's size within a box (portrait, the cover is cropped to it). */
export const cardSize = (maxW, maxH) => (maxW / maxH > 0.79 ? [maxH * 0.79, maxH] : [maxW, maxW / 0.79]);

/** The cover (or sigil) on a slab, facing +z. */
export function card(K, group, m, w, h) {
    const { M, mesh } = K;
    mesh(new THREE.ExtrudeGeometry(rounded(w + 2.4, h + 2.4, 3.4), { depth: 1.6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 2 }), m.on ? M.trim : M.steel, group, 0, 0, -0.8);
    mesh(new THREE.PlaneGeometry(w, h), flat(faceTexture(K, m, w, h, false)), group, 0, 0, 1.45);
}

function record(K, group, m) {
    const { M, std, mesh, cyl } = K;
    const disc = cyl(26, 26, 1.4, std({ color: '#0b0b0d', metalness: 0.35, roughness: 0.28 }), group); disc.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(15.5 + i * 1.8, 0.14, 4, 64), M.steel, group, 0, 0, 0.75);
    mesh(new THREE.CircleGeometry(13.5, 48), flat(faceTexture(K, m, 27, 27, true)), group, 0, 0, 0.95);
    cyl(1.1, 1.1, 3, M.trim, group).rotation.x = Math.PI / 2;
}

/** A vessel: `m.kind` event | item | performance | battle; origin on the shelf, about 100 units tall. */
export function vessel(K, group, m) {
    const { M, std, glow, mesh, lathe, ring, ball, tube, gem } = K, V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
    const trim = m.on ? M.bright : M.steel, lit = () => (m.on ? glow(m.color, 1.1) : M.steel);
    const glass = (opacity) => std({ color: '#dfeef4', transparent: true, opacity, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
    // the foot
    lathe([[0, 0], [27, 0], [27, 2], [23, 4.5], [23, 7.5], [0, 7.5]], M.steel, group);
    ring(23.4, 0.7, M.trim, group, 0, 6.6); ring(27, 0.6, M.trim, group, 0, 1);
    const hold = new THREE.Group(); hold.position.y = 48; group.add(hold);
    let spin = null;
    if (m.kind === 'performance') {
        ring(34, 1.4, trim, group, 0, 48, 0, false);
        for (const z of [3, -3]) mesh(new THREE.CircleGeometry(33, 48), glass(0.05), group, 0, 48, z);
        for (const f of [-1, 1]) tube([V(f * 8, 8), V(f * 20, 10), V(f * 27, 18), V(f * 28, 27)], 1.1, trim, group);
        gem(3, lit(), group, 0, 85, 0, 1);
        spin = new THREE.Group(); hold.add(spin); record(K, spin, m);
    } else if (m.kind === 'battle') {
        ring(34, 1.2, trim, group, 0, 48, 0, false);
        for (const s of [-1, 1]) {   // two blades crossed behind the card
            const b = new THREE.Group(); b.position.set(0, 50, -6 - s); b.rotation.z = s * 0.74; group.add(b);
            const blade = mesh(new THREE.CylinderGeometry(0.3, 3, 78, 4), m.on ? M.bright : M.trim, b, 0, 12); blade.scale.z = 0.35;
            mesh(new THREE.BoxGeometry(15, 1.6, 2.4), M.trim, b, 0, -27); mesh(new THREE.CylinderGeometry(1.2, 1.2, 11, 10), M.steel, b, 0, -33); ball(1.9, M.trim, b, 0, -39);
        }
        gem(3, lit(), group, 0, 86, 0, 1);
        card(K, hold, m, 30, 38);
    } else if (m.kind === 'event') {
        mesh(new THREE.CylinderGeometry(33, 33, 70, 48, 1, true), glass(0.09), group, 0, 48, 0);
        for (const y of [13, 83]) { ring(33, 1.1, trim, group, 0, y); ring(30, 0.5, M.steel, group, 0, y); }
        for (let q = 0; q < 4; q++) { const a = (q / 4) * Math.PI * 2 + 0.78; mesh(new THREE.CylinderGeometry(0.6, 0.6, 70, 6), trim, group, Math.cos(a) * 33, 48, Math.sin(a) * 33); }
        lathe([[33, 83], [26, 87], [12, 90], [0, 91]], glass(0.12), group);
        gem(3, lit(), group, 0, 94, 0, 1);
        card(K, hold, m, 43, 54);
    } else {
        lathe([[32, 12], [32, 52], [29, 68], [21, 80], [9, 87], [0, 88]], glass(0.09), group);
        ring(32, 1, trim, group, 0, 12); ball(2.2, trim, group, 0, 89.5);
        card(K, hold, m, 41, 50);
    }
    const phase = (m.id.charCodeAt(0) + m.id.charCodeAt(1)) % 9;
    return {
        frame(t, hover) {
            hold.rotation.y = Math.sin(t / 1700 + phase) * (spin ? 0.2 : SWAY) * (1 - 0.7 * hover);
            if (spin) spin.rotation.z = -t / 1400;
        },
    };
}
