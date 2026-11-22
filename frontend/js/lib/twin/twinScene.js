// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// SignalChainPanel.js is the typed boundary. Topology: ../twinTopology.js; numbers: ../twinModel.js.
// Machines: machines.js; zones: zones.js; textures: textures.js (phase 7, PHASE7_PLAN.md).

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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { magicCircleCanvases } from '../magicCircle.js';
import { deferredResize, isResizing, viewOf } from '../resizing.js';
import { CENTRIFUGE, CODEX, ENTROPY_MARKET, FORGE, MAIN_CHAIN, MANIFOLD, NECROPOLIS, OUTSIDE, SUMP, pipeIndex, route } from '../twinTopology.js';
import { makeMaterials } from './materials.js';
import { buildZones, zoneRects } from './zones.js';
import { FOOT, bodyOf, buildMachine, makeShop } from './machines.js';

// Phase 7: every zone stands on the floor, cordoned by walls of light (twin/zones.js).
const NET_Y = 0;
const CORE_Y = 0;
const GALLERY_Y = 0;
const GROUND = 0x07080b;  // the twin's own dark floor (bloom needs an opaque canvas)
const MACHINE_SCALE = 1.5;
/** Rows that fill a heart: each zone has its own scale (raw events are bulk, adventures refined). */
const CAP = { net: 120, core: 12 };
/** Dynamos name what they work with on their label. */
const SUB = { forge: 'prima materia', atlas: 'space', calendar: 'time', nexus: 'topology' };
const PIPE_H = 5;         // pipes run this far above a machine's floor
const FRUSTUM = 300;
const VIEW_DIR = new THREE.Vector3(0.55, 0.85, 1.15).normalize();

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

const STEEL = 0x23262b;
const STEEL_EDGE = 0x7a808a;
const BRASS = 0xc8a46a;

/** A count for a label: whole numbers as they are, shared rows (object lenses) to one decimal. */
const fmtCount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // names are never parsed as HTML
    return n;
}

/**
 * Where each machine stands (PHASE7_PLAN.md: the approved prototype's layout). The camera
 * looks from +z, so +z is the near side: the forge, codex and entropy market stand there;
 * the sump and necropolis on the far side. The manifold is the harvesters' pipe junction.
 * @param {{ id: string, zone: string, kind: string }[]} nodes
 */
function layout(nodes) {
    const pos = new Map();
    const harvesters = nodes.filter((n) => n.kind === 'harvester');
    // a diagonal row, near to far
    harvesters.forEach((n, i) => pos.set(n.id, new THREE.Vector3(-372 + i * 16, NET_Y, 80 - i * 72)));
    const fixed = {
        [MANIFOLD]: [-258, NET_Y, 0],
        [CENTRIFUGE]: [-210, NET_Y, 0], [SUMP]: [-205, NET_Y, -122], [FORGE]: [-215, NET_Y, 118],
        [CODEX]: [-40, CORE_Y, 104], [ENTROPY_MARKET]: [180, CORE_Y, 104],
        [NECROPOLIS]: [110, CORE_Y, -104],
        atlas: [-40, GALLERY_Y, -204], nexus: [90, GALLERY_Y, -204], calendar: [220, GALLERY_Y, -204],
    };
    const chainX = [-110, -40, 30, 110, 180, 250, 320];
    MAIN_CHAIN.forEach((id, i) => { fixed[id] = [chainX[i] ?? -110 + i * 70, CORE_Y, 0]; });
    for (const id of [...nodes.map((n) => n.id), MANIFOLD]) if (fixed[id]) pos.set(id, new THREE.Vector3(...fixed[id]));
    return pos;
}

/** The polyline a pipe follows, from `a` to `b` (right angles, like real plumbing). */
function pipePath(pipe, pos) {
    const A = pos.get(pipe.a), B = pos.get(pipe.b);
    if (!A || !B) return null;
    const a = A.clone().setY(A.y + PIPE_H), b = B.clone().setY(B.y + PIPE_H);
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

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(GROUND, 1);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
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

        // brass and glass need something to reflect: a studio environment, plus a warm key and a cool rim
        this.pmrem = new THREE.PMREMGenerator(this.renderer);
        this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environment = this.envMap;
        this.scene.environmentIntensity = 0.75;
        this.scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x1a1208, 0.5));
        const key = new THREE.DirectionalLight(0xffe2b8, 1.6);
        key.position.set(150, 260, 120);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x6fb8ff, 0.7);
        rim.position.set(-200, 120, -220);
        this.scene.add(rim);

        // bloom: the soft halo around bright parts (a switch on the panel; on by default)
        this.bloomOn = true;
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.85);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.kit = makeMaterials();
        this.shop = makeShop(this.kit);
        /** node ids whose panel is in use (stage 7d fills this) */
        this.inUse = new Set();
        this.zones = null;   // built with the machines (they need the layout)
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

    /** The ground: a dark floor, lighter under the machines. Zones are built with the machines. */
    _buildStage() {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
        grad.addColorStop(0, '#13151a');
        grad.addColorStop(1, '#07080b');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.25, envMapIntensity: 0.35 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(-40, -0.05, -30);
        ground.raycast = () => {};
        this.zoneLabels = [];   // the zones name themselves with floor plaques
        return ground;
    }

    /** The zones' walls, corners, floors and plaques, around where the machines stand. */
    _buildZones(nodes) {
        if (this.zones) { this.scene.remove(this.zones.group); this.zones.dispose(); }
        const zoneOf = new Map(nodes.map((n) => [n.id, n.zone]));
        zoneOf.set(MANIFOLD, 'net');
        const viewers = Object.fromEntries(['atlas', 'nexus', 'calendar'].filter((id) => this.positions.has(id)).map((id) => [id, [this.positions.get(id).x, this.positions.get(id).z]]));
        this.zones = buildZones(this.kit, zoneRects(this.positions, zoneOf), viewers);
        this.scene.add(this.zones.group);
    }

    /** Turn the bloom pass on or off (the panel's Glow switch). */
    setBloom(on) {
        this.bloomOn = Boolean(on);
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

    /** One machine (twin/machines.js), standing at `position`. */
    _addMachine(node, position, color) {
        const rec = { id: node.id, node, color, spin: 0, syncing: false, pendingBands: null, relightAt: 0 };
        const machine = buildMachine(this.shop, node, {
            color,
            working: () => this.inUse.has(node.id),
            spin: () => rec.spin,
            objects: () => this.data?.codex?.total ?? 0,
            pending: () => (this.data?.light?.pending ?? 0) > 0,
        });
        machine.group.position.copy(position);
        machine.group.scale.setScalar(MACHINE_SCALE);
        Object.assign(rec, { machine, group: machine.group, height: machine.height * MACHINE_SCALE, liquidMax: Boolean(machine.heart) });
        this.machineGroup.add(machine.group);
        rec.label = this._makeLabel(node);
        this.machines.set(node.id, rec);
        return rec;
    }

    _makeLabel(node) {
        const label = el('div', `twin-label kind-${node.kind}${node.locked ? ' locked' : ''}`);
        label.style.setProperty('--c', this.data?.colors?.[node.id] ?? '#9aa0aa');
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
                b.addEventListener('click', () => {
                    if (cmd === 'purge') { const c = this.machines.get(CENTRIFUGE); if (c) c.spin = 6; }
                    this.onCommand(cmd, node.id);
                });
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

        for (const rec of this.machines.values()) {
            const n = rec.node;
            const level = data.levels[n.id] ?? { total: 0, lit: 0, bands: [] };
            if (rec.machine.heart) {
                // lit liquid in lens bands, ghosts (rows the filter leaves out) on top; each zone on its own scale
                const bands = level.total > level.lit
                    ? [...level.bands, { color: data.colors[n.id] ?? '#888', count: level.total - level.lit, ghost: true }]
                    : level.bands;
                const cap = CAP[n.zone] ?? CAP.core;
                if (this.time < (rec.relightAt ?? 0)) rec.pendingBands = { bands, total: level.total, cap }; // the beam hasn't reached it yet
                else { rec.machine.heart.setBands(bands, level.total, cap); rec.pendingBands = null; }
            }
            rec.machine.setRim(data.stageFilter?.[n.id] ?? null);
            if (n.id === 'nexus' && rec.label._lens && data.light) rec.label._lens.textContent = data.light.lensLabel;
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

    _updateLabel(rec, level, syncing) {
        const { label, node } = rec;
        // what it holds, in its matter's colour; dynamos name what they work with
        if (node.locked) label._count.textContent = 'locked';
        else if (node.holds === 'objects') label._count.textContent = `${this.data.codex.total} objects`;
        else if (node.holds) label._count.textContent = level.lit < level.total ? `${fmtCount(level.lit)} of ${level.total} ${node.matter} lit` : `${level.total} ${node.matter}`;
        else label._count.textContent = SUB[node.id] ?? '';
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
            rec.machine.dispose();
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
        this._buildZones(data.nodes);
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
                this.circleSize = ((FOOT[bodyOf(rec.node)] ?? 9) + 7) * MACHINE_SCALE * 2; // diameter: just outside the base
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
        this.composer.setSize(w, h);
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
        box.expandByPoint(new THREE.Vector3(box.min.x - 46, 0, box.max.z + 46)).expandByPoint(new THREE.Vector3(box.max.x + 46, 0, box.min.z - 46)); // the zones' margins
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
            if (rec.pendingBands && this.time >= (rec.relightAt ?? 0)) {
                const { bands, total, cap } = rec.pendingBands;   // the beam reached it
                rec.machine.heart.setBands(bands, total, cap);
                rec.pendingBands = null;
            }
            // a harvester's rotor spins while it harvests; the centrifuge whirls after a purge
            rec.spin = rec.syncing ? 14 : Math.max(0, rec.spin - dt * 3);
            rec.machine.frame(dt, this.time, ease);
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

        if (this.bloomOn) this.composer.render(); else this.renderer.render(this.scene, this.camera);
        this._placeLabels();
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
            const at = this._project(this._v.copy(rec.group.position).setY(rec.group.position.y + rec.height + 8));
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
        this.zones?.dispose();
        this.kit.dispose();
        this.bloom.dispose();
        this.composer.dispose();
        this.envMap.dispose();
        this.pmrem.dispose();
        this.renderer.dispose();
        this.container.remove();
    }
}
