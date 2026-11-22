// @ts-nocheck -- three.js materials and shape helpers; untyped like the scenes.
// Shared materials and small shape helpers for the Signal Chain twin (phase 7), ported
// from the approved prototype (resources/signal chain digital twin/atelier.html).
//
// Call makeMaterials() once per scene; dispose() frees everything it made.

import * as THREE from 'three';

export const SILVER = '#cfd6e0';
export const TAU = Math.PI * 2;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });

/** The material set and helpers for one scene. */
export function makeMaterials() {
    const M = {
        brass: std({ color: 0xb08646, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
        gilt: std({ color: 0xe8b85c, metalness: 1, roughness: 0.2 }),
        copper: std({ color: 0xc06a3e, metalness: 1, roughness: 0.32, side: THREE.DoubleSide }),
        iron: std({ color: 0x30333a, metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }),
        stone: std({ color: 0x24262c, metalness: 0.05, roughness: 0.9 }),
        silver: std({ color: 0xc8ced8, metalness: 1, roughness: 0.25 }),
    };
    const glows = new Map();
    /** An emissive accent in a colour (cached by colour and strength). */
    const glow = (color, intensity = 2.2) => {
        const key = `${color}/${intensity}`;
        if (!glows.has(key)) glows.set(key, std({ color: 0x050505, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 }));
        return glows.get(key);
    };
    const geos = [];
    const keep = (geo) => { geos.push(geo); return geo; };
    const SPHERE = keep(new THREE.SphereGeometry(1, 12, 8));

    const cyl = (rt, rb, h, mat, y = 0, seg = 32, open = false) => { const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), mat); m.position.y = y + h / 2; return m; };
    const torus = (r, t, mat, y = 0, seg = 48) => { const m = new THREE.Mesh(keep(new THREE.TorusGeometry(r, t, 10, seg)), mat); m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
    const ball = (r, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(SPHERE, mat); m.scale.setScalar(r); m.position.set(x, y, z); return m; };
    const tube = (points, r, mat, segs = 32) => new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, 8)), mat);
    const lathe = (pts, mat, seg = 48) => new THREE.Mesh(keep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)), mat);
    /** A gilt filigree curl: a spiral tube in its own XY plane. */
    const curl = (size = 3, turns = 1.5, mat = M.gilt) => {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * turns * TAU, r = size * (1 - t * 0.82); pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0)); }
        return new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, size * 0.07, 6, false)), mat);
    };
    const finial = (s = 1, mat = M.gilt) => lathe([[0, 0], [1.1, 0], [1.1, 0.4], [0.5, 0.8], [0.9, 1.7], [0.3, 2.5], [0.55, 3.0], [0, 4.4]].map(([r, y]) => [r * s, y * s]), mat, 24);
    const gem = (color, s = 1) => new THREE.Mesh(keep(new THREE.OctahedronGeometry(s)), glow(color, 3));

    const dispose = () => {
        for (const m of Object.values(M)) m.dispose();
        for (const m of glows.values()) m.dispose();
        for (const g of geos) g.dispose();
    };
    return { M, glow, cyl, torus, ball, tube, lathe, curl, finial, gem, dispose };
}
