// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// SignalChainPanel.js is the typed boundary. Topology: ../twinTopology.js; numbers: ../twinModel.js.
// Machines: machines.js; zones: zones.js; textures: textures.js (phase 7, PHASE7_PLAN.md).

/**
 * TwinScene — the signal chain as machines in four zones (BUILD_PLAN.md, phase 3):
 *
 *   NET     foundry floor: harvesters -> centrifuge -> sump; the forge
 *   CORE    raised bench:  hopper -> refinery -> alembic -> crucible -> arena -> treasury
 *           -> archive; necropolis behind (kill manifold)
 *   SANCTUM front: codex, inventory, agora, pantheon, mastery (no pipes yet)
 *   GALLERY back, raised:  nexus, atlas, calendar, ledger (the viewers)
 *
 * Liquid height = rows held (each zone on its own scale). Pipes lie on the floor, dark
 * until a logged transition sends a slug of light along its route (pipes.js).
 *
 * Light: lit liquid in lens bands with ghost liquid above it (a filter or lens change
 * shows at once); slugs in their row's lens colour, dim if the row fails the filter; a
 * magic circle on the floor around the selected row's machine, in the row's matter colour
 * (selection.js). Each vessel's base is a button that cycles its stage in the filter.
 *
 *   scene.update({ nodes, pipes, levels, codex, flows, colors, accents, sources, io,
 *                  centrifugeBySource, stageFilter, light, packetStyle, fresh })
 *   scene.setSelection(nodeId, color)     // the old circle closes, the new one opens
 *   scene.setInUse(nodeIds)               // machines whose panel is in use work
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
import { deferredResize, isResizing, viewOf } from '../resizing.js';
import { CENTRIFUGE, ENRICHER, FORGE, SANCTUM, SIEVE, MAIN_CHAIN, MANIFOLD, NECROPOLIS, OUTSIDE, SUMP, pipeIndex, route } from '../twinTopology.js';
import { makeMaterials } from './materials.js';
import { buildZones, zoneRects } from './zones.js';
import { FOOT, bodyOf, buildMachine, lighter, makeShop } from './machines.js';
import { buildPipes } from './pipes.js';
import { makeSelection } from './selection.js';

// Phase 7: every zone stands on the floor, cordoned by walls of light (twin/zones.js).
const NET_Y = 0;
const CORE_Y = 0;
const GALLERY_Y = 0;
const MACHINE_SCALE = 1.5;
/** Rows that fill a heart: each zone has its own scale (raw events are bulk, adventures refined). */
const CAP = { net: 120, core: 12 };
/** Dynamos name what they work with on their label. */
const SUB = { forge: 'prima materia', atlas: 'space', calendar: 'time', nexus: 'topology', ledger: 'list' };
const FRUSTUM = 300;
const VIEW_DIR = new THREE.Vector3(0.55, 0.85, 1.15).normalize();

const REPLAY_MAX = 40;
const REPLAY_SECONDS = 5;
const BURST_MAX = 8;                     // slugs drawn per (from, to) in one batch
const BURST_GAP_S = 0.12;                // between the slugs of one burst

/** A count for a label: whole numbers as they are, shared rows (entity lenses) to one decimal. */
const fmtCount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // names are never parsed as HTML
    return n;
}

/**
 * Where each machine stands (PHASE7_PLAN.md: the approved prototype's layout). The camera
 * looks from +z, so +z is the near side: the forge and the Sanctum stand there;
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
        [ENRICHER]: [-295, NET_Y, 118],   // front, between the harvesters and the Forge
        [SIEVE]: [-272, NET_Y, -104],     // back, between the harvesters and the Centrifuge
        [NECROPOLIS]: [110, CORE_Y, -104],
    };
    const chainX = [-110, -40, 30, 110, 180, 250, 320];
    MAIN_CHAIN.forEach((id, i) => { fixed[id] = [chainX[i] ?? -110 + i * 70, CORE_Y, 0]; });
    // the Sanctum stands in front of the Core, as the Gallery stands behind it: same span, evenly spread
    SANCTUM.forEach((id, i) => { fixed[id] = [chainX[0] + (i * (chainX.at(-1) - chainX[0])) / (SANCTUM.length - 1), CORE_Y, 204]; });
    // the viewers spread evenly over the main chain's span, so the Gallery's side edges
    // line up with the Core's (both zones pad their outermost machines the same)
    const viewers = ['atlas', 'nexus', 'calendar', 'ledger'];
    const [x0, x1] = [chainX[0], chainX.at(-1)];
    viewers.forEach((id, i) => { fixed[id] = [x0 + (i * (x1 - x0)) / (viewers.length - 1), GALLERY_Y, -204]; });
    for (const id of [...nodes.map((n) => n.id), MANIFOLD]) if (fixed[id]) pos.set(id, new THREE.Vector3(...fixed[id]));
    return pos;
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
        this.renderer.setClearColor(0x000000, 0); // transparent: the panel's glass shows through, like the other scenes
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


        this.kit = makeMaterials();
        this.shop = makeShop(this.kit);
        /** node ids whose panel is in use (setInUse, from the panel) */
        this.inUse = new Set();
        /** reduced motion: mechanisms and turning circles stand still (slugs still run) */
        this.calm = this.view.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
        this.zones = null;   // built with the machines (they need the layout)

        this.machineGroup = new THREE.Group();
        this.scene.add(this.machineGroup);

        this.sel = makeSelection(this.shop, this.scene);

        /** id -> machine record (see _addMachine) */
        this.machines = new Map();
        /** the floor pipes, slugs, conveyor and Temper (pipes.js); built with the machines */
        this.pipes = null;
        this.pipesByEnds = new Map();
        this.temperLabel = null;
        this.positions = new Map();
        this.hoverId = null;
        this.hoverRing = false;
        this.selection = { nodeId: null, color: '#ffffff' };
        this.data = null;
        this.lastPlayedId = 0;
        this._nodeKey = '';
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
    /*  Assets and the stage                                               */
    /* ------------------------------------------------------------------ */

    /** The zones' walls, corners, floors and plaques, around where the machines stand. */
    _buildZones(nodes) {
        if (this.zones) { this.scene.remove(this.zones.group); this.zones.dispose(); }
        const zoneOf = new Map(nodes.map((n) => [n.id, n.zone]));
        zoneOf.set(MANIFOLD, 'net');
        const viewers = Object.fromEntries(['atlas', 'nexus', 'calendar', 'ledger'].filter((id) => this.positions.has(id)).map((id) => [id, [this.positions.get(id).x, this.positions.get(id).z]]));
        this.zones = buildZones(this.kit, zoneRects(this.positions, zoneOf), viewers);
        this.scene.add(this.zones.group);
    }

    /** The machines whose panel is in use: their mechanisms work (easing in and out). @param {string[]} ids */
    setInUse(ids) {
        this.inUse = new Set(ids);
    }

    /* ------------------------------------------------------------------ */
    /*  Machines                                                           */
    /* ------------------------------------------------------------------ */

    /** One machine (twin/machines.js), standing at `position`. */
    _addMachine(node, position, color) {
        const rec = { id: node.id, node, color, spin: 0, syncing: false };
        const machine = buildMachine(this.shop, node, {
            color,
            accent: this.data?.accents?.[node.id],
            working: () => this.inUse.has(node.id),
            spin: () => rec.spin,
            entities: () => this.data?.codex?.total ?? 0,
            pending: () => (this.data?.light?.pending ?? 0) > 0,
            ports: this.pipes?.ports.get(node.id) ?? [],
        });
        machine.group.position.copy(position);
        machine.group.scale.setScalar(MACHINE_SCALE);
        Object.assign(rec, { machine, group: machine.group, height: machine.height * MACHINE_SCALE });
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

    /** The Temper names itself and its step: a Net heart's scale to a Core heart's. */
    _temperLabel() {
        const label = el('div', 'twin-label kind-temper');
        label.style.setProperty('--c', '#cfd6e0');
        label.append(el('span', 'twin-label-name', 'Temper'), el('b', 'twin-label-count', `${CAP.net} : ${CAP.core} scale`));
        this.labels.appendChild(label);
        return label;
    }

    /* ------------------------------------------------------------------ */
    /*  Data                                                               */
    /* ------------------------------------------------------------------ */

    /**
     * @param {{ nodes, pipes, levels, codex, flows, colors, sources }} data
     *   flows: pipeId -> { forward, backward }; colors: nodeId -> css color;
     *   accents: nodeId -> css color of its trim, where it differs (harvesters: their source);
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
                rec.machine.heart.setBands(bands, level.total, cap);
            }
            rec.machine.setRim(data.stageFilter?.[n.id] ?? null);
            if (n.id === 'nexus' && rec.label._lens && data.light) rec.label._lens.textContent = data.light.lensLabel;
            const syncing = n.kind === 'harvester' && data.sources[n.label]?.status === 'syncing';
            rec.syncing = syncing;
            this._updateLabel(rec, level, syncing);
        }
        if (!this._fitted) { this.fit(); this._fitted = true; }
    }

    _updateLabel(rec, level, syncing) {
        const { label, node } = rec;
        // what it holds, in its matter's colour; dynamos name what they work with
        if (node.locked) label._count.textContent = 'locked';
        else if (node.holds === 'entities') label._count.textContent = `${this.data.codex.total} entities`;
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
        if (this.pipes) { this.scene.remove(this.pipes.group); this.pipes.dispose(); }
        this.temperLabel?.el.remove();
        this.machines.clear();

        this.positions = layout(data.nodes);
        this._buildZones(data.nodes);
        // pipes first: they decide where each base needs a port
        this.pipesByEnds = pipeIndex(data.pipes);
        this.pipes = buildPipes(this.shop, { pipes: data.pipes, positions: this.positions, nodes: data.nodes, colors: data.colors });
        this.scene.add(this.pipes.group);
        for (const n of data.nodes) {
            const at = this.positions.get(n.id);
            if (at) this._addMachine(n, at, data.colors[n.id] ?? '#888');
        }
        this.temperLabel = this.pipes.temperAt ? { el: this._temperLabel(), at: this.pipes.temperAt } : null;
        this._nodeKey = data.nodes.map((n) => `${n.id}:${n.locked}`).join('|');
    }

    /**
     * A magic circle on the floor around the machine holding the selected row, in the row's
     * matter colour: the old circle closes, the new one opens. nodeId null: none.
     * @param {string | null} nodeId @param {string} [color]
     */
    setSelection(nodeId, color = '#ffffff') {
        const moved = nodeId !== this.selection.nodeId;
        this.selection = { nodeId, color };
        const glowColor = lighter(color);
        if (!moved) { this.sel.recolor(glowColor); return; }
        const rec = nodeId ? this.machines.get(nodeId) : null;
        const r = rec ? ((FOOT[bodyOf(rec.node)] ?? 9) + 7) * MACHINE_SCALE : 0;   // just outside the base
        this.sel.set(rec ? rec.group.position : null, r, glowColor);
    }

    /* ------------------------------------------------------------------ */
    /*  Slugs                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Send slugs for transitions not played yet. replay: squeeze the latest REPLAY_MAX
     * into REPLAY_SECONDS (so the twin doesn't open frozen); otherwise play now, bursts
     * of the same move capped at BURST_MAX slugs.
     * @param {{ id: number, from: string, to: string, subject: string }[]} transitions
     */
    play(transitions, { replay = false } = {}) {
        if (!this.data || !this.pipes) return;
        let fresh = transitions.filter((t) => t.id > this.lastPlayedId);
        if (!fresh.length) return;
        this.lastPlayedId = fresh[fresh.length - 1].id;
        if (replay) {
            fresh = fresh.slice(-REPLAY_MAX);
            const gap = Math.min(0.15, REPLAY_SECONDS / fresh.length);
            fresh.forEach((t, i) => this._launch(t, 0.4 + i * gap));
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
            for (let i = 0; i < n; i++) this._launch(list[i], i * BURST_GAP_S);
        }
    }

    /** One move: a slug down each pipe of its route in turn (a link runs the conveyor instead). */
    _launch(t, delay) {
        const steps = route(this.pipesByEnds, t.from, t.to);
        if (!steps?.length) return;
        const link = t.subject === 'link';
        const style = link ? null : this.data.packetStyle?.(t);
        // the row's lens colour; the stage lens keeps the colour of the machine it leaves
        const color = new THREE.Color(style?.color ?? lighter(this.data.colors[t.from === OUTSIDE ? t.to : t.from] ?? '#ffffff'));
        if (style && !style.lit) color.multiplyScalar(0.3); // the row fails the filter: a dim slug
        this.pipes.launch(steps, color, delay);
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
        this.shop.tick(this.calm?.matches ? 0 : dt);   // the hearts' liquid drifts and ripples

        for (const rec of this.machines.values()) {
            // a harvester's rotor spins while it harvests; the centrifuge whirls after a purge
            rec.spin = rec.syncing ? 14 : Math.max(0, rec.spin - dt * 3);
            rec.machine.frame(this.calm?.matches ? 0 : dt, this.time, ease);
        }

        this.pipes?.frame(dt);   // slugs always run: they carry information
        this.sel.frame(dt);
        this.renderer.render(this.scene, this.camera);
        this._placeLabels();
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
        if (this.temperLabel) {
            const at = this._project(this.temperLabel.at);
            const l = this.temperLabel.el;
            l.style.display = at ? '' : 'none';
            if (at) {
                l.style.transform = `translate(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px) translate(-50%, -100%)`;
                l.style.zIndex = String(1000 - Math.round(at[2] * 500));
            }
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
        this.sel.dispose();
        this.pipes?.dispose();
        this.zones?.dispose();
        this.shop.dispose();
        this.kit.dispose();
        this.envMap.dispose();
        this.pmrem.dispose();
        this.renderer.dispose();
        this.container.remove();
    }
}
