// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// AlembicPanel.js is the typed boundary. Graph logic: roadmap.js.

/**
 * AlembicScene — an adventure's action roadmap as a distillery seen from above:
 * each action is a still (steel base, glass column, liquid), each link a steel pipe.
 *
 *   locked  near-empty glass, dim alloy       (waiting on another action)
 *   ready   half full of pulsing alloy        (a bottleneck: the next thing to do)
 *   done    full of glowing animus; its pipes carry it onward
 *
 *   scene.update(analysis, { selectedId, linkFromId, refit })
 *   scene.celebrate()      // every still flares (the roadmap is complete)
 *   scene.dispose()
 *
 * Callbacks: onSelect(id | null), onActivate(id) (double-click), onHover(id | null).
 * Controls match the Nexus: left-drag rotates, right-drag moves, scroll zooms.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { splitTitle } from './quests.js';
import { deferredResize, isResizing, viewOf } from './resizing.js';

const LAYER_X = 66;       // spacing between steps (left to right)
const ROW_Z = 52;         // spacing between actions in the same step
const COLUMN_H = 26;
const COLUMN_R = 6.5;
const BASE_H = 3;
const FRUSTUM = 240;      // world units shown vertically at zoom 1
const VIEW_DIR = new THREE.Vector3(1, 0.95, 1.05).normalize();

// Action colours follow the adventure's matter (roadmapColors in roadmap.js, set through
// setColors): incomplete actions burn in `todo`, complete ones in `done`. Default: alloy
// and animus.
const ALLOY = 0xf28a2e;
const ANIMUS = 0xef3e4a;
const SHADE = 0x5d6070;
const STEEL = 0x23262b;
const STEEL_EDGE = 0x7a808a;

/**
 * The three looks of a still from the two colours. liquid: the dark body colour; light:
 * the energy it glows with (carries the hue); locked stills are a dim, nearly empty todo.
 */
function looks(todo, done) {
    const t = new THREE.Color(todo), d = new THREE.Color(done), white = new THREE.Color(0xffffff);
    const hex = (c) => c.getHex();
    return {
        locked: { fill: 0.05, liquid: hex(t.clone().multiplyScalar(0.16)), light: hex(t.clone().multiplyScalar(0.5)), emissive: 0.5, ring: hex(t.clone().multiplyScalar(0.38)), ringOpacity: 0.55, glow: 0 },
        ready: { fill: 0.45, liquid: hex(t.clone().multiplyScalar(0.5)), light: hex(t), emissive: 0.85, ring: hex(t), ringOpacity: 0.9, glow: 0.38 },
        done: { fill: 1, liquid: hex(d.clone().multiplyScalar(0.5)), light: hex(d), emissive: 1, ring: hex(d.clone().lerp(white, 0.35)), ringOpacity: 1, glow: 0.5 },
    };
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // titles are never parsed as HTML
    return n;
}

export class AlembicScene {
    /** @param {HTMLElement} parent @param {any} [callbacks] */
    constructor(parent, { onSelect = () => {}, onActivate = () => {}, onHover = () => {} } = {}) {
        this.onSelect = onSelect;
        this.onActivate = onActivate;
        this.onHover = onHover;

        // the window this scene is shown in (a popped-out panel lives in its own window)
        this.view = viewOf(parent);
        this.container = el('div', 'alm-root');
        parent.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0); // the panel's glass shows through
        this.container.appendChild(this.renderer.domElement);

        this.labels = el('div', 'alm-labels');
        this.container.appendChild(this.labels);

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -3000, 3000);
        this.camera.position.copy(VIEW_DIR).multiplyScalar(500);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minZoom = 0.3;
        this.controls.maxZoom = 4;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.08; // stay above the floor
        // Same convention as the Nexus and the map: left-drag rotates, right-drag moves.
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(120, 260, 160);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fb4c8, 0.4);
        rim.position.set(-180, 90, -140);
        this.scene.add(rim);

        this.shared = this._sharedAssets();
        this.floor = this._buildFloor();
        this.scene.add(this.floor);

        this.nodeGroup = new THREE.Group();
        this.edgeGroup = new THREE.Group();
        this.fxGroup = new THREE.Group();
        this.scene.add(this.nodeGroup, this.edgeGroup, this.fxGroup);

        /** id -> node record (see _addNode) */
        this.nodes = new Map();
        this.edges = [];
        this.sparks = [];
        this.selectedId = null;
        this.linkFromId = null;
        this.hoverId = null;
        this._fitted = false;
        this.time = 0;

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

    /* ------------------------------------------------------------------ */
    /*  Assets                                                             */
    /* ------------------------------------------------------------------ */

    _sharedAssets() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.22, 'rgba(255,255,255,.5)');
        grad.addColorStop(0.6, 'rgba(255,255,255,.06)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const glow = new THREE.CanvasTexture(c);
        glow.colorSpace = THREE.SRGBColorSpace;

        const glassShape = new THREE.CylinderGeometry(COLUMN_R, COLUMN_R, COLUMN_H, 6, 1, true);
        const liquid = new THREE.CylinderGeometry(COLUMN_R - 0.9, COLUMN_R - 0.9, 1, 6);
        liquid.translate(0, 0.5, 0); // grows upward from its base
        const pipe = new THREE.CylinderGeometry(0.75, 0.75, 1, 8);
        pipe.rotateX(Math.PI / 2); // along +Z, scaled to length
        const cone = new THREE.ConeGeometry(2.4, 6, 6);
        cone.rotateX(Math.PI / 2);

        return {
            glow,
            base: new THREE.CylinderGeometry(10, 11.5, BASE_H, 6),
            ring: new THREE.RingGeometry(11.8, 13, 6),
            glass: glassShape,
            glassEdges: new THREE.EdgesGeometry(new THREE.CylinderGeometry(COLUMN_R, COLUMN_R, COLUMN_H, 6)),
            liquid,
            cap: new THREE.CylinderGeometry(COLUMN_R + 1.2, COLUMN_R + 1.2, 1.6, 6),
            pipe,
            cone,
            steel: new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.75, roughness: 0.42 }),
            pipeIdle: new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.7, roughness: 0.45 }),
            pipeLit: new THREE.MeshStandardMaterial({ color: 0x6b1a20, emissive: ANIMUS, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.4 }),  // recoloured by setColors
            edgeLine: new THREE.LineBasicMaterial({ color: STEEL_EDGE, transparent: true, opacity: 0.4 }),
            packet: new THREE.SpriteMaterial({ map: glow, color: 0xff7a84, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
            spark: new THREE.SpriteMaterial({ map: glow, color: 0xff7a84, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
        };
    }

    _glow(color, scale, opacity) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.shared.glow, color: new THREE.Color(color), transparent: true, opacity,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        s.scale.setScalar(scale);
        return s;
    }

    _buildFloor() {
        // A faint workshop floor: a fine grid and a ritual hexagon, scaled to the roadmap.
        const floor = new THREE.Group();
        const grid = new THREE.GridHelper(1, 24, 0x2a2e35, 0x16181c);
        grid.material.transparent = true;
        grid.material.opacity = 0.55;
        floor.add(grid);
        const mat = new THREE.LineBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.08 });
        const hex = (r, rot = 0) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 6 }, (_, i) => {
                const a = rot + (i / 6) * Math.PI * 2;
                return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            })), mat);
        floor.add(hex(0.36), hex(0.44, Math.PI / 6), hex(0.5));
        floor.position.y = -0.2;
        floor.scale.setScalar(300);
        return floor;
    }

    /* ------------------------------------------------------------------ */
    /*  Data                                                               */
    /* ------------------------------------------------------------------ */

    /**
     * @param {import('./roadmap.js').RoadmapAnalysis} analysis
     * @param {{ selectedId?: string | null, linkFromId?: string | null, refit?: boolean }} [opts]
     */
    update(analysis, { selectedId = null, linkFromId = null, refit = false } = {}) {
        this.selectedId = selectedId;
        this.linkFromId = linkFromId;
        const ids = new Set(analysis.actions.map((a) => a.id));
        for (const [id, node] of this.nodes) {
            if (!ids.has(id)) this._removeNode(id, node);
        }

        const L = analysis.layers.length;
        for (const info of analysis.actions) {
            const count = analysis.layers[info.layer]?.length ?? 1;
            const x = (info.layer - (L - 1) / 2) * LAYER_X;
            const z = (info.row - (count - 1) / 2) * ROW_Z;
            let node = this.nodes.get(info.id);
            if (!node) node = this._addNode(info, x, z);
            node.target.set(x, 0, z);
            node.title = info.title;
            const { verb, subject } = splitTitle(info.title);
            node.labelId.textContent = verb ? `${info.id} · ${verb}` : info.id;
            node.labelTitle.textContent = subject || verb;
            node.label.classList.toggle('noverb', !verb);
            node.label.title = `${info.id} · ${info.title}`;
            this._setState(node, info.state);
        }

        this._rebuildEdges(analysis);

        // floor follows the roadmap's size
        const span = Math.max(L * LAYER_X, Math.max(1, ...analysis.layers.map((l) => l.length)) * ROW_Z);
        this.floor.scale.setScalar(Math.max(300, span * 1.6));

        if (analysis.actions.length && (refit || !this._fitted)) {
            this.fit(analysis);
            this._fitted = true;
        }
        if (!analysis.actions.length) this._fitted = false;
    }

    _addNode(info, x, z) {
        const S = this.shared;
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.scale.setScalar(0.01); // grows in

        const base = new THREE.Mesh(S.base, S.steel);
        base.position.y = BASE_H / 2;
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a3e45, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(S.ring, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;

        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xcfd8e3, transparent: true, opacity: 0.1, metalness: 0.1, roughness: 0.08,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const glass = new THREE.Mesh(S.glass, glassMat);
        glass.position.y = BASE_H + COLUMN_H / 2;
        const edges = new THREE.LineSegments(S.glassEdges, S.edgeLine);
        edges.position.copy(glass.position);

        const liquidMat = new THREE.MeshStandardMaterial({
            color: SHADE, emissive: ALLOY, emissiveIntensity: 0, transparent: true, opacity: 0.9,
            metalness: 0, roughness: 0.65, // matte, so white highlights don't wash the hue out
        });
        const liquid = new THREE.Mesh(S.liquid, liquidMat);
        liquid.position.y = BASE_H + 0.4;
        liquid.scale.y = 0.01;

        const cap = new THREE.Mesh(S.cap, S.steel);
        cap.position.y = BASE_H + COLUMN_H + 0.8;

        const glow = this._glow(ALLOY, 34, 0);
        glow.position.y = BASE_H + COLUMN_H + 3;
        const halo = this._glow(0xffffff, 40, 0); // selection / link-source halo at the base
        halo.position.y = 2;

        for (const m of [base, glass, liquid, cap]) m.userData.id = info.id;
        group.add(base, ring, glass, edges, liquid, cap, glow, halo);
        this.nodeGroup.add(group);

        const label = el('div', 'alm-label');
        const labelId = el('b', '', info.id);
        const labelTitle = el('span', '', info.title);
        label.append(labelId, labelTitle);
        label.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(info.id); });
        label.addEventListener('dblclick', (e) => { e.stopPropagation(); this.onActivate(info.id); });
        label.addEventListener('pointerenter', () => this._setHover(info.id));
        label.addEventListener('pointerleave', () => this._setHover(null));
        this.labels.appendChild(label);

        const node = {
            id: info.id, group, ring, glass, liquid, glow, halo, label, labelId, labelTitle,
            target: new THREE.Vector3(x, 0, z), fill: 0, state: null, flare: 0, phase: Math.random() * Math.PI * 2,
        };
        this.nodes.set(info.id, node);
        return node;
    }

    _removeNode(id, node) {
        this.nodeGroup.remove(node.group);
        node.group.traverse((o) => {
            // shared geometries/materials stay; per-node materials go
            if (o.material && ![this.shared.steel, this.shared.edgeLine].includes(o.material)) o.material.dispose();
        });
        node.label.remove();
        this.nodes.delete(id);
        if (this.hoverId === id) this._setHover(null);
    }

    /** The colours of incomplete and complete actions (the adventure's matter); restyles every still. */
    setColors(todo, done) {
        const key = `${todo}|${done}`;
        if (key === this._colorKey) return;
        this._colorKey = key;
        this.looks = looks(todo, done);
        const d = new THREE.Color(done);
        this.shared.pipeLit.color.copy(d).multiplyScalar(0.45);
        this.shared.pipeLit.emissive.copy(d);
        this.shared.packet.color.copy(d).lerp(new THREE.Color(0xffffff), 0.3);
        this.shared.spark.color.copy(this.shared.packet.color);
        for (const node of this.nodes.values()) {
            const state = node.state;
            node.state = null;
            this._setState(node, state, true);
        }
    }

    _setState(node, state, quiet = false) {
        if (node.state === state) return;
        const wasDone = node.state === 'done';
        node.state = state;
        this.looks ??= looks(ALLOY, ANIMUS);
        const look = this.looks[state];
        node.look = look;
        node.liquid.material.color.setHex(look.liquid);
        node.liquid.material.emissive.setHex(look.light);
        node.glow.material.color.setHex(look.light);
        node.ring.material.color.setHex(look.ring);
        node.glass.material.opacity = state === 'locked' ? 0.07 : 0.12;
        node.label.dataset.state = state;
        if (state === 'done' && !wasDone && !quiet && node.fill > 0) node.flare = 1; // just completed: flare
    }

    _rebuildEdges(analysis) {
        for (const e of this.edges) {
            this.edgeGroup.remove(e.pipe, e.cone, e.packet);
        }
        this.edges = [];
        for (const info of analysis.actions) {
            for (const childId of info.children) {
                const lit = info.state === 'done';
                const pipe = new THREE.Mesh(this.shared.pipe, lit ? this.shared.pipeLit : this.shared.pipeIdle);
                const cone = new THREE.Mesh(this.shared.cone, lit ? this.shared.pipeLit : this.shared.pipeIdle);
                const packet = new THREE.Sprite(this.shared.packet);
                packet.scale.setScalar(7);
                packet.visible = lit;
                this.edgeGroup.add(pipe, cone, packet);
                this.edges.push({ from: info.id, to: childId, pipe, cone, packet, lit, offset: Math.random() });
            }
        }
    }

    /** Frame the whole roadmap. */
    fit(analysis) {
        const L = Math.max(1, analysis.layers.length);
        const R = Math.max(1, ...analysis.layers.map((l) => l.length));
        const w = L * LAYER_X + 40, d = R * ROW_Z + 40;
        const diag = Math.hypot(w, d);
        const rect = this.container.getBoundingClientRect();
        const aspect = rect.width && rect.height ? rect.width / rect.height : 1.6;
        const zoom = Math.min(FRUSTUM / (diag * 0.62 + 40), (FRUSTUM * aspect) / (diag * 1.05 + 40));
        this.controls.target.set(0, COLUMN_H / 3, 0);
        this.camera.position.copy(VIEW_DIR).multiplyScalar(500).add(this.controls.target);
        this.camera.zoom = THREE.MathUtils.clamp(zoom, 0.35, 2.4);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    /** Every still flares and throws sparks: the roadmap is complete. */
    celebrate() {
        for (const node of this.nodes.values()) {
            node.flare = 1.4;
            for (let i = 0; i < 12; i++) {
                const s = new THREE.Sprite(this.shared.spark.clone());
                s.scale.setScalar(3 + Math.random() * 3);
                s.position.set(node.group.position.x, BASE_H + COLUMN_H + 2, node.group.position.z);
                const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 22;
                s.userData = { v: new THREE.Vector3(Math.cos(a) * r, 34 + Math.random() * 40, Math.sin(a) * r), life: 1 + Math.random() * 0.8, age: 0 };
                this.fxGroup.add(s);
                this.sparks.push(s);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Interaction                                                        */
    /* ------------------------------------------------------------------ */

    _pick(ev) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this._ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this._ndc, this.camera);
        const hit = this.raycaster.intersectObjects(this.nodeGroup.children, true).find((h) => h.object.userData.id);
        return hit ? hit.object.userData.id : null;
    }

    _setHover(id) {
        if (id === this.hoverId) return;
        this.hoverId = id;
        this.renderer.domElement.style.cursor = id ? 'pointer' : '';
        for (const node of this.nodes.values()) node.label.classList.toggle('hover', node.id === id);
        this.onHover(id);
    }

    _bindEvents() {
        const canvas = this.renderer.domElement;
        this._onDown = (ev) => { this._down = [ev.clientX, ev.clientY]; };
        this._onUp = (ev) => {
            if (ev.button !== 0 || !this._down) return;
            if (Math.hypot(ev.clientX - this._down[0], ev.clientY - this._down[1]) > 5) return; // that was a drag
            this.onSelect(this._pick(ev));
        };
        this._onDbl = (ev) => {
            const id = this._pick(ev);
            if (id) this.onActivate(id);
        };
        this._onMove = (ev) => { if (!ev.buttons) this._setHover(this._pick(ev)); };
        this._onLeave = () => this._setHover(null);
        this._onContext = (ev) => ev.preventDefault();
        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointerup', this._onUp);
        canvas.addEventListener('dblclick', this._onDbl);
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('pointerleave', this._onLeave);
        canvas.addEventListener('contextmenu', this._onContext);
    }

    _resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        const aspect = w / h;
        this.camera.left = (-FRUSTUM * aspect) / 2;
        this.camera.right = (FRUSTUM * aspect) / 2;
        this.camera.top = FRUSTUM / 2;
        this.camera.bottom = -FRUSTUM / 2;
        this.camera.updateProjectionMatrix();
    }

    /* ------------------------------------------------------------------ */
    /*  Frame                                                              */
    /* ------------------------------------------------------------------ */

    _frame(now) {
        const dt = Math.min((now - this._last) / 1000, 0.1);
        this._last = now;
        this.time += dt;
        const k = 1 - Math.exp(-dt * 8);
        this.controls.update();

        for (const node of this.nodes.values()) {
            const look = node.look ?? (this.looks ??= looks(ALLOY, ANIMUS)).locked;
            node.group.position.lerp(node.target, k);
            const s = node.group.scale.x + (1 - node.group.scale.x) * k;
            node.group.scale.setScalar(s);

            node.fill += (look.fill - node.fill) * (1 - Math.exp(-dt * 3)); // liquid rises/falls
            node.liquid.scale.y = Math.max(0.01, node.fill * (COLUMN_H - 1.2));
            node.flare = Math.max(0, node.flare - dt * 0.9);

            const pulse = node.state === 'ready' ? 0.5 + 0.5 * Math.sin(this.time * 3 + node.phase) : 1;
            // capped: past ~1.1 the red channel clips and the hue drifts toward yellow-white
            node.liquid.material.emissiveIntensity = Math.min(1.1, look.emissive * (node.state === 'ready' ? 0.6 + 0.4 * pulse : 1) + node.flare * 0.3);
            node.glow.material.opacity = look.glow * (node.state === 'ready' ? 0.45 + 0.55 * pulse : 1) + node.flare * 0.8;
            node.glow.scale.setScalar(34 + node.flare * 30);
            node.glow.position.y = BASE_H + Math.max(4, node.fill * COLUMN_H) + 2;

            const selected = node.id === this.selectedId;
            const linking = node.id === this.linkFromId;
            const hover = node.id === this.hoverId;
            node.ring.material.opacity = Math.min(1, look.ringOpacity + (hover ? 0.3 : 0));
            if (selected || linking) node.ring.material.color.setHex(0xffffff);
            else node.ring.material.color.setHex(look.ring);
            node.halo.material.opacity = linking ? 0.35 + 0.25 * Math.sin(this.time * 6) : selected ? 0.32 : hover ? 0.12 : 0;
        }

        // pipes follow their stills; lit ones carry a packet of distillate
        const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
        for (const e of this.edges) {
            const src = this.nodes.get(e.from), tgt = this.nodes.get(e.to);
            if (!src || !tgt) continue;
            a.copy(src.group.position).setY(2.2);
            b.copy(tgt.group.position).setY(2.2);
            dir.subVectors(b, a);
            const len = dir.length();
            if (len < 28) { e.pipe.visible = e.cone.visible = e.packet.visible = false; continue; }
            dir.divideScalar(len);
            const start = a.clone().addScaledVector(dir, 13);
            const end = b.clone().addScaledVector(dir, -16);
            const seg = start.distanceTo(end);
            e.pipe.visible = e.cone.visible = true;
            e.pipe.position.addVectors(start, end).multiplyScalar(0.5);
            e.pipe.scale.set(1, 1, seg);
            e.pipe.lookAt(end);
            e.cone.position.copy(end).addScaledVector(dir, 3);
            e.cone.lookAt(b);
            if (e.lit) {
                const t = (this.time * 0.45 + e.offset) % 1;
                e.packet.visible = true;
                e.packet.position.lerpVectors(start, end, t).setY(3);
            }
        }

        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            const u = s.userData;
            u.age += dt;
            u.v.y -= 60 * dt;
            s.position.addScaledVector(u.v, dt);
            s.material.opacity = Math.max(0, 1 - u.age / u.life);
            if (u.age >= u.life) {
                this.fxGroup.remove(s);
                s.material.dispose();
                this.sparks.splice(i, 1);
            }
        }

        this.renderer.render(this.scene, this.camera);
        this._placeLabels();
    }

    _placeLabels() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        for (const node of this.nodes.values()) {
            this._v.copy(node.group.position);
            this._v.y = BASE_H + COLUMN_H + 9;
            this._v.project(this.camera);
            const off = this._v.z > 1 || Math.abs(this._v.x) > 1.2 || Math.abs(this._v.y) > 1.2;
            node.label.style.display = off ? 'none' : '';
            if (off) continue;
            const x = (this._v.x * 0.5 + 0.5) * w, y = (-this._v.y * 0.5 + 0.5) * h;
            node.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
            node.label.style.zIndex = String(1000 - Math.round(this._v.z * 500));
            node.label.classList.toggle('selected', node.id === this.selectedId);
            node.label.classList.toggle('linking', node.id === this.linkFromId);
        }
    }

    dispose() {
        this.view.cancelAnimationFrame(this._raf);
        this._ro?.disconnect();
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this._onDown);
        canvas.removeEventListener('pointerup', this._onUp);
        canvas.removeEventListener('dblclick', this._onDbl);
        canvas.removeEventListener('pointermove', this._onMove);
        canvas.removeEventListener('pointerleave', this._onLeave);
        canvas.removeEventListener('contextmenu', this._onContext);
        this.controls.dispose();
        this.scene.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        });
        for (const v of Object.values(this.shared)) v?.dispose?.();
        this.renderer.dispose();
        this.container.remove();
    }
}
