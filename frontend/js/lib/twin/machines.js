// @ts-nocheck -- three.js scene building; untyped like the scenes.
// The Signal Chain twin's machines (phase 7), ported from the approved prototype
// (resources/signal chain digital twin/atelier.html); see PHASE7_PLAN.md.
//
//   const shop = makeShop(kit);                        // once per scene
//   const m = buildMachine(shop, node, ctx);            // one machine
//   m.group, m.height, m.heart?.setBands(...), m.setRim(mode), m.frame(dt, t)
//
// Every matter-holding machine is built around a glass heart (its liquid = rows held, in
// lens bands, ghosts on top); dynamos have none. Every machine stands on a dark plinth:
// the base. Base meshes carry userData.ring (click: filter); body meshes carry userData.id
// only when the machine opens a panel (click: open it). Locked machines stand dark.
// Mechanisms run only while ctx.working() is true (its panel is in use; stage 7d); they
// ease in and out over PACE_S (pace: 0 still .. 1 working) so focus changes don't flicker.

import * as THREE from 'three';
import { magicCircleCanvases } from '../magicCircle.js';
import { SILVER, TAU, V } from './materials.js';
import { canvas2d, rune, runeStrip, texture } from './textures.js';

export const PLINTH_H = 3.4;
const Y = PLINTH_H;
const FRONT = Math.PI / 4;   // the side facing the camera
// The camera's side, seen from above (twinScene.js VIEW_DIR): an angle t places a part at
// (cos t, sin t). Nothing tall stands between the camera and a heart's glass.
const CAM = Math.atan2(1.15, 0.55);
/** An angle on the far side, `offset` radians from straight behind. */
const away = (offset = 0) => CAM + Math.PI + offset;
/** Every Core heart has one size, so the same number of rows stands at the same height. */
const CORE = { r: 5.6, h: 12, y: PLINTH_H + 1.2 };
const CORE_TOP = CORE.y + CORE.h;
/** Turns a square body so its corners sit 45° either side of the camera (clear of the glass). */
const SQUARE_TURN = Math.PI / 2 - CAM;
const RIM_COLORS = { include: '#e6ebf2', exclude: '#ff4a3d' };
const PACE_S = 0.5;          // a mechanism winds up or down in this long

/** Plinth radius per body: the base is sized to the machine. */
export const FOOT = { harvester: 8, centrifuge: 10, sump: 13, lode: 11, hopper: 9, athanor: 7, anvil: 9, crucible: 10, arena: 12, treasury: 9, archive: 10, necropolis: 10, codex: 8, cohort: 9, complex: 9, agora: 9, inventory: 9, pantheon: 10, mastery: 8, nexus: 8, atlas: 7, calendar: 8, ledger: 8, assayer: 8 };

/** Which body a node gets. */
export function bodyOf(node) {
    if (node.kind === 'harvester') return 'harvester';
    return FOOT[node.id] ? node.id : 'agora';
}

const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });

/** Extra materials, textures and helpers the machines share (one per scene). */
export function makeShop(K) {
    const { M } = K;
    const own = [];
    const keep = (x) => { own.push(x); return x; };
    Object.assign(M, {
        wood: keep(std({ color: 0x3a2618, metalness: 0.1, roughness: 0.7 })),
        glass: keep(std({ color: 0xb8d0e0, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })),
        heart: keep(std({ color: 0xd4e6f2, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8 })),  // light glass: the liquid reads through it
        dark: keep(std({ color: 0x101114, metalness: 0.5, roughness: 0.6 })),
        ghost: keep(std({ color: 0x2a2f38, metalness: 0, roughness: 0.3, transparent: true, opacity: 0.6, depthWrite: false })),
        locked: keep(std({ color: 0x15171b, metalness: 0.6, roughness: 0.7 })),
        lockedGlass: keep(std({ color: 0x3a3f48, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })),
    });
    const circles = magicCircleCanvases(512);
    const CIRCLE = { outer: keep(texture(circles.outer)), inner: keep(texture(circles.inner)) };
    const RUNES = keep(runeStrip());
    const DOT = (() => { const [c, g] = canvas2d(64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(texture(c)); })();
    const U = { uFlowT: { value: 0 }, uShimmer: { value: SHIMMER }, uTime: { value: 0 } };   // one clock for every heart
    const liquids = new Map();
    const liquidMat = (color) => {
        // vivid and softly glowing: outside tone mapping, which would wash the colours out; its brightness drifts (flowGain)
        if (!liquids.has(color)) liquids.set(color, keep(withFlow(std({ color: new THREE.Color(color).multiplyScalar(0.22), emissive: new THREE.Color(color), emissiveIntensity: 0.82, roughness: 0.4, metalness: 0, envMapIntensity: 0.2, toneMapped: false }), U)));
        return liquids.get(color);
    };
    const seamGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true));
    const additive = (map, color, opacity = 0.9) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const unitCyl = keep(new THREE.CylinderGeometry(1, 1, 1, 32)); unitCyl.translate(0, 0.5, 0);
    let globe = null;
    const globeTexture = () => globe ?? (globe = keep(drawGlobe()));
    return { ...K, CIRCLE, RUNES, DOT, liquidMat, additive, unitCyl, seamGeo, globeTexture, U,
        /** advance the liquid's clock once a frame (dt is 0 under reduced motion) */
        tick(dt) { U.uTime.value += dt; U.uFlowT.value += dt; },
        dispose: () => own.forEach((x) => x.dispose()) };
}

/* ---------------------------------------------------------------------- */
/*  The heart's liquid as energy (prototype: resources/.../liquid.html).    */
/*  Every effect changes brightness only; each band keeps its own hue, so  */
/*  the lens stays readable.                                               */
/* ---------------------------------------------------------------------- */

const SHIMMER = 0.28;   // the drift's strength: brightness varies by up to ±28%
const NOISE = /* glsl */`
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
uniform float uFlowT, uShimmer;
// slow billows and fine streaks drifting upward, as a brightness gain
float flowGain(vec3 p) {
    vec3 q = p * 0.30;
    float n1 = fbm(vec3(q.x, q.y * 0.7 - uFlowT * 0.35, q.z));
    float n2 = fbm(vec3(q.x * 2.4 + 3.0, q.y * 0.22 - uFlowT * 0.8, q.z * 2.4));
    return 1.0 + uShimmer * clamp((0.6 * n1 + 0.4 * n2 - 0.46) * 2.8, -1.0, 1.0);
}`;
const SURF = /* glsl */`
uniform float uTime, uWave, uHit, uR;
// crossing waves, a ripple ring after rows arrive, and a meniscus climbing the glass
float surfH(vec2 p) {
    float r = length(p), t = uTime;
    float h = uWave * 0.12 * (sin(dot(p, vec2(0.8, 0.6)) * 0.9 + t * 1.6) * 0.5
                            + sin(dot(p, vec2(-0.5, 0.86)) * 1.3 - t * 2.1) * 0.35
                            + sin(r * 1.7 - t * 2.4) * 0.25);
    float a = uTime - uHit;
    if (a > 0.0 && a < 6.0) h += 0.32 * sin(r * 2.6 - a * 7.0) * exp(-a * 0.9) * exp(-pow(r - a * 3.2, 2.0) * 0.5);
    h *= 1.0 - pow(min(r / uR, 1.0), 6.0);
    return h + 0.14 * smoothstep(uR - 0.7, uR, r);
}`;

/**
 * Patch a standard material so its emissive drifts (flowGain of the world position).
 * `surf` also displaces the vertices as the liquid's surface, with normals from the slope.
 */
function withFlow(mat, U, surf = null) {
    mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, surf ?? {});
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${surf ? `varying float vH;\n${SURF}` : ''}`)
            .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        if (surf) sh.vertexShader = sh.vertexShader
            .replace('#include <beginnormal_vertex>', `
                float e = 0.08, h0 = surfH(position.xz);
                vec3 objectNormal = normalize(vec3(-(surfH(position.xz + vec2(e, 0.0)) - h0) / e, 1.0, -(surfH(position.xz + vec2(0.0, e)) - h0) / e));
                #ifdef USE_TANGENT
                vec3 objectTangent = vec3(tangent.xyz);
                #endif`)
            .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.y += h0; vH = h0;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${surf ? 'varying float vH;' : ''}\n${NOISE}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= flowGain(vWPos)${surf ? ' * (1.0 + vH * 2.4)' : ''};`);   // crests a little brighter
    };
    mat.customProgramCacheKey = () => (surf ? 'liquid-surface' : 'liquid');
    return mat;
}

/** The liquid's surface (one per heart: its waves are its own). */
const surfaceMat = (U, waves) => withFlow(std({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.12, metalness: 0, envMapIntensity: 1.1, toneMapped: false }), U, waves);

/** A seam where two lit bands meet: lower half in the lower band's light, upper half in the upper's, a bright core between. */
function seamMat(low, high, U) {
    return new THREE.ShaderMaterial({
        uniforms: { cLow: { value: new THREE.Color(lighter(low)) }, cHigh: { value: new THREE.Color(lighter(high)) }, uTime: U.uTime },
        vertexShader: 'varying vec2 vUv; varying vec3 vP; void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
            uniform vec3 cLow, cHigh; uniform float uTime; varying vec2 vUv; varying vec3 vP;
            void main() {
                float d = abs(vUv.y - 0.5) * 2.0;
                float core = exp(-d * d * 22.0), halo = exp(-d * d * 3.5) * 0.35;
                float sparkle = 0.78 + 0.22 * sin(atan(vP.z, vP.x) * 5.0 - uTime * 1.6);
                gl_FragColor = vec4(mix(vUv.y < 0.5 ? cLow : cHigh, vec3(1.0), core * 0.5) * (core + halo) * sparkle, 1.0);
            }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
}

/** A lighter tint of a colour, for glows that must read on dark matter. */
export const lighter = (c) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35).getHexString();

/**
 * Build one machine.
 * @param {ReturnType<typeof makeShop>} S
 * @param {{ id: string, kind: string, zone: string, locked: boolean, holds: string | null, action: object | null }} node
 * @param {{ color: string, accent?: string, working: () => boolean, spin: () => number, entities: () => number, pending: () => boolean, ports?: number[] }} ctx
 *   accent: the trim's colour, if not the matter colour (a harvester's source colour)
 *   ports: the angles (radians, world frame) where pipes meet the base
 */
export function buildMachine(S, node, ctx) {
    const { M, glow, cyl, torus, ball, tube, lathe, curl, finial, gem, CIRCLE, RUNES, DOT, liquidMat, additive } = S;
    const G = () => new THREE.Group();
    const anims = [];
    const a = anims;
    const color = ctx.color, light = lighter(ctx.color), accent = ctx.accent ?? color;
    // pace eases toward 1 while the panel is in use, back to 0 after (smoothstepped)
    let wind = 0, pace = 0;
    const working = () => pace > 0;
    const busy = () => 3 * pace;
    const paceOf = () => pace;
    const owned = [];   // per-machine materials (not shared) to dispose with it
    const mine = (m) => { owned.push(m); return m; };
    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m; };
    const rivets = (r, y, n, mat = M.gilt, s = 0.32) => {
        const g = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, n); const o = new THREE.Object3D();
        for (let i = 0; i < n; i++) { const t = (i / n) * TAU; o.position.set(Math.cos(t) * r, y, Math.sin(t) * r); o.scale.setScalar(s); o.updateMatrix(); g.setMatrixAt(i, o.matrix); }
        return g;
    };
    const band = (r, y, h = 1.3) => { const g = G(); g.add(cyl(r, r, h, M.brass, y - h / 2, 48, true), torus(r, 0.2, M.gilt, y - h / 2), torus(r, 0.2, M.gilt, y + h / 2), rivets(r + 0.05, y, Math.max(8, Math.round(r * 2.6)))); return g; };
    const runeBand = (r, y, h, c, repeat = 2, opacity = 0.95) => { const t = RUNES.clone(); t.needsUpdate = true; t.repeat.set(repeat, 1); mine(t); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), mine(additive(t, c, opacity))); m.position.y = y; return m; };
    const curls = (g, r, y, n = 4, size = 2.4) => { for (let i = 0; i < n; i++) { const t = (i / n) * TAU + Math.PI / n; for (const s of [-1, 1]) { const c = curl(size); c.position.set(Math.cos(t) * r, y, Math.sin(t) * r); c.rotation.y = -t + Math.PI / 2; c.scale.x = s; g.add(c); } } };
    const gear = (r, teeth, mat = M.brass) => { const m = new THREE.Mesh(gearGeo(r, teeth, Math.min(0.7, r * 0.18)), mat); return m; };
    const ownGlow = (c, intensity) => mine(std({ color: 0x050505, emissive: new THREE.Color(c), emissiveIntensity: intensity, roughness: 0.4 }));

    /* the heart: a glass cylinder whose liquid shows the rows held */
    let heartRec = null;
    const heart = (r, H, y0) => {
        const g = G(), rr = r - 0.35;
        g.add(cyl(r, r, H, M.heart, y0, 48, true));
        const liquid = G(); liquid.position.y = y0 + 0.2; liquid.visible = false; g.add(liquid);
        const overlay = G(); g.add(overlay);   // in machine units, not scaled with the liquid: the surface and the seams
        // the surface: the top band's own colour, glowing, rippling (surfaceMat); a bright meniscus where it meets the glass
        const waves = { uWave: { value: 0.45 }, uHit: { value: -100 }, uR: { value: rr } };
        const topMat = mine(surfaceMat(S.U, waves));
        const grid = new THREE.RingGeometry(0.001, rr * 0.995, 96, 24); grid.rotateX(-Math.PI / 2);
        const top = new THREE.Mesh(grid, topMat); overlay.add(top);
        const menMat = mine(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const meniscus = torus(rr - 0.02, 0.09, menMat, 0); overlay.add(meniscus);
        const seams = [];
        const over = torus(r + 0.15, 0.22, ownGlow('#ff7a3c', 2.2), y0 + H); over.visible = false; g.add(over);
        const tk = CAM + 1.4; // the capacity ticks at the heart's edge, seen side-on
        g.add(box(0.25, H, 0.25, M.gilt, Math.cos(tk) * (r + 0.3), y0, Math.sin(tk) * (r + 0.3)));
        for (let k = 1; k < 10; k++) g.add(box(k % 5 ? 0.7 : 1.3, 0.1, 0.18, M.gilt, Math.cos(tk) * (r + 0.6), y0 + (k / 10) * H, Math.sin(tk) * (r + 0.6)));
        const segs = [];
        heartRec = {
            fill: 0, target: 0, litShare: 1, maxH: H - 0.4, y0: y0 + 0.2,
            /** bands: [{ color, count, ghost? }] bottom up; total rows; cap = rows that fill it */
            setBands(bands, total, cap) {
                for (const s of segs.splice(0)) liquid.remove(s);
                for (const s of seams.splice(0)) { overlay.remove(s.mesh); s.mesh.material.dispose(); }
                if (this.total != null && total > this.total) waves.uHit.value = S.U.uTime.value;   // rows arrived: a ripple
                this.total = total;
                const sum = bands.reduce((n, b) => n + b.count, 0) || 1;
                let y = 0, litTop = 0;
                const lit = [];
                for (const b of bands) {
                    const share = b.count / sum;
                    if (share <= 0) continue;
                    const m = new THREE.Mesh(S.unitCyl, b.ghost ? M.ghost : liquidMat(b.color));
                    m.position.y = y; m.scale.set(rr * (b.ghost ? 0.995 : 1), share, rr * (b.ghost ? 0.995 : 1));
                    liquid.add(m); segs.push(m);
                    // a glowing seam where one lit band meets the next (each half in its own band's light)
                    if (!b.ghost && litTop > 0) {
                        const below = lit.at(-1);
                        const mesh = new THREE.Mesh(S.seamGeo, seamMat(below, b.color, S.U));
                        mesh.scale.set(rr + 0.04, 0.26, rr + 0.04); overlay.add(mesh);
                        seams.push({ mesh, at: y });
                    }
                    if (!b.ghost) lit.push(b.color);
                    y += share; if (!b.ghost) litTop = y;
                }
                top.visible = meniscus.visible = litTop > 0;
                if (lit.length) { topMat.emissive.set(lit.at(-1)); menMat.color.set(lighter(lit.at(-1))); } // the surface shows the top band
                this.litShare = litTop;
                this.target = Math.min(1, total / cap);
                over.visible = total > cap;
            },
            /** the lit liquid's top, in the machine's own units */
            level() { return this.y0 + this.fill * this.maxH * this.litShare; },
            frame(ease, pace) {
                this.fill += (this.target - this.fill) * ease;
                liquid.visible = this.fill > 0.002;
                const H = Math.max(0.001, this.fill * this.maxH);
                liquid.scale.y = H;
                top.position.y = this.y0 + this.litShare * H;
                meniscus.position.y = top.position.y + 0.14;
                for (const s of seams) s.mesh.position.y = this.y0 + s.at * H;
                waves.uWave.value = 0.45 + 1.1 * pace;   // choppier while the machine works
            },
        };
        return g;
    };

    /* the base: dark stone, the filter rim, and a turning circle when it opens a panel */
    const r = FOOT[bodyOf(node)] ?? 9;
    const base = G();
    base.add(cyl(r + 1.4, r + 1.8, 1.2, M.stone, 0, 56), cyl(r + 0.6, r + 1.0, 2.2, M.stone, 1.2, 56), torus(r + 0.6, 0.22, M.iron, PLINTH_H));
    // the base filters its stage: Core vessels only (the Net's stages aren't matter filters)
    const vessel = node.zone === 'core' && (node.holds === 'events' || node.holds === 'adventures');
    let rim = null;
    if (vessel && !node.locked) {
        base.add(torus(r + 0.62, 0.12, glow(accent, 1.4), PLINTH_H + 0.12));
        const bandMesh = runeBand(r + 1.05, 2.3, 1.1, light, Math.max(2, Math.round(r / 2.6)), 0.45);
        const rings = [torus(r + 1.2, 0.26, ownGlow('#ffffff', 1.3), 1.3), torus(r + 1.2, 0.26, ownGlow('#ffffff', 1.3), 3.2), torus(r + 2.0, 0.2, ownGlow('#ffffff', 1), 0.25)];
        for (const ring of rings) { ring.visible = false; base.add(ring); }
        base.add(bandMesh);
        rim = { bandMesh, rings };
        // a generous invisible hit area over the whole base
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(r + 2.4, r + 2.4, PLINTH_H + 0.6, 32, 1, true), mine(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide })));
        hit.position.y = (PLINTH_H + 0.6) / 2; base.add(hit);
    }
    if (node.action && !node.locked) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(2, r - 3), r + 0.5, 64), mine(additive(CIRCLE.outer, light, 0.6)));
        ring.rotation.x = -Math.PI / 2; ring.position.y = PLINTH_H + 0.06; base.add(ring);
        a.push((dt) => { ring.rotation.z += dt * 0.25 * (1 + 2 * pace); ring.material.opacity = 0.6 + 0.25 * pace; });
    }
    // a flanged socket for each pipe (angles from pipes.js, in the base's own frame)
    for (const ang of ctx.ports ?? []) {
        const p = G(); p.position.set(Math.cos(ang) * (r + 0.9), 1.6, Math.sin(ang) * (r + 0.9)); p.rotation.y = -ang;
        const sk = cyl(1.05, 1.05, 1.8, M.iron, 0, 16); sk.rotation.z = Math.PI / 2; sk.position.set(0.9, 0, 0); p.add(sk);
        const fl = cyl(1.5, 1.5, 0.4, M.brass, 0, 16); fl.rotation.z = Math.PI / 2; fl.position.set(1.8, 0, 0); p.add(fl);
        base.add(p);
    }

    /* the body */
    const body = BODIES[bodyOf(node)]({ node, a, color, light, accent, working, busy, pace: paceOf, ctx, heart, G, M, glow, cyl, torus, ball, tube, lathe, curl, finial, gem, box, rivets, band, runeBand, curls, gear, ownGlow, mine, CIRCLE, RUNES, DOT, liquidMat, additive, S, getHeart: () => heartRec });

    const group = G();
    group.add(base, body.group);
    if (node.locked) group.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.material = o.material.transparent ? M.lockedGlass : M.locked; });
    // what a click means: the base filters (matter-holding machines), the body opens the panel
    base.traverse((o) => { if (o.isMesh && vessel && !node.locked) o.userData.ring = node.id; });
    body.group.traverse((o) => { if (o.isMesh && node.action && !node.locked) o.userData.id = node.id; });
    group.traverse((o) => { if (o.isPoints || o.isSprite) o.raycast = () => {}; });

    return {
        group,
        height: body.height,
        heart: heartRec,
        setRim(mode) {
            if (!rim) return;
            const c = mode ? RIM_COLORS[mode] : light;
            rim.bandMesh.material.color.set(c);
            rim.bandMesh.material.opacity = mode === 'include' ? 0.7 : mode ? 1 : 0.45;
            rim.bandMesh.scale.y = mode ? 1.45 : 1;
            for (const ring of rim.rings) { ring.visible = Boolean(mode); ring.material.emissive.set(c); ring.material.emissiveIntensity = mode === 'include' ? 1.3 : 4; }
        },
        frame(dt, t, ease) {
            const want = !node.locked && ctx.working();
            wind = want ? Math.min(1, wind + dt / PACE_S) : Math.max(0, wind - dt / PACE_S);
            pace = wind * wind * (3 - 2 * wind);
            heartRec?.frame(ease, pace);
            for (const f of anims) f(dt, t);
        },
        dispose() { owned.forEach((x) => x.dispose()); group.traverse((o) => { if (o.geometry && o.geometry !== S.unitCyl && o.geometry !== S.seamGeo) o.geometry.dispose(); }); },
    };
}

/* ---------------------------------------------------------------------- */
/*  Bodies: each returns { group, height }; animations go in c.a            */
/* ---------------------------------------------------------------------- */

/** Chains and a padlock round a machine that isn't built yet. */
function chain({ M, torus, box }, g, r, n = 3) {
    for (let k = 0; k < n; k++) { const ch = torus(r, 0.3, M.iron, Y + 3 + k * 3.2); ch.rotation.z = (k - 1) * 0.1; g.add(ch); }
    g.add(box(2.4, 2.2, 1.2, M.brass, 0, Y + 5, r));
}

const gearCache = new Map();
function gearGeo(r, teeth, depth) {
    const key = `${r}/${teeth}/${depth}`;
    if (gearCache.has(key)) return gearCache.get(key);
    const s = new THREE.Shape();
    for (let i = 0; i <= teeth * 4; i++) { const t = (i / (teeth * 4)) * TAU, rr = i % 4 < 2 ? r : r - depth; i ? s.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : s.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.25, 0, TAU, true); s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false });
    geo.translate(0, 0, -0.4);
    gearCache.set(key, geo);
    return geo;
}

/** bubbles rising through a heart while the machine works */
function bubbles(c, r, y0, h, count = 16) {
    const { G, ball, glow, light, working, a } = c;
    const items = Array.from({ length: count }, (_, i) => { const b = ball(0.25 + (i % 3) * 0.12, glow(light, 0.9)); b.visible = false; return { b, x: Math.cos(i * 2.4) * r * (0.2 + (i % 5) * 0.15), z: Math.sin(i * 2.4) * r * (0.2 + (i % 5) * 0.15), ph: i / count }; });
    const g = G(); for (const it of items) g.add(it.b);
    let t0 = 0;
    a.push((dt) => {
        const on = working(); t0 += dt;
        for (const it of items) { it.b.visible = on; if (!on) continue; const f = (it.ph + t0 * 0.5) % 1; it.b.position.set(it.x + Math.sin(t0 * 3 + it.ph * 9) * 0.3, y0 + f * h, it.z); }
    });
    return g;
}

const BODIES = {
    harvester(c) {
        const { G, M, node, accent, cyl, heart, band, box, curls, lathe, torus, ball, glow, finial, gem, additive, CIRCLE, mine, a, ctx } = c;
        const g = G();
        g.add(cyl(6.9, 7.4, 1.2, M.brass, Y, 32), heart(6, 14, Y + 1.2), band(6.3, Y + 2), band(6.3, Y + 14.6));
        // the source's colour: rings at the foot and on both bands
        g.add(torus(7.55, 0.3, glow(accent, 0.9), Y + 1.3), torus(6.6, 0.26, glow(accent, 0.9), Y + 2.9), torus(6.6, 0.26, glow(accent, 0.9), Y + 15.5));
        for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + 0.3; g.add(box(0.5, 14, 0.5, M.brass, Math.cos(t) * 6.6, Y + 1.2, Math.sin(t) * 6.6)); }
        curls(g, 6.8, Y + 8.4, 3, 1.9);
        g.add(lathe([[6.6, Y + 15.2], [6.6, Y + 16], [4.8, Y + 17.2], [2, Y + 18.4], [1.1, Y + 19.2]], M.brass), cyl(0.7, 0.7, 3, M.brass, Y + 19, 12));
        const rotor = G(); rotor.position.y = Y + 22;
        rotor.add(torus(5.6, 0.45, M.gilt, 0));
        for (let i = 0; i < 7; i++) { const b = box(4.6, 0.2, 1.5, M.brass, 2.6, -0.1, 0); b.rotation.x = 0.55; const p = G(); p.rotation.y = (i / 7) * TAU; p.add(b); rotor.add(p); }
        rotor.add(torus(5.6, 0.28, glow(accent, 1), 0.55), ball(1, glow(accent, 1.6)));
        g.add(rotor);
        // a sigil in the source's colour hovers over the rotor, turning against it
        const sigil = new THREE.Mesh(new THREE.CircleGeometry(6.4, 48), mine(additive(CIRCLE.inner, accent, 0.95)));
        sigil.rotation.x = -Math.PI / 2; sigil.position.y = Y + 24.4; g.add(sigil);
        const f = finial(0.9); f.position.y = Y + 22.8; g.add(f);
        const crown = gem(accent, 0.7); crown.position.y = Y + 26.4; g.add(crown);
        if (node.locked) { for (let k = 0; k < 3; k++) { const ch = torus(7, 0.3, M.iron, Y + 5 + k * 3.5); ch.rotation.z = (k - 1) * 0.12; g.add(ch); } g.add(box(2.4, 2.2, 1.2, M.brass, 0, Y + 7.6, 7.2)); }
        else a.push((dt) => { rotor.rotation.y += dt * ctx.spin(); sigil.rotation.z -= dt * 0.6 * ctx.spin(); });   // only while harvesting
        if (node.locked) sigil.visible = false;
        return { group: g, height: Y + 27 };
    },
    centrifuge(c) {
        const { G, M, light, lathe, heart, getHeart, band, torus, cyl, box, finial, ball, glow, additive, CIRCLE, mine, busy, a, ctx } = c;
        const g = G();
        g.add(lathe([[9.6, Y], [9.6, Y + 0.8], [8.4, Y + 1.6]], M.iron), heart(7.2, 11, Y + 1.6));
        const vortex = new THREE.Mesh(new THREE.CircleGeometry(6.6, 48), mine(additive(CIRCLE.inner, light, 0.35))); vortex.rotation.x = -Math.PI / 2; g.add(vortex);
        g.add(band(7.5, Y + 2.2), band(7.5, Y + 12.2));
        const cage = G(); cage.position.y = Y + 0.8;
        cage.add(torus(9.6, 0.35, M.gilt, 0), torus(9.6, 0.35, M.gilt, 12.6));
        for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU; const rod = cyl(0.3, 0.3, 12.6, M.gilt, 0, 8); rod.position.x = Math.cos(t) * 9.6; rod.position.z = Math.sin(t) * 9.6; cage.add(rod); }
        for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU + 0.3; const fin = box(0.25, 9, 2.2, M.brass, Math.cos(t) * 8.7, 1.8, Math.sin(t) * 8.7); fin.rotation.y = -t; cage.add(fin); }
        g.add(cage);
        g.add(lathe([[7.8, Y + 12.8], [7.8, Y + 13.4], [5.8, Y + 15.2], [2.4, Y + 16.6], [1.2, Y + 17.4]], M.brass));
        const f = finial(1); f.position.y = Y + 17.2; g.add(f);
        g.add(ball(0.9, glow(light, 2.4), 0, Y + 22, 0));
        a.push((dt) => {
            const k = busy() + ctx.spin();
            cage.rotation.y += dt * 1.6 * k; vortex.rotation.z -= dt * 2.2 * k;
            vortex.position.y = Math.max(getHeart().level(), Y + 2) + 0.05;
        });
        return { group: g, height: Y + 24 };
    },
    sump(c) {
        const { G, M, light, heart, lathe, torus, box, cyl, curl, ball, tube, ownGlow, pace, a } = c;
        const g = G();
        g.add(heart(11.4, 6, Y - 1.4));
        g.add(lathe([[12.4, Y + 4.4], [12.4, Y + 5.2], [11.6, Y + 5.6]], M.stone, 64), torus(12.1, 0.3, M.brass, Y + 5.4));
        for (let i = -4; i <= 4; i++) { if (i === 0) continue; g.add(box(0.35, 0.35, Math.sqrt(Math.max(0, 11.4 ** 2 - (i * 2.4) ** 2)) * 2, M.iron, i * 2.4, Y + 5, 0)); }
        const lamps = [];
        for (let i = 0; i < 4; i++) {
            const t = (i / 4) * TAU + Math.PI / 4 + 0.4, x = Math.cos(t) * 12.6, z = Math.sin(t) * 12.6;
            g.add(cyl(0.4, 0.55, 8, M.iron, Y, 10).translateX(x).translateZ(z));
            const cu = curl(1.5); cu.position.set(x, Y + 8, z); cu.rotation.y = -t; g.add(cu);
            const l = ball(0.8, ownGlow(light, 1.6), x, Y + 8.6, z); g.add(l); lamps.push(l);
        }
        // a dredge wheel on an iron gantry, turning through the tailings while the Sump is worked
        for (const sx of [-3, 3]) g.add(tube([V(sx, Y + 4.6, -11), V(sx, Y + 9.5, -0.3), V(sx, Y + 4.6, 10.6)], 0.35, M.iron, 12));
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 12), M.brass); axle.rotation.z = Math.PI / 2; axle.position.set(0, Y + 9.2, 0); g.add(axle);
        const wheel = G(); wheel.position.set(0, Y + 9.2, 0);
        const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.3, 8, 40), M.brass); rimMesh.rotation.y = Math.PI / 2; wheel.add(rimMesh);
        for (let i = 0; i < 10; i++) { const sp = G(); sp.rotation.x = (i / 10) * TAU; sp.add(box(0.25, 6.2, 0.25, M.iron), box(4, 0.2, 1.6, M.brass, 0, 5.6, 0)); wheel.add(sp); }
        g.add(wheel);
        a.push((dt, t) => { const k = pace(); wheel.rotation.x += dt * 1.6 * k; lamps.forEach((l, i) => { l.material.emissiveIntensity = 1.6 + (1.2 + 0.8 * Math.abs(Math.sin(t * 7 + i * 1.7)) - 1.6) * k; }); });
        return { group: g, height: Y + 16 };
    },
    // an outcrop of native metal, veins running through it, under a mine's headframe
    lode(c) {
        const { G, M, color, light, cyl, torus, box, tube, mine, ownGlow, gem, gear, pace, a } = c;
        const g = G(), rock = mine(std({ color: 0x1c1a19, metalness: 0.25, roughness: 0.85, flatShading: true }));
        const boulder = (r, x, y, z, sy, turn) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rock); b.position.set(x, Y + y, z); b.scale.y = sy; b.rotation.y = turn; g.add(b); };
        boulder(6.4, -1.5, 1.5, 1, 0.72, 0.3); boulder(4.4, 4.2, 1, 3.4, 0.7, 1.1); boulder(4, -5.4, 0.8, -3.4, 0.8, 2); boulder(3, 2.6, 1, -5, 0.9, 0.7);
        // veins over the near face, bright where the metal shows
        const vein = ownGlow(color, 1.3);
        for (const [t0, t1, h0, h1] of [[-0.9, -0.2, 0.4, 5.2], [-0.3, 0.5, 0.5, 5.6], [0.4, 1.1, 0.3, 4.2], [-0.1, 0.2, 2, 6]]) {
            const at = (k) => { const t = CAM + t0 + (t1 - t0) * k, rr = 6.6 * Math.cos((h0 + (h1 - h0) * k) / 7.2) + 0.5; return V(-1.5 + Math.cos(t) * rr, Y + h0 + (h1 - h0) * k, 1 + Math.sin(t) * rr); };
            g.add(tube([at(0), at(0.3), at(0.62), at(1)], 0.32, vein, 16));
        }
        for (const [x, y, z, r] of [[1.6, 5.4, 4.4, 1], [-3.4, 6.2, 2.2, 1.3], [4.8, 3.6, 5, 0.8]]) { const n = gem(light, r); n.position.set(x, Y + y, z); g.add(n); }
        // the headframe: four legs, a winding wheel, and a bucket on its cable
        const T = Y + 19;
        for (const [x, z] of [[-8, -6], [-8, 7], [7, -7], [8, 6]]) g.add(tube([V(x, Y, z), V(x * 0.22, T, z * 0.22)], 0.45, M.brass, 2));
        g.add(torus(2.6, 0.35, M.brass, T), box(5, 0.5, 5, M.iron, 0, T, 0));
        const wheel = G(); wheel.position.y = T + 3.4; wheel.rotation.y = FRONT; g.add(wheel);
        const spin = gear(3, 20, M.gilt); wheel.add(spin, box(0.5, 3.4, 0.5, M.iron, 0, -3.4, -0.9), box(0.5, 3.4, 0.5, M.iron, 0, -3.4, 0.9));
        const cable = cyl(0.12, 0.12, 1, M.iron, 0, 6), bucket = G(); g.add(cable, bucket);
        bucket.add(cyl(1.5, 1.1, 2.2, M.brass, 0, 16), torus(1.5, 0.18, M.gilt, 2.2)); const load = gem(light, 0.8); load.position.y = 2.4; bucket.add(load);
        cable.geometry.translate(0, -cable.geometry.parameters.height / 2, 0); cable.position.set(0, T, 0);
        let p = 0;
        a.push((dt, t) => {
            const k = pace(); p += dt * 0.9 * k; spin.rotation.z = p * 3;
            const y = Y + 11 + Math.sin(p) * 3; bucket.position.y = y; cable.scale.y = T - y - 2;
            vein.emissiveIntensity = 1.3 + (0.6 + 0.6 * Math.sin(t * 3)) * k;
        });
        return { group: g, height: T + 7 };
    },
    hopper(c) {
        const { G, M, accent, heart, band, lathe, tube, torus, rivets, glow } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(heart(r, h, y), band(r + 0.3, y + 0.6), band(r + 0.3, top - 0.4));
        g.add(lathe([[r + 0.4, top + 0.2], [r + 1.2, top + 1], [11, top + 8], [11.6, top + 8.6], [11.6, top + 9.4]], M.brass, 48));
        for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; g.add(tube([V(Math.cos(t) * (r + 1.2), top + 1, Math.sin(t) * (r + 1.2)), V(Math.cos(t) * 11.2, top + 8.4, Math.sin(t) * 11.2)], 0.25, M.gilt, 2)); }
        g.add(torus(11.6, 0.4, M.gilt, top + 9.4), rivets(11.6, top + 8.9, 26), torus(11.7, 0.16, glow(accent, 1.6), top + 9.9), torus(r + 0.5, 0.14, glow(accent, 1.4), top + 0.3));
        // struts 45° either side of the camera's line, clear of the glass
        for (let i = 0; i < 4; i++) { const t = CAM + Math.PI / 4 + (i * Math.PI) / 2; g.add(tube([V(Math.cos(t) * 8.8, PLINTH_H, Math.sin(t) * 8.8), V(Math.cos(t) * 9.8, y + h * 0.8, Math.sin(t) * 9.8), V(Math.cos(t) * 11.2, top + 8.6, Math.sin(t) * 11.2)], 0.45, M.iron, 12)); }
        return { group: g, height: top + 11 };
    },
    athanor(c) {
        const { G, M, light, cyl, heart, band, box, curls, lathe, runeBand, gem, finial, ball, busy, pace, a } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(cyl(r + 0.6, r + 1.2, y - PLINTH_H, M.iron, PLINTH_H, 32), heart(r, h, y), band(r + 0.3, y + 0.6, 0.8), band(r + 0.3, top - 0.4, 0.8));
        // the fractionating tower above the heart: a brass column ringed with bands
        const colR = 3.4, colH = 12, colY = top + 1.4, T = colY + colH;
        g.add(cyl(r + 0.3, colR, 1.4, M.brass, top, 32), cyl(colR, colR, colH, M.brass, colY, 32, true));
        for (let i = 0; i < 4; i++) g.add(band(colR + 0.2, colY + 1.6 + i * 2.9, 0.6));
        curls(g, colR + 0.4, colY + colH / 2, 4, 1.4);
        g.add(lathe([[colR + 0.6, T], [colR + 0.6, T + 1], [2.6, T + 2.2], [1.4, T + 3.4], [0.8, T + 4.2]], M.brass), runeBand(colR + 0.3, T + 0.5, 0.9, light, 2));
        const crown = gem(light, 1.3); crown.position.y = T + 7; g.add(crown);
        const f = finial(0.8); f.position.y = T + 4; g.add(f);
        g.add(bubbles(c, r - 0.6, y + 0.6, h - 1));
        // a flywheel and piston round the back, driving the column while it works
        const fw = G(); fw.position.set(6.4, PLINTH_H + 9, -6.4); fw.rotation.y = FRONT; g.add(fw);
        fw.add(box(0.8, 9, 0.8, M.iron, 0, -9, -1.2));
        const wheel = G(); wheel.position.z = 0.6; fw.add(wheel);
        wheel.add(new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.45, 8, 32), M.iron));
        for (let i = 0; i < 6; i++) { const pv = G(); pv.rotation.z = (i / 6) * TAU; pv.add(box(0.3, 3.2, 0.3, M.brass)); wheel.add(pv); }
        wheel.add(ball(0.6, M.gilt), ball(0.4, M.gilt, 2.4, 0, 0.4));
        const rod = box(0.35, 1, 0.35, M.brass); rod.geometry.translate(0, -0.5, 0); fw.add(rod);
        const piston = G(); fw.add(piston);
        piston.add(cyl(0.9, 0.9, 2.2, M.iron, 0, 16));
        fw.add(cyl(1.1, 1.1, 4, M.glass, 4.6, 16, true));
        let ang = 0;
        a.push((dt) => {
            const k = pace();
            ang += dt * 4 * k; wheel.rotation.z = ang;
            const px = Math.cos(ang) * 2.4, py = Math.sin(ang) * 2.4, tp = 5.2 + py * 0.5 + 1.2;
            piston.position.set(0, tp, 0.6);
            const dx = 0 - px, dy = tp - py, L = Math.hypot(dx, dy); rod.position.set(px / 2, (py + tp) / 2, 0.9); rod.scale.y = L; rod.rotation.z = Math.atan2(-dx, dy);
            crown.rotation.y += dt * busy();
        });
        return { group: g, height: T + 9 };
    },
    // an anvil on the heart's lid, a trip hammer behind it, and a jointed armature growing on its horn
    anvil(c) {
        const { G, M, accent, light, heart, band, torus, lathe, cyl, box, ball, tube, rivets, glow, mine, DOT, working, pace, a } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(cyl(r + 0.6, r + 1.2, y - PLINTH_H, M.iron, PLINTH_H, 32), heart(r, h, y), band(r + 0.3, y + 0.6, 0.8), band(r + 0.3, top - 0.4, 0.8), torus(r + 0.4, 0.14, glow(accent, 1.4), top + 0.3), rivets(r + 0.3, y + 0.4, 22));
        g.add(lathe([[r + 0.5, top], [r + 0.5, top + 0.8], [4.4, top + 1.6]], M.iron, 40));
        // everything above turns so +x looks at the camera: the anvil lies across its view
        const steel = mine(std({ color: 0x8b929c, metalness: 0.9, roughness: 0.34 }));
        const s = G(); s.rotation.y = -CAM; s.position.y = top + 1.4; g.add(s);
        s.add(box(5, 1.2, 6.4, steel, 0, 0, 0), box(2.8, 2.2, 3.4, steel, 0, 1.2, 0), box(4.2, 2.2, 8.4, steel, 0, 3.4, -0.6), box(4.4, 0.35, 8.6, M.gilt, 0, 5.6, -0.6));
        const horn = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 20), steel); horn.rotation.x = Math.PI / 2; horn.position.set(0, 4.6, 6); s.add(horn);
        // the armature: rods and joints, standing on the face
        const J = [[0, 6, 2.6], [0, 9.6, 4.6], [-0.6, 13, 2.4], [0.5, 12.4, 7.2], [0, 16, 4.8], [0.4, 8.6, 8.2]].map((p) => V(...p));
        for (const [i, k] of [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [1, 5]]) s.add(tube([J[i], J[k]], 0.26, M.copper, 1));
        const joint = mine(std({ color: 0x050505, emissive: new THREE.Color(accent), emissiveIntensity: 1.2 })), joints = J.map((p) => { const b = ball(0.42, joint, p.x, p.y, p.z); s.add(b); return b; });
        // the trip hammer, on two posts round the back
        for (const z of [-3.2, 0.4]) s.add(box(0.9, top + 10 - PLINTH_H, 0.9, M.iron, -8.4, PLINTH_H - top - 1.4, z));
        s.add(box(1.2, 0.8, 5, M.brass, -8.4, 8.8, -1.4));
        const arm = G(); arm.position.set(-8.4, 8.4, -1.4); s.add(arm);
        arm.add(box(10, 0.7, 0.7, M.wood, 4.4, -0.35, 0), box(2.2, 2.8, 2.2, M.iron, 8.4, -2.4, 0), box(2.4, 0.4, 2.4, M.gilt, 8.4, 0.2, 0), box(1.6, 0.8, 1.6, M.brass, -0.6, -0.4, 0));
        const spark = new THREE.Sprite(mine(new THREE.SpriteMaterial({ map: DOT, color: light, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))); spark.position.set(0, 6.4, -1.4); s.add(spark);
        let hp = 0.5;
        a.push((dt) => {
            const k = pace(), on = working();
            hp = (hp + dt * 1.2 * k) % 1;
            const up = hp < 0.12 ? 1 - hp / 0.12 : (hp - 0.12) / 0.88;         // falls fast, lifts slowly
            arm.rotation.z = 0.06 + 0.34 * (on || k > 0 ? up * k + 0.5 * (1 - k) : 0.5);
            const hit = hp > 0.1 && hp < 0.3 ? 1 - (hp - 0.1) / 0.2 : 0;
            spark.material.opacity = 0.8 * hit * k; spark.scale.setScalar(3 + 6 * (1 - hit));
            joint.emissiveIntensity = 1.2 + 2 * hit * k;
            joints.forEach((b, i) => b.scale.setScalar(1 + 0.25 * hit * k * (i % 2)));
        });
        return { group: g, height: top + 19 };
    },
    crucible(c) {
        const { G, M, color, accent, heart, cyl, tube, ball, torus, rivets, box, glow, gear, mine, pace, a } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(cyl(r + 0.8, r + 1.4, y - PLINTH_H, M.iron, PLINTH_H, 40), heart(r, h, y));
        // three iron legs, all round the back
        for (const off of [-1.1, 0, 1.1]) {
            const t = away(off);
            g.add(tube([V(Math.cos(t) * 9.4, PLINTH_H, Math.sin(t) * 9.4), V(Math.cos(t) * 9.4, PLINTH_H + 3, Math.sin(t) * 9.4), V(Math.cos(t) * 7.6, y + h * 0.4, Math.sin(t) * 7.6), V(Math.cos(t) * 7.2, top - 0.6, Math.sin(t) * 7.2), V(Math.cos(t) * (r + 0.6), top + 0.2, Math.sin(t) * (r + 0.6))], 0.6, M.iron, 24));
            g.add(ball(1.1, M.gilt, Math.cos(t) * 9.4, PLINTH_H + 0.6, Math.sin(t) * 9.4));
        }
        // the heating coil stands beside the crucible (a spring of copper), clear of the glass
        const ct = CAM + Math.PI / 2, cx = Math.cos(ct) * 9.6, cz = Math.sin(ct) * 9.6, coilR = 2.2;
        const coil = []; for (let i = 0; i <= 150; i++) { const t = i / 150, an = t * 6 * TAU; coil.push(V(cx + Math.cos(an) * coilR, PLINTH_H + 0.6 + t * (h - 0.6), cz + Math.sin(an) * coilR)); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 400, 0.4, 8), mine(std({ color: 0xc06a3e, metalness: 1, roughness: 0.3, emissive: new THREE.Color(color), emissiveIntensity: 0.15 }))));
        g.add(tube([V(cx, top, cz), V(cx * 0.8, top + 1.2, cz * 0.8), V(Math.cos(ct) * (r + 0.4), top + 0.4, Math.sin(ct) * (r + 0.4))], 0.35, M.copper, 12));
        // light that climbs the coil's rings now and then while it works
        const climb = Array.from({ length: 5 }, (_, i) => { const m = torus(coilR, 0.45, mine(std({ color: 0x050505, emissive: new THREE.Color(color), emissiveIntensity: 0, transparent: true, opacity: 0.85 })), PLINTH_H + 1.4 + i * 2.2); m.position.x = cx; m.position.z = cz; g.add(m); return m; });
        g.add(torus(r + 0.3, 0.4, M.gilt, top), rivets(r + 0.3, y + 0.4, 22), torus(r + 0.4, 0.14, glow(accent, 1.6), top + 0.5));
        // a geared stirrer on a gantry, turning in the melt while it works
        for (const sx of [-1, 1]) g.add(tube([V(sx * 9.4, PLINTH_H, 0), V(sx * 8.6, top + 2.6, 0), V(sx * 4, top + 7.6, 0)], 0.4, M.iron, 12));
        g.add(box(9, 0.8, 1.2, M.brass, 0, top + 7.4, 0));
        const stir = G(); stir.position.y = top + 7.8; g.add(stir);
        stir.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), M.iron).translateY(-4.5), box(3.6, 0.5, 0.3, M.iron, 0, -8.6, 0));
        const g1 = gear(1.8, 12); g1.rotation.x = -Math.PI / 2; g1.position.y = 0.6; stir.add(g1);
        const g2 = gear(1.2, 8, M.gilt); g2.rotation.x = -Math.PI / 2; g2.position.set(2.9, top + 8.4, 0); g.add(g2);
        let cp = 0;
        a.push((dt) => {
            const k = pace(); cp += dt * 0.9 * k;
            climb.forEach((m, i) => { const f = (cp - i * 0.14) % 1.8; m.material.emissiveIntensity = f > 0 && f < 0.35 ? Math.sin((f / 0.35) * Math.PI) * 1.2 * k : 0; });
            stir.rotation.y += dt * 2.4 * k; g2.rotation.z -= dt * 3.6 * k;
        });
        return { group: g, height: top + 10.6 };
    },
    arena(c) {
        const { G, M, color, accent, heart, band, torus, box, glow } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(heart(r, h, y), band(r + 0.3, y + 0.6, 0.9), band(r + 0.3, top - 0.4, 0.9), torus(r + 0.4, 0.14, glow(accent, 1.6), top + 0.2));
        // a ring of standing stones, open toward the camera
        for (let i = 0; i < 8; i++) {
            const off = (i / 8) * TAU + Math.PI / 8, t = CAM + off;
            if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < 1.2) continue; // the ones in front would hide the glass
            const hh = 9 + (i % 3) * 1.6;
            const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, hh, 1.5), M.stone); st.position.set(Math.cos(t) * 10, PLINTH_H + hh / 2, Math.sin(t) * 10); st.rotation.y = -t + Math.PI / 2; g.add(st);
            const cap = box(2.8, 0.5, 1.9, M.brass); cap.position.set(Math.cos(t) * 10, PLINTH_H + hh, Math.sin(t) * 10); cap.rotation.y = -t + Math.PI / 2; g.add(cap);
            const rr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, hh * 0.7), glow(color, 1.6)); rr.position.set(Math.cos(t) * 9.2, PLINTH_H + hh / 2, Math.sin(t) * 9.2); rr.lookAt(0, rr.position.y, 0); g.add(rr);
        }
        return { group: g, height: top + 2 };
    },
    treasury(c) {
        const { G, M, light, accent, heart, box, finial, gem, torus, glow } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(heart(r, h, y), torus(r + 0.3, 0.14, glow(accent, 1.6), top - 0.2));
        // the casket, turned so its corner posts frame the glass instead of crossing it
        const deco = G(); deco.rotation.y = SQUARE_TURN; g.add(deco);
        const q = 6.4, postH = top + 0.6 - (PLINTH_H + 0.8);
        deco.add(box(14, 0.8, 14, M.wood, 0, PLINTH_H, 0), box(14.4, 0.3, 14.4, M.gilt, 0, PLINTH_H + 0.8, 0));
        for (const x of [-q, q]) for (const z of [-q, q]) { deco.add(box(0.9, postH, 0.9, M.gilt, x, PLINTH_H + 0.8, z)); const f = finial(0.5); f.position.set(x, top + 1.4, z); deco.add(f); const gm2 = gem(accent, 0.45); gm2.position.set(x, top + 4, z); deco.add(gm2); }
        for (const ry of [0, Math.PI / 2]) { const arch = new THREE.Mesh(new THREE.TorusGeometry(q, 0.35, 8, 32, Math.PI), M.gilt); arch.position.y = top + 1.4; arch.rotation.y = ry; deco.add(arch); }
        deco.add(box(2 * q + 0.4, 0.4, 0.4, M.gilt, 0, top + 1.2, q), box(2 * q + 0.4, 0.4, 0.4, M.gilt, 0, top + 1.2, -q), box(0.4, 0.4, 2 * q + 0.4, M.gilt, q, top + 1.2, 0), box(0.4, 0.4, 2 * q + 0.4, M.gilt, -q, top + 1.2, 0));
        const gm = gem(light, 1); gm.position.y = top + 8; g.add(gm);
        return { group: g, height: top + 10 };
    },
    archive(c) {
        const { G, M, accent, heart, band, box, torus, glow, curl } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP;
        g.add(heart(r, h, y), band(r + 0.3, y + 0.6, 0.8), band(r + 0.3, top - 0.4, 0.8), torus(r + 0.35, 0.14, glow(accent, 1.6), top));
        // the shelving, turned so its open side faces the camera
        const deco = G(); deco.rotation.y = SQUARE_TURN; g.add(deco);
        const Y = PLINTH_H;
        for (const x of [-8, 8]) for (const z of [-8, 8]) deco.add(box(0.7, 17, 0.7, M.iron, x, Y, z));
        for (let s = 0; s < 3; s++) for (const [x, z, w, d] of [[0, -8, 16.6, 3], [-8, 0, 3, 16.6], [8, 0, 3, 16.6]]) deco.add(box(w, 0.35, d, M.iron, x, Y + 2 + s * 5.4, z));
        let k = 0;
        for (let s = 0; s < 3; s++) for (const [x, z] of [[-4, -8], [4, -8], [-8, -3], [-8, 3], [8, -3], [8, 3]]) { if ((k++ * 5) % 7 > 4) continue; deco.add(box(2.6, 3, 2.4, M.wood, x, Y + 2.35 + s * 5.4, z), box(2.7, 0.25, 2.5, M.brass, x, Y + 3.8 + s * 5.4, z)); }
        deco.add(box(17.4, 0.6, 17.4, M.iron, 0, Y + 17, 0), box(17.6, 0.2, 0.2, glow(accent, 1.4), 0, Y + 17.6, 8.8), box(0.2, 0.2, 17.6, glow(accent, 1.4), 8.8, Y + 17.6, 0));
        const c1 = curl(2.2); c1.position.set(-2, Y + 19.6, 0); deco.add(c1); const c2 = curl(2.2); c2.scale.x = -1; c2.position.set(2, Y + 19.6, 0); deco.add(c2);
        return { group: g, height: PLINTH_H + 22 };
    },
    necropolis(c) {
        const { G, M, accent, heart, lathe, cyl, box, finial, gem, torus, glow } = c;
        const g = G(), { r, h, y } = CORE, top = CORE_TOP, Y = PLINTH_H;
        g.add(heart(r, h, y), lathe([[0, Y], [r + 0.6, Y], [r + 0.6, y], [r + 0.1, y]], M.stone, 40), lathe([[r + 0.1, top], [r + 0.6, top + 0.6], [3, top + 1.8], [1.4, top + 2.2]], M.stone, 40));
        // a portico of columns round the back, open toward the camera
        const colH = top + 2.8 - Y;
        for (const off of [-1.26, -0.63, 0, 0.63, 1.26]) { const t = away(off); g.add(cyl(0.55, 0.6, colH, M.stone, Y, 12).translateX(Math.cos(t) * 8).translateZ(Math.sin(t) * 8), box(1.4, 0.5, 1.4, M.gilt, Math.cos(t) * 8, Y + colH, Math.sin(t) * 8)); }
        g.add(cyl(9.4, 9.4, 1, M.stone, Y + colH + 0.5, 6), new THREE.Mesh(new THREE.CylinderGeometry(0.5, 9.6, 4, 6), M.stone).translateY(Y + colH + 3.5));
        const f = finial(0.6); f.position.y = Y + colH + 5.4; g.add(f);
        const gm = gem(accent, 0.8); gm.position.y = Y + colH + 10.6; g.add(gm);
        g.add(torus(r + 0.35, 0.14, glow(accent, 1.4), top - 0.4));
        return { group: g, height: Y + colH + 12 };
    },
    codex(c) {
        const { G, M, box, cyl, gear, curl, liquidMat, mine, working, pace, ctx, a } = c;
        const g = G();
        g.add(box(12, 18, 6, M.wood, 0, Y, -0.4), box(11, 16, 0.2, M.glass, 0, Y + 1, 2.75));
        for (let s = 0; s < 3; s++) g.add(box(11, 0.4, 5, M.brass, 0, Y + 1.2 + s * 5.4, 0));
        // one jar per entity (up to nine shown), its lid lighting in turn while the Codex is open
        const kinds = ['#c86bf0', '#3ccf8e', '#4fb3ff'];
        const jars = [];
        for (let i = 0; i < 9; i++) {
            const s = Math.floor(i / 3), j = i % 3, jar = G(); jar.position.set(-3.6 + j * 3.6, Y + 1.6 + s * 5.4, 0.8);
            const lid = cyl(1.3, 1.3, 0.5, mine(std({ color: 0xb08646, metalness: 1, roughness: 0.3, emissive: new THREE.Color(kinds[i % 3]), emissiveIntensity: 0 })), 3.2, 16);
            jar.add(cyl(1.2, 1.2, 3.2, M.glass, 0, 16, true), cyl(1, 1, 2.2, liquidMat(kinds[i % 3]), 0.1, 16), lid);
            jar.userData.y = jar.position.y;
            g.add(jar); jars.push({ jar, lid });
        }
        g.add(box(13, 1, 7, M.gilt, 0, Y + 18, 0));
        const cg = [gear(2.2, 14), gear(1.4, 9, M.gilt), gear(1.0, 7)];
        cg[0].position.set(-1.2, Y + 22.4, 0.6); cg[1].position.set(2.25, Y + 22.4, 0.6); cg[2].position.set(2.25, Y + 24.8, 0.6);
        for (const x of cg) g.add(x);
        a.push((dt, t) => {
            const on = working(), sp = 1.2 * pace(), shown = Math.min(9, ctx.entities());
            cg[0].rotation.z += dt * sp; cg[1].rotation.z -= dt * sp * (2.2 / 1.4); cg[2].rotation.z += dt * sp * 2.2;
            jars.forEach(({ jar, lid }, i) => {
                jar.visible = i < shown;
                const f = (t * 1.2 - i * 0.25) % 2, up = on && f > 0 && f < 0.4;
                lid.material.emissiveIntensity = up ? 1.5 : 0; jar.position.y = jar.userData.y + (up ? 0.3 : 0);
            });
        });
        return { group: g, height: Y + 27 };
    },
    // an assay balance: two pans on a beam, over a drawer of weights
    assayer(c) {
        const { G, M, node, color, light, box, lathe, cyl, torus, tube, ball, finial, gem, pace, a } = c;
        const g = G(), T = Y + 17;
        const s = G(); s.rotation.y = Math.PI / 2 - CAM; g.add(s);   // the beam lies across the camera's view
        s.add(box(13, 2.2, 7, M.wood, 0, Y, 0), box(13.6, 0.4, 7.6, M.gilt, 0, Y + 2.2, 0), ball(0.4, M.gilt, 0, Y + 1.1, 3.7));
        s.add(lathe([[2.4, Y + 2.6], [2, Y + 3.2], [0.8, Y + 4.4], [0.6, T - 1], [1.2, T]], M.brass, 24));
        const beam = G(); beam.position.y = T; s.add(beam);
        beam.add(tube([V(-7, -0.4, 0), V(-3.5, 0.7, 0), V(0, 0.2, 0), V(3.5, 0.7, 0), V(7, -0.4, 0)], 0.34, M.gilt, 32), box(0.2, 5, 0.2, M.iron, 0, -5, 0.7));
        const pans = [-7, 7].map((x) => {
            const p = G(); p.position.set(x, -0.4, 0); beam.add(p);
            for (let i = 0; i < 3; i++) { const t = (i / 3) * TAU; p.add(tube([V(0, 0, 0), V(Math.cos(t) * 2.5, -7.4, Math.sin(t) * 2.5)], 0.09, M.brass, 1)); }
            p.add(lathe([[0, -8.2], [1.6, -8], [2.6, -7.4]], M.brass, 28), torus(2.6, 0.14, M.gilt, -7.4));
            return p;
        });
        const sample = gem(light, 0.9); sample.position.y = -6.9; pans[0].add(sample);
        pans[1].add(cyl(0.7, 0.8, 1.4, M.gilt, -8, 16), cyl(0.25, 0.25, 0.6, M.gilt, -6.6, 8));
        const f = finial(0.8); f.position.y = T + 0.6; s.add(f);
        if (node.locked) chain(c, g, 7.4);
        let p = 0;
        a.push((dt) => { const k = pace(); p += dt * 2 * k; beam.rotation.z = 0.1 + Math.sin(p) * 0.14 * k; for (const q of pans) q.rotation.z = -beam.rotation.z; sample.rotation.y += dt * k; });
        return { group: g, height: T + 4 };
    },
    // the Sanctum's machines not built yet: chained shut, like the Net's
    // a round colonnade over an amphora
    agora(c) {
        const { G, M, cyl, lathe, box, torus, tube, node } = c;
        const g = G();
        for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; g.add(cyl(0.5, 0.6, 13, M.stone, Y, 12).translateX(Math.cos(t) * 7).translateZ(Math.sin(t) * 7)); }
        g.add(torus(7, 0.5, M.gilt, Y + 13.2), torus(7, 0.3, M.gilt, Y + 14.2), torus(7.4, 0.25, M.iron, Y + 0.3));
        g.add(lathe([[0, Y], [2, Y], [1.6, Y + 1], [3.4, Y + 4.4], [3.6, Y + 6.6], [1.7, Y + 9.6], [1.3, Y + 11.4], [2, Y + 12.2]], M.brass, 40));
        for (const s of [-1, 1]) g.add(tube([V(s * 1.4, Y + 11, 0), V(s * 3.6, Y + 11.4, 0), V(s * 4.2, Y + 8.6, 0), V(s * 3.4, Y + 6.8, 0)], 0.28, M.gilt, 24));
        if (node.locked) chain(c, g, 7.6);
        return { group: g, height: Y + 15 };
    },
    // an orrery of three linked rings: adventure, site and party (with its players)
    complex(c) {
        const { G, M, color, light, cyl, torus, lathe, tube, gem, finial, additive, CIRCLE, mine, ownGlow, busy, a } = c;
        const g = G(), cy = Y + 13;
        g.add(lathe([[5.4, Y], [5, Y + 0.8], [2, Y + 1.8], [1.1, Y + 5], [1.7, Y + 6], [0.8, Y + 7]], M.brass, 40));
        for (let i = 0; i < 3; i++) { const t = (i / 3) * TAU; g.add(tube([V(0, Y + 6, 0), V(Math.cos(t) * 2.6, Y + 7.6, Math.sin(t) * 2.6), V(Math.cos(t) * 4.4, Y + 10, Math.sin(t) * 4.4)], 0.3, M.gilt, 18)); }
        const spin = G(); spin.position.y = cy; g.add(spin);
        const rings = [[0, color, 4.6], [TAU / 3, '#06b6d4', 3.8], [(2 * TAU) / 3, '#3b82f6', 3.8]].map(([t, col, R], k) => {
            const hold = G(); hold.position.set(Math.cos(t) * 3.4, 0, Math.sin(t) * 3.4); hold.rotation.set(0.5 + k, t, 0.35 * k); spin.add(hold);
            hold.add(torus(R, 0.34, k ? M.brass : M.gilt, 0), torus(R - 0.5, 0.1, mine(ownGlow(col, 1.6)), 0));
            const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.6, 48), mine(additive(CIRCLE.inner, col, 0.5))); disc.rotation.x = -Math.PI / 2; hold.add(disc);
            const core = gem(col, 1.1); hold.add(core);
            return { hold, core };
        });
        for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU, orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), mine(ownGlow('#9fc2ff', 1.2))); orb.position.set(Math.cos(t) * 3.8, 0, Math.sin(t) * 3.8); rings[2].hold.add(orb); }
        const f = finial(0.6); f.position.y = cy + 6.6; g.add(f);
        a.push((dt) => { const k = busy(); spin.rotation.y += dt * 0.22 * k; rings.forEach((r, i) => { r.hold.rotation.y += dt * (0.3 + i * 0.12) * k; r.core.rotation.y -= dt * k; }); });
        return { group: g, height: Y + 22 };
    },
    // twelve standing figures (the archetypes) around a brazier
    cohort(c) {
        const { G, M, color, cyl, torus, lathe, gem, light, additive, RUNES, mine, busy, a } = c;
        const g = G(), turn = G();
        g.add(cyl(8.4, 8.8, 0.8, M.stone, Y, 48), torus(8.4, 0.25, M.gilt, Y + 0.9), turn);
        for (let i = 0; i < 12; i++) {
            const t = (i / 12) * TAU, x = Math.cos(t) * 6.9, z = Math.sin(t) * 6.9, h = i % 3 === 0 ? 1.6 : 0;
            const robe = lathe([[1.25, 0], [1.05, 1], [0.6, 5 + h], [0.75, 6.2 + h], [0.3, 7 + h]], i % 2 ? M.silver : M.brass, 16);
            robe.position.set(x, Y + 0.8, z);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), i % 2 ? M.silver : M.brass);
            head.position.set(x, Y + 8.5 + h, z);
            turn.add(robe, head);
        }
        const face = new THREE.Mesh(new THREE.RingGeometry(3.2, 5.4, 64), mine(additive(RUNES, light, 0.6))); face.rotation.x = -Math.PI / 2; face.position.y = Y + 0.95; g.add(face);
        g.add(lathe([[2, Y + 0.8], [0.9, Y + 1.6], [0.7, Y + 6], [2.2, Y + 8], [2.4, Y + 8.6]], M.gilt, 32));
        const flame = gem(color, 1.8); flame.position.y = Y + 11.6; flame.scale.y = 1.6; g.add(flame);
        a.push((dt) => { const k = busy(); turn.rotation.y += dt * 0.15 * k; face.rotation.z -= dt * 0.3 * k; flame.rotation.y += dt * 0.6 * k; });
        return { group: g, height: Y + 16 };
    },
    // a glass case of shelves, a gear over it
    inventory(c) {
        const { G, M, box, cyl, gear, gem, node } = c;
        const g = G();
        for (const x of [-5.6, 5.6]) for (const z of [-3, 3]) g.add(cyl(0.3, 0.3, 17, M.silver, Y, 10).translateX(x).translateZ(z));
        g.add(box(11.4, 16.6, 0.2, M.glass, 0, Y + 0.2, 3), box(11.4, 16.6, 0.2, M.glass, 0, Y + 0.2, -3));
        for (let s = 0; s < 3; s++) {
            g.add(box(11.6, 0.3, 6.4, M.silver, 0, Y + 0.6 + s * 5.5, 0));
            for (let j = 0; j < 3; j++) {
                const x = -3.6 + j * 3.6, y = Y + 2.8 + s * 5.5;
                const thing = (s + j) % 3 === 0 ? gem('#cfd6e0', 1.2) : (s + j) % 3 === 1 ? gear(1.3, 10) : box(2, 2, 2, M.brass, 0, -1, 0);
                thing.position.x += x; thing.position.y += y; g.add(thing);
            }
        }
        g.add(box(12.4, 0.6, 7, M.silver, 0, Y + 17, 0));
        const top = gear(2.4, 14); top.position.set(0, Y + 20.4, 0); g.add(top);
        if (node.locked) chain(c, g, 7.2);
        return { group: g, height: Y + 23 };
    },
    // a domed rotunda with an open eye
    pantheon(c) {
        const { G, M, light, cyl, torus, lathe, gem, additive, CIRCLE, mine, node, pace, a } = c;
        const g = G();
        g.add(cyl(8, 8.4, 0.8, M.stone, Y, 40), cyl(7.4, 7.6, 0.8, M.stone, Y + 0.8, 40));
        for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU; g.add(cyl(0.45, 0.55, 10, M.stone, Y + 1.6, 12).translateX(Math.cos(t) * 6.6).translateZ(Math.sin(t) * 6.6)); }
        g.add(cyl(7.4, 7.4, 1.2, M.stone, Y + 11.6, 40));
        const dome = [];
        for (let i = 0; i <= 14; i++) { const t = (i / 14) * 1.32; dome.push([Math.cos(t) * 7, Y + 12.8 + Math.sin(t) * 5.4]); }
        g.add(lathe(dome, M.silver, 48), torus(1.75, 0.3, M.gilt, Y + 18.1));
        const eye = gem('#f2f3f5', 1.3); eye.position.y = Y + 20.6; g.add(eye);
        // a circle turns on the temple's floor, and the eye over it, while it's worked
        const circle = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48), mine(additive(CIRCLE.inner, light, 0.5))); circle.rotation.x = -Math.PI / 2; circle.position.y = Y + 1.75; g.add(circle);
        a.push((dt) => { const k = pace(); circle.rotation.z += dt * k; circle.material.opacity = 0.5 + 0.5 * k; eye.rotation.y += dt * 1.5 * k; });
        if (node.locked) chain(c, g, 7.8);
        return { group: g, height: Y + 22 };
    },
    // a tree whose branches end in gems
    mastery(c) {
        const { G, M, tube, gem, torus, node } = c;
        const g = G();
        g.add(tube([V(0, Y, 0), V(0.4, Y + 3, 0), V(-0.3, Y + 6, 0), V(0, Y + 9, 0)], 0.9, M.brass, 32), torus(5, 0.25, M.gilt, Y + 0.3));
        for (let i = 0; i < 7; i++) {
            const t = (i / 7) * TAU, up = i % 2 ? 17 : 14, out = i % 2 ? 4.4 : 6.4;
            const end = V(Math.cos(t) * out, Y + up, Math.sin(t) * out);
            g.add(tube([V(0, Y + 6 + (i % 3), 0), V(Math.cos(t) * out * 0.4, Y + 9.5, Math.sin(t) * out * 0.4), V(Math.cos(t) * out * 0.9, Y + up - 3, Math.sin(t) * out * 0.9), end], 0.32, M.brass, 28));
            const gm = gem('#ffffff', 1); gm.position.copy(end).setY(end.y + 1); g.add(gm);
        }
        const crown = gem('#ffffff', 1.5); crown.position.y = Y + 20; g.add(tube([V(0, Y + 8, 0), V(0.3, Y + 14, 0), V(0, Y + 18.6, 0)], 0.4, M.brass, 24), crown);
        if (node.locked) chain(c, g, 5.6, 2);
        return { group: g, height: Y + 22 };
    },
    nexus(c) {
        const { G, M, color, light, lathe, band, tube, torus, finial, additive, RUNES, mine, busy, ctx, a } = c;
        const g = G();
        g.add(lathe([[6, Y], [3, Y + 1], [2.2, Y + 7], [3.6, Y + 8], [5.2, Y + 8.6], [5.2, Y + 9.4]], M.brass, 48), band(2.6, Y + 4, 1));
        const cage = G(); cage.position.y = Y + 9.4;
        for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; cage.add(tube([V(Math.cos(t) * 4.8, 0, Math.sin(t) * 4.8), V(Math.cos(t) * 6.2, 6, Math.sin(t) * 6.2), V(Math.cos(t) * 3, 12.5, Math.sin(t) * 3)], 0.3, M.gilt, 16)); }
        cage.add(torus(5.2, 0.35, M.gilt, 0), torus(3.2, 0.35, M.gilt, 12.5));
        const prismMat = mine(std({ color: 0xdffcff, emissive: new THREE.Color(color), emissiveIntensity: 2, roughness: 0.05, metalness: 0.1 }));
        const prism = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), prismMat); prism.position.y = 6.2; prism.scale.y = 1.5; cage.add(prism);
        const lens1 = G(), lens2 = G(); lens1.position.y = lens2.position.y = 6.2;
        lens1.add(new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.28, 8, 64), M.gilt), new THREE.Mesh(new THREE.CircleGeometry(7.4, 48), M.glass));
        lens2.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.22, 8, 64), M.brass), new THREE.Mesh(new THREE.RingGeometry(8.6, 9, 64), mine(additive(RUNES, light, 0.5))));
        cage.add(lens1, lens2); g.add(cage);
        const f = finial(0.8); f.position.y = Y + 22; g.add(f);
        const base = new THREE.Color(color), amber = new THREE.Color('#f2a33a');
        let lt = 0;
        a.push((dt, t) => {
            const k = busy(); lt += dt * k * 0.3;
            lens1.rotation.y += dt * 0.7 * k; lens1.rotation.x = Math.sin(lt * 1.6) * 0.6; lens2.rotation.x += dt * 0.4 * k; lens2.rotation.z = Math.cos(lt * 1.3) * 0.5; prism.rotation.y += dt * 0.8 * k;
            // a filter draft waits in the Nexus: the prism dims and pulses amber
            if (ctx.pending()) { prismMat.emissive.copy(amber); prismMat.emissiveIntensity = 0.6 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4)); }
            else { prismMat.emissive.copy(base); prismMat.emissiveIntensity = 2; }
        });
        return { group: g, height: Y + 26 };
    },
    atlas(c) {
        const { G, M, light, lathe, tube, curl, torus, box, gem, finial, cyl, additive, RUNES, mine, S, pace, a } = c;
        const g = G(), R = 7, cy = Y + 15;
        g.add(lathe([[5.4, Y], [5, Y + 0.8], [2.2, Y + 1.6], [1.4, Y + 3.4], [2, Y + 4]], M.brass, 40));
        for (let i = 0; i < 4; i++) { const t = (i / 4) * TAU + Math.PI / 4; g.add(tube([V(Math.cos(t) * 1.6, Y + 3.6, Math.sin(t) * 1.6), V(Math.cos(t) * 5, Y + 6, Math.sin(t) * 5), V(Math.cos(t) * 8.4, Y + 10, Math.sin(t) * 8.4), V(Math.cos(t) * 8.8, cy - 0.2, Math.sin(t) * 8.8)], 0.32, M.brass, 20)); const cu = curl(1.4); cu.position.set(Math.cos(t) * 6.4, Y + 6.6, Math.sin(t) * 6.4); cu.rotation.y = -t + Math.PI / 2; g.add(cu); }
        const horizon = G(); horizon.position.y = cy; g.add(horizon);
        const hFace = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, R + 2.2, 64), mine(additive(RUNES, light, 0.55))); hFace.rotation.x = -Math.PI / 2; horizon.add(hFace);
        horizon.add(torus(R + 0.8, 0.22, M.gilt, 0), torus(R + 2.2, 0.3, M.gilt, 0));
        const merid = G(); merid.position.y = cy; g.add(merid);
        const tilt = G(); tilt.rotation.z = 0.41; merid.add(tilt);
        tilt.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.5, 0.35, 8, 72), M.gilt));
        for (let i = 0; i < 36; i++) { const t = (i / 36) * TAU, tick = box(0.12, i % 9 ? 0.5 : 1, 0.6, M.brass); tick.position.set(Math.cos(t) * (R + 0.9), Math.sin(t) * (R + 0.9), 0); tick.rotation.z = t - Math.PI / 2; tilt.add(tick); }
        const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32), mine(std({ map: S.globeTexture(), metalness: 0.55, roughness: 0.38, envMapIntensity: 1.1 })));
        tilt.add(globe, new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, (R + 1.6) * 2, 8), M.gilt));
        const sun = gem(light, 0.8); sun.position.y = R + 1.9; tilt.add(sun);
        const moon = gem(SILVER, 0.6); moon.position.y = -R - 1.8; tilt.add(moon);
        const f = finial(0.45); f.position.y = R + 0.9; tilt.add(f);
        g.add(cyl(0.9, 0.9, cy - R - 2 - (Y + 4), M.brass, Y + 4, 12));
        a.push((dt, t) => {
            const k = pace();
            globe.rotation.y += dt * 0.9 * k;
            merid.rotation.y = FRONT + Math.sin(t * 0.6) * 0.45 * k;
            hFace.rotation.z -= dt * 0.3 * k;
            sun.rotation.y += dt * 1.5 * k;
        });
        return { group: g, height: Y + 25 };
    },
    calendar(c) {
        const { G, M, color, light, lathe, ball, glow, additive, RUNES, mine, busy, pace, a } = c;
        const g = G();
        g.add(lathe([[5.4, Y], [1.4, Y + 1.2], [1.1, Y + 4.5], [1.8, Y + 5.2]], M.brass, 40));
        const sphere = G(); sphere.position.y = Y + 13;
        const horizon = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.3, 8, 72), M.brass); horizon.rotation.x = Math.PI / 2;
        const inner = G();
        const eq = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.28, 8, 72), M.gilt); eq.rotation.x = Math.PI / 2;
        const ecl = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.9, 2, 72), mine(additive(RUNES, light, 0.7))); ecl.rotation.x = Math.PI / 2 + 0.41;
        inner.add(eq, ecl, new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.22, 8, 72), M.brass));
        sphere.add(new THREE.Mesh(new THREE.TorusGeometry(8, 0.42, 8, 72), M.gilt), horizon, inner, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18, 8), M.gilt), ball(1.6, glow(color, 2.4)));
        sphere.rotation.z = 0.3; g.add(sphere);
        const planets = [3.2, 4.6, 5.8].map((r, i) => { const p = ball(0.45 + i * 0.1, [M.silver, M.copper, M.gilt][i]); sphere.add(p); return { p, r, w: 1.6 - i * 0.4, ph: i * 2 }; });
        for (const pl of planets) pl.p.position.set(Math.cos(pl.ph) * pl.r, Math.sin(pl.ph) * pl.r * 0.4, Math.sin(pl.ph) * pl.r);
        a.push((dt) => {
            const k = pace(); inner.rotation.y += dt * 0.35 * busy();
            sphere.rotation.y += dt * 0.6 * k;
            for (const pl of planets) { if (!k) continue; pl.ph += dt * pl.w * 3 * k; pl.p.position.set(Math.cos(pl.ph) * pl.r, Math.sin(pl.ph) * pl.r * 0.4, Math.sin(pl.ph) * pl.r); }
        });
        return { group: g, height: Y + 24 };
    },
    // a lectern with an open book; its pages turn while the Ledger is in use
    ledger(c) {
        const { G, M, light, lathe, box, torus, gem, finial, additive, RUNES, mine, pace, a } = c;
        const g = G();
        g.add(lathe([[5.4, Y], [5, Y + 0.8], [1.6, Y + 1.8], [1.1, Y + 8], [1.8, Y + 8.6], [2.6, Y + 9.2]], M.brass, 40));
        g.add(torus(5.2, 0.22, M.gilt, Y + 0.6), torus(1.5, 0.2, M.gilt, Y + 4.4));
        const desk = G(); desk.position.y = Y + 10.4; desk.rotation.x = -0.5; g.add(desk);
        desk.add(box(11, 0.6, 7.6, M.iron, 0, -0.6, 0), box(11.4, 0.3, 0.5, M.gilt, 0, -0.1, 3.8));
        // two open pages, each with glowing ruled lines
        const pageMat = mine(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, metalness: 0 }));
        const lines = mine(additive(RUNES, light, 0.6));
        for (const s of [-1, 1]) {
            const page = box(4.8, 0.25, 6.6, pageMat, s * 2.55, 0, 0); page.rotation.z = s * -0.08; desk.add(page);
            const ruled = new THREE.Mesh(new THREE.PlaneGeometry(4, 5.6), lines); ruled.rotation.x = -Math.PI / 2; ruled.position.set(s * 2.55, 0.42, 0); desk.add(ruled);
        }
        // the turning leaf, hinged on the spine
        const hinge = G(); desk.add(hinge);
        const leaf = box(4.8, 0.12, 6.6, pageMat, 2.5, 0.3, 0); hinge.add(leaf);
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 10), M.gilt); spine.rotation.x = Math.PI / 2; desk.add(spine);
        const crown = gem(light, 0.7); crown.position.set(0, Y + 16.4, -2.4); g.add(crown);
        const f = finial(0.4); f.position.set(0, Y + 14.6, -2.4); g.add(f);
        g.add(box(0.4, 4.2, 0.4, M.brass, 0, Y + 10.6, -2.4));
        let turn = 0, angle = 0;
        a.push((dt) => {
            const k = pace();
            if (k) turn = (turn + dt * 0.9 * k) % 1;   // about a page a second while in use
            const target = k ? Math.PI * (0.5 - 0.5 * Math.cos(turn * Math.PI)) : 0;   // eased right -> left
            angle += (target - angle) * Math.min(1, dt * 8);
            hinge.rotation.z = angle;
            crown.rotation.y += dt * 1.2 * k;
        });
        return { group: g, height: Y + 18 };
    },
};

/** The Atlas globe: gilt continents on a dark sea, a graticule, the tropics, a rune band at the equator. */
function drawGlobe() {
    const W = 1024, H = 512, [c, g] = canvas2d(W, H);
    const P = (lon, lat) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
    g.fillStyle = '#0d2229'; g.fillRect(0, 0, W, H);
    const lands = [
        [[-168, 65], [-140, 70], [-95, 72], [-75, 62], [-55, 50], [-70, 43], [-80, 25], [-97, 18], [-105, 22], [-117, 32], [-125, 40], [-130, 55], [-150, 58]],
        [[-80, 10], [-60, 8], [-35, -7], [-40, -22], [-58, -38], [-70, -55], [-75, -40], [-70, -18], [-80, -5]],
        [[-10, 36], [-9, 44], [0, 50], [10, 58], [30, 70], [70, 75], [110, 77], [140, 70], [170, 66], [160, 55], [140, 40], [120, 22], [105, 10], [95, 20], [80, 8], [75, 20], [60, 25], [50, 30], [35, 35], [25, 40], [10, 44]],
        [[-17, 15], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 12], [40, -15], [32, -28], [20, -35], [12, -15], [8, 4], [-8, 5]],
        [[114, -22], [122, -17], [135, -12], [145, -15], [153, -28], [145, -38], [130, -32], [115, -34]],
        [[-45, 60], [-20, 70], [-30, 83], [-60, 82], [-55, 70]],
    ];
    g.fillStyle = '#c8a46a'; g.strokeStyle = '#f0d39a'; g.lineWidth = 2;
    for (const land of lands) { g.beginPath(); land.forEach(([lo, la], i) => { const [x, y] = P(lo, la); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke(); }
    g.fillRect(0, P(0, -72)[1], W, H - P(0, -72)[1]);
    g.strokeStyle = 'rgba(232, 200, 140, 0.35)'; g.lineWidth = 1.2;
    for (let lo = -180; lo <= 180; lo += 15) { const [x] = P(lo, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let la = -75; la <= 75; la += 15) { const [, y] = P(0, la); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.setLineDash([8, 8]); g.strokeStyle = 'rgba(240, 211, 154, 0.6)';
    for (const la of [23.4, -23.4, 66.6, -66.6]) { const [, y] = P(0, la); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.setLineDash([]);
    const [, eq] = P(0, 0); g.fillStyle = 'rgba(10, 20, 24, 0.75)'; g.fillRect(0, eq - 9, W, 18);
    g.strokeStyle = '#f0d39a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, eq - 9); g.lineTo(W, eq - 9); g.moveTo(0, eq + 9); g.lineTo(W, eq + 9); g.stroke();
    for (let i = 0; i < 48; i++) rune(g, i * 3 + 1, 10 + i * (W / 48), eq, 5);
    const [rx, ry] = P(-35, 25); g.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU, l = i % 2 ? 12 : 24; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + Math.cos(t) * l, ry + Math.sin(t) * l * 0.9); g.stroke(); }
    g.beginPath(); g.arc(rx, ry, 9, 0, TAU); g.stroke();
    return texture(c);
}
