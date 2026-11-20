// @ts-nocheck -- imperative three.js/MapLibre code ported from the legacy project;
// both libraries are untyped globals here. MapPanel.js is the typed boundary.

/**
 * LevelMap — AR-style event map on MapLibre + three.js (ported from legacy/static/lib/map.js)
 *
 * Each event becomes a neon tower with an orb floating above it. A card
 * (title + cover image) hangs above every orb and always faces the viewer.
 * Cards are HTML overlays projected from the orb's 3D position, so any image
 * URL works (no CORS needed, unlike WebGL textures) and text stays crisp.
 * Styles live in frontend/styles.css under "Map".
 *
 * Usage:
 *   await loadMapLibraries();
 *   const map = new LevelMap(parentEl, { onSelect(id), onHover(id | null) });
 *   map.updateNodes(events);            // PoolItem[]
 *   map.select(id, { fly, emit });      // emit=false when the change came from elsewhere
 *   map.highlight(id);                  // hover from another view
 *   map.setRing(ring, units);           // proximity filter ring (null hides it)
 *   map.startPlacing();                 // next map click reports a point via onRingPlace
 *   map.dispose();
 */

import { loadScript, loadStylesheet } from './loadScript.js';
import { stageOf } from '../lifecycle.js';
import { deferredResize, isResizing } from './resizing.js';

const VENDOR = '/frontend/vendor';

/** Load three.js r128 + MapLibre (globals) once. */
export async function loadMapLibraries() {
    await Promise.all([
        loadStylesheet(`${VENDOR}/maplibre-gl.css`),
        loadScript(`${VENDOR}/three.min.js`),
        loadScript(`${VENDOR}/maplibre-gl.js`),
    ]);
}

let THREE;
let maplibregl;

export class LevelMap {
    static PALETTE = [0x00f0ff, 0xff2bd6, 0xfcee0a, 0x39ff14, 0xb026ff, 0xff6a00];

    constructor(parent, options = {}) {
        THREE = window.THREE;
        maplibregl = window.maplibregl;
        if (!parent || !THREE || !maplibregl) {
            throw new Error('[Map] Missing container or dependencies (call loadMapLibraries first).');
        }

        // Own an inner host that fills the parent (inline style beats MapLibre's CSS)
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
        this.container = document.createElement('div');
        this.container.style.cssText = 'position:absolute;inset:0;background:#05070d';
        parent.appendChild(this.container);

        const {
            onSelect = () => {}, onHover = () => {},
            onRingChange = () => {}, onRingPlace = () => {}, onSiteClick = () => {},
            ...config
        } = options;
        this.onSiteClick = onSiteClick;   // (site, { x, y } in the map's own pixels) after a site pin click
        /** @type {Map<string, { marker: any, site: any }>} site id -> pin */
        this._sites = new Map();
        this.onSelect = onSelect;
        this.onHover = onHover;
        this.onRingChange = onRingChange; // (ring) after dragging the ring's center or edge
        this.onRingPlace = onRingPlace;   // ({ lat, lon }) after startPlacing() + a map click
        this._ring = null;
        this._ringUnits = 'mi';
        this._placing = false;

        this.config = {
            mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: [-118.2437, 34.0522], // downtown Los Angeles
            towerRadius: 28,      // meters
            orbRadius: 36,        // meters
            orbHover: 70,         // meters between tower top and orb centre
            minTowerHeight: 60,   // tower height for an event with no guests
            arcLift: 90,          // meters the connection arcs rise above the orbs
            flyToOnSelect: true,
            fitOnFirstData: true, // frame all events the first time any arrive
            ...config,
        };

        this.container.classList.add('lm-root');

        this.nodes = [];
        this.entries = [];
        this.pickables = [];
        this.arcs = [];
        this.selectedId = null;
        this.time = 0;
        this._hasFrame = false;
        this._compact = null;
        this._fitted = false;
        this._styleReady = false;

        this._createMap();
        this._createOverlay();
        this._createLayer();
        this._bindEvents();
        this._watchSize();
    }

    _watchSize() {
        this._ro = new ResizeObserver(deferredResize(() => this.map?.resize()));
        this._ro.observe(this.container);
    }

    /* ------------------------------------------------------------------ */
    /*  Data                                                               */
    /* ------------------------------------------------------------------ */

    /** PoolItem -> internal node. Tower height grows with the guest count. */
    _normalizeNode(raw, index) {
        const fallback = LevelMap.PALETTE[index % LevelMap.PALETTE.length];
        let color;
        try {
            color = new THREE.Color(raw.color ?? fallback);
        } catch {
            color = new THREE.Color(fallback);
        }

        const guests = Number(raw.details?.guest_count) || 0;
        const height = guests > 0 ? this.config.minTowerHeight + 45 * Math.log10(1 + guests) : 0;

        return {
            id: String(raw.id ?? index),
            title: raw.title ?? `Event ${index + 1}`,
            image: raw.cover_url ?? null,
            lng: raw.lon == null ? NaN : Number(raw.lon), // Number(null) would be 0, not "missing"
            lat: raw.lat == null ? NaN : Number(raw.lat),
            height,
            guests,
            start: raw.start ? new Date(raw.start) : null,
            color,
            raw,
        };
    }

    _hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    /* ------------------------------------------------------------------ */
    /*  Map + overlay                                                      */
    /* ------------------------------------------------------------------ */

    _createMap() {
        this.map = new maplibregl.Map({
            container: this.container,
            style: this.config.mapStyle,
            center: this.config.center,
            zoom: 12.5,
            pitch: 62,
            bearing: -18,
            maxPitch: 80,
            antialias: true,
            canvasContextAttributes: { antialias: true },
        });

        this.map.addControl(new maplibregl.NavigationControl());
        this._bindMouseDrag();
    }

    /**
     * Mouse drag, matching the Nexus: left-drag rotates (bearing + tilt), right-drag
     * moves. MapLibre hard-wires the opposite, so its mouse drag handlers are turned
     * off and replaced here. Touch, wheel, pinch and the buttons are unchanged.
     */
    _bindMouseDrag() {
        const map = this.map;
        map.dragRotate.disable(); // mouse-only handler
        // Keep one-finger touch pan: disable only the mouse half of drag-pan when we can reach it.
        const mousePan = /** @type {any} */ (map.dragPan)._mousePan;
        if (mousePan?.disable) mousePan.disable();
        else map.dragPan.disable();

        const canvas = map.getCanvas();
        /** @type {{ id: number, mode: 'rotate' | 'pan', x: number, y: number, anchor: any } | null} */
        let drag = null;

        this._onDragDown = (/** @type {PointerEvent} */ e) => {
            if (e.pointerType !== 'mouse' || (e.button !== 0 && e.button !== 2)) return;
            const p = this._canvasPoint(e);
            drag = {
                id: e.pointerId, x: e.clientX, y: e.clientY,
                mode: e.button === 0 ? 'rotate' : 'pan',
                anchor: e.button === 2 ? map.unproject(p) : null, // the ground point held under the cursor
            };
            canvas.setPointerCapture(e.pointerId);
            map.stop(); // cancel any fly-to in progress
        };
        this._onDragMove = (/** @type {PointerEvent} */ e) => {
            if (!drag || e.pointerId !== drag.id) return;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (!dx && !dy) return;
            drag.x = e.clientX; drag.y = e.clientY;
            canvas.classList.add('lm-dragging');
            if (drag.mode === 'rotate') {
                // Same rates as MapLibre's own rotate-drag
                map.jumpTo({ bearing: map.getBearing() + dx * 0.8, pitch: map.getPitch() + dy * 0.5 });
            } else {
                // Keep the grabbed ground point under the cursor (falls back to a plain shift near the horizon)
                const p = this._canvasPoint(e);
                const at = map.project(drag.anchor);
                let ox = at.x - p.x, oy = at.y - p.y;
                if (!Number.isFinite(ox) || !Number.isFinite(oy) || Math.hypot(ox, oy) > 400) { ox = -dx; oy = -dy; }
                map.panBy([ox, oy], { duration: 0 });
            }
        };
        this._onDragUp = (/** @type {PointerEvent} */ e) => {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
            canvas.classList.remove('lm-dragging');
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        };
        this._onContextMenu = (/** @type {MouseEvent} */ e) => e.preventDefault();

        canvas.addEventListener('pointerdown', this._onDragDown);
        canvas.addEventListener('pointermove', this._onDragMove);
        canvas.addEventListener('pointerup', this._onDragUp);
        canvas.addEventListener('pointercancel', this._onDragUp);
        canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    /** Pointer position relative to the map canvas. @param {PointerEvent} e */
    _canvasPoint(e) {
        const r = this.map.getCanvas().getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }

    _addBuildings() {
        try {
            const layers = this.map.getStyle().layers;
            const source = layers.find((l) => l['source-layer'] === 'building' && l.source);
            if (!source) return;

            const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
            const h = ['coalesce', ['get', 'render_height'], 10];

            this.map.addLayer({
                id: 'lm-buildings',
                type: 'fill-extrusion',
                source: source.source,
                'source-layer': 'building',
                minzoom: 13,
                paint: {
                    'fill-extrusion-color': ['interpolate', ['linear'], h, 0, '#0a1226', 80, '#14264d', 220, '#22377a'],
                    'fill-extrusion-height': h,
                    'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                    'fill-extrusion-opacity': 0.9,
                },
            }, firstSymbol);
        } catch (error) {
            console.warn('[Map] Skipping 3D buildings:', error);
        }
    }

    _createOverlay() {
        const div = (cls, parent = this.container) => {
            const el = document.createElement('div');
            el.className = cls;
            parent.appendChild(el);
            return el;
        };

        // Soft vignette over the map.
        this.fx = div('lm-fx');

        // Cards live here, above the canvas.
        this.labelLayer = div('lm-labels');

        // HUD (static markup only; dynamic values are set via textContent).
        this.panel = div('lm-hud');
        this.panel.innerHTML = `
            <div class="lm-row"><span>Shown</span><b data-ref="count">0</b></div>
            <div class="lm-row"><span>Target</span><b data-ref="target">None</b></div>
        `;
        this.nodeCount = this.panel.querySelector('[data-ref="count"]');
        this.selectedLabel = this.panel.querySelector('[data-ref="target"]');
    }

    /* ------------------------------------------------------------------ */
    /*  three.js layer                                                     */
    /* ------------------------------------------------------------------ */

    _createLayer() {
        this.layer = {
            id: 'threejs-nodes',
            type: 'custom',
            renderingMode: '3d',

            onAdd: (mapInstance, gl) => {
                this.camera = new THREE.PerspectiveCamera();
                this.scene = new THREE.Scene();
                this.raycaster = new THREE.Raycaster();

                this._white = new THREE.Color(0xffffff);
                this._bq = new THREE.Quaternion();
                this._m4 = new THREE.Matrix4();
                this._v4 = new THREE.Vector4();
                this._pv1 = new THREE.Vector3();
                this._pv2 = new THREE.Vector3();

                this._buildShared();
                this._buildNodes();
                if (this.selectedId) this.select(this.selectedId, { fly: false, emit: false });

                this.renderer = new THREE.WebGLRenderer({
                    canvas: mapInstance.getCanvas(),
                    context: gl,
                });
                this.renderer.autoClear = false;
            },

            render: (gl, args) => {
                const matrix = args?.defaultProjectionData?.mainMatrix
                    ?? (Array.isArray(args) || ArrayBuffer.isView(args) ? args : null);
                if (!matrix) return;

                const now = performance.now() / 1000;
                const dt = Math.min(now - (this._last ?? now), 0.1);
                this._last = now;
                this.time += dt;

                this.camera.projectionMatrix.fromArray(matrix);
                this.camera.projectionMatrixInverse
                    .copy(this.camera.projectionMatrix)
                    .invert();
                this._hasFrame = true;

                this._animate(this.time, dt);

                this.renderer.resetState();
                this.renderer.render(this.scene, this.camera);

                this._updateLabels();

                // Keep animating; while a splitter is dragged, just check back now and then.
                if (isResizing()) setTimeout(() => this.map?.triggerRepaint(), 100);
                else this.map.triggerRepaint();
            },

            onRemove: () => {
                this._disposeLayer();
            },
        };

        this.map.on('load', () => {
            this._styleReady = true;
            this._addBuildings();
            this.map.addLayer(this.layer);
            this._renderRing();
            this._maybeFit();
        });
    }

    /** Geometries and textures shared by every node. Units are meters. */
    _buildShared() {
        const R = this.config.towerRadius;
        const rotUp = (geo, lift = 0) => {
            geo.rotateX(Math.PI / 2); // cylinder axis Y -> Z (up)
            if (lift) geo.translate(0, 0, lift);
            return geo;
        };

        const tower = rotUp(new THREE.CylinderGeometry(R, R * 1.3, 1, 6, 1, true), 0.5);
        const hexRing = new THREE.RingGeometry(R * 0.97, R * 1.07, 6, 1);
        hexRing.rotateZ(-Math.PI / 2); // align with the hex tower

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = 128;
        const g = glowCanvas.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,.45)');
        grad.addColorStop(0.6, 'rgba(255,255,255,.1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const glowTex = new THREE.CanvasTexture(glowCanvas);
        if (THREE.SRGBColorSpace) glowTex.colorSpace = THREE.SRGBColorSpace;

        this.shared = {
            tower,
            towerEdges: new THREE.EdgesGeometry(tower),
            cap: rotUp(new THREE.CylinderGeometry(R * 1.1, R * 1.1, 3, 6)),
            beam: rotUp(new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true), 0.5),
            hexRing,
            sphere: new THREE.SphereGeometry(1, 32, 20),
            ico: new THREE.IcosahedronGeometry(1, 1),
            torus: new THREE.TorusGeometry(1, 0.025, 8, 96),
            plane: new THREE.PlaneGeometry(1, 1),
            disc: new THREE.CircleGeometry(1, 48),
            ring: new THREE.RingGeometry(0.97, 1, 64),
            glowTex,
            hitMat: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
        };
    }

    _buildNodes() {
        this._clearNodes();

        const S = this.shared;
        const cfg = this.config;
        const R = cfg.towerRadius;
        const orbR = cfg.orbRadius;
        const additive = THREE.AdditiveBlending;

        this.nodes.forEach((node, index) => {
            const mc = maplibregl.MercatorCoordinate.fromLngLat([node.lng, node.lat], 0);
            const m = mc.meterInMercatorCoordinateUnits();
            const hash = this._hash(node.id);
            const towerH = node.height > 0
                ? Math.max(node.height, 40)
                : cfg.minTowerHeight + (hash % 30);
            const orbZ = towerH + cfg.orbHover;
            const bright = node.color.clone().lerp(this._white, 0.45);

            // Group local space: meters, x = east, y = north, z = up.
            // Mercator y points south, so y is flipped to keep winding correct.
            const group = new THREE.Group();
            group.position.set(mc.x, mc.y, 0);
            group.scale.set(m, -m, m);

            const glowMat = (opacity, color = node.color) => new THREE.MeshBasicMaterial({
                color, transparent: true, opacity, depthWrite: false,
                blending: additive, side: THREE.DoubleSide,
            });
            const add = (parent, geo, mat) => {
                const mesh = new THREE.Mesh(geo, mat);
                parent.add(mesh);
                return mesh;
            };

            // --- Tower ---------------------------------------------------
            const towerBody = add(group, S.tower, glowMat(0.14));
            towerBody.scale.z = towerH;

            const edges = new THREE.LineSegments(S.towerEdges, new THREE.LineBasicMaterial({
                color: bright, transparent: true, opacity: 0.7, blending: additive, depthWrite: false,
            }));
            edges.scale.z = towerH;
            group.add(edges);

            const cap = add(group, S.cap, glowMat(0.9, bright));
            cap.position.z = towerH;

            const scan = add(group, S.hexRing, glowMat(0.8, bright));
            const beam = add(group, S.beam, glowMat(0.6, bright));
            beam.position.z = towerH;
            beam.scale.z = cfg.orbHover;

            // --- Ground markings ----------------------------------------
            const floor = add(group, S.disc, glowMat(0.1));
            floor.scale.setScalar(R * 2.6);
            const floorRing = add(group, S.ring, glowMat(0.8, bright));
            floorRing.scale.setScalar(R * 2.6);
            const pulse = add(group, S.ring, glowMat(0.5));

            // --- Orb -----------------------------------------------------
            const orb = new THREE.Group();
            orb.position.z = orbZ;
            group.add(orb);

            const core = add(orb, S.sphere, new THREE.MeshBasicMaterial({ color: node.color }));
            core.scale.setScalar(orbR);

            const shell = add(orb, S.sphere, glowMat(0.22));
            shell.scale.setScalar(orbR * 1.35);

            const wire = add(orb, S.ico, new THREE.MeshBasicMaterial({
                color: bright, wireframe: true, transparent: true, opacity: 0.7,
                blending: additive, depthWrite: false,
            }));
            wire.scale.setScalar(orbR * 1.75);

            const tilt = new THREE.Group();
            tilt.rotation.x = 1.15;
            orb.add(tilt);
            const spinner = new THREE.Group();
            tilt.add(spinner);
            add(spinner, S.torus, glowMat(0.9, bright)).scale.setScalar(orbR * 2.3);
            const satellite = add(spinner, S.sphere, new THREE.MeshBasicMaterial({ color: this._white }));
            satellite.scale.setScalar(orbR * 0.2);
            satellite.position.x = orbR * 2.3;

            const halo = add(orb, S.plane, new THREE.MeshBasicMaterial({
                map: S.glowTex, color: node.color, transparent: true, opacity: 0.6,
                blending: additive, depthWrite: false, side: THREE.DoubleSide,
            }));

            // --- Picking proxies ----------------------------------------
            const orbHit = add(orb, S.sphere, S.hitMat);
            orbHit.scale.setScalar(orbR * 2);
            const towerHit = add(group, S.tower, S.hitMat);
            towerHit.scale.set(1.25, 1.25, towerH);

            group.traverse((o) => { o.frustumCulled = false; });
            this.scene.add(group);

            const entry = {
                node, group, m, towerH, orbZ, index,
                phase: (hash % 997) / 997,
                sel: 0, hov: 0,
                selected: false, hoverPick: false, hoverCard: false,
                parts: { orb, core, wire, spinner, halo, scan, pulse, beam, edges },
            };

            orbHit.userData.entry = entry;
            towerHit.userData.entry = entry;
            this.pickables.push(orbHit, towerHit);

            entry.card = this._makeCard(entry);
            this.entries.push(entry);
        });

        this._buildArcs();

        this.nodeCount.textContent = String(this.nodes.length);
    }

    /** Curved data links from the first orb to every other orb, with travelling packets. */
    _buildArcs() {
        const anchor = this.entries[0];
        if (!anchor) return;

        const orbWorld = (e) => new THREE.Vector3(e.group.position.x, e.group.position.y, e.orbZ * e.m);

        for (const e of this.entries.slice(1)) {
            const a = orbWorld(anchor);
            const b = orbWorld(e);
            const control = a.clone().add(b).multiplyScalar(0.5);
            control.z = Math.max(a.z, b.z) + this.config.arcLift * 2 * anchor.m;

            const curve = new THREE.QuadraticBezierCurve3(a, control, b);
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
                new THREE.LineBasicMaterial({
                    color: e.node.color, transparent: true, opacity: 0.6,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                }),
            );
            line.frustumCulled = false;
            this.scene.add(line);

            const packets = [0, 0.5].map((off) => {
                const mesh = new THREE.Mesh(
                    this.shared.sphere,
                    new THREE.MeshBasicMaterial({ color: e.node.color.clone().lerp(this._white, 0.6) }),
                );
                mesh.scale.setScalar(9 * e.m);
                mesh.frustumCulled = false;
                this.scene.add(mesh);
                return { mesh, off, speed: 0.12 + (e.phase * 0.08) };
            });

            this.arcs.push({ curve, line, packets });
        }
    }

    _clearNodes() {
        const S = this.shared;

        for (const e of this.entries) {
            this.scene.remove(e.group);
            e.group.traverse((o) => {
                if (o.material && o.material !== S?.hitMat) o.material.dispose();
            });
            e.card.remove();
        }

        for (const a of this.arcs) {
            this.scene.remove(a.line);
            a.line.geometry.dispose();
            a.line.material.dispose();
            for (const p of a.packets) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
            }
        }

        this.entries = [];
        this.pickables = [];
        this.arcs = [];
    }

    /* ------------------------------------------------------------------ */
    /*  Cards (title + image, billboarded via screen-space projection)     */
    /* ------------------------------------------------------------------ */

    _makeCard(entry) {
        const { node } = entry;
        const el = (tag, cls, text) => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text; // event data is never parsed as HTML
            return n;
        };

        const card = el('div', 'lm-card');
        card.style.setProperty('--c', '#' + node.color.getHexString());

        const frame = el('div', 'lm-frame');
        const inner = el('div', 'lm-inner');

        const head = el('div', 'lm-head');
        head.append(
            el('span', 'lm-tag', stageOf(node.raw)?.matter ?? 'matter'),
            el('span', 'lm-title', node.title),
        );

        const imgBox = el('div', 'lm-img');
        const src = this._safeImageUrl(node.image);
        if (src) {
            const img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.onerror = () => { img.remove(); imgBox.classList.add('empty'); };
            img.src = src;
            imgBox.appendChild(img);
        } else {
            imgBox.classList.add('empty');
        }

        const foot = el('div', 'lm-foot');
        const when = el('span', '');
        when.appendChild(el('b', '', node.start && !Number.isNaN(node.start.getTime())
            ? node.start.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
            : '—'));
        const going = el('span', '');
        going.appendChild(el('b', '', node.guests ? node.guests.toLocaleString() : '—'));
        going.append(' going');
        foot.append(when, going);

        inner.append(head, imgBox, foot);
        frame.appendChild(inner);
        card.append(frame, el('div', 'lm-stem'));

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.select(node.id);
        });
        card.addEventListener('mouseenter', () => { entry.hoverCard = true; card.classList.add('hover'); this._emitHover(node); });
        card.addEventListener('mouseleave', () => { entry.hoverCard = false; card.classList.toggle('hover', !!entry.hoverExt); this._emitHover(null); });

        card.style.visibility = 'hidden';
        this.labelLayer.appendChild(card);
        return card;
    }

    _emitHover(node) {
        const id = node ? node.id : null;
        if (id === this._hoverId) return;
        this._hoverId = id;
        this.onHover(id);
    }

    /** Hover from another view. Highlights without emitting. */
    highlight(id) {
        id = id == null ? null : String(id);
        this._hoverId = id;
        for (const e of this.entries) {
            e.hoverExt = e.node.id === id;
            e.card.classList.toggle('hover', e.hoverExt || e.hoverCard);
        }
        this.map.triggerRepaint();
    }

    _safeImageUrl(link) {
        if (!link || typeof link !== 'string') return null;
        try {
            const url = new URL(link, window.location.href);
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    _updateLabels() {
        const canvas = this.map.getCanvas();
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const zoom = this.map.getZoom();
        const base = THREE.MathUtils.clamp(0.55 + (zoom - 13) * 0.22, 0.5, 1.15);
        const compact = zoom < 13.6;
        const lift = this.config.orbRadius * 2.5;
        const visible = [];

        for (const e of this.entries) {
            const z = (e.parts.orb.position.z + lift) * e.m;
            this._v4.set(e.group.position.x, e.group.position.y, z, 1)
                .applyMatrix4(this.camera.projectionMatrix);

            const w = this._v4.w;
            const nx = this._v4.x / w;
            const ny = this._v4.y / w;
            const card = e.card;

            if (w <= 0 || Math.abs(nx) > 1.3 || Math.abs(ny) > 1.3) {
                card.style.visibility = 'hidden';
                continue;
            }

            const px = (nx * 0.5 + 0.5) * W;
            let py = (1 - (ny * 0.5 + 0.5)) * H;
            const s = base * (1 + e.sel * 0.12);
            // Keep the locked card fully on screen (it hangs above py, so clamp its top edge).
            if (e.selected) py = Math.max(py, card.offsetHeight * s + 8);

            card.style.visibility = 'visible';
            card.style.transform =
                `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
            visible.push({ card, w, boost: e.selected ? 10000 : 0 });
        }

        // Nearer cards render on top.
        visible.sort((a, b) => b.w - a.w);
        visible.forEach((v, i) => { v.card.style.zIndex = String(i + v.boost); });

        if (compact !== this._compact) {
            this._compact = compact;
            for (const e of this.entries) e.card.classList.toggle('compact', compact);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Animation                                                          */
    /* ------------------------------------------------------------------ */

    _animate(t, dt) {
        const R = this.config.towerRadius;
        const TAU = Math.PI * 2;

        // Billboard orientation from the map camera. Local axes: x east, y north, z up.
        const b = THREE.MathUtils.degToRad(this.map.getBearing());
        const p = THREE.MathUtils.degToRad(this.map.getPitch());
        const back = new THREE.Vector3(-Math.sin(b) * Math.sin(p), -Math.cos(b) * Math.sin(p), Math.cos(p));
        const right = new THREE.Vector3(Math.cos(b), -Math.sin(b), 0);
        const up = new THREE.Vector3().crossVectors(back, right);
        this._m4.makeBasis(right, up, back);
        this._bq.setFromRotationMatrix(this._m4);

        const k = Math.min(1, dt * 6);

        for (const e of this.entries) {
            const p = e.parts;
            const ph = e.phase * TAU;

            e.sel += ((e.selected ? 1 : 0) - e.sel) * k;
            e.hov += ((e.hoverPick || e.hoverCard || e.hoverExt ? 1 : 0) - e.hov) * k;

            p.orb.position.z = e.orbZ + Math.sin(t * 1.4 + ph) * 4 + e.sel * 14 + e.hov * 6;
            p.orb.scale.setScalar(1 + e.sel * 0.3 + e.hov * 0.12);

            p.core.material.color.copy(e.node.color)
                .lerp(this._white, Math.min(1, e.sel * 0.7 + e.hov * 0.3));
            p.wire.rotation.set(t * 0.5 + ph, t * 0.8, 0);
            p.spinner.rotation.z = t * (0.9 + e.sel * 1.6);

            const hs = R * (5 + Math.sin(t * 2 + ph) * 0.5 + e.sel * 1.6 + e.hov * 0.6);
            p.halo.quaternion.copy(this._bq);
            p.halo.scale.set(hs, hs, 1);
            p.halo.material.opacity = 0.5 + 0.2 * Math.sin(t * 2.3 + ph) + e.sel * 0.25;

            // Scan ring climbing the tower.
            const f = (t * 0.3 + e.phase) % 1;
            p.scan.position.z = f * e.towerH;
            p.scan.scale.setScalar(1.3 - 0.3 * f);
            p.scan.material.opacity = Math.sin(Math.PI * f) * (0.7 + e.sel * 0.3);

            // Ground pulse.
            const pf = (t * 0.45 + e.phase) % 1;
            p.pulse.scale.setScalar(R * (1.2 + pf * 3.4));
            p.pulse.material.opacity = (1 - pf) * 0.6;

            p.beam.material.opacity = 0.45 + 0.2 * Math.sin(t * 9 + ph * 3);
            p.edges.material.opacity = 0.6 + e.sel * 0.4 + e.hov * 0.2;
        }

        for (const a of this.arcs) {
            for (const pk of a.packets) {
                a.curve.getPoint((t * pk.speed + pk.off) % 1, pk.mesh.position);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Interaction                                                        */
    /* ------------------------------------------------------------------ */

    _bindEvents() {
        this._onClick = (event) => {
            if (this._placing) {
                this._placing = false;
                this.map.getCanvas().style.cursor = '';
                this.onRingPlace({ lat: event.lngLat.lat, lon: event.lngLat.lng });
                return;
            }
            // a click on a node selects it; anywhere else clears the selection
            // (MapLibre only fires click when the pointer barely moved, so drags don't count)
            const entry = this._pick(event.point);
            this.select(entry ? entry.node.id : null);
        };

        this._onMove = (event) => {
            const hit = this._pick(event.point);
            for (const e of this.entries) e.hoverPick = e === hit;
            this.map.getCanvas().style.cursor = hit ? 'pointer' : '';
            this._emitHover(hit ? hit.node : null);
        };

        this._onError = (event) => {
            console.error('[Map] Map error:', event.error || event);
        };

        this.map.on('click', this._onClick);
        this.map.on('mousemove', this._onMove);
        this.map.on('error', this._onError);
    }

    /** Ray from the near to far plane of the map's own projection matrix. */
    _pick(point) {
        if (!this._hasFrame || !this.pickables.length) return null;

        const canvas = this.map.getCanvas();
        const x = (point.x / canvas.clientWidth) * 2 - 1;
        const y = -(point.y / canvas.clientHeight) * 2 + 1;

        const near = this._pv1.set(x, y, -1).unproject(this.camera);
        const far = this._pv2.set(x, y, 1).unproject(this.camera);

        this.raycaster.ray.origin.copy(near);
        this.raycaster.ray.direction.copy(far).sub(near).normalize();

        const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
        return hit ? hit.object.userData.entry : null;
    }

    /**
     * Lock onto an event (null clears). `emit` reports the change via onSelect;
     * pass emit: false when the selection came from another view.
     */
    select(id, { fly = this.config.flyToOnSelect, emit = true } = {}) {
        const entry = id == null ? null : this.entries.find((e) => e.node.id === String(id));
        // Remember the id even before the layer exists, so it can be applied once built.
        this.selectedId = entry ? entry.node.id : (id == null ? null : String(id));

        for (const e of this.entries) {
            e.selected = e === entry;
            e.card.classList.toggle('selected', e.selected);
        }

        this.selectedLabel.textContent = entry ? entry.node.title : 'None';
        if (emit) this.onSelect(entry ? entry.node.id : null);
        if (!entry) return;

        if (fly) {
            // Put the tower base low in the view so the orb and its card above fit,
            // scaled to the panel height (legacy used a fixed 110px for a full-window map).
            const h = this.map.getCanvas().clientHeight;
            this.map.easeTo({
                center: [entry.node.lng, entry.node.lat],
                zoom: Math.max(this.map.getZoom(), 15),
                pitch: 62,
                offset: [0, Math.round(h * 0.38)],
                duration: 1400,
            });
        }

        this.map.triggerRepaint();
    }

    /** Frame all events once, the first time there are any (after the style loads). */
    _maybeFit() {
        if (!this.config.fitOnFirstData || this._fitted || !this.nodes.length || !this._styleReady) return;
        this._fitted = true;
        if (this.selectedId && this.nodes.some((n) => n.id === this.selectedId)) return; // select() flies there instead
        const bounds = new maplibregl.LngLatBounds();
        for (const n of this.nodes) bounds.extend([n.lng, n.lat]);
        this.map.fitBounds(bounds, { padding: 80, maxZoom: 15, pitch: 62, duration: 0 });
    }

    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    _disposeLayer() {
        if (this.scene) this._clearNodes();

        if (this.shared) {
            for (const value of Object.values(this.shared)) value.dispose?.();
            this.shared = null;
        }

        this.renderer?.dispose();
    }

    /* ------------------------------------------------------------------ */
    /*  Proximity ring (filter)                                            */
    /* ------------------------------------------------------------------ */

    /** Show / update / hide the ring. `ring` = { center: { lat, lon }, radius_km, mode } or null. */
    setRing(ring, units = 'mi') {
        this._ring = ring ? { ...ring, center: { ...ring.center } } : null;
        this._ringUnits = units;
        this._renderRing();
    }

    /** The next click on the map reports its point via onRingPlace instead of selecting. */
    startPlacing() {
        this._placing = true;
        this.map.getCanvas().style.cursor = 'crosshair';
    }

    cancelPlacing() {
        this._placing = false;
        this.map.getCanvas().style.cursor = '';
    }

    /** Point `km` away from (lat, lon) along `bearing` degrees, as [lon, lat]. */
    static _destination(lat, lon, km, bearing) {
        const R = 6371.0088, rad = Math.PI / 180;
        const d = km / R, th = bearing * rad, p1 = lat * rad, l1 = lon * rad;
        const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
        const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
        return [((l2 / rad + 540) % 360) - 180, p2 / rad];
    }

    static _distanceKm(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180;
        const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
            + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
        return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    _ringGeoJSON() {
        const { center, radius_km } = this._ring;
        const coords = [];
        for (let i = 0; i <= 96; i++) coords.push(LevelMap._destination(center.lat, center.lon, radius_km, (i / 96) * 360));
        return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
    }

    _ringLabel() {
        const km = this._ring.radius_km;
        const v = this._ringUnits === 'mi' ? km / 1.609344 : km;
        return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${this._ringUnits}`;
    }

    /** Draw the ring layers and its two drag handles (center, edge). */
    _renderRing() {
        if (!this._styleReady) return; // drawn once the style loads
        const map = this.map;

        if (!this._ring) {
            map.getSource('lm-ring')?.setData({ type: 'FeatureCollection', features: [] });
            this._ringCenter?.remove(); this._ringCenter = null;
            this._ringEdge?.remove(); this._ringEdge = null;
            return;
        }

        const color = this._ring.mode === 'exclude' ? '#ff2bd6' : '#00f0ff';
        if (!map.getSource('lm-ring')) {
            map.addSource('lm-ring', { type: 'geojson', data: this._ringGeoJSON() });
            const before = map.getLayer('threejs-nodes') ? 'threejs-nodes' : undefined;
            map.addLayer({ id: 'lm-ring-fill', type: 'fill', source: 'lm-ring',
                paint: { 'fill-color': color, 'fill-opacity': 0.07 } }, before);
            map.addLayer({ id: 'lm-ring-line', type: 'line', source: 'lm-ring',
                paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 1.5] } }, before);
        } else {
            map.getSource('lm-ring').setData(this._ringGeoJSON());
        }
        map.setPaintProperty('lm-ring-fill', 'fill-color', color);
        map.setPaintProperty('lm-ring-line', 'line-color', color);

        const { center } = this._ring;
        const edgePos = LevelMap._destination(center.lat, center.lon, this._ring.radius_km, 90);

        if (!this._ringCenter) {
            const el = document.createElement('div');
            el.className = 'lm-ring-center';
            el.title = 'Drag to move the proximity ring';
            this._ringCenter = new maplibregl.Marker({ element: el, draggable: true })
                .setLngLat([center.lon, center.lat]).addTo(map);
            this._ringCenter.on('drag', () => {
                const p = this._ringCenter.getLngLat();
                // moved by hand: no longer anchored on a site
                this._ring.center = { ...this._ring.center, lat: p.lat, lon: p.lng, label: null, site_id: null };
                this._refreshRingShape();
            });
            this._ringCenter.on('dragend', () => this.onRingChange({ ...this._ring, center: { ...this._ring.center } }));

            const handle = document.createElement('div');
            handle.className = 'lm-ring-edge';
            handle.title = 'Drag to resize';
            handle.appendChild(document.createElement('span'));
            this._ringEdge = new maplibregl.Marker({ element: handle, draggable: true })
                .setLngLat(edgePos).addTo(map);
            this._ringEdge.on('drag', () => {
                const p = this._ringEdge.getLngLat();
                const c = this._ring.center;
                this._ring.radius_km = Math.max(0.05, LevelMap._distanceKm(c.lat, c.lon, p.lat, p.lng));
                this._refreshRingShape(false);
            });
            this._ringEdge.on('dragend', () => {
                this._refreshRingShape(); // snap the handle back onto the ring's east side
                this.onRingChange({ ...this._ring, center: { ...this._ring.center } });
            });
        } else {
            this._ringCenter.setLngLat([center.lon, center.lat]);
            this._ringEdge.setLngLat(edgePos);
        }
        this._ringCenter.getElement().dataset.mode = this._ring.mode;
        this._ringEdge.getElement().dataset.mode = this._ring.mode;
        this._ringEdge.getElement().firstChild.textContent = this._ringLabel();
    }

    /** Live update while dragging (no store round trip). */
    _refreshRingShape(moveEdge = true) {
        this.map.getSource('lm-ring')?.setData(this._ringGeoJSON());
        if (moveEdge) {
            const c = this._ring.center;
            this._ringEdge?.setLngLat(LevelMap._destination(c.lat, c.lon, this._ring.radius_km, 90));
        }
        if (this._ringEdge) this._ringEdge.getElement().firstChild.textContent = this._ringLabel();
    }

    /* ------------------------------------------------------------------ */
    /*  Sites (virtual objects with a location, from the Codex)            */
    /* ------------------------------------------------------------------ */

    /**
     * Show sites as pins (VObject[] with lat/lon; others are skipped). Clicking a pin calls
     * onSiteClick(site, point). `anchoredId` marks the site the proximity ring is on.
     */
    setSites(sites, anchoredId = null) {
        const keep = new Set();
        for (const site of sites) {
            if (site.lat == null || site.lon == null) continue;
            keep.add(site.id);
            let entry = this._sites.get(site.id);
            if (!entry) {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'lm-site';
                const glyph = document.createElement('i');
                glyph.textContent = '⌖';
                const name = document.createElement('span');
                el.append(glyph, name);
                entry = { marker: new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([site.lon, site.lat]).addTo(this.map), site };
                el.addEventListener('click', (e) => {
                    e.stopPropagation(); // not a click on empty map
                    const rect = this.container.getBoundingClientRect();
                    this.onSiteClick(this._sites.get(site.id)?.site ?? site, { x: e.clientX - rect.left, y: e.clientY - rect.top });
                });
                this._sites.set(site.id, entry);
            }
            entry.site = site;
            entry.marker.setLngLat([site.lon, site.lat]);
            const el = entry.marker.getElement();
            el.lastChild.textContent = site.name; // text only, never parsed as HTML
            el.title = `${site.name}${site.address ? ` · ${site.address}` : ''}`;
            el.classList.toggle('anchored', site.id === anchoredId);
        }
        for (const [id, entry] of this._sites) {
            if (!keep.has(id)) { entry.marker.remove(); this._sites.delete(id); }
        }
    }

    /** Fly to a point (e.g. a site opened from the Codex). */
    flyTo(lat, lon) {
        this.map.flyTo({ center: [lon, lat], zoom: Math.max(this.map.getZoom(), 14), duration: 1200 });
    }

    dispose() {
        for (const entry of this._sites.values()) entry.marker.remove();
        this._sites.clear();
        this._ringCenter?.remove();
        this._ringEdge?.remove();
        this._ro?.disconnect();
        const canvas = this.map.getCanvas();
        canvas.removeEventListener('pointerdown', this._onDragDown);
        canvas.removeEventListener('pointermove', this._onDragMove);
        canvas.removeEventListener('pointerup', this._onDragUp);
        canvas.removeEventListener('pointercancel', this._onDragUp);
        canvas.removeEventListener('contextmenu', this._onContextMenu);
        this.map.off('click', this._onClick);
        this.map.off('mousemove', this._onMove);
        this.map.off('error', this._onError);
        this.map.remove(); // removes the custom layer too (-> _disposeLayer)

        this.panel.remove();
        this.labelLayer.remove();
        this.fx.remove();
        this.container.remove(); // the host we created
    }

    /* ------------------------------------------------------------------ */
    /*  Data updates                                                       */
    /* ------------------------------------------------------------------ */

    /** Replace the events shown (PoolItem[]). Events without valid coordinates are skipped. */
    updateNodes(data) {
        if (!Array.isArray(data)) {
            console.warn('[Map] Expected an array of events.', data);
            return;
        }

        this.nodes = data
            .map((node, index) => this._normalizeNode(node, index))
            .filter((node) =>
                Number.isFinite(node.lng) &&
                Number.isFinite(node.lat) &&
                node.lng >= -180 && node.lng <= 180 &&
                node.lat >= -90 && node.lat <= 90);

        this._rebuildNodes();
        this._maybeFit();
    }

    _rebuildNodes() {
        if (!this.scene) {
            // layer not added yet; onAdd will build from this.nodes
            this.nodeCount.textContent = String(this.nodes.length);
            return;
        }

        const keep = this.selectedId;
        this._buildNodes();
        this._compact = null;

        // Keep the current target locked if it still exists in the new data.
        this.select(keep, { fly: false, emit: false });

        this.map.triggerRepaint();
    }
}
