// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// ClassifierPanel.js is the typed boundary. Model + layout: classifierGraph.js.

/**
 * ClassifierScene — the Assay: adventures as bodies in space; a sphere at the centre holds
 * everything that passes the draft filters.
 *
 *   scene.update(model)                 // stars, galaxies, pass count (from buildModel)
 *   scene.setSelection(id, { fly })     // fly = move the camera to it
 *   scene.setHover(id)
 *   scene.dispose()
 *
 * Callbacks: onSelect(itemId | null: empty space clicked), onHover(itemId | null), onStarClick(star), onStarContext(star).
 * Labels are HTML overlays projected from 3D positions; each adventure is one 3D card (its
 * cover image, through /api/cover, drawn into the card). Cards move only when the topology
 * changes (stars, roles, galaxies), gliding to their new places. Styles: frontend/styles.css
 * under "Classifier".
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { REGION_R, ROLE_COLORS, galaxyRadius, layout } from './classifierGraph.js';
import { magicCircleCanvases } from './magicCircle.js';
import { starIconCanvas, starIconKey } from './starIcons.js';
import { stageOf } from '../lifecycle.js';
import { coverSrc } from './covers.js';
import { deferredResize, isResizing, viewOf } from './resizing.js';

const EXPAND_BASE = 170;     // a galaxy breaks apart when the camera is closer than this (+ size)
const FLY_MS = 1100;
const GLIDE_S = 1.4;         // bodies glide this long to new places when the topology changes
const BURST_S = 0.55;        // a cluster bursts into its cards (or gathers them back) in this long
const CARD_W = 8, CARD_H = 11.3;   // a card's size in the scene
const CARD_PX = [240, 340];        // its canvas
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Wrap text into at most `lines` lines that fit `width` (the last one ellipsized). */
function wrapText(g, text, width, lines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const out = [];
    let line = '';
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (g.measureText(next).width <= width || !line) { line = next; continue; }
        out.push(line); line = w;
        if (out.length === lines) break;
    }
    if (out.length < lines && line) out.push(line);
    if (out.length === lines && words.join(' ') !== out.join(' ')) {
        let last = out[lines - 1];
        while (last.length > 1 && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
        out[lines - 1] = `${last}…`;
    }
    return out;
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // event data is never parsed as HTML
    return n;
}

/** Evenly spread points on a sphere (Fibonacci). */
function spherePoints(n, r) {
    if (n === 1) return [new THREE.Vector3()];
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const rad = Math.sqrt(1 - y * y);
        const th = golden * i;
        pts.push(new THREE.Vector3(Math.cos(th) * rad * r, y * r * 0.7, Math.sin(th) * rad * r));
    }
    return pts;
}

export class ClassifierScene {
    /** @param {HTMLElement} parent @param {any} [callbacks] */
    constructor(parent, { onSelect = () => {}, onHover = () => {}, onStarClick = () => {}, onStarContext = () => {} } = {}) {
        this.onSelect = onSelect;
        this.onHover = onHover;
        this.onStarClick = onStarClick;
        this.onStarContext = onStarContext;

        // the window this scene is shown in (a popped-out panel lives in its own window)
        this.view = viewOf(parent);
        this.container = el('div', 'cls-root');
        parent.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0); // transparent: the panel's glass shows through
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x030405, 0.0009);
        this.camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
        this.camera.position.set(0, 300, 360);
        this._fitted = false; // frame the content once, on the first update with something in it

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 25;
        this.controls.maxDistance = 1500;
        // Same convention as the map: left-drag rotates, right-drag moves.
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        this.controls.addEventListener('start', () => { this._fly = null; });

        this.labels = el('div', 'cls-labels');
        this.container.appendChild(this.labels);

        this.raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._v = new THREE.Vector3();
        this._white = new THREE.Color(0xffffff);

        this.shared = {
            sphere: new THREE.SphereGeometry(1, 24, 16),
            ring: new THREE.TorusGeometry(1, 0.06, 8, 64),
            glow: this._glowTexture(),
            placeholder: this._placeholderTexture(),
            plane: new THREE.PlaneGeometry(1, 1),
            ...this._sigilTextures(),
        };

        this.stars = new Map();     // id -> { star, group, core (icon), glow, label, pos, target, from, t }
        this.galaxies = new Map();  // id -> { galaxy, group, body, glow, label, members, pos, target, from, t, expanded, color }
        this.covers = new Map();    // cover URL -> { img, ready, failed, waiting: Set<member> }
        this._iconTex = new Map();  // icon key -> texture
        this._topoKey = '';
        this.passCount = 0;
        this.total = 0;
        this.selectedId = null;
        this.hoveredId = null;
        this.time = 0;

        this._buildBackdrop();
        this._buildRegion();
        this._buildLinks();
        this._bindEvents();

        this._ro = new this.view.ResizeObserver(deferredResize(() => this._resize(), this.view));
        this._ro.observe(this.container);
        this._resize();

        this._last = this.view.performance.now();
        const loop = (t) => {
            this._raf = this.view.requestAnimationFrame(loop);
            // Hold still while a splitter is dragged: the GPU time goes to the resize instead.
            if (isResizing()) { this._last = t; return; }
            this._frame(t);
        };
        this._raf = this.view.requestAnimationFrame(loop);
    }

    /* ------------------------------------------------------------------ */
    /*  Static scenery                                                     */
    /* ------------------------------------------------------------------ */

    _glowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.2, 'rgba(255,255,255,.5)');
        grad.addColorStop(0.55, 'rgba(255,255,255,.08)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    /** The role sigil's two layers (a magic circle, white so each star can tint it). */
    _sigilTextures() {
        const { outer, inner } = magicCircleCanvases(256);
        const tex = (cv) => {
            const t = new THREE.CanvasTexture(cv);
            t.colorSpace = THREE.SRGBColorSpace;
            return t;
        };
        return { sigilOuter: tex(outer), sigilInner: tex(inner) };
    }

    /** One flat sigil layer, lying in the star's horizontal plane. */
    _sigilLayer(map) {
        const m = new THREE.Mesh(this.shared.plane, new THREE.MeshBasicMaterial({
            map, color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
            depthWrite: false, side: THREE.DoubleSide,
        }));
        m.rotation.x = -Math.PI / 2;
        m.scale.setScalar(46);
        return m;
    }

    _glowSprite(color, scale, opacity = 0.8) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.shared.glow, color: new THREE.Color(color), transparent: true, opacity,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        s.scale.setScalar(scale);
        return s;
    }

    _buildBackdrop() {
        // a faint ritual circle on the chamber floor: rings and two interlocked triangles
        const floor = new THREE.Group();
        const mat = new THREE.LineBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.1 });
        const loop = (pts) => floor.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
        const circle = (r) => Array.from({ length: 128 }, (_, i) => {
            const a = (i / 128) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        });
        for (const r of [95, 150, 205, 262]) loop(circle(r));
        for (const rot of [0, Math.PI]) {
            loop([0, 1, 2].map((k) => {
                const a = rot + (k / 3) * Math.PI * 2 - Math.PI / 2;
                return new THREE.Vector3(Math.cos(a) * 205, 0, Math.sin(a) * 205);
            }));
        }
        floor.position.y = -60;
        this.floor = floor;
        this.scene.add(floor);

        // a few motes rising slowly through the chamber
        const n = 140;
        this.motePos = new Float32Array(n * 3);
        let seed = 11;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < n; i++) {
            const r = 40 + rnd() * 260, a = rnd() * Math.PI * 2;
            this.motePos.set([Math.cos(a) * r, -60 + rnd() * 220, Math.sin(a) * r], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
        this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xbdf5f7, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0.35,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.scene.add(this.motes);
    }

    /** A 1×1 dark texture for cards not drawn yet (their galaxy hasn't opened up). */
    _placeholderTexture() {
        const t = new THREE.DataTexture(new Uint8Array([10, 11, 14, 255]), 1, 1);
        t.needsUpdate = true;
        return t;
    }

    /** A star icon's texture (cached per drawing). */
    _iconTexture(key) {
        let t = this._iconTex.get(key);
        if (!t) {
            t = new THREE.CanvasTexture(starIconCanvas(key));
            t.colorSpace = THREE.SRGBColorSpace;
            this._iconTex.set(key, t);
        }
        return t;
    }

    /** What a card shows; when it changes, the card is drawn again. */
    _cardSig(item) {
        const stage = stageOf(item);
        return [item.title, item.cover_url, item.color, stage?.matter].join('\u0001');
    }

    /** Draw (or redraw) a member's card: foil frame, title, cover image, matter strip. */
    _drawCard(m) {
        const item = m.item;
        if (!m.canvas) {
            m.canvas = document.createElement('canvas');
            [m.canvas.width, m.canvas.height] = CARD_PX;
            m.tex = new THREE.CanvasTexture(m.canvas);
            m.tex.colorSpace = THREE.SRGBColorSpace;
            m.tex.anisotropy = 4;
            m.card.material.map = m.tex;
            m.card.material.needsUpdate = true;
        }
        m.sig = this._cardSig(item);
        const [W, H] = CARD_PX;
        const g = m.canvas.getContext('2d');
        g.clearRect(0, 0, W, H);
        const color = item.color || '#7d838d';
        const base = new THREE.Color(color);
        const css = (col) => '#' + col.getHexString();
        const light = css(base.clone().lerp(this._white, 0.55));
        const deep = css(base.clone().multiplyScalar(0.35));
        // the foil frame in the matter's colour, a dark body
        const foil = g.createLinearGradient(0, 0, W, H);
        foil.addColorStop(0, light); foil.addColorStop(0.3, color); foil.addColorStop(0.6, deep); foil.addColorStop(0.85, color); foil.addColorStop(1, light);
        g.fillStyle = foil;
        g.beginPath(); g.roundRect(0, 0, W, H, 22); g.fill();
        g.fillStyle = '#0a0b0e';
        g.beginPath(); g.roundRect(9, 9, W - 18, H - 18, 15); g.fill();
        // the title banner
        const bannerH = 62;
        const banner = g.createLinearGradient(0, 18, 0, 18 + bannerH);
        banner.addColorStop(0, css(base.clone().lerp(new THREE.Color('#4a4f58'), 0.6)));
        banner.addColorStop(1, css(base.clone().multiplyScalar(0.25)));
        g.fillStyle = banner;
        g.beginPath(); g.roundRect(18, 18, W - 36, bannerH, 7); g.fill();
        g.fillStyle = '#fff';
        g.font = "700 22px 'Saira Condensed', 'Arial Narrow', sans-serif";
        g.textBaseline = 'middle';
        const lines = wrapText(g, item.title || 'Untitled', W - 56, 2);
        lines.forEach((ln, i) => g.fillText(ln, 28, 18 + bannerH / 2 + (i - (lines.length - 1) / 2) * 24));
        // the art window: the cover image, else a glow in the matter's colour
        const art = { x: 18, y: 18 + bannerH + 8, w: W - 36, h: 170 };
        g.save();
        g.beginPath(); g.roundRect(art.x, art.y, art.w, art.h, 7); g.clip();
        const cover = this._cover(item.cover_url, m);
        if (cover?.ready) {
            const iw = cover.img.naturalWidth, ih = cover.img.naturalHeight;
            const k = Math.max(art.w / iw, art.h / ih);
            const dw = iw * k, dh = ih * k;
            g.drawImage(cover.img, art.x + (art.w - dw) / 2, art.y + (art.h - dh) / 2, dw, dh);
        } else {
            const glow = g.createRadialGradient(W / 2, art.y + art.h * 0.55, 4, W / 2, art.y + art.h * 0.55, art.w * 0.6);
            glow.addColorStop(0, light); glow.addColorStop(0.35, color); glow.addColorStop(1, '#07080a');
            g.fillStyle = glow;
            g.fillRect(art.x, art.y, art.w, art.h);
        }
        g.restore();
        // the matter strip
        const stripY = art.y + art.h + 10;
        g.fillStyle = '#16181c';
        g.beginPath(); g.roundRect(18, stripY, W - 36, 30, 5); g.fill();
        g.fillStyle = color;
        g.font = "600 17px 'Saira Condensed', 'Arial Narrow', sans-serif";
        const stage = stageOf(item);
        g.fillText(`★ ${(stage ? stage.matter : 'matter').toUpperCase()}`, 28, stripY + 16);
        m.tex.needsUpdate = true;
    }

    /** A cover image through the app's origin (loaded once per URL); redraws waiting cards. */
    _cover(link, m) {
        const src = coverSrc(link);
        if (!src) return null;
        let c = this.covers.get(src);
        if (!c) {
            c = { img: new Image(), ready: false, failed: false, waiting: new Set() };
            c.img.decoding = 'async';
            c.img.onload = () => { c.ready = true; for (const w of c.waiting) if (w.canvas) this._drawCard(w); c.waiting.clear(); };
            c.img.onerror = () => { c.failed = true; c.waiting.clear(); };
            c.img.src = src;
            this.covers.set(src, c);
        }
        if (!c.ready && !c.failed) c.waiting.add(m);
        return c;
    }

    /** The region: a faint sphere at the centre; every galaxy inside it passes the filters. */
    _buildRegion() {
        const mat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color('#1fc2c9') } },
            vertexShader: `varying vec3 vN; varying vec3 vV;
                void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
                void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = 0.025 + pow(f, 3.0) * 0.38; gl_FragColor = vec4(uColor * a, a); }`,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(REGION_R, 64, 40), mat);
        shell.raycast = () => {};
        // an equator ring, to read the sphere's size against the floor
        const pts = Array.from({ length: 160 }, (_, i) => { const t = (i / 160) * Math.PI * 2; return new THREE.Vector3(Math.cos(t) * REGION_R, 0, Math.sin(t) * REGION_R); });
        const equator = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5fe0e6, transparent: true, opacity: 0.35 }));
        equator.raycast = () => {};
        this.region = new THREE.Group();
        this.region.add(shell, equator, this._glowSprite('#1fc2c9', 60, 0.18));
        this.scene.add(this.region);

        this.portalLabel = el('div', 'cls-portal');
        this.labels.appendChild(this.portalLabel);
    }

    _buildLinks() {
        this.linkGeo = new THREE.BufferGeometry();
        this.links = new THREE.LineSegments(this.linkGeo, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.links.frustumCulled = false;
        this.scene.add(this.links);
        this.linkPairs = []; // [galaxyEntry, starEntry]
    }

    /* ------------------------------------------------------------------ */
    /*  Model -> scene                                                     */
    /* ------------------------------------------------------------------ */

    update(model) {
        this.passCount = model.passCount;
        this.total = model.total;

        // stars
        const starIds = new Set(model.stars.map((s) => s.id));
        for (const [id, e] of this.stars) if (!starIds.has(id)) this._removeStar(id, e);
        for (const star of model.stars) {
            let e = this.stars.get(star.id);
            if (!e) e = this._addStar(star);
            this._styleStar(e, star);
        }

        // galaxies (members are rebuilt whenever the galaxy changes)
        const shown = model.galaxies.filter((g) => !g.hidden);
        const galaxyIds = new Set(shown.map((g) => g.id));
        for (const [id, e] of this.galaxies) if (!galaxyIds.has(id)) this._removeGalaxy(id, e);
        for (const galaxy of shown) {
            const e = this.galaxies.get(galaxy.id);
            const sig = galaxy.members.map((m) => m.id).join(',');
            if (e && e.sig === sig) { e.galaxy = galaxy; this._styleGalaxy(e); continue; }
            if (e) this._removeGalaxy(galaxy.id, e);
            this._addGalaxy(galaxy, sig, e?.pos);
        }

        // layout, only when the topology changed (stars, roles, which galaxies, who passes):
        // otherwise everything stays exactly where it is. Warm start from where things are.
        const topo = [
            ...model.stars.map((st) => `${st.id}:${st.role}:${st.collapsed ? 1 : 0}`),
            ...shown.map((g) => `${g.id}:${g.passes ? 1 : 0}:${g.members.length}`),
        ].join('|');
        const missing = [...this.stars.values(), ...this.galaxies.values()].some((e) => !e.target);
        let positions = null;
        if (topo !== this._topoKey || missing) {
            this._topoKey = topo;
            const previous = new Map();
            for (const [id, e] of this.stars) if (e.target) previous.set(id, e.target.toArray());
            for (const [id, e] of this.galaxies) if (e.target) previous.set(id, e.target.toArray());
            positions = layout(model, previous, previous.size ? 120 : 260);
            for (const [id, p] of positions) {
                const e = this.stars.get(id) ?? this.galaxies.get(id);
                if (!e) continue;
                const target = new THREE.Vector3(...p);
                if (!e.pos) { e.pos = target.clone(); e.target = target; continue; }
                if (e.target && e.target.distanceToSquared(target) < 0.01) continue;
                e.target = target;
                e.from = e.pos.clone(); // glide there
                e.t = 0;
            }
        }

        // links
        this.linkPairs = [];
        for (const e of this.galaxies.values()) {
            for (const sid of e.galaxy.starIds) {
                const s = this.stars.get(sid);
                if (s) this.linkPairs.push([e, s]);
            }
        }
        const n = this.linkPairs.length;
        this.linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        const colors = new Float32Array(n * 6);
        this.linkPairs.forEach(([g, s], i) => {
            const c = new THREE.Color(s.star.color).multiplyScalar(s.star.role === 'off' ? 0.45 : 1);
            if (!g.galaxy.passes) c.multiplyScalar(0.5);
            colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
        });
        this.linkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this._applyHighlight();
        // fit once there's real content (the first update can arrive before the pool does)
        if (!this._fitted && model.total > 0 && positions) this._fit(positions);
    }

    /** Frame everything (the panel's ⌂ button): fly to a view that fits every body. */
    fit() {
        let radius = 60;
        for (const e of [...this.stars.values(), ...this.galaxies.values()]) if (e.target) radius = Math.max(radius, e.target.length() + (e.radius ?? 10));
        const dir = new THREE.Vector3(0, 0.95, 1).normalize();
        const fov = (this.camera.fov * Math.PI) / 180;
        const distance = Math.min(1400, (radius * 1.05) / Math.sin(fov / 2));
        this._flyTo(new THREE.Vector3(0, 0, 0), distance);
        this._fly.toPos = dir.multiplyScalar(distance); // from above, whatever the current angle
    }

    /** Point the camera at the whole scene from above, at a distance that fits it. */
    _fit(positions) {
        this._fitted = true;
        let radius = 60;
        for (const p of positions.values()) radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
        const dir = new THREE.Vector3(0, 0.95, 1).normalize();
        const fov = (this.camera.fov * Math.PI) / 180;
        const distance = Math.min(1400, (radius * 1.05) / Math.sin(fov / 2));
        this.controls.target.set(0, 0, 0);
        this.camera.position.copy(dir.multiplyScalar(distance));
        this.controls.update();
    }

    _addStar(star) {
        const group = new THREE.Group();
        // the star itself: a medallion showing what it is (a source, a city, a type, ...)
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._iconTexture(starIconKey(star)), color: star.color, transparent: true, depthWrite: false }));
        core.scale.setScalar(16);
        core.renderOrder = 2;
        const glow = this._glowSprite(star.color, 46, 0.75);
        const ping = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: star.color, transparent: true, opacity: 0 }));
        ping.rotation.x = Math.PI / 2;
        const spark = this._glowSprite('#ffffff', 5, 0.9);
        // the role: a magic circle in the role's colour (white include, red exclude, gold seal)
        const sigil = new THREE.Group();
        const sigilOuter = this._sigilLayer(this.shared.sigilOuter);
        const sigilInner = this._sigilLayer(this.shared.sigilInner);
        sigil.add(sigilOuter, sigilInner);
        sigil.position.y = -4;
        group.add(glow, sigil, ping, spark, core);
        core.userData.star = star.id;
        this.scene.add(group);

        const label = el('div', 'cls-star');
        label.style.display = 'none'; // shown once the scene has placed it
        label.append(el('b'), el('small'));
        label.addEventListener('click', () => this.onStarClick(this.stars.get(star.id)?.star));
        label.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.onStarContext(this.stars.get(star.id)?.star); });
        this.labels.appendChild(label);

        const e = { star, group, core, ping, spark, glow, sigil, sigilOuter, sigilInner, label, pos: null, target: null, from: null, t: 1, phase: Math.random() * Math.PI * 2 };
        this.stars.set(star.id, e);
        return e;
    }

    _styleStar(e, star) {
        e.star = star;
        const color = new THREE.Color(star.color);
        e.core.material.color.copy(color);
        const iconTex = this._iconTexture(starIconKey(star));
        if (e.core.material.map !== iconTex) { e.core.material.map = iconTex; e.core.material.needsUpdate = true; }
        e.glow.material.color.copy(color);
        const active = star.role !== 'off';
        // the role, never the colour: a sigil and a ping in the role's colour
        const roleColor = active ? ROLE_COLORS[/** @type {keyof typeof ROLE_COLORS} */ (star.role)] : null;
        e.sigil.visible = !!roleColor;
        if (roleColor) {
            e.sigilOuter.material.color.set(roleColor);
            e.sigilInner.material.color.set(roleColor);
            e.ping.material.color.set(roleColor);
        }
        e.core.material.opacity = active ? 1 : 0.7;
        e.spark.visible = star.role !== 'exclude';
        e.ping.visible = star.role === 'include' || star.role === 'seal';
        e.glow.scale.setScalar(star.collapsed ? 80 : active ? 58 : 40);
        e.label.dataset.role = star.role;
        e.label.style.setProperty('--c', star.color);
        e.label.title = `${star.group}: ${star.label}\nClick: ${star.kind === 'seal' ? 'seal / break the seal' : 'include → exclude → off'} · Right-click: ${star.collapsed ? 'expand' : 'collapse'}`;
        e.label.firstChild.textContent = `${star.role === 'include' ? '＋ ' : star.role === 'exclude' ? '－ ' : ''}${star.label}`;
        e.label.lastChild.textContent = `${star.group} · ${star.count}${star.collapsed ? ' · collapsed' : ''}`;
    }

    _removeStar(id, e) {
        this.scene.remove(e.group);
        for (const o of [e.core, e.ping, e.spark, e.glow, e.sigilOuter, e.sigilInner]) o.material.dispose();
        e.label.remove();
        this.stars.delete(id);
    }

    _addGalaxy(galaxy, sig, pos) {
        const group = new THREE.Group();
        const r = galaxyRadius(galaxy.members.length);
        // colour: blend of its members' colours
        const color = new THREE.Color(0, 0, 0);
        for (const m of galaxy.members) color.add(new THREE.Color(m.color));
        color.multiplyScalar(1 / galaxy.members.length).lerp(this._white, 0.15);

        const body = new THREE.Mesh(this.shared.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        body.scale.setScalar(r);
        body.userData.galaxy = galaxy.id;
        const glow = this._glowSprite(color, r * 7, 0.9);
        group.add(body, glow);

        const members = new Map();
        const offsets = spherePoints(galaxy.members.length, r * 2.4 + 16);
        galaxy.members.forEach((item, i) => {
            // the adventure's card (cover image and all), always facing the camera; drawn
            // the first time its galaxy opens up
            const card = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.shared.placeholder, transparent: true }));
            card.scale.set(CARD_W, CARD_H, 1);
            card.position.copy(offsets[i]);
            card.userData.item = item.id;
            card.visible = false;
            const halo = this._glowSprite(item.color, 20, 0.45);
            halo.position.copy(offsets[i]);
            halo.visible = false;
            group.add(halo, card);
            members.set(item.id, { item, card, halo, offset: offsets[i], canvas: null, tex: null, sig: '', k: 1 });
        });
        this.scene.add(group);

        const label = el('div', 'cls-galaxy');
        label.style.display = 'none'; // shown once the scene has placed it
        label.addEventListener('click', () => this._flyToGalaxy(galaxy.id));
        this.labels.appendChild(label);

        const e = { galaxy, sig, group, body, glow, label, members, pos: pos ? pos.clone() : null, target: null, from: null, t: 1, expanded: false, wind: 0, open: 0, color, radius: r };
        this.galaxies.set(galaxy.id, e);
        this._styleGalaxy(e);
        return e;
    }

    _styleGalaxy(e) {
        const g = e.galaxy;
        e.body.material.opacity = g.passes ? 0.85 : 0.22;
        e.glow.material.opacity = g.passes ? 0.7 : 0.18;
        for (const m of e.members.values()) {
            m.item = g.members.find((x) => x.id === m.item.id) ?? m.item;
            if (m.canvas && this._cardSig(m.item) !== m.sig) this._drawCard(m); // edited: show it now
            m.card.material.opacity = g.passes ? 1 : 0.35;
            m.card.material.color.setScalar(g.passes ? 1 : 0.55);
            m.halo.material.opacity = g.passes ? 0.45 : 0.08;
        }
        e.label.textContent = String(g.members.length);
        e.label.classList.toggle('dim', !g.passes);
        const names = g.starIds.map((id) => this.stars.get(id)?.star.label).filter(Boolean);
        e.label.title = `${g.members.length} adventure${g.members.length === 1 ? '' : 's'}${names.length ? ': ' + names.join(' ∩ ') : ' (no visible links)'}${g.passes ? '' : ' (filtered out)'}\nClick to fly in`;
    }

    _removeGalaxy(id, e) {
        this.scene.remove(e.group);
        e.body.material.dispose(); e.glow.material.dispose();
        for (const m of e.members.values()) {
            m.card.material.dispose(); m.halo.material.dispose(); m.tex?.dispose();
            for (const c of this.covers.values()) c.waiting.delete(m);
        }
        e.label.remove();
        this.galaxies.delete(id);
    }

    /* ------------------------------------------------------------------ */
    /*  Selection, hover, camera                                           */
    /* ------------------------------------------------------------------ */

    _findMember(itemId) {
        for (const e of this.galaxies.values()) {
            const m = e.members.get(itemId);
            if (m) return { e, m };
        }
        return null;
    }

    setSelection(id, { fly = false } = {}) {
        this.selectedId = id;
        this._applyHighlight();
        if (!id || !fly) return;
        const hit = this._findMember(id);
        if (!hit) return;
        const target = (hit.e.target ?? hit.e.pos ?? new THREE.Vector3()).clone().add(hit.m.offset);
        this._flyTo(target, 75);
    }

    setHover(id) {
        this.hoveredId = id;
        this._applyHighlight();
    }

    _applyHighlight() {
        for (const e of this.galaxies.values()) {
            for (const [id, m] of e.members) {
                const sel = id === this.selectedId, hov = id === this.hoveredId;
                const k = sel ? 1.55 : hov ? 1.28 : 1;
                m.k = k; // applied each frame, with the cluster's burst (_frame)
                m.card.renderOrder = sel ? 3 : hov ? 2 : 0;
                m.haloSize = sel ? 40 : hov ? 30 : 20;
            }
        }
    }

    _flyToGalaxy(id) {
        const e = this.galaxies.get(id);
        if (e) this._flyTo((e.target ?? e.pos).clone(), Math.max(60, e.radius * 7));
    }

    _flyTo(target, distance) {
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        if (!Number.isFinite(dir.x)) dir.set(0, 0.5, 1).normalize();
        this._fly = {
            t0: this.view.performance.now(),
            fromPos: this.camera.position.clone(), toPos: target.clone().addScaledVector(dir, distance),
            fromTarget: this.controls.target.clone(), toTarget: target.clone(),
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Interaction                                                        */
    /* ------------------------------------------------------------------ */

    _pick(ev) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this._ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this._ndc, this.camera);
        const targets = [];
        for (const e of this.stars.values()) targets.push(e.core);
        for (const e of this.galaxies.values()) {
            if (e.expanded) for (const m of e.members.values()) targets.push(m.card);
            else targets.push(e.body);
        }
        const hit = this.raycaster.intersectObjects(targets, false)[0];
        return hit ? hit.object.userData : null;
    }

    _bindEvents() {
        const canvas = this.renderer.domElement;
        this._onDown = (ev) => { this._down = [ev.clientX, ev.clientY]; };
        this._onUp = (ev) => {
            if (!this._down || Math.hypot(ev.clientX - this._down[0], ev.clientY - this._down[1]) > 5) return;
            if (ev.button !== 0) return;
            const hit = this._pick(ev);
            if (hit?.item) this.onSelect(hit.item);
            else if (hit?.galaxy) this._flyToGalaxy(hit.galaxy);
            else if (hit?.star) this.onStarClick(this.stars.get(hit.star)?.star);
            else if (!hit) this.onSelect(null); // empty space: clear the selection
        };
        this._onMove = (ev) => {
            const hit = this._pick(ev);
            canvas.style.cursor = hit ? 'pointer' : '';
            const item = hit?.item ?? null;
            if (item !== this._hoverPick) {
                this._hoverPick = item;
                this.onHover(item);
            }
        };
        this._onContext = (ev) => {
            const hit = this._pick(ev);
            if (hit?.star) { ev.preventDefault(); this.onStarContext(this.stars.get(hit.star)?.star); }
        };
        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointerup', this._onUp);
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('contextmenu', this._onContext);
    }

    _resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /* ------------------------------------------------------------------ */
    /*  Frame                                                              */
    /* ------------------------------------------------------------------ */

    /** Move a body along its glide to its target (eased), or keep it there. */
    _glide(e, dt) {
        if (!e.from) { if (e.target) e.pos.copy(e.target); return; }
        e.t = Math.min(1, e.t + dt / GLIDE_S);
        e.pos.lerpVectors(e.from, e.target, easeInOut(e.t));
        if (e.t >= 1) e.from = null;
    }

    /** Project a world point to panel pixels; null when behind the camera. */
    _screen(p) {
        this._v.copy(p).project(this.camera);
        if (this._v.z > 1) return null;
        const w = this.container.clientWidth, h = this.container.clientHeight;
        return [(this._v.x * 0.5 + 0.5) * w, (1 - (this._v.y * 0.5 + 0.5)) * h];
    }

    _place(node, p, visible = true) {
        const s = visible ? this._screen(p) : null;
        if (!s) { node.style.display = 'none'; return null; }
        node.style.display = '';
        node.style.transform = `translate3d(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px,0) translate(-50%,-50%)`;
        return s;
    }

    _frame(now) {
        const dt = Math.min((now - this._last) / 1000, 0.1);
        this._last = now;
        this.time += dt;
        if (this._fly) {
            const t = Math.min(1, (now - this._fly.t0) / FLY_MS);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            this.camera.position.lerpVectors(this._fly.fromPos, this._fly.toPos, ease);
            this.controls.target.lerpVectors(this._fly.fromTarget, this._fly.toTarget, ease);
            if (t >= 1) this._fly = null;
        }
        this.controls.update();

        // rising motes (wrap back to the floor)
        const mp = this.motePos;
        for (let i = 1; i < mp.length; i += 3) { mp[i] += dt * 4; if (mp[i] > 170) mp[i] = -60; }
        this.motes.geometry.attributes.position.needsUpdate = true;
        this.floor.rotation.y += dt * 0.01;

        // the region's count, over the top of the sphere
        this._place(this.portalLabel, new THREE.Vector3(0, REGION_R + 12, 0));
        this.portalLabel.textContent = `${this.passCount} / ${this.total} pass`;

        // stars
        for (const e of this.stars.values()) {
            if (!e.pos) continue;
            this._glide(e, dt);
            e.group.position.copy(e.pos);
            const sa = this.time * 1.6 + e.phase;
            e.spark.position.set(Math.cos(sa) * 12, Math.sin(sa * 0.7) * 4, Math.sin(sa) * 12);
            const pf = ((this.time * 0.4 + e.phase) % 1);
            e.ping.scale.setScalar(6 + pf * 26);
            e.sigilOuter.rotation.z = this.time * 0.25 + e.phase;
            e.sigilInner.rotation.z = -this.time * 0.4 - e.phase;
            e.ping.material.opacity = (1 - pf) * 0.5;
            this._place(e.label, e.pos.clone().add(new THREE.Vector3(0, 14, 0)));
        }

        // galaxies + level of detail (cards hold still: they move only with the topology)
        const cam = this.camera.position;
        for (const e of this.galaxies.values()) {
            if (!e.pos) continue;
            this._glide(e, dt);
            e.group.position.copy(e.pos);
            const dist = cam.distanceTo(e.group.position);
            const hasSelected = this.selectedId != null && e.members.has(this.selectedId);
            const want = e.members.size === 1 || hasSelected || dist < EXPAND_BASE + e.radius * 8;
            // burst: the cards fly out of the cluster (or gather back into it), eased
            e.wind = want ? Math.min(1, e.wind + dt / BURST_S) : Math.max(0, e.wind - dt / BURST_S);
            const open = e.wind * e.wind * (3 - 2 * e.wind);
            e.open = open;
            e.expanded = open > 0.5; // what clicks hit: the cards once they're mostly out

            const passes = e.galaxy.passes ? 1 : 0.3;
            e.body.visible = open < 0.99;
            e.body.scale.setScalar(e.radius * (1 - 0.85 * open));
            e.body.material.opacity = (e.galaxy.passes ? 0.85 : 0.22) * (1 - open);
            e.glow.material.opacity = (0.9 - 0.75 * open) * passes;
            for (const m of e.members.values()) {
                const shown = open > 0.01;
                m.card.visible = m.halo.visible = shown;
                if (!shown) continue;
                if (!m.canvas) this._drawCard(m);
                m.card.position.copy(m.offset).multiplyScalar(open);
                m.halo.position.copy(m.card.position);
                const s = 0.2 + 0.8 * open;
                m.card.scale.set(CARD_W * m.k * s, CARD_H * m.k * s, 1);
                m.halo.scale.setScalar((m.haloSize ?? 20) * s);
            }
            const showCount = open < 0.5 && e.members.size > 1;
            this._place(e.label, e.group.position.clone().add(new THREE.Vector3(0, -e.radius - 4, 0)), showCount);
        }

        // links follow their ends
        const attr = this.linkGeo.getAttribute('position');
        if (attr && this.linkPairs.length) {
            this.linkPairs.forEach(([g, s], i) => {
                const a = g.group.position, b = s.group.position;
                attr.array.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
            });
            attr.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    dispose() {
        this.view.cancelAnimationFrame(this._raf);
        this._ro.disconnect();
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this._onDown);
        canvas.removeEventListener('pointerup', this._onUp);
        canvas.removeEventListener('pointermove', this._onMove);
        canvas.removeEventListener('contextmenu', this._onContext);
        this.controls.dispose();
        for (const [id, e] of [...this.stars]) this._removeStar(id, e);
        for (const [id, e] of [...this.galaxies]) this._removeGalaxy(id, e);
        this.scene.traverse((o) => {
            o.geometry?.dispose?.();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        });
        for (const v of Object.values(this.shared)) v.dispose?.();
        for (const t of this._iconTex.values()) t.dispose();
        this.covers.clear();
        this.renderer.dispose();
        this.container.remove();
    }
}
