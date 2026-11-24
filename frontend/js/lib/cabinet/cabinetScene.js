// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// components/Cabinet.js is the typed boundary. Geometry: layout.js (pure), frames.js, models.js.

/**
 * CabinetScene — a shelved cabinet behind a scrolling grid of buttons. One world unit is one
 * pixel at the cabinet's face, in the scrolled content's coordinates (y is negative
 * downward), so alcoves line up with their buttons. The canvas covers only what's visible;
 * scrolling moves the camera. Models are built as they come into view.
 *
 *   scene.update(layout, models, { selectedId })   // models: Map id -> { type, id, color, on, points, rings, ... }
 *   scene.setScroll(px)   scene.setHover(id)   scene.setPointer(-0.5..0.5)   scene.dispose()
 */

import * as THREE from 'three';
import { deferredResize, isResizing, viewOf } from '../resizing.js';
import { disposeGroup, makeKit, studio } from './kit.js';
import { alcoveFrame, carcass, inside } from './frames.js';
import { MODELS } from './models.js';
import { sigilCanvas } from './sigil.js';
import { THEMES } from './themes.js';

const DIST = 1050;          // from the camera to the cabinet's face
const PARALLAX = 120;       // how far the camera shifts sideways with the pointer
const MODEL_H = 104;        // the height models are drawn to
const MARGIN = 260;         // build alcoves this far outside the view

export class CabinetScene {
    /** @param {HTMLElement} host @param {{ shape: string, sealColor: string, seed: string, points?: number, dim?: boolean }} style */
    constructor(host, style) {
        this.style = style;
        this.view = viewOf(host);
        this.host = host;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        host.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.env = studio(this.renderer);
        this.scene.environment = this.env.texture;
        this.scene.add(new THREE.HemisphereLight('#d2d2d3', '#161616', 0.7));
        const key = new THREE.DirectionalLight('#f6f4f0', 2.4); key.position.set(-300, 500, 700);
        const rim = new THREE.DirectionalLight('#c4c5c6', 1.1); rim.position.set(500, -100, 400);
        this.scene.add(key, rim);
        this.camera = new THREE.PerspectiveCamera(30, 1, 100, 2600);

        this.kit = makeKit({ dim: style.dim });
        this.sealTexture = this.kit.texture(sigilCanvas({ seed: style.seed, points: style.points ?? 8, rings: 3 }));
        this.sealTexture.userData.shared = true;
        this.frame = new THREE.Group();
        this.scene.add(this.frame);
        /** id -> { group, sig, parts } built models; keystones by cell */
        this.built = new Map();
        this.layout = null;
        this.models = new Map();
        this.hoverId = this.selectedId = null;
        this.scroll = 0;
        this.par = this.parTarget = 0;
        this.calm = this.view.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

        this._ro = new this.view.ResizeObserver(deferredResize(() => this._resize(), this.view));
        this._ro.observe(host);
        this._resize();
        const loop = (t) => {
            this._raf = this.view.requestAnimationFrame(loop);
            if (!isResizing()) this._frame(t);
        };
        this._raf = this.view.requestAnimationFrame(loop);
    }

    setScroll(px) { this.scroll = px; }
    setHover(id) { this.hoverId = id; }
    setPointer(f) { this.parTarget = f * PARALLAX; }

    update(layout, models, { selectedId = null } = {}) {
        this.selectedId = selectedId;
        this.models = models;
        const sig = JSON.stringify([layout.cols, layout.cellH, layout.groups]);
        const moved = sig !== this._layoutSig;
        this.layout = layout;
        if (moved) { this._layoutSig = sig; this._buildFrame(); }
        const cells = new Map(layout.cells.filter((c) => c.id != null).map((c) => [c.id, c]));
        for (const [id, rec] of this.built) {
            const cell = cells.get(id), m = models.get(id);
            if (!cell || !m || rec.sig !== this._sig(m, cell)) { this._remove(id); continue; }
            rec.group.position.set(cell.x + cell.w / 2, -(cell.y + cell.h / 2), 0);
        }
        this._lightKeystones();
    }

    _sig(m, cell) { return JSON.stringify([m, cell.w, cell.h]); }

    _remove(id) {
        const rec = this.built.get(id);
        this.scene.remove(rec.group);
        disposeGroup(rec.group);
        this.built.delete(id);
    }

    /** The housing: one frame per alcove, and the carcass. Rebuilt when the layout changes. */
    _buildFrame() {
        disposeGroup(this.frame);
        this.frame.clear();
        const { layout } = this;
        if (!layout.groups.length) return;
        this.keystones = layout.cells.map((c) => {
            const g = new THREE.Group();
            g.position.set(c.x + c.w / 2, -(c.y + c.h / 2), 0);
            this.frame.add(g);
            return { cell: c, gem: alcoveFrame(this.kit, g, THEMES[c.theme]?.shape ?? this.style.shape, c.w, c.h, this._rune(c)) };
        });
        this.seal = carcass(this.kit, this.frame, layout, { sealTexture: this.sealTexture, sealColor: this.style.sealColor }).seal;
    }

    /** An idol's alcove wears its archetype's rune. */
    _rune(c) {
        const m = c.id != null ? this.models.get(c.id) : null;
        return m?.idol ? { id: m.idol, color: m.color } : null;
    }

    /** The gem over an alcove lights in its model's colour. */
    _lightKeystones() {
        this.keystones?.forEach((k, i) => {
            const id = this.layout.cells[i]?.id, m = id != null ? this.models.get(id) : null, want = m?.on ? m.color : null;
            if (k.color === want) return;
            if (!k.gem.material.userData.shared) k.gem.material.dispose();
            k.gem.material = want ? this.kit.glow(want) : this.kit.M.steel;
            k.color = want;
        });
    }

    /** One alcove's contents: circles, beam and model. */
    _build(cell, m) {
        const K = this.kit, { mesh, light, tex } = K, group = new THREE.Group();
        group.position.set(cell.x + cell.w / 2, -(cell.y + cell.h / 2), 0);
        const { y0, h, nw } = inside(cell.w, cell.h);
        const circle = K.texture(sigilCanvas({ seed: m.id, points: m.points ?? 5, rings: m.rings ?? 0, open: !m.on }));
        const floor = mesh(new THREE.PlaneGeometry(nw * 0.72, nw * 0.72), light(circle, m.color, m.on ? 1 : 0.4), group, 0, y0 + 1.5, -30);
        floor.rotation.x = -1.43;
        const back = mesh(new THREE.PlaneGeometry(nw, nw), light(circle, m.color, m.on ? 0.42 : 0.1), group, 0, y0 + h * 0.52, -96);
        const haze = mesh(new THREE.PlaneGeometry(nw * 1.6, nw * 1.6), light(tex.haze, m.color, 0), group, 0, y0 + h * 0.5, -90);
        mesh(new THREE.PlaneGeometry(nw * 0.84, h * 0.95), light(tex.beam, m.color, m.on ? 0.2 : 0.06), group, 0, y0 + h * 0.475, -34);
        const body = new THREE.Group();
        body.position.set(0, y0 + 1, -34);
        body.scale.setScalar(Math.min(nw / 112, h / MODEL_H));
        group.add(body);
        const parts = MODELS[m.type]?.(K, body, m) ?? null;
        this.scene.add(group);
        this.built.set(cell.id, { group, sig: this._sig(m, cell), turning: [floor, back], haze, parts, on: m.on, hover: 0 });
    }

    /** Build what's in (or near) view, a couple per frame so opening stays smooth. */
    _buildVisible() {
        const lo = this.scroll - MARGIN, hi = this.scroll + this.height + MARGIN;
        let left = 3;
        for (const c of this.layout?.cells ?? []) {
            if (!left || c.id == null || this.built.has(c.id) || c.y > hi || c.y + c.h < lo) continue;
            const m = this.models.get(c.id);
            if (m) { this._build(c, m); left--; }
        }
    }

    _resize() {
        this.width = this.host.clientWidth;
        this.height = this.host.clientHeight;
        if (!this.width || !this.height) return;
        this.renderer.setSize(this.width, this.height);
        this.camera.aspect = this.width / this.height;
        this.camera.fov = (2 * Math.atan(this.height / 2 / DIST) * 180) / Math.PI;
    }

    _frame(t) {
        if (!this.width || !this.height || !this.layout) return;
        const still = this.calm?.matches;
        this._buildVisible();
        // shift the camera with the pointer and shear its view back, so the face stays put
        this.par += ((still ? 0 : this.parTarget) - this.par) * 0.06;
        this.camera.position.set(this.width / 2 + this.par, -(this.scroll + this.height / 2), DIST);
        this.camera.updateProjectionMatrix();
        this.camera.projectionMatrix.elements[8] = (-2 * this.par) / this.width;
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
        if (this.seal && !still) this.seal.rotation.z = t / 14000;
        for (const [id, rec] of this.built) {
            const hot = id === this.hoverId || id === this.selectedId;
            rec.hover += ((hot ? 1 : 0) - rec.hover) * 0.1;
            rec.haze.material.opacity = (rec.on ? 0.2 : 0.04) + rec.hover * 0.16;
            if (still) continue;
            for (const m of rec.turning) m.rotation.z = t / 22000;
            rec.parts?.frame?.(t, rec.hover);
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.view.cancelAnimationFrame(this._raf);
        this._ro.disconnect();
        for (const id of [...this.built.keys()]) this._remove(id);
        disposeGroup(this.frame);
        this.sealTexture.dispose();
        this.kit.dispose();
        this.env.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }
}
