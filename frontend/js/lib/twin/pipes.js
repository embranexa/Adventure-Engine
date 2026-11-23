// @ts-nocheck -- three.js scene building; untyped like the scenes.
// The Signal Chain twin's pipes (phase 7c), ported from the approved prototype
// (resources/signal chain digital twin/atelier.html); see PHASE7_PLAN.md.
//
//   const pipes = buildPipes(shop, { pipes, positions, nodes, colors });
//   pipes.group, pipes.ports (node id -> port angles, for buildMachine's ctx.ports),
//   pipes.temperAt (where the Temper's label goes), pipes.launch(steps, color, delay),
//   pipes.frame(dt), pipes.dispose()
//
// Pipes lie on the floor, straight when two machines line up and a flat S-bend otherwise,
// ending in the ports on the machines' bases. They stay dark until a move sends a slug of
// light through (up to SLUGS at once per pipe; more wait their turn). Net pipes are wider
// than Core pipes; the Temper sits on the Centrifuge -> Hopper pipe and steps it down.
// The Codex -> Refinery conveyor carries gilt plates that move only during a link;
// the Entropy Market's pipes are gold glass banded like a roll of coins.

import * as THREE from 'three';
import { MANIFOLD } from '../twinTopology.js';
import { SILVER, TAU, V } from './materials.js';
import { FOOT, bodyOf } from './machines.js';

const PIPE_Y = 2.4;           // the pipes' axis: the ports' height on a scaled base
const SCALE = 1.5;            // the machines' scale (MACHINE_SCALE in twinScene.js)
const TEMPER_L = 20;
const SLUG_SPEED = 110;       // world units per second
const SLUGS = 4;              // slugs one pipe draws at once (the shader's array size)
const MAX_WAITING = 400;      // moves queued behind full pipes or delays

const flowVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const slugFrag = `
uniform float uLen; uniform float uHead[4]; uniform float uDir[4]; uniform vec3 uCol[4]; varying vec2 vUv;
void main(){
    vec3 c = vec3(0.012, 0.014, 0.018);
    for (int i = 0; i < 4; i++) {
        if (uHead[i] < -0.5) continue;
        float d = (vUv.x - uHead[i]) * uLen * uDir[i];
        float k = d > 0.0 ? exp(-d * d / 6.0) : exp(-d * d / 40.0);
        c += uCol[i] * k * 3.0;
    }
    gl_FragColor = vec4(c, 1.0);
}`;

const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });

/**
 * Build every pipe.
 * @param {any} S  the machines' shop (makeShop)
 * @param {{ pipes: { id: string, a: string, b: string, kind: string }[], positions: Map<string, THREE.Vector3>,
 *           nodes: { id: string, zone: string, kind: string }[], colors: Record<string, string> }} data
 */
export function buildPipes(S, { pipes, positions, nodes, colors }) {
    const { M, glow, additive, RUNES } = S;
    const group = new THREE.Group();
    const owned = [];
    const keep = (x) => { owned.push(x); return x; };
    const mesh = (geo, mat) => { const m = new THREE.Mesh(keep(geo), mat); m.raycast = () => {}; group.add(m); return m; };
    const pipeGlass = keep(std({ color: 0x8fa6b8, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.6 }));
    const marketGlass = keep(std({ color: 0xd8b060, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.6 }));

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const end = (id) => {
        const n = byId.get(id), at = positions.get(id);
        if (!at) return null;
        if (id === MANIFOLD) return { id, zone: 'net', junction: true, at, r: 0 };
        return n ? { id, zone: n.zone, junction: false, at, r: FOOT[bodyOf(n)] ?? 9 } : null;
    };
    /** @type {Map<string, number[]>} */
    const ports = new Map();
    const portPoint = (e, ang) => {
        const r = (e.r + 2.8) * SCALE;
        return V(e.at.x + Math.cos(ang) * r, PIPE_Y, e.at.z + Math.sin(ang) * r);
    };
    // each end leaves along the major axis, so straight rows stay straight and offsets bend flat on the floor
    const pipeCurve = (A, B) => {
        const dx = B.at.x - A.at.x, dz = B.at.z - A.at.z, alongX = B.junction || Math.abs(dx) >= Math.abs(dz);
        const angA = alongX ? (dx > 0 ? 0 : Math.PI) : (dz > 0 ? Math.PI / 2 : -Math.PI / 2);
        const angB = angA + Math.PI;
        if (!A.junction) { if (!ports.has(A.id)) ports.set(A.id, []); ports.get(A.id).push(angA); }
        if (!B.junction) { if (!ports.has(B.id)) ports.set(B.id, []); ports.get(B.id).push(angB); }
        const a = portPoint(A, angA), b = portPoint(B, angB);
        if (Math.abs(a.z - b.z) < 1 || Math.abs(a.x - b.x) < 1) return new THREE.LineCurve3(a, b);
        if (alongX) { const h = (b.x - a.x) * 0.5; return new THREE.CubicBezierCurve3(a, V(a.x + h, PIPE_Y, a.z), V(b.x - h, PIPE_Y, b.z), b); }
        const h = (b.z - a.z) * 0.5;
        return new THREE.CubicBezierCurve3(a, V(a.x, PIPE_Y, a.z + h), V(b.x, PIPE_Y, b.z - h), b);
    };
    const along = (m, pt, tan) => { m.position.copy(pt); m.quaternion.setFromUnitVectors(V(0, 0, 1), tan); return m; };

    /** pipe id -> { curve, len, u?, slugs, conveyor? } */
    const recs = new Map();
    let temperPipe = null;
    for (const pipe of pipes) {
        const A = end(pipe.a), B = end(pipe.b);
        if (!A || !B) continue;
        const curve = pipeCurve(A, B), len = curve.getLength(), segs = Math.max(16, Math.round(len / 2));
        if (pipe.kind === 'conveyor') {
            // two iron rails carrying gilt plates (Codex entities)
            for (const off of [-1.4, 1.4]) {
                const pts = curve.getSpacedPoints(segs).map((p, i, arr) => { const t = curve.getTangentAt(i / (arr.length - 1)); return p.clone().add(V(-t.z, 0, t.x).multiplyScalar(off)).setY(1.2); });
                mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, 0.3, 6), M.iron);
            }
            const N = Math.max(2, Math.round(len / 5));
            const items = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(2.6, 0.4, 2.2)), M.gilt, N);
            items.raycast = () => {};
            group.add(items);
            const rec = { pipe, curve, len, slugs: [], conveyor: { items, N, o: new THREE.Object3D(), offset: 0, active: 0, dir: 1 } };
            placeConveyor(rec, 0);
            recs.set(pipe.id, rec);
            continue;
        }
        const market = pipe.kind === 'market';
        const wide = A.zone === 'net' && B.zone === 'net';
        const tempered = !temperPipe && pipe.a === 'centrifuge' && B.zone === 'core';
        const shellR = market ? 1.0 : wide ? 1.7 : 1.2;
        if (tempered) {   // wide up to the Temper, narrow after it
            const a0 = curve.getPointAt(0), b0 = curve.getPointAt(1), m0 = a0.clone().lerp(b0, 0.5), dir = b0.clone().sub(a0).normalize();
            mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a0, m0.clone().addScaledVector(dir, -TEMPER_L / 2 + 1)), 8, 1.7, 12), pipeGlass);
            mesh(new THREE.TubeGeometry(new THREE.LineCurve3(m0.clone().addScaledVector(dir, TEMPER_L / 2 - 1), b0), 8, 1.2, 12), pipeGlass);
        } else mesh(new THREE.TubeGeometry(curve, segs, shellR, 12), market ? marketGlass : pipeGlass);
        if (market) {   // gold-banded, like a roll of coins
            const N = Math.round(len / 3.4), ring = keep(new THREE.TorusGeometry(1.1, 0.16, 6, 18));
            for (let i = 1; i < N; i++) { const t = i / N; along(mesh(ring, i % 4 ? M.brass : M.gilt), curve.getPointAt(t), curve.getTangentAt(t)); }
        }
        const u = { uLen: { value: len }, uHead: { value: [-1, -1, -1, -1] }, uDir: { value: [1, 1, 1, 1] }, uCol: { value: [0, 1, 2, 3].map(() => new THREE.Color()) } };
        mesh(new THREE.TubeGeometry(curve, segs, wide ? 1.05 : 0.7, 8), keep(new THREE.ShaderMaterial({ uniforms: u, vertexShader: flowVert, fragmentShader: slugFrag, toneMapped: false })));
        const collars = market || tempered ? 0 : Math.max(1, Math.round(len / 40));
        if (collars > 1) {
            const collar = keep(new THREE.TorusGeometry(shellR + 0.15, 0.28, 8, 20)), saddle = keep(new THREE.BoxGeometry(1.2, PIPE_Y - 1.1, 3));
            for (let i = 1; i < collars; i++) {
                const t = i / collars, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
                along(mesh(collar, M.brass), p, tan);
                const s = mesh(saddle, M.iron); s.position.set(p.x, (PIPE_Y - 1.1) / 2, p.z); s.rotation.y = Math.atan2(tan.x, tan.z);
            }
        }
        const rec = { pipe, curve, len, u, slugs: [] };
        recs.set(pipe.id, rec);
        if (tempered) temperPipe = rec;
    }

    // the manifold: a hub where the harvester pipes merge
    const hubAt = positions.get(MANIFOLD);
    if (hubAt) {
        const { cyl, torus } = S;
        const hub = new THREE.Group(); hub.position.set(hubAt.x, 0, hubAt.z);
        const harvester = nodes.find((n) => n.kind === 'harvester');
        hub.add(cyl(3.6, 4, 1, M.stone, 0, 24), cyl(2.6, 2.6, 3.6, M.iron, 1, 24), torus(2.6, 0.3, M.brass, 4.6), torus(2.65, 0.12, glow(colors[harvester?.id] ?? SILVER, 1.2), 2.4));
        hub.traverse((o) => { o.raycast = () => {}; });
        group.add(hub);
    }

    const temper = temperPipe ? buildTemper(temperPipe) : null;

    /** The Temper: a glass-and-iron gearbox around the middle of the Centrifuge -> Hopper pipe. */
    function buildTemper(p) {
        const a0 = p.curve.getPointAt(0), b0 = p.curve.getPointAt(1), mid = a0.clone().lerp(b0, 0.5);
        const L = TEMPER_L, R = 2.3, g = new THREE.Group();
        g.position.copy(mid);
        g.rotation.y = -Math.atan2(b0.z - a0.z, b0.x - a0.x);   // local +x runs down the pipe
        const alongX = () => { const h = new THREE.Group(); h.rotation.z = Math.PI / 2; g.add(h); return h; };
        const part = (geo, mat) => { const m = new THREE.Mesh(keep(geo), mat); m.raycast = () => {}; return m; };
        const ringX = (r, t, mat, x) => { const m = part(new THREE.TorusGeometry(r, t, 8, 32), mat); m.rotation.y = Math.PI / 2; m.position.x = x; g.add(m); return m; };
        const shell = alongX();
        shell.add(part(new THREE.CylinderGeometry(R, R, L - 4, 32, 1, true), M.glass));
        // the taper inside: Net width in, Core width out
        shell.add(part(new THREE.CylinderGeometry(1.7, 1.15, L - 4, 32, 1, true), keep(std({ color: 0x8a6a3a, metalness: 1, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }))));
        for (const sgn of [-1, 1]) {
            const cap = part(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 2, 32), M.iron); cap.position.y = sgn * (L / 2 - 1); shell.add(cap);
            ringX(R + 0.42, 0.22, M.brass, sgn * (L / 2 - 2)); ringX(R + 0.42, 0.22, M.brass, (sgn * L) / 2);
        }
        for (let i = 0; i < 4; i++) { const t = (i / 4) * TAU + Math.PI / 4; const rod = part(new THREE.CylinderGeometry(0.2, 0.2, L - 2, 8), M.iron); rod.position.set(Math.cos(t) * (R + 0.15), 0, Math.sin(t) * (R + 0.15)); shell.add(rod); }
        const spin = alongX();
        const runes = keep(RUNES.clone()); runes.needsUpdate = true; runes.repeat.set(4, 1);
        const band = part(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 1.6, 48, 1, true), keep(additive(runes, SILVER, 0.35)));
        spin.add(band);
        // rings of light that travel down the taper and shrink while matter passes
        const rings = [0, 1, 2].map(() => ringX(1.7, 0.16, glow(SILVER, 2.4), 0));
        group.add(g);
        let ph = 0;
        return {
            at: mid.clone().setY(R * 2 + 6),
            frame(dt) {
                const on = p.slugs.length > 0;
                ph += dt * (on ? 1.4 : 0.15);
                band.rotation.y += dt * (on ? 2 : 0.1); band.material.opacity = on ? 0.9 : 0.35;
                rings.forEach((m, i) => { const f = (ph + i / 3) % 1; m.position.x = -(L / 2 - 2) + f * (L - 4); m.scale.setScalar((1.7 - f * 0.55) / 1.7); m.visible = on; });
            },
        };
    }

    // moves waiting for a delay, a free slot in a full pipe, or the conveyor to finish
    let waiting = [];
    const color3 = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
    /** Send a slug down the first step now; the rest follow as it arrives. */
    function start(steps, color) {
        if (!steps?.length) return;
        const [step, ...rest] = steps, p = recs.get(step.pipe.id);
        if (!p) return;
        if (p.conveyor) {
            const dur = p.len / SLUG_SPEED;
            p.conveyor.active = Math.max(p.conveyor.active, dur);
            p.conveyor.dir = step.forward ? 1 : -1;
            if (rest.length) waiting.push({ steps: rest, color, delay: dur });
            return;
        }
        if (p.slugs.length >= SLUGS) { if (waiting.length < MAX_WAITING) waiting.push({ steps, color, delay: 0.15 }); return; }
        p.slugs.push({ head: step.forward ? 0 : 1, dir: step.forward ? 1 : -1, color, rest });
    }

    return {
        group,
        ports,
        temperAt: temper?.at ?? null,
        /** @param {{ pipe: { id: string }, forward: boolean }[]} steps @param {string | THREE.Color} color @param {number} [delay] */
        launch(steps, color, delay = 0) {
            if (!steps?.length) return;
            if (delay > 0) { if (waiting.length < MAX_WAITING) waiting.push({ steps, color: color3(color), delay }); return; }
            start(steps, color3(color));
        },
        frame(dt) {
            const due = [];
            waiting = waiting.filter((w) => { w.delay -= dt; if (w.delay > 0) return true; due.push(w); return false; });
            for (const w of due) start(w.steps, w.color);
            for (const p of recs.values()) {
                if (p.conveyor) {
                    const c = p.conveyor;
                    if (c.active > 0) { c.active -= dt; c.offset = (c.offset + (c.dir * dt * SLUG_SPEED) / p.len + 1) % 1; placeConveyor(p, c.offset); }
                    continue;
                }
                if (!p.slugs.length && p.u.uHead.value[0] < -0.5) continue;
                for (const s of p.slugs) s.head += (s.dir * SLUG_SPEED * dt) / p.len;
                const done = p.slugs.filter((s) => s.head > 1.05 || s.head < -0.05);
                if (done.length) p.slugs = p.slugs.filter((s) => !done.includes(s));
                for (const s of done) start(s.rest, s.color);
                for (let i = 0; i < SLUGS; i++) {
                    const s = p.slugs[i];
                    p.u.uHead.value[i] = s ? s.head : -1;
                    p.u.uDir.value[i] = s ? s.dir : 1;
                    if (s) p.u.uCol.value[i].copy(s.color);
                }
            }
            temper?.frame(dt);
        },
        dispose() {
            group.traverse((o) => { if (o.geometry) owned.includes(o.geometry) || o.geometry.dispose(); });
            owned.forEach((x) => x.dispose());
        },
    };
}

function placeConveyor(p, offset) {
    const c = p.conveyor;
    for (let i = 0; i < c.N; i++) {
        const u = (i / c.N + offset) % 1, pt = p.curve.getPointAt(u), tan = p.curve.getTangentAt(u);
        c.o.position.copy(pt).setY(1.9); c.o.rotation.set(0, 0, 0); c.o.lookAt(pt.clone().add(tan).setY(1.9));
        c.o.updateMatrix(); c.items.setMatrixAt(i, c.o.matrix);
    }
    c.items.instanceMatrix.needsUpdate = true;
}
