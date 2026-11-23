// @ts-nocheck -- imperative three.js; the three ES module is untyped here.
// components/ModelView.js is the typed boundary.

/**
 * Many small live 3D views from one WebGL context: each is rendered into a corner of a
 * shared canvas and copied into its own 2D canvas. (Browsers allow only a few contexts, and
 * a list of quests could want dozens.)
 *
 *   const view = addView(canvas2d, spec, { distance, orbit });   // spec: lib/items.js modelSpec
 *   view.update(spec); view.dispose();
 *   snapshot(spec, w, h)   // one still frame, as a canvas
 */

import * as THREE from 'three';
import { viewOf } from '../resizing.js';
import { disposeGroup, makeKit, studio } from './kit.js';
import { drawRecipe } from './recipe.js';
import { sigilCanvas } from './sigil.js';
import { card, cardSize } from './vessels.js';

let shared = null;
let users = 0;
let idle = 0;
const KEEP_MS = 10_000;     // keep the context this long with no views: they come and go

function acquire() {
    users++;
    clearTimeout(idle);
    if (!shared) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.setScissorTest(true);
        shared = { renderer, env: studio(renderer), kit: makeKit(), w: 0, h: 0 };
    }
    return shared;
}

function release() {
    if (--users || !shared) return;
    clearTimeout(idle);
    idle = setTimeout(free, KEEP_MS);
}

function free() {
    if (users || !shared) return;
    shared.kit.dispose(); shared.env.dispose(); shared.renderer.dispose(); shared.renderer.forceContextLoss();
    shared = null;
}

/** Render a scene at w x h and copy it onto `g` (clearing it first). */
function blit(S, scene, camera, g, w, h) {
    if (w > S.w || h > S.h) { S.w = Math.max(S.w, w); S.h = Math.max(S.h, h); S.renderer.setSize(S.w, S.h, false); }
    S.renderer.setViewport(0, 0, w, h); S.renderer.setScissor(0, 0, w, h);
    S.renderer.clear();
    S.renderer.render(scene, camera);
    g.clearRect(0, 0, w, h);
    g.drawImage(S.renderer.domElement, 0, S.h - h, w, h, 0, 0, w, h);
}

/** The scene for one spec: the model (or its default card) before its sigil. */
function build(S, spec) {
    const scene = new THREE.Scene(), root = new THREE.Group(), K = S.kit;
    scene.environment = S.env.texture;
    scene.add(new THREE.HemisphereLight('#d2d2d3', '#161616', 0.8), root);
    const key = new THREE.DirectionalLight('#f6f4f0', 2.4); key.position.set(-30, 50, 70); scene.add(key);
    const sigil = K.mesh(new THREE.PlaneGeometry(84, 84), K.light(K.texture(sigilCanvas({ seed: spec.id, points: spec.points, rings: spec.rings || 2 })), spec.color, 0.5), scene, 0, 0, -40);
    if (spec.parts) drawRecipe(K, root, spec.parts, spec.color);
    else card(K, root, { ...spec, on: true }, ...cardSize(46, 58));
    return { scene, root, sigil, flat: !spec.parts };
}

const cameraFor = (distance) => new THREE.PerspectiveCamera(34, 1, 1, 800).translateZ(distance);

export function addView(canvas, spec, { distance = 132, orbit = false } = {}) {
    const S = acquire(), win = viewOf(canvas), camera = cameraFor(distance), g = canvas.getContext('2d');
    const calm = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    let sig = JSON.stringify(spec), s = build(S, spec), yaw = 0.5, pitch = 0.22, drag = null, raf = 0, last = 0, gone = false;
    const frame = (t) => {
        raf = win.requestAnimationFrame(frame);
        if (!orbit && t - last < 33) return; // small views at 30 fps
        const dt = last ? Math.min(100, t - last) : 0;
        last = t;
        const dpr = Math.min(win.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (!w || !h) return;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        camera.aspect = w / h;
        camera.position.z = distance / Math.min(1, camera.aspect);
        camera.updateProjectionMatrix();
        const still = calm?.matches;
        if (!drag && !still) yaw += dt * 0.0005;
        s.root.rotation.set(pitch * (s.flat ? 0.4 : 1), s.flat && !orbit ? (still ? 0 : Math.sin(t / 1700) * 0.38) : yaw, 0);
        if (!still) s.sigil.rotation.z = t / 16000;
        blit(S, s.scene, camera, g, w, h);
    };
    raf = win.requestAnimationFrame(frame);
    if (orbit) {
        canvas.onpointerdown = (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
        canvas.onpointermove = (e) => {
            if (!drag) return;
            yaw += (e.clientX - drag[0]) * 0.01;
            pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - drag[1]) * 0.01));
            drag = [e.clientX, e.clientY];
        };
        canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    }
    return {
        update(next) {
            const nextSig = JSON.stringify(next);
            if (nextSig === sig) return;
            sig = nextSig;
            disposeGroup(s.scene);
            s = build(S, next);
        },
        dispose() {
            if (gone) return;
            gone = true;
            win.cancelAnimationFrame(raf);
            disposeGroup(s.scene);
            release();
        },
    };
}

/** One still of a model, for canvases that can't animate (the Nexus's cards). */
export function snapshot(spec, w, h) {
    const S = acquire(), s = build(S, spec), camera = cameraFor(132), out = document.createElement('canvas');
    out.width = w; out.height = h;
    camera.aspect = w / h;
    camera.position.z = 132 / Math.min(1, camera.aspect);
    camera.updateProjectionMatrix();
    s.root.rotation.set(0.22, 0.5, 0);
    blit(S, s.scene, camera, out.getContext('2d'), w, h);
    disposeGroup(s.scene);
    release();
    return out;
}
