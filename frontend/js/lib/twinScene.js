// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// SignalChainPanel.js is the typed boundary. Topology: twinTopology.js; numbers: twinModel.js.

/**
 * TwinScene — the signal chain as machines in three zones (BUILD_PLAN.md, phase 3):
 *
 *   NET     foundry floor: harvesters -> centrifuge -> sump; the forge
 *   CORE    raised bench:  hopper -> refinery -> alembic -> crucible -> arena -> treasury
 *           -> archive; necropolis in front (kill manifold), codex cabinet behind
 *   GALLERY back, raised:  nexus (the lantern), atlas, calendar, copper wires between them
 *
 * Liquid height = rows held (each zone on its own scale); pipe bore = sqrt(packets over
 * the flows window); packets = logged transitions, travelling the pipes.
 *
 * Light (phase 4): lit liquid in lens bands with ghost liquid above it; packets in their
 * row's lens colour, dim if the row fails the filter; the lantern's hood closes and its
 * lamp blinks amber while the Nexus draft is pending; a relight (filter or lens change)
 * sweeps the beam across the machines, each relighting as it passes, after a pulse down
 * the wire when the calendar or atlas caused it; a magic circle under the selected row's
 * machine, in the row's colour. Each vessel's base is a button (a rune collar) that
 * cycles its stage in the filter.
 *
 *   scene.update({ nodes, pipes, levels, codex, flows, colors, sources, io,
 *                  centrifugeBySource, stageFilter, light, packetStyle, fresh })
 *   scene.relight({ from })               // from: 'calendar' | 'atlas' | null
 *   scene.setSelection(nodeId, color)     // a magic circle at the base of the row's machine
 *   scene.play(transitions, { replay })   // replay: compress into a few seconds
 *   scene.fit()                           // frame everything
 *   scene.dispose()
 *
 * Callbacks: onActivate(nodeId) (click a machine), onCommand(command, nodeId)
 * (harvest | feed | siphon | purge buttons on the labels), onRing(nodeId) (click a
 * vessel's base ring: cycle its stage in the filter), onLens(step) (the lantern's wheel).
 * Controls match the other scenes: left-drag rotates, right-drag moves, scroll zooms.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { magicCircleCanvases } from './magicCircle.js';
import { deferredResize, isResizing, viewOf } from './resizing.js';
import { CENTRIFUGE, CODEX, FORGE, MAIN_CHAIN, NECROPOLIS, OUTSIDE, SUMP, pipeIndex, route } from './twinTopology.js';

const NET_Y = 8;          // the foundry floor's platform
const CORE_Y = 26;        // the lab bench
const GALLERY_Y = 52;     // the viewers' gallery
const PIPE_H = 5;         // pipes run this far above a machine's floor
const MANIFOLD_Z = 62;    // the kill manifold runs in front of the core chain
const FRUSTUM = 300;
const VIEW_DIR = new THREE.Vector3(0.55, 0.85, 1.15).normalize();

const SIZE = {
    vessel: { r: 9, h: 26 },
    processor: { r: 9, h: 26 },
    harvester: { r: 6.5, h: 18 },
};
const MIN_CAP = { net: 20, core: 6 };   // a zone's scale never shrinks below this many rows
const PACKET_SPEED = 55;                 // world units per second
const MIN_TRIP_S = 1.2;                  // even a short hop stays visible this long
const MAX_PACKETS = 400;
const REPLAY_MAX = 40;
const REPLAY_SECONDS = 5;
const BURST_MAX = 8;                     // packets drawn per (from, to) in one batch

const SWEEP_S = 1.6;                     // the beam crosses the machines in this long
const PULSE_S = 0.7;                     // a pulse runs down a copper wire in this long
const AMBER = 0xf2a33a;
const COPPER = 0xb87333;
const RING_COLORS = { include: '#ffffff', exclude: '#e0524a' };

const STEEL = 0x23262b;
const STEEL_EDGE = 0x7a808a;
const BRASS = 0xc8a46a;

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // names are never parsed as HTML
    return n;
}

/** Where each machine stands. @param {{ id: string, zone: string, kind: string }[]} nodes */
function layout(nodes) {
    const pos = new Map();
    const harvesters = nodes.filter((n) => n.kind === 'harvester');
    // a row that reads left to right on screen (+x and -z together)
    harvesters.forEach((n, i) => pos.set(n.id, new THREE.Vector3(-430 + i * 50, NET_Y, 80 - i * 72)));
    const fixed = {
        [CENTRIFUGE]: [-210, NET_Y, 0], [SUMP]: [-210, NET_Y, 104], [FORGE]: [-250, NET_Y, -150],
        [CODEX]: [-50, CORE_Y, -96], entropy_market: [250, CORE_Y, -96],
        [NECROPOLIS]: [110, CORE_Y, 112],
        nexus: [-60, GALLERY_Y, -196], atlas: [70, GALLERY_Y, -196], calendar: [200, GALLERY_Y, -196],
    };
    MAIN_CHAIN.forEach((id, i) => { fixed[id] = [-120 + i * 70, CORE_Y, 0]; });
    for (const n of nodes) if (fixed[n.id]) pos.set(n.id, new THREE.Vector3(...fixed[n.id]));
    return pos;
}

/** The polyline a pipe follows, from `a` to `b` (right angles, like real plumbing). */
function pipePath(pipe, pos) {
    const A = pos.get(pipe.a), B = pos.get(pipe.b);
    if (pipe.a === OUTSIDE) {
        const p = B.clone().setY(B.y + PIPE_H);
        return [new THREE.Vector3(p.x - 70, p.y, p.z), p];
    }
    if (!A || !B) return null;
    const a = A.clone().setY(A.y + PIPE_H), b = B.clone().setY(B.y + PIPE_H);
    if (pipe.b === NECROPOLIS) {
        return [a, new THREE.Vector3(a.x, a.y, MANIFOLD_Z), new THREE.Vector3(b.x, b.y, MANIFOLD_Z), b];
    }
    if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6) {
        if (Math.abs(a.y - b.y) < 1e-6) return [a, b];
    }
    const mx = (a.x + b.x) / 2;
    return [a, new THREE.Vector3(mx, a.y, a.z), new THREE.Vector3(mx, b.y, a.z), new THREE.Vector3(mx, b.y, b.z), b]
        .filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-6);
}

/** Total length of a polyline. */
function pathLength(points) {
    let n = 0;
    for (let i = 1; i < points.length; i++) n += points[i].distanceTo(points[i - 1]);
    return n;
}

/** The point `d` units along a polyline. */
function pointAt(points, d, out) {
    for (let i = 1; i < points.length; i++) {
        const seg = points[i].distanceTo(points[i - 1]);
        if (d <= seg) return out.lerpVectors(points[i - 1], points[i], seg ? d / seg : 0);
        d -= seg;
    }
    return out.copy(points[points.length - 1]);
}

export class TwinScene {
    /** @param {HTMLElement} parent @param {any} [callbacks] */
    constructor(parent, { onActivate = () => {}, onCommand = () => {}, onRing = () => {}, onLens = () => {} } = {}) {
        this.onActivate = onActivate;
        this.onCommand = onCommand;
        this.onRing = onRing;
        this.onLens = onLens;

        // the window this scene is shown in (a popped-out panel lives in its own window)
        this.view = viewOf(parent);
        this.container = el('div', 'twin-root');
        parent.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0); // the panel's glass shows through
        this.container.appendChild(this.renderer.domElement);

        this.labels = el('div', 'twin-labels');
        this.container.appendChild(this.labels);

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
        this.camera.position.copy(VIEW_DIR).multiplyScalar(800);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minZoom = 0.25;
        this.controls.maxZoom = 6;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const key = new THREE.DirectionalLight(0xffffff, 1.05);
        key.position.set(160, 320, 220);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fb4c8, 0.45);
        rim.position.set(-260, 120, -200);
        this.scene.add(rim);

        this.shared = this._sharedAssets();
        this.scene.add(this._buildStage());

        this.machineGroup = new THREE.Group();
        this.pipeGroup = new THREE.Group();
        this.scene.add(this.machineGroup, this.pipeGroup);

        this.packetMesh = new THREE.InstancedMesh(this.shared.packetGeo, this.shared.packetMat, MAX_PACKETS);
        this.packetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.packetMesh.count = 0;
        this.packetMesh.frustumCulled = false;
        this.scene.add(this.packetMesh);

        this.lightGroup = new THREE.Group(); // wires, beam, the selection's magic circle
        this.scene.add(this.lightGroup);
        this._buildLight();

        /** id -> machine record (see _addMachine) */
        this.machines = new Map();
        /** id -> pipe record { pipe, points, meshes, joints, bore, color } */
        this.pipes = new Map();
        this.pipesByEnds = new Map();
        this.packets = [];      // { points, length, d, delay, color, scale, to }
        this.positions = new Map();
        this.hoverId = null;
        this.hoverRing = false;
        this.wires = new Map();  // 'atlas' | 'calendar' -> { curve, mesh }
        this.pulses = [];        // { curve, t, dur, sprite }
        this.sweepT = -1;        // time the current beam sweep started (-1: none)
        this.selection = { nodeId: null, color: '#ffffff' };
        this.data = null;
        this.lastPlayedId = 0;
        this._nodeKey = '';
        this._fitted = false;
        this.time = 0;

        this.raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._v = new THREE.Vector3();
        this._m = new THREE.Matrix4();
        this._q = new THREE.Quaternion();
        this._s = new THREE.Vector3();
        this._c = new THREE.Color();
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
    /*  Assets and the stage                                               */
    /* ------------------------------------------------------------------ */

    _sharedAssets() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,.45)');
        grad.addColorStop(0.65, 'rgba(255,255,255,.05)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const glow = new THREE.CanvasTexture(c);
        glow.colorSpace = THREE.SRGBColorSpace;

        const segment = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
        segment.rotateX(Math.PI / 2); // along +Z, scaled to length
        const liquid = new THREE.CylinderGeometry(1, 1, 1, 16);
        liquid.translate(0, 0.5, 0); // grows upward from its base

        return {
            glow,
            segment,
            joint: new THREE.SphereGeometry(1, 10, 8),
            liquid,
            packetGeo: new THREE.SphereGeometry(1, 10, 8),
            packetMat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
            steel: new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.75, roughness: 0.42 }),
            steelDim: new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.6, roughness: 0.6, transparent: true, opacity: 0.45 }),
            brass: new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.85, roughness: 0.35 }),
            edgeLine: new THREE.LineBasicMaterial({ color: STEEL_EDGE, transparent: true, opacity: 0.35 }),
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

    /** Floor grid, the core bench and the viewers' gallery, with zone names. */
    _buildStage() {
        const stage = new THREE.Group();
        const grid = new THREE.GridHelper(900, 45, 0x2a2e35, 0x15171b);
        grid.material.transparent = true;
        grid.material.opacity = 0.5;
        grid.position.set(0, -0.2, 0);
        stage.add(grid);

        const slab = (x0, x1, z0, z1, top, color) => {
            const geo = new THREE.BoxGeometry(x1 - x0, top, z1 - z0);
            const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.7, transparent: true, opacity: 0.55 }));
            mesh.position.set((x0 + x1) / 2, top / 2, (z0 + z1) / 2);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.shared.edgeLine);
            mesh.add(edges);
            stage.add(mesh);
        };
        slab(-505, -172, -185, 142, NET_Y, 0x121418);    // net platform
        slab(-160, 360, -140, 150, CORE_Y, 0x14161a);    // core bench
        slab(-120, 260, -230, -160, GALLERY_Y, 0x111317); // gallery

        this.zoneLabels = [
            { text: 'Net', at: new THREE.Vector3(-350, NET_Y, 130) },
            { text: 'Core', at: new THREE.Vector3(-150, CORE_Y, 145) },
            { text: 'Gallery', at: new THREE.Vector3(-110, GALLERY_Y, -165) },
        ].map((z) => {
            const label = el('div', 'twin-zone', z.text);
            this.labels.appendChild(label);
            return { ...z, label };
        });
        return stage;
    }

    /** A cone with its apex at the origin, opening along +Z (scale: radius, radius, length). */
    _coneGeo() {
        const g = new THREE.ConeGeometry(1, 1, 28, 1, true);
        g.translate(0, -0.5, 0);
        g.rotateX(-Math.PI / 2);
        return g;
    }

    /** The lantern's beam and the selection's magic circle (wires come with the machines). */
    _buildLight() {
        const beamMat = (color) => new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
            depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        });
        this.beam = new THREE.Mesh(this._coneGeo(), beamMat(0xfff1d0));
        this.beam.visible = false;
        this.beamSpot = this._glow(0xfff1d0, 90, 0);
        this.beamSpot.visible = false;

        // the selection: a magic circle of two counter-rotating layers on the floor
        const { outer, inner } = magicCircleCanvases(512);
        const layer = (cv) => {
            const tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
                map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
            }));
            m.rotation.x = -Math.PI / 2;
            return m;
        };
        this.circle = new THREE.Group();
        this.circleOuter = layer(outer);
        this.circleInner = layer(inner);
        this.circleGlow = this._glow(0xffffff, 1, 0);
        this.circleGlow.position.y = 3;
        this.circle.add(this.circleOuter, this.circleInner, this.circleGlow);
        this.circle.visible = false;
        this.circleOn = 0;          // fades in and out
        this.circleSize = 30;
        this.circleTextures = [this.circleOuter.material.map, this.circleInner.material.map];
        this.lightGroup.add(this.beam, this.beamSpot, this.circle);
    }

    /* ------------------------------------------------------------------ */
    /*  Machines                                                           */
    /* ------------------------------------------------------------------ */

    _addMachine(node, position, color) {
        const group = new THREE.Group();
        group.position.copy(position);
        const steel = node.locked ? this.shared.steelDim : this.shared.steel;
        const rec = { id: node.id, node, group, color, fill: 0, target: 0, segments: [], rotor: null, flare: 0, spin: 0 };
        const tag = (mesh) => { mesh.userData.id = node.id; return mesh; };

        const size = SIZE[node.kind];
        if (size) {
            // plinth, glass column, liquid, cap, and a rune ring in the matter's color
            const { r, h } = size;
            group.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(r + 2, r + 3.5, 3, 16), steel)));
            const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true), new THREE.MeshPhysicalMaterial({
                color: 0x9fb4c8, transparent: true, opacity: node.locked ? 0.05 : 0.12, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
            }));
            glass.position.y = 3 + h / 2;
            group.add(tag(glass));
            const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, h, 8)), this.shared.edgeLine);
            rim.position.y = 3 + h / 2;
            group.add(rim);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.2, r + 1.2, 1.6, 16), steel);
            cap.position.y = 3 + h + 0.8;
            group.add(tag(cap));
            rec.liquidBase = 3.4;
            rec.liquidMax = h - 1;
            rec.liquidR = r - 0.9;
            // the base button: a rune collar round the plinth, with a bright rune ring on
            // top in the matter's colour (white = included, red = excluded). Pressing it
            // cycles the stage in the filter.
            const button = new THREE.Group();
            const collar = new THREE.Mesh(new THREE.TorusGeometry(r + 5.4, 2.3, 10, 40), new THREE.MeshStandardMaterial({
                color: 0x2b2f36, metalness: 0.75, roughness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: node.locked ? 0 : 0.2,
            }));
            collar.rotation.x = Math.PI / 2;
            collar.scale.z = 0.55; // flattened: a low, wide button
            button.add(collar);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 5.4, 0.5, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: node.locked ? 0.2 : 0.75 }));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 1.35;
            button.add(ring);
            button.position.y = 1;
            group.add(button);
            rec.ring = ring;
            rec.collar = collar;
            rec.button = button;
            rec.ringMode = null;
            rec.lift = 0;
            rec.press = 0;
            if (!node.locked && node.holds && node.holds !== 'objects') {
                collar.userData.ring = node.id;
                // a generous invisible hit area over the whole collar
                const hit = new THREE.Mesh(new THREE.CylinderGeometry(r + 8.5, r + 8.5, 4, 32, 1, true), new THREE.MeshBasicMaterial({
                    transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide,
                }));
                hit.userData.ring = node.id;
                button.add(hit);
                const hitTop = new THREE.Mesh(new THREE.RingGeometry(r + 2, r + 8.5, 32), hit.material);
                hitTop.rotation.x = -Math.PI / 2;
                hitTop.position.y = 2;
                hitTop.userData.ring = node.id;
                button.add(hitTop);
            }

            if (node.kind === 'processor' || node.kind === 'harvester') {
                // kinetic machinery outside the glass: a turning cage
                const cage = new THREE.Group();
                for (let i = 0; i < 4; i++) {
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h + 2, 6), this.shared.brass);
                    const a = (i / 4) * Math.PI * 2;
                    bar.position.set(Math.cos(a) * (r + 2.2), 3 + h / 2, Math.sin(a) * (r + 2.2));
                    cage.add(bar);
                }
                const hoop = new THREE.Mesh(new THREE.TorusGeometry(r + 2.2, 0.55, 6, 24), this.shared.brass);
                hoop.rotation.x = Math.PI / 2;
                hoop.position.y = 3 + h * 0.75;
                cage.add(hoop);
                if (node.kind === 'harvester') {
                    const drill = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9, 8), this.shared.brass);
                    drill.position.y = 3 + h + 6;
                    drill.rotation.x = Math.PI;
                    cage.add(drill);
                }
                group.add(cage);
                rec.rotor = cage;
            }
        } else if (node.kind === 'dynamo') {
            // no glass, no liquid: a housing and a flywheel
            const box = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 18), steel);
            box.position.y = 5;
            group.add(tag(box));
            const wheel = new THREE.Group();
            const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(9, 1.4, 8, 24), node.locked ? steel : this.shared.brass);
            wheel.add(tag(rimMesh));
            for (let i = 0; i < 3; i++) {
                const spoke = new THREE.Mesh(new THREE.BoxGeometry(17, 1.2, 1.2), steel);
                spoke.rotation.z = (i / 3) * Math.PI;
                wheel.add(spoke);
            }
            wheel.position.set(0, 19, 0);
            group.add(wheel);
            rec.rotor = wheel;
            rec.rotorAxis = 'z';
            if (node.id === FORGE) {
                const core = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: color, emissiveIntensity: 1.2 }));
                core.position.set(0, 12, 0);
                group.add(tag(core));
            }
        } else if (node.kind === 'cabinet') {
            // the codex: a cabinet of three jars (pillars, sites, contacts), filled in phase 5
            const box = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 16), steel);
            box.position.y = 2;
            group.add(tag(box));
            rec.jars = [-10, 0, 10].map((x) => {
                const jar = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 14, 12, 1, true), new THREE.MeshPhysicalMaterial({
                    color: 0x9fb4c8, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false,
                }));
                jar.position.set(x, 11, 0);
                group.add(tag(jar));
                const fill = new THREE.Mesh(this.shared.liquid, new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: BRASS, emissiveIntensity: 0.8 }));
                fill.position.set(x, 4.2, 0);
                fill.scale.set(3, 0.01, 3);
                group.add(fill);
                return fill;
            });
        } else if (node.id === 'nexus') {
            this._buildLantern(rec, tag, steel);
        } else if (node.kind === 'viewer') {
            // armillary rings on a pedestal
            const ped = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 8, 12), steel);
            ped.position.y = 4;
            group.add(tag(ped));
            const rings = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(9 - i * 1.6, 0.5, 6, 32), this.shared.brass);
                ring.rotation.set(i * 0.9, i * 0.6, 0);
                rings.add(tag(ring));
            }
            rings.position.y = 19;
            group.add(rings);
            rec.rotor = rings;
        }

        rec.glow = this._glow(color, 40, 0);
        rec.glow.position.y = 14;
        group.add(rec.glow);

        this.machineGroup.add(group);
        rec.label = this._makeLabel(node);
        this.machines.set(node.id, rec);
        return rec;
    }

    /**
     * The nexus as a lantern: a lamp on a post, a hood that drops over it while the Nexus
     * draft is pending, a status lamp, and a wheel of coloured glass (the lens) around it.
     */
    _buildLantern(rec, tag, steel) {
        const g = rec.group;
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 6, 12), steel);
        ped.position.y = 3;
        g.add(tag(ped));
        const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 12, 8), this.shared.brass);
        post.position.y = 12;
        g.add(post);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 14), new THREE.MeshStandardMaterial({
            color: 0x332a18, emissive: 0xfff1d0, emissiveIntensity: 1.6,
        }));
        lamp.position.y = 22;
        g.add(tag(lamp));
        const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(6, 6, 11, 6)), new THREE.LineBasicMaterial({ color: BRASS }));
        cage.position.y = 22;
        g.add(cage);
        // the hood: a brass cap that slides down over the lamp
        const hood = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(3, 7.4, 9, 16, 1, true), new THREE.MeshStandardMaterial({
            color: BRASS, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide,
        }));
        hood.add(tag(shell));
        const top = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.8, 16), this.shared.brass);
        top.position.y = 4.5;
        hood.add(top);
        hood.position.y = 33;
        g.add(hood);
        // status lamp on the pedestal: amber blinking = draft pending
        const status = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3ccf8e, toneMapped: false }));
        status.position.set(0, 4.5, 7.6);
        g.add(status);
        // the lens wheel: discs of coloured glass, one per lens value
        const wheel = new THREE.Group();
        wheel.position.y = 22;
        const discs = [];
        for (let i = 0; i < 8; i++) {
            const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 14), new THREE.MeshBasicMaterial({
                color: 0x555555, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false,
            }));
            const a = (i / 8) * Math.PI * 2;
            disc.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5);
            disc.lookAt(0, 0, 0);
            wheel.add(disc);
            discs.push(disc);
        }
        g.add(wheel);
        rec.lantern = { lamp, hood, status, wheel, discs, hoodY: 33, open: 1, turn: 0, lensKey: null };
    }

    _makeLabel(node) {
        const label = el('div', `twin-label kind-${node.kind}${node.locked ? ' locked' : ''}`);
        const name = el('button', 'twin-label-name', node.label + (node.locked ? ' 🔒' : ''));
        name.type = 'button';
        name.addEventListener('click', () => { if (!node.locked) this.onActivate(node.id); });
        name.addEventListener('pointerenter', () => this._setHover(node.id));
        name.addEventListener('pointerleave', () => this._setHover(null));
        label.appendChild(name);
        const count = el('b', 'twin-label-count', '');
        label.appendChild(count);
        label._count = count;
        const commands = node.kind === 'harvester' && !node.locked ? ['harvest', 'feed', 'siphon']
            : node.id === CENTRIFUGE ? ['purge'] : [];
        if (commands.length) {
            const row = el('div', 'twin-cmds');
            for (const cmd of commands) {
                const b = el('button', `twin-cmd cmd-${cmd}`, { harvest: 'Harvest', feed: 'Feed ⟶', siphon: '⟵ Siphon', purge: 'Purge' }[cmd]);
                b.type = 'button';
                b.title = {
                    harvest: 'Crawl the source: events not harvested before fill this harvester',
                    feed: "Pour this harvester's events into the Centrifuge, to review them",
                    siphon: "Draw this source's events back out of the Centrifuge",
                    purge: 'Send everything left in the Centrifuge to the Sump',
                }[cmd];
                b.addEventListener('click', () => this.onCommand(cmd, node.id));
                row.appendChild(b);
                label[`_${cmd}`] = b;
            }
            label.appendChild(row);
        }
        if (node.id === 'nexus') {
            // the lantern's lens wheel: turn it one glass either way
            const row = el('div', 'twin-cmds twin-lens');
            const turn = (step, text, title) => {
                const b = el('button', 'twin-cmd', text);
                b.type = 'button';
                b.title = title;
                b.addEventListener('click', () => this.onLens(step));
                return b;
            };
            const name = el('span', 'twin-lens-name', '');
            row.append(turn(-1, '◀', 'Previous lens'), name, turn(1, '▶', 'Next lens'));
            label.appendChild(row);
            label._lens = name;
        }
        this.labels.appendChild(label);
        return label;
    }

    /** Replace the liquid with one stacked segment per band (bottom up). */
    _setSegments(rec, bands) {
        while (rec.segments.length > bands.length) {
            const s = rec.segments.pop();
            rec.group.remove(s.mesh);
            s.mesh.material.dispose();
        }
        while (rec.segments.length < bands.length) {
            const mesh = new THREE.Mesh(this.shared.liquid, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4 }));
            mesh.userData.id = rec.id;
            rec.group.add(mesh);
            rec.segments.push({ mesh, share: 0 });
        }
        const total = bands.reduce((n, b) => n + b.count, 0) || 1;
        bands.forEach((b, i) => {
            const s = rec.segments[i];
            s.share = b.count / total;
            this._c.set(b.color);
            s.mesh.material.emissive.copy(this._c);
            s.mesh.material.color.copy(this._c).multiplyScalar(0.25);
            s.mesh.material.opacity = b.ghost ? 0.5 : 1;
            s.mesh.material.transparent = Boolean(b.ghost);
            s.mesh.material.depthWrite = !b.ghost;
            s.mesh.material.emissiveIntensity = b.ghost ? 0.3 : 0.85; // ghosts: dark, see-through
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Data                                                               */
    /* ------------------------------------------------------------------ */

    /**
     * @param {{ nodes, pipes, levels, codex, flows, colors, sources }} data
     *   flows: pipeId -> { forward, backward }; colors: nodeId -> css color;
     *   sources: name -> SourceStatus
     */
    update(data) {
        this.data = data;
        const key = data.nodes.map((n) => `${n.id}:${n.locked}`).join('|');
        if (key !== this._nodeKey) this._rebuild(data);

        // each zone on its own scale (the core holds a tenth of what the net does)
        const caps = { net: MIN_CAP.net, core: MIN_CAP.core };
        for (const n of data.nodes) {
            const level = data.levels[n.id];
            if (level && caps[n.zone] !== undefined) caps[n.zone] = Math.max(caps[n.zone], level.total * 1.2);
        }
        for (const rec of this.machines.values()) {
            const n = rec.node;
            const level = data.levels[n.id] ?? { total: 0, lit: 0, bands: [] };
            if (rec.liquidMax) {
                rec.target = Math.min(1, level.total / (caps[n.zone] ?? MIN_CAP.core));
                // lit liquid in lens bands, ghosts (rows the filter leaves out) on top
                const bands = level.total > level.lit
                    ? [...level.bands, { color: data.colors[n.id] ?? '#888', count: level.total - level.lit, ghost: true }]
                    : level.bands;
                if (this.time < (rec.relightAt ?? 0)) rec.pendingBands = bands; // the beam hasn't reached it yet
                else { this._setSegments(rec, bands); rec.pendingBands = null; }
            }
            if (rec.ring) {
                rec.ringMode = data.stageFilter?.[n.id] ?? null;
                const c = rec.ringMode ? RING_COLORS[rec.ringMode] : (data.colors[n.id] ?? '#888');
                rec.ring.material.color.set(c);
                rec.collar.material.emissive.set(c);
            }
            if (rec.lantern) this._updateLantern(rec, data.light);
            if (rec.jars) {
                const byType = data.codex.byType;
                const max = Math.max(4, ...Object.values(byType));
                ['pillar', 'site', 'contact'].forEach((t, i) => { rec.jarTargets ??= []; rec.jarTargets[i] = (byType[t] ?? 0) / max; });
            }
            const syncing = n.kind === 'harvester' && data.sources[n.label]?.status === 'syncing';
            rec.syncing = syncing;
            this._updateLabel(rec, level, syncing);
        }

        for (const p of this.pipes.values()) {
            const f = data.flows[p.pipe.id] ?? { forward: 0, backward: 0 };
            const count = f.forward + f.backward;
            p.targetBore = count ? 0.9 + 0.55 * Math.sqrt(count) : 0.55;
            p.active = count > 0;
        }
        if (!this._fitted) { this.fit(); this._fitted = true; }
    }

    _updateLantern(rec, light) {
        if (!light) return;
        const L = rec.lantern;
        if (L.lensKey !== null && L.lensKey !== light.lens) L.turn += Math.PI / 4; // the wheel turns a notch
        L.lensKey = light.lens;
        L.pending = light.pending > 0;
        L.discs.forEach((d, i) => {
            const c = light.colors[i];
            d.visible = Boolean(c);
            if (c) d.material.color.set(c);
        });
        if (rec.label._lens) rec.label._lens.textContent = light.lensLabel;
    }

    _updateLabel(rec, level, syncing) {
        const { label, node } = rec;
        if (node.holds === 'objects') label._count.textContent = String(this.data.codex.total);
        else if (node.holds && !node.locked) label._count.textContent = String(level.total);
        else label._count.textContent = '';
        if (label._harvest) {
            // harvested recently: off (no hover, no click) until it goes stale
            const fresh = syncing ? undefined : this.data.fresh?.[node.label];
            label._harvest.disabled = syncing || fresh != null;
            label._harvest.textContent = syncing ? 'Harvesting…' : 'Harvest';
            label._harvest.classList.toggle('fresh', fresh != null);
            label._feed.disabled = !level.total;
            label._siphon.disabled = !this.data.centrifugeBySource?.[node.label]; // its events in the centrifuge
        }
        if (label._purge) label._purge.disabled = !level.total;
        label.classList.toggle('syncing', syncing);
    }

    _rebuild(data) {
        for (const rec of this.machines.values()) {
            rec.label.remove();
            this.machineGroup.remove(rec.group);
            rec.group.traverse((o) => {
                if (o.geometry && o.geometry !== this.shared.liquid) o.geometry.dispose();
                if (o.material && !Object.values(this.shared).includes(o.material)) o.material.dispose();
            });
        }
        for (const p of this.pipes.values()) {
            for (const m of [...p.meshes, ...p.joints]) { this.pipeGroup.remove(m); m.material.dispose(); }
        }
        for (const w of this.wires.values()) { this.lightGroup.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); }
        for (const pl of this.pulses) { this.lightGroup.remove(pl.sprite); pl.sprite.material.dispose(); }
        this.machines.clear();
        this.pipes.clear();
        this.wires.clear();
        this.pulses = [];
        this.packets = [];

        this.positions = layout(data.nodes);
        for (const n of data.nodes) {
            const at = this.positions.get(n.id);
            if (at) this._addMachine(n, at, data.colors[n.id] ?? '#888');
        }
        this.pipesByEnds = pipeIndex(data.pipes);
        for (const pipe of data.pipes) {
            const points = pipePath(pipe, this.positions);
            if (!points) continue;
            const color = data.colors[pipe.b] ?? '#888';
            const conveyor = pipe.kind === 'conveyor';
            const mat = new THREE.MeshStandardMaterial({
                color: conveyor ? 0x4a3a22 : 0x3a3e45, metalness: 0.7, roughness: 0.45,
                emissive: new THREE.Color(color), emissiveIntensity: 0,
            });
            const meshes = [], joints = [];
            for (let i = 1; i < points.length; i++) {
                const m = new THREE.Mesh(this.shared.segment, mat);
                m.position.addVectors(points[i - 1], points[i]).multiplyScalar(0.5);
                m.lookAt(points[i]);
                m.userData.len = points[i].distanceTo(points[i - 1]);
                this.pipeGroup.add(m);
                meshes.push(m);
            }
            for (let i = 1; i < points.length - 1; i++) {
                const j = new THREE.Mesh(this.shared.joint, mat);
                j.position.copy(points[i]);
                this.pipeGroup.add(j);
                joints.push(j);
            }
            this.pipes.set(pipe.id, { pipe, points, meshes, joints, mat, bore: 0.55, targetBore: 0.55, active: false, conveyor });
        }
        this._buildWires();
        this._nodeKey = data.nodes.map((n) => `${n.id}:${n.locked}`).join('|');
    }

    /** Copper wires from the atlas and calendar into the lantern, hanging slack behind them. */
    _buildWires() {
        const lantern = this.positions.get('nexus');
        if (!lantern) return;
        ['atlas', 'calendar'].forEach((id, i) => {
            const from = this.positions.get(id);
            if (!from) return;
            const back = -9 - i * 7; // the calendar's wire runs behind the atlas
            const a = from.clone().add(new THREE.Vector3(0, 9, back));
            const b = lantern.clone().add(new THREE.Vector3(0, 9, back));
            const sag = (t) => a.clone().lerp(b, t).setY(a.y - 7 * Math.sin(Math.PI * t));
            const curve = new THREE.CatmullRomCurve3([a, sag(0.25), sag(0.5), sag(0.75), b]);
            const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.55, 6, false), new THREE.MeshStandardMaterial({
                color: COPPER, metalness: 0.9, roughness: 0.3, emissive: COPPER, emissiveIntensity: 0.08,
            }));
            this.lightGroup.add(mesh);
            this.wires.set(id, { curve, mesh });
        });
    }

    /**
     * Relight the machines: the filter or lens changed. A pulse runs down the wire first if
     * the calendar or atlas caused it, then the beam sweeps across and each machine takes
     * its new liquid as the beam passes (call before update()).
     * @param {{ from?: 'calendar' | 'atlas' | null }} [opts]
     */
    relight({ from = null } = {}) {
        let delay = 0;
        const wire = from ? this.wires.get(from) : null;
        if (wire) {
            const sprite = this._glow(0xffb070, 14, 0.95);
            this.lightGroup.add(sprite);
            this.pulses.push({ curve: wire.curve, t: 0, dur: PULSE_S, sprite });
            delay = PULSE_S;
        }
        this.sweepT = this.time + delay;
        const [x0, x1] = this._sweepSpan();
        for (const rec of this.machines.values()) {
            if (!rec.liquidMax) continue;
            const f = (rec.group.position.x - x0) / (x1 - x0 || 1);
            rec.relightAt = this.sweepT + Math.min(1, Math.max(0, f)) * SWEEP_S;
        }
    }

    /** Left and right edge of the machines that hold liquid (the beam's sweep). */
    _sweepSpan() {
        let x0 = Infinity, x1 = -Infinity;
        for (const rec of this.machines.values()) {
            if (!rec.liquidMax) continue;
            x0 = Math.min(x0, rec.group.position.x);
            x1 = Math.max(x1, rec.group.position.x);
        }
        return Number.isFinite(x0) ? [x0 - 20, x1 + 20] : [-100, 100];
    }

    /**
     * Draw a magic circle at the base of the machine holding the selected row, in the row's
     * colour (its lens colour). nodeId null: none.
     * @param {string | null} nodeId @param {string} [color]
     */
    setSelection(nodeId, color = '#ffffff') {
        const moved = nodeId !== this.selection.nodeId;
        this.selection = { nodeId, color };
        for (const m of [this.circleOuter, this.circleInner]) m.material.color.set(color);
        this.circleGlow.material.color.set(color);
        if (moved && nodeId) {
            const rec = this.machines.get(nodeId);
            if (rec) {
                this.circle.position.copy(rec.group.position).setY(rec.group.position.y + 0.25);
                this.circleSize = ((SIZE[rec.node.kind]?.r ?? 10) + 8) * 3.6; // diameter: well outside the base button
                this.circleOn = 0; // draw it in afresh
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Packets                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Send packets for transitions not played yet. replay: squeeze the latest REPLAY_MAX
     * into REPLAY_SECONDS (so the twin doesn't open frozen); otherwise play now, bursts
     * of the same move capped at BURST_MAX packets (bigger ones carry the rest).
     * @param {{ id: number, from: string, to: string, entity: string }[]} transitions
     */
    play(transitions, { replay = false } = {}) {
        if (!this.data) return;
        let fresh = transitions.filter((t) => t.id > this.lastPlayedId);
        if (!fresh.length) return;
        this.lastPlayedId = fresh[fresh.length - 1].id;
        if (replay) {
            fresh = fresh.slice(-REPLAY_MAX);
            const gap = Math.min(0.15, REPLAY_SECONDS / fresh.length);
            fresh.forEach((t, i) => this._launch(t, 0.4 + i * gap, 1));
            return;
        }
        const groups = new Map();
        for (const t of fresh) {
            const k = `${t.from}>${t.to}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(t);
        }
        for (const list of groups.values()) {
            const n = Math.min(list.length, BURST_MAX);
            const scale = list.length > BURST_MAX ? 1 + Math.log2(list.length / BURST_MAX) * 0.5 : 1;
            for (let i = 0; i < n; i++) this._launch(list[i], i * 0.09, i === n - 1 ? scale : 1);
        }
    }

    _launch(t, delay, scale) {
        const steps = route(this.pipesByEnds, t.from, t.to);
        if (!steps) return;
        const points = [];
        for (const { pipe, forward } of steps) {
            const rec = this.pipes.get(pipe.id);
            if (!rec) return;
            const pts = forward ? rec.points : [...rec.points].reverse();
            for (const p of pts) if (!points.length || !points[points.length - 1].equals(p)) points.push(p);
        }
        if (points.length < 2 || this.packets.length >= MAX_PACKETS) return;
        const link = t.entity === 'link';
        const style = link ? null : this.data.packetStyle?.(t);
        const color = new THREE.Color(link ? BRASS : (style?.color ?? this.data.colors[t.to === OUTSIDE ? t.from : t.to] ?? '#ffffff'));
        const lit = style ? style.lit : true;
        if (!lit) color.multiplyScalar(0.3); // the row fails the filter: a dim packet
        this.packets.push({
            points, length: pathLength(points), d: 0, delay, color, scale: (link ? 1.4 : 2) * scale * (lit ? 1 : 0.7),
            to: t.to, link, rowId: link ? null : t.row_id, at: new THREE.Vector3(),
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Interaction                                                        */
    /* ------------------------------------------------------------------ */

    _pick(ev) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this._ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this._ndc, this.camera);
        const hit = this.raycaster.intersectObjects(this.machineGroup.children, true)
            .find((h) => h.object.userData.id || h.object.userData.ring);
        if (!hit) return { id: null, ring: false };
        return hit.object.userData.ring ? { id: hit.object.userData.ring, ring: true } : { id: hit.object.userData.id, ring: false };
    }

    _setHover(id, ring = false) {
        if (id === this.hoverId && ring === this.hoverRing) return;
        this.hoverId = id;
        this.hoverRing = ring;
        const rec = id ? this.machines.get(id) : null;
        this.renderer.domElement.style.cursor = rec && !rec.node.locked && (ring || rec.node.action) ? 'pointer' : '';
        for (const m of this.machines.values()) m.label.classList.toggle('hover', m.id === id);
    }

    _bindEvents() {
        const canvas = this.renderer.domElement;
        this._onDown = (ev) => { this._down = [ev.clientX, ev.clientY]; };
        this._onUp = (ev) => {
            if (ev.button !== 0 || !this._down) return;
            if (Math.hypot(ev.clientX - this._down[0], ev.clientY - this._down[1]) > 5) return; // that was a drag
            const { id, ring } = this._pick(ev);
            const rec = id ? this.machines.get(id) : null;
            if (!rec || rec.node.locked) return;
            if (ring) { rec.press = 1; this.onRing(id); }
            else if (rec.node.action) this.onActivate(id);
        };
        this._onMove = (ev) => {
            if (ev.buttons) return;
            const { id, ring } = this._pick(ev);
            this._setHover(id, ring);
        };
        this._onLeave = () => this._setHover(null);
        this._onContext = (ev) => ev.preventDefault();
        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointerup', this._onUp);
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

    /** Frame every machine: aim at their middle and zoom so they all fit. */
    fit() {
        if (!this.positions.size) return;
        const box = new THREE.Box3();
        for (const p of this.positions.values()) box.expandByPoint(p).expandByPoint(p.clone().setY(p.y + 40));
        box.expandByPoint(new THREE.Vector3(box.min.x - 70, 0, 0)); // the harvesters' intakes
        const center = box.getCenter(new THREE.Vector3());
        this.controls.target.copy(center);
        this.camera.position.copy(center).addScaledVector(VIEW_DIR, 800);
        this.camera.lookAt(center);
        this.camera.updateMatrixWorld();
        // extent of the box on screen, in camera units
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        let w = 0, h = 0;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const d = new THREE.Vector3(x, y, z).sub(center);
            w = Math.max(w, Math.abs(d.dot(right)) * 2);
            h = Math.max(h, Math.abs(d.dot(up)) * 2);
        }
        const viewW = this.camera.right - this.camera.left, viewH = this.camera.top - this.camera.bottom;
        this.camera.zoom = Math.max(this.controls.minZoom, Math.min(this.controls.maxZoom, 0.92 * Math.min(viewW / w, viewH / h)));
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    /* ------------------------------------------------------------------ */
    /*  Frame                                                              */
    /* ------------------------------------------------------------------ */

    _frame(now) {
        const dt = Math.min((now - this._last) / 1000, 0.1);
        this._last = now;
        this.time += dt;
        this.controls.update();
        const ease = 1 - Math.exp(-dt * 3);

        for (const rec of this.machines.values()) {
            if (rec.liquidMax) {
                rec.fill += (rec.target - rec.fill) * ease;
                let y = rec.liquidBase;
                const height = Math.max(0.01, rec.fill * rec.liquidMax);
                for (const s of rec.segments) {
                    const sh = Math.max(0.01, height * s.share);
                    s.mesh.position.y = y;
                    s.mesh.scale.set(rec.liquidR, sh, rec.liquidR);
                    y += sh;
                }
                rec.glow.position.y = rec.liquidBase + height + 2;
            }
            if (rec.jars) rec.jars.forEach((fill, i) => {
                const t = rec.jarTargets?.[i] ?? 0;
                fill.scale.y += (Math.max(0.01, t * 12) - fill.scale.y) * ease;
            });
            if (rec.rotor && !rec.node.locked) {
                const speed = rec.syncing ? 5 : rec.node.kind === 'viewer' ? 0.25 : 0.5 + rec.flare * 4;
                if (rec.rotorAxis === 'z') rec.rotor.rotation.z += dt * speed;
                else rec.rotor.rotation.y += dt * speed;
            }
            rec.flare = Math.max(0, rec.flare - dt * 1.2);
            const pulse = rec.syncing ? 0.35 + 0.25 * Math.sin(this.time * 6) : 0;
            rec.glow.material.opacity = Math.min(0.9, rec.flare * 0.7 + pulse + (rec.id === this.hoverId ? 0.12 : 0));
            if (rec.pendingBands && this.time >= (rec.relightAt ?? 0)) {
                this._setSegments(rec, rec.pendingBands); // the beam reached it
                rec.pendingBands = null;
                rec.flare = Math.max(rec.flare, 0.5);
            }
            if (rec.ring) {
                const hot = rec.id === this.hoverId && this.hoverRing && !rec.node.locked;
                rec.ring.material.opacity = rec.node.locked ? 0.2 : hot || rec.ringMode ? 1 : 0.75;
                // the button lifts under the pointer and dips when pressed
                rec.lift += ((hot ? 1 : 0) - rec.lift) * Math.min(1, dt * 10);
                rec.press = Math.max(0, rec.press - dt * 4);
                rec.button.position.y = 1 + rec.lift * 0.9 - rec.press * 1.6;
                rec.collar.material.emissiveIntensity = rec.node.locked ? 0 : 0.2 + (rec.ringMode ? 0.45 : 0) + rec.lift * 0.5 + rec.press * 0.6;
            }
            if (rec.lantern) this._frameLantern(rec, dt, ease);
        }

        for (const p of this.pipes.values()) {
            p.bore += (p.targetBore - p.bore) * ease;
            for (const m of p.meshes) m.scale.set(p.bore, p.bore, m.userData.len);
            for (const j of p.joints) j.scale.setScalar(p.bore * 1.15);
            p.mat.emissiveIntensity = p.active ? 0.18 : 0;
        }

        // packets: wait out their delay, travel, flare their destination on arrival
        let n = 0;
        for (let i = this.packets.length - 1; i >= 0; i--) {
            const pk = this.packets[i];
            if (pk.delay > 0) { pk.delay -= dt; continue; }
            pk.d += dt * Math.max(PACKET_SPEED, pk.length / MIN_TRIP_S) * (pk.link ? 0.6 : 1);
            if (pk.d >= pk.length) {
                const dest = this.machines.get(pk.to);
                if (dest) dest.flare = 1;
                this.packets.splice(i, 1);
                continue;
            }
            pointAt(pk.points, pk.d, this._v);
            pk.at.copy(this._v);
            this._s.setScalar(pk.scale);
            this._m.compose(this._v, this._q, this._s);
            this.packetMesh.setMatrixAt(n, this._m);
            this.packetMesh.setColorAt(n, pk.color);
            n++;
        }
        this.packetMesh.count = n;
        this.packetMesh.instanceMatrix.needsUpdate = true;
        if (this.packetMesh.instanceColor) this.packetMesh.instanceColor.needsUpdate = true;

        this._frameBeam();
        this._frameCircle(dt);
        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const pl = this.pulses[i];
            pl.t += dt / pl.dur;
            if (pl.t >= 1) {
                this.lightGroup.remove(pl.sprite);
                pl.sprite.material.dispose();
                this.pulses.splice(i, 1);
                continue;
            }
            pl.curve.getPointAt(pl.t, pl.sprite.position);
        }
        for (const w of this.wires.values()) w.mesh.material.emissiveIntensity = this.pulses.some((pl) => pl.curve === w.curve) ? 0.6 : 0.08;

        this.renderer.render(this.scene, this.camera);
        this._placeLabels();
    }

    _frameLantern(rec, dt, ease) {
        const L = rec.lantern;
        const open = L.pending ? 0 : 1;
        L.open += (open - L.open) * ease * 1.6;
        L.hood.position.y = L.hoodY - (1 - L.open) * 11; // drops down over the lamp
        L.lamp.material.emissiveIntensity = 0.25 + 1.35 * L.open + (this._sweeping() ? 0.8 : 0);
        L.status.material.color.setHex(L.pending ? (Math.sin(this.time * 7) > 0 ? AMBER : 0x3a2808) : 0x3ccf8e);
        L.wheel.rotation.y += (L.turn - L.wheel.rotation.y) * ease + dt * 0.08;
        L.turn += dt * 0.08; // the wheel drifts slowly; a lens change kicks it a notch
    }

    _sweeping() {
        return this.sweepT >= 0 && this.time >= this.sweepT && this.time <= this.sweepT + SWEEP_S;
    }

    /** The lantern's beam during a sweep: from the lamp to a point crossing the machines. */
    _frameBeam() {
        const lantern = this.machines.get('nexus');
        const on = lantern && this._sweeping();
        this.beam.visible = this.beamSpot.visible = Boolean(on);
        if (!on) return;
        const t = (this.time - this.sweepT) / SWEEP_S;
        const [x0, x1] = this._sweepSpan();
        const target = new THREE.Vector3(x0 + (x1 - x0) * t, NET_Y + 14, 20);
        const from = lantern.group.position.clone().setY(lantern.group.position.y + 22);
        const fade = Math.sin(Math.PI * t);
        this.beam.position.copy(from);
        this.beam.lookAt(target);
        const len = from.distanceTo(target);
        this.beam.scale.set(len * 0.11, len * 0.11, len);
        this.beam.material.opacity = 0.16 * fade;
        this.beamSpot.position.copy(target);
        this.beamSpot.material.opacity = 0.55 * fade;
    }

    /** The selection's magic circle: fades and grows in, the layers turn against each other. */
    _frameCircle(dt) {
        const rec = this.selection.nodeId ? this.machines.get(this.selection.nodeId) : null;
        const want = rec ? 1 : 0;
        this.circleOn += (want - this.circleOn) * Math.min(1, dt * 4);
        this.circle.visible = this.circleOn > 0.01;
        if (!this.circle.visible) return;
        if (rec) this.circle.position.copy(rec.group.position).setY(rec.group.position.y + 0.25);
        const grow = 0.6 + 0.4 * this.circleOn;
        const breathe = 1 + 0.025 * Math.sin(this.time * 2.2);
        this.circleOuter.scale.setScalar(this.circleSize * grow * breathe);
        this.circleInner.scale.setScalar(this.circleSize * 0.8 * grow);
        this.circleOuter.rotation.z += dt * 0.25;
        this.circleInner.rotation.z -= dt * 0.45;
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 3);
        this.circleOuter.material.opacity = this.circleOn * pulse;
        this.circleInner.material.opacity = 0.9 * this.circleOn;
        this.circleGlow.scale.setScalar(this.circleSize * 1.5);
        this.circleGlow.material.opacity = 0.5 * this.circleOn * pulse;
    }

    _project(v) {
        this._v.copy(v).project(this.camera);
        const off = this._v.z > 1 || Math.abs(this._v.x) > 1.2 || Math.abs(this._v.y) > 1.2;
        const w = this.container.clientWidth, h = this.container.clientHeight;
        return off ? null : [(this._v.x * 0.5 + 0.5) * w, (-this._v.y * 0.5 + 0.5) * h, this._v.z];
    }

    _placeLabels() {
        for (const rec of this.machines.values()) {
            const top = SIZE[rec.node.kind]?.h ?? 22;
            const at = this._project(this._v.copy(rec.group.position).setY(rec.group.position.y + top + 18));
            rec.label.style.display = at ? '' : 'none';
            if (!at) continue;
            rec.label.style.transform = `translate(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px) translate(-50%, -100%)`;
            rec.label.style.zIndex = String(1000 - Math.round(at[2] * 500));
        }
        for (const z of this.zoneLabels) {
            const at = this._project(z.at);
            z.label.style.display = at ? '' : 'none';
            if (at) z.label.style.transform = `translate(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px)`;
        }
    }

    dispose() {
        this.view.cancelAnimationFrame(this._raf);
        this._ro?.disconnect();
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this._onDown);
        canvas.removeEventListener('pointerup', this._onUp);
        canvas.removeEventListener('pointermove', this._onMove);
        canvas.removeEventListener('pointerleave', this._onLeave);
        canvas.removeEventListener('contextmenu', this._onContext);
        this.controls.dispose();
        this.scene.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        });
        for (const v of Object.values(this.shared)) v?.dispose?.();
        for (const t of this.circleTextures) t.dispose();
        this.renderer.dispose();
        this.container.remove();
    }
}
