// @ts-nocheck -- three.js scene building; untyped like the scenes.
// The Signal Chain twin's zones (phase 7): no raised platforms. Each zone is a rectangle
// on the floor, cordoned by low silver walls of light with a curved corner post at each
// corner, an engraved floor composition and a floor plaque at the middle of its near edge.
// Ported from the approved prototype (resources/signal chain digital twin/atelier.html).

import * as THREE from 'three';
import { SILVER, V } from './materials.js';
import { plaqueTexture, texture, zoneFloor } from './textures.js';

const ZONE_NAMES = { net: 'Net', core: 'Core', viewer: 'Gallery' };
const PAD = 46;            // a zone reaches this far past its outermost machines
const WALL_H = 26;

const flatVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
// brightest at the floor line, fading as it climbs: a wall of light
const wallFrag = 'uniform vec3 uColor; varying vec2 vUv; void main(){ float y = vUv.y; float a = 0.04 + pow(1.0 - y, 2.0) * 0.2 + exp(-y * 18.0) * 0.35; a *= smoothstep(1.0, 0.55, y); gl_FragColor = vec4(uColor * a, a); }';

/**
 * Each zone's rectangle on the floor, from where its machines stand.
 * @param {Map<string, THREE.Vector3>} positions  node id -> position
 * @param {Map<string, string>} zoneOf            node id -> 'net' | 'core' | 'viewer'
 */
export function zoneRects(positions, zoneOf) {
    const rects = {};
    for (const [id, p] of positions) {
        const z = zoneOf.get(id);
        if (!z) continue;
        const r = rects[z] ?? (rects[z] = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
        r.x0 = Math.min(r.x0, p.x - PAD); r.x1 = Math.max(r.x1, p.x + PAD);
        r.z0 = Math.min(r.z0, p.z - PAD); r.z1 = Math.max(r.z1, p.z + PAD);
    }
    return rects;
}

/**
 * Build the zones. Returns the group and a dispose function for what only it uses.
 * @param {ReturnType<import('./materials.js').makeMaterials>} K
 * @param {Record<string, { x0: number, x1: number, z0: number, z1: number }>} rects
 * @param {Record<string, [number, number]>} viewers  atlas / nexus / calendar (x, z)
 */
export function buildZones(K, rects, viewers) {
    const { M, glow, cyl, torus, ball, tube, curl, finial } = K;
    const group = new THREE.Group();
    const owned = [];   // textures, geometries and materials made here
    const own = (x) => { owned.push(x); return x; };
    const color = new THREE.Color(SILVER);

    // a corner piece: two floor rails sweeping up into a short post, silver and gilt
    const corner = () => {
        const g = new THREE.Group(), L = 16;
        for (const axis of [0, 1]) {
            const pt = (d, y) => (axis ? V(0, y, d) : V(d, y, 0));
            g.add(tube([pt(L, 0.6), pt(9, 0.6), pt(4, 0.9), pt(1.6, 2.8), pt(0.5, 6), pt(0.3, 9)], 0.42, M.silver, 40));
            g.add(ball(0.7, M.silver, axis ? 0 : L, 0.6, axis ? L : 0));
            const c = curl(1.6, 1.4, M.silver); c.position.copy(pt(7, 1.8)); c.rotation.y = axis ? -Math.PI / 2 : 0; g.add(c);
        }
        g.add(cyl(1.6, 2, 0.8, M.iron, 0, 16), cyl(0.5, 0.6, 12, M.silver, 0.8, 12), torus(0.75, 0.2, M.gilt, 6), torus(0.75, 0.2, M.gilt, 11));
        const f = finial(0.55, M.silver); f.position.y = 12.8; g.add(f);
        const gm = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.9)), glow(SILVER, 2)); gm.position.y = 18; g.add(gm);
        return g;
    };

    // the glow under each plaque: a blurred rounded bar, brightest in the middle
    const haloTex = own((() => {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
        const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
        g.filter = 'blur(14px)'; g.fillStyle = '#fff';
        g.beginPath(); g.roundRect(34, 30, 188, 36, 18); g.fill();
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        return t;
    })());

    for (const [zone, r] of Object.entries(rects)) {
        const w = r.x1 - r.x0, d = r.z1 - r.z0;
        // the engraved floor
        // the plaque lies just inside the near edge; the floor's frame opens around it
        const px = (r.x0 + r.x1) / 2, pz = r.z1 - 14;
        const tex = own(texture(zoneFloor(zone, r, viewers, { x: px, z: pz, w: 64, h: 16 }), false));
        const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d)), own(new THREE.MeshBasicMaterial({
            map: tex, color: color.clone().multiplyScalar(0.13), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })));
        floor.rotation.x = -Math.PI / 2; floor.position.set((r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2);
        group.add(floor);
        // the walls and their floor line
        const wallMat = own(new THREE.ShaderMaterial({ uniforms: { uColor: { value: color } }, vertexShader: flatVert, fragmentShader: wallFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
        const lineMat = own(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.2), toneMapped: false }));
        for (const [ax, az, bx, bz] of [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]]) {
            const len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
            const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(len, WALL_H)), wallMat);
            wall.position.set((ax + bx) / 2, WALL_H / 2, (az + bz) / 2); wall.rotation.y = ry; wall.raycast = () => {};
            const line = new THREE.Mesh(own(new THREE.BoxGeometry(len, 0.2, 0.5)), lineMat);
            line.position.set((ax + bx) / 2, 0.1, (az + bz) / 2); line.rotation.y = ry;
            group.add(wall, line);
        }
        // the corner pieces
        for (const [x, cz, ry] of [[r.x0, r.z0, 0], [r.x1, r.z0, -Math.PI / 2], [r.x1, r.z1, Math.PI], [r.x0, r.z1, Math.PI / 2]]) {
            const c = corner(); c.position.set(x, 0, cz); c.rotation.y = ry; group.add(c);
        }
        // the plaque: an inlay flush with the floor, just inside the near edge. It glows a
        // little (brighter than the engravings, on a soft halo) so it reads apart from the floor.
        const halo = new THREE.Mesh(own(new THREE.PlaneGeometry(84, 30)), own(new THREE.MeshBasicMaterial({
            map: haloTex, color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })));
        halo.rotation.x = -Math.PI / 2; halo.position.set(px, 0.05, pz);
        const plaque = new THREE.Mesh(own(new THREE.PlaneGeometry(64, 16)), own(new THREE.MeshBasicMaterial({
            map: own(plaqueTexture(zone, ZONE_NAMES[zone] ?? zone)), color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })));
        plaque.rotation.x = -Math.PI / 2; plaque.position.set(px, 0.06, pz);
        group.add(halo, plaque);
    }
    group.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });   // zones are scenery: never picked
    return { group, dispose: () => owned.forEach((x) => x.dispose()) };
}
