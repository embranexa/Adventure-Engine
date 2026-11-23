// @ts-nocheck -- three.js materials and shape helpers; untyped like the scenes.
// Materials and shapes the cabinets share. The housing is monochrome: silver and glass.
// Colour belongs to the magic (circles, glows, lit gems) and to the trophies.

import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.8, ...o });

/** A studio of soft panels to reflect: neutral, so silver stays silver. */
export function studio(renderer) {
    const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
    s.background = new THREE.Color('#0c0c0d');
    const own = [];
    for (const [x, y, z, w, h, c, k] of [[0, 9, 3, 10, 4, '#f4f3f1', 5], [-9, 2, 5, 3, 9, '#cfd0d2', 2.6], [9, 1, 4, 2, 8, '#e6e4e0', 3], [0, -2, 10, 9, 1.5, '#e4e5e6', 2]]) {
        const geo = new THREE.PlaneGeometry(w, h), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide });
        own.push(geo, mat);
        const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    }
    const target = pm.fromScene(s, 0.03);
    own.forEach((o) => o.dispose()); pm.dispose();
    return target;
}

/** Free what a group made for itself (shared materials and textures are flagged). */
export function disposeGroup(group) {
    group.traverse((o) => {
        o.geometry?.dispose();
        const m = o.material;
        if (!m || m.userData.shared) return;
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
    });
}

/** @param {{ dim?: boolean }} [options]  dim: the Necropolis's darker silver */
export function makeKit({ dim = false } = {}) {
    const shared = [];
    const share = (x) => { x.userData.shared = true; shared.push(x); return x; };
    const M = {
        pane: share(std({ color: '#2c2d2f', transparent: true, opacity: 0.17, roughness: 0.22, metalness: 0.35, envMapIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide })),
        shelf: share(std({ color: '#cfe0e8', transparent: true, opacity: 0.07, roughness: 0.08, metalness: 0.1, depthWrite: false, envMapIntensity: 1.4 })),
        steel: share(std({ color: '#5f6164', metalness: 0.95, roughness: 0.36 })),
        trim: share(std({ color: dim ? '#6f6f70' : '#b4b6b9', metalness: 1, roughness: 0.26 })),
        bright: share(std({ color: dim ? '#858586' : '#d0d2d4', metalness: 1, roughness: 0.2 })),
        stone: share(std({ color: '#303031', roughness: 0.88 })),
        wax: share(std({ color: '#b9ae97', roughness: 0.7 })),
    };
    const glow = (color, k = 1.3) => std({ color: '#050505', emissive: color, emissiveIntensity: k, roughness: 0.4 });
    const light = (map, color, opacity) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const texture = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const draw = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return share(texture(c)); };
    const pixels = (w, h, alpha) => draw(w, h, (g) => {
        const im = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data.set([255, 255, 255, 255 * Math.max(0, alpha(x / (w - 1), y / (h - 1)))], (y * w + x) * 4);
        g.putImageData(im, 0, 0);
    });
    const tex = {
        haze: pixels(64, 64, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2; return d >= 1 ? 0 : Math.pow(1 - d, 2); }),
        // a line of light that fades at both ends, and one that fades to the right
        line: pixels(256, 2, (u) => Math.min(1, u / 0.14, (1 - u) / 0.14)),
        half: pixels(256, 2, (u) => 1 - u),
        // the light under a shelf's edge
        wash: pixels(128, 32, (u, v) => Math.sin(Math.PI * u) * (1 - v) ** 2),
        // a soft beam standing on the shelf
        beam: pixels(64, 64, (u, v) => Math.max(0, 1 - (Math.abs(u - 0.5) * 2) / (0.62 + 0.38 * (1 - v))) * Math.pow(v, 1.8)),
    };

    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const lathe = (pts, mat, parent, y = 0) => mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 36), mat, parent, 0, y);
    const tube = (pts, r, mat, parent, segs = 48) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 7), mat, parent);
    const ring = (R, t, mat, parent, x = 0, y = 0, z = 0, flat = true) => { const m = mesh(new THREE.TorusGeometry(R, t, 8, 44), mat, parent, x, y, z); if (flat) m.rotation.x = Math.PI / 2; return m; };
    const ball = (r, mat, parent, x, y, z = 0) => mesh(new THREE.SphereGeometry(r, 16, 12), mat, parent, x, y, z);
    const cyl = (r0, r1, h, mat, parent, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(r0, r1, h, 20), mat, parent, x, y, z);
    const gem = (r, mat, parent, x, y, z, tall = 1.5) => { const m = mesh(new THREE.OctahedronGeometry(r), mat, parent, x, y, z); m.scale.y = tall; return m; };
    const curl = (size, mat, parent, x, y, z, flip = 1, turns = 1.5) => {
        const pts = [];
        for (let i = 0; i <= 36; i++) { const t = i / 36, a = t * turns * TAU, r = size * (1 - t * 0.84); pts.push(V(Math.cos(a) * r * flip, Math.sin(a) * r)); }
        const m = tube(pts, size * 0.07, mat, parent, 56); m.position.set(x, y, z); return m;
    };
    const finial = (s, mat, parent, x, y, z = 0) => { const m = lathe([[0, 0], [1.1, 0], [1.1, 0.4], [0.5, 0.8], [0.9, 1.7], [0.3, 2.5], [0.55, 3], [0, 4.4]].map(([r, h]) => [r * s, h * s]), mat, parent); m.position.set(x, y, z); return m; };
    /** A thin tube along a closed or open 2D outline. */
    const wire = (pts, r, mat, parent, z = 0, closed = true) => {
        const path = new THREE.CurvePath();
        for (let i = closed ? 0 : 1; i < pts.length; i++) { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i]; if (Math.hypot(a.x - b.x, a.y - b.y) > 0.01) path.add(new THREE.LineCurve3(V(a.x, a.y), V(b.x, b.y))); }
        return mesh(new THREE.TubeGeometry(path, 120, r, 6), mat, parent, 0, 0, z);
    };
    return { M, std, glow, light, texture, tex, mesh, lathe, tube, ring, ball, cyl, gem, curl, finial, wire, dispose: () => shared.forEach((x) => x.dispose()) };
}
