// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// ComplexPanel.js is the typed boundary. What to draw: complexGraph.js.

/**
 * ComplexScene — a collaboration complex in 3D. Core nodes (adventure, site, party) are gems
 * over counter-rotating magic circles; stewards are prisms, players orbs, entities small
 * gems. An edge's style says the bond: solid, dashed, triple (annealed) or jagged (repelled);
 * `flow` edges carry a spark.
 *
 *   scene.update(graph, { selectedId, refit })
 *   scene.fit()
 *   scene.dispose()
 *
 * Callback: onSelect(nodeId | null). Controls match the Nexus and the Anvil.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { magicCircleCanvases } from './magicCircle.js';
import { deferredResize, isResizing, viewOf } from './resizing.js';

const VIEW_DIR = new THREE.Vector3(0.12, 1.15, 1).normalize();
const FOV = 38;
const DASH = 3.2, GAP = 2.4;
const Z = new THREE.Vector3(0, 0, 1);

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // names are never parsed as HTML
    return n;
}

export class ComplexScene {
    /** @param {HTMLElement} parent @param {any} [callbacks] */
    constructor(parent, { onSelect = () => {} } = {}) {
        this.onSelect = onSelect;
        this.view = viewOf(parent); // a popped-out panel lives in its own window
        this.container = el('div', 'alm-root');
        parent.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);
        this.labels = el('div', 'alm-labels');
        this.container.appendChild(this.labels);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 3000);
        this.camera.position.copy(VIEW_DIR).multiplyScalar(300);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 40;
        this.controls.maxDistance = 1200;
        this.controls.addEventListener('start', () => { this._moved = true; });
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(90, 200, 140);
        this.scene.add(key);

        this.shared = this._sharedAssets();
        this.group = new THREE.Group();
        this.scene.add(this.group);
        /** id -> { node, group, label, halo, spin } */
        this.nodes = new Map();
        this.flows = [];
        this.selectedId = null;
        this.hoverId = null;
        this.time = 0;
        this._key = '';

        this.raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._v = new THREE.Vector3();
        this._bindEvents();

        this._ro = new this.view.ResizeObserver(deferredResize(() => this._resize(), this.view));
        this._ro.observe(this.container);
        this._resize();

        this._last = this.view.performance.now();
        const loop = (t) => {
            this._raf = this.view.requestAnimationFrame(loop);
            if (isResizing()) { this._last = t; return; } // hold still while a splitter is dragged
            this._frame(t);
        };
        this._raf = this.view.requestAnimationFrame(loop);
    }

    _sharedAssets() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,.42)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const circle = magicCircleCanvases(1024);
        const tex = (canvas) => {
            const t = new THREE.CanvasTexture(canvas);
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 8;
            return t;
        };
        const tube = new THREE.CylinderGeometry(1, 1, 1, 8);
        tube.rotateX(Math.PI / 2); // along +Z, scaled to length
        const cone = new THREE.ConeGeometry(1.6, 4.5, 10);
        cone.rotateX(Math.PI / 2);
        return {
            glow: tex(c), outer: tex(circle.outer), inner: tex(circle.inner), tube, cone,
            plane: new THREE.PlaneGeometry(2, 2), gem: new THREE.OctahedronGeometry(1), orb: new THREE.SphereGeometry(1, 24, 16),
            prism: new THREE.CylinderGeometry(0.7, 1, 1.7, 6), ring: new THREE.TorusGeometry(1.7, 0.05, 6, 48),
        };
    }

    /* ---------------- data ---------------- */

    /** @param {import('./complexGraph.js').Graph} graph @param {{ selectedId?: string | null, refit?: boolean }} [opts] */
    update(graph, { selectedId = null, refit = false } = {}) {
        this.selectedId = selectedId;
        const key = JSON.stringify(graph);
        if (key !== this._key) {
            const grown = refit ? new Set() : new Set(this.nodes.keys()); // nodes already here don't grow in again
            const count = this.nodes.size;
            this._key = key;
            this._clear();
            for (const n of graph.nodes) this._addNode(n, grown.has(n.id));
            for (const e of graph.edges) this._addEdge(e);
            if (count !== this.nodes.size) refit = true;
        }
        if (refit) this.fit();
    }

    _clear() {
        this.group.traverse((o) => {
            if (o.material) o.material.dispose(); // geometries and textures are shared
        });
        this.group.clear();
        for (const n of this.nodes.values()) n.label.remove();
        this.nodes.clear();
        this.flows = [];
        this._setHover(null);
    }

    _sprite(color, scale, opacity) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.shared.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
        s.scale.setScalar(scale);
        return s;
    }

    _addNode(n, grown) {
        const S = this.shared, color = new THREE.Color(n.color), group = new THREE.Group();
        group.position.set(...n.pos);
        group.scale.setScalar(grown ? 1 : 0.01);
        const size = n.kind === 'core' ? n.size * 0.32 : n.size;
        const geometry = n.kind === 'core' || n.kind === 'entity' || n.kind === 'archon' ? S.gem : n.kind === 'steward' ? S.prism : S.orb;
        const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.5), emissive: color, emissiveIntensity: n.dim ? 0.25 : n.glow || n.kind === 'core' ? 0.75 : 0.45,
            roughness: 0.35, metalness: 0.25, transparent: n.dim, opacity: n.dim ? 0.55 : 1,
        }));
        body.scale.setScalar(size);
        body.userData.id = n.id;
        group.add(body);
        const spin = [];
        if (n.kind === 'core') {
            body.position.y = size * 1.1;
            for (const [map, k] of [[S.outer, 1], [S.inner, 0.98]]) {
                const m = new THREE.Mesh(S.plane, new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
                m.rotation.x = -Math.PI / 2;
                m.position.y = -5;
                m.scale.setScalar(n.size * k);
                m.userData.id = n.id; // the circle is part of the target
                group.add(m);
                spin.push(m);
            }
        } else if (n.kind === 'player' && !n.dim) {
            const ring = new THREE.Mesh(S.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
            ring.rotation.x = Math.PI / 2;
            ring.scale.setScalar(size);
            group.add(ring);
        }
        group.add(this._sprite(color, size * 6, n.glow || n.kind === 'core' ? 0.4 : 0.14));
        const halo = this._sprite(0xffffff, size * 8, 0);
        group.add(halo);
        this.group.add(group);

        const label = el('div', 'alm-label cpx-label');
        label.style.setProperty('--c', n.color);
        label.append(el('b', '', n.sub), el('span', '', n.label));
        label.title = `${n.label} · ${n.sub}`;
        label.classList.toggle('dim', Boolean(n.dim));
        label.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(n.id); });
        label.addEventListener('pointerenter', () => this._setHover(n.id));
        label.addEventListener('pointerleave', () => this._setHover(null));
        this.labels.appendChild(label);
        this.nodes.set(n.id, { node: n, group, body, label, halo, spin, lift: n.kind === 'core' ? size * 2.4 : size * 1.5 + 2 });
    }

    /** One straight rod from a to b. */
    _rod(a, b, r, material) {
        const m = new THREE.Mesh(this.shared.tube, material);
        const d = new THREE.Vector3().subVectors(b, a), len = d.length();
        m.position.addVectors(a, b).multiplyScalar(0.5);
        m.scale.set(r, r, len);
        m.quaternion.setFromUnitVectors(Z, d.divideScalar(len || 1));
        this.group.add(m);
    }

    _addEdge(e) {
        const from = this.nodes.get(e.a), to = this.nodes.get(e.b);
        if (!from || !to) return;
        const a = new THREE.Vector3(...from.node.pos), b = new THREE.Vector3(...to.node.pos);
        const dir = new THREE.Vector3().subVectors(b, a), full = dir.length();
        dir.normalize();
        // stop at the bodies: cores at the rim of their gem
        a.addScaledVector(dir, Math.min(full * 0.3, from.node.kind === 'core' ? from.node.size * 0.3 : from.node.size));
        b.addScaledVector(dir, -Math.min(full * 0.4, to.node.kind === 'core' ? to.node.size * 0.4 : to.node.size + 1));
        const color = new THREE.Color(e.color), len = a.distanceTo(b);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: e.dim ? 0.35 : 0.8, depthWrite: !e.dim });
        const at = (d) => a.clone().addScaledVector(dir, d);
        const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        if (e.style === 'dashed') {
            for (let d = 0; d < len; d += DASH + GAP) this._rod(at(d), at(Math.min(d + DASH, len)), e.width, mat);
        } else if (e.style === 'triple') {
            for (const k of [-1, 0, 1]) this._rod(a.clone().addScaledVector(side, k * 1.8), b.clone().addScaledVector(side, k * 1.8), e.width, mat);
        } else if (e.style === 'jagged') {
            const steps = Math.max(4, Math.round(len / 5));
            let prev = a;
            for (let i = 1; i <= steps; i++) {
                const p = at((i / steps) * len);
                if (i < steps) p.addScaledVector(side, i % 2 ? 2.4 : -2.4);
                this._rod(prev, p, e.width, mat);
                prev = p;
            }
        } else this._rod(a, b, e.width, mat);
        if (e.arrow) {
            const cone = new THREE.Mesh(this.shared.cone, mat);
            cone.position.copy(b);
            cone.quaternion.setFromUnitVectors(Z, dir);
            this.group.add(cone);
        }
        if (e.flow) {
            const s = this._sprite(color.clone().lerp(new THREE.Color(0xffffff), 0.4), 7, 0.9);
            this.group.add(s);
            this.flows.push({ s, a, b, offset: Math.random() });
        }
    }

    /** Frame everything. */
    fit() {
        this._moved = false;
        if (!this.nodes.size) return;
        // seen along VIEW_DIR: centre what there is, then stand back until every node (with
        // room for its label) is inside the frame
        const right = new THREE.Vector3(0, 1, 0).cross(VIEW_DIR).normalize(), up = new THREE.Vector3().crossVectors(VIEW_DIR, right);
        const pts = [...this.nodes.values()].map(({ node }) => {
            const p = new THREE.Vector3(...node.pos);
            return { x: p.dot(right), y: p.dot(up), z: p.dot(VIEW_DIR), r: node.kind === 'core' ? node.size : 20 };
        });
        const mid = (k) => (Math.min(...pts.map((p) => p[k] - p.r)) + Math.max(...pts.map((p) => p[k] + p.r))) / 2;
        const [cx, cy, cz] = [mid('x'), mid('y'), mid('z')];
        const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), tanX = tan * this.camera.aspect;
        let dist = 130;
        for (const p of pts) dist = Math.max(dist, p.z - cz + Math.max((Math.abs(p.y - cy) + p.r + 4) / tan, (Math.abs(p.x - cx) + p.r) / tanX));
        this.controls.target.set(0, 0, 0).addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(VIEW_DIR, cz);
        this.camera.position.copy(this.controls.target).addScaledVector(VIEW_DIR, dist);
        this.controls.update();
    }

    /* ---------------- interaction ---------------- */

    _pick(ev) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this._ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this._ndc, this.camera);
        return this.raycaster.intersectObjects([...this.nodes.values()].flatMap((n) => [n.body, ...n.spin]), false)[0]?.object.userData.id ?? null;
    }

    _setHover(id) {
        if (id === this.hoverId) return;
        this.hoverId = id;
        this.renderer.domElement.style.cursor = id ? 'pointer' : '';
        for (const [key, n] of this.nodes) n.label.classList.toggle('hover', key === id);
    }

    _bindEvents() {
        const canvas = this.renderer.domElement;
        this._listeners = {
            pointerdown: (ev) => { this._down = [ev.clientX, ev.clientY]; },
            pointerup: (ev) => {
                if (ev.button !== 0 || !this._down) return;
                if (Math.hypot(ev.clientX - this._down[0], ev.clientY - this._down[1]) > 5) return; // that was a drag
                this.onSelect(this._pick(ev));
            },
            pointermove: (ev) => { if (!ev.buttons) this._setHover(this._pick(ev)); },
            pointerleave: () => this._setHover(null),
            contextmenu: (ev) => ev.preventDefault(),
        };
        for (const [k, f] of Object.entries(this._listeners)) canvas.addEventListener(k, f);
    }

    _resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (!this._moved) this.fit(); // a view the user has turned stays as it is
    }

    /* ---------------- frame ---------------- */

    _frame(now) {
        const dt = Math.min((now - this._last) / 1000, 0.1);
        this._last = now;
        this.time += dt;
        const k = 1 - Math.exp(-dt * 8);
        this.controls.update();
        for (const [id, n] of this.nodes) {
            n.group.scale.setScalar(n.group.scale.x + (1 - n.group.scale.x) * k);
            if (n.spin.length) {
                n.spin[0].rotation.z += dt * 0.12;
                n.spin[1].rotation.z -= dt * 0.18;
                n.body.rotation.y += dt * 0.4;
            }
            const want = id === this.selectedId ? 0.5 : id === this.hoverId ? 0.22 : 0;
            n.halo.material.opacity += (want - n.halo.material.opacity) * k;
        }
        for (const f of this.flows) f.s.position.lerpVectors(f.a, f.b, (this.time * 0.35 + f.offset) % 1);
        this.renderer.render(this.scene, this.camera);
        this._placeLabels();
    }

    _placeLabels() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        for (const [id, n] of this.nodes) {
            this._v.copy(n.group.position);
            this._v.y += n.lift;
            this._v.project(this.camera);
            const off = this._v.z > 1 || Math.abs(this._v.x) > 1.2 || Math.abs(this._v.y) > 1.2;
            n.label.style.display = off ? 'none' : '';
            if (off) continue;
            const x = (this._v.x * 0.5 + 0.5) * w, y = (-this._v.y * 0.5 + 0.5) * h;
            n.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
            n.label.style.zIndex = String(id === this.hoverId ? 3000 : 1000 - Math.round(this._v.z * 500));
            n.label.classList.toggle('selected', id === this.selectedId);
        }
    }

    dispose() {
        this.view.cancelAnimationFrame(this._raf);
        this._ro?.disconnect();
        for (const [k, f] of Object.entries(this._listeners)) this.renderer.domElement.removeEventListener(k, f);
        this.controls.dispose();
        this._clear();
        for (const v of Object.values(this.shared)) v?.dispose?.();
        this.renderer.dispose();
        this.container.remove();
    }
}
