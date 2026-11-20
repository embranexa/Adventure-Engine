// @ts-nocheck -- imperative three.js scene; the three ES module is untyped here.
// ClassifierPanel.js is the typed boundary. Model + layout: classifierGraph.js.

/**
 * ClassifierScene — the Assay: adventures as bodies in space around a central portal.
 *
 *   scene.update(model)                 // stars, galaxies, pass count (from buildModel)
 *   scene.setSelection(id, { fly })     // fly = move the camera to it
 *   scene.setHover(id)
 *   scene.dispose()
 *
 * Callbacks: onSelect(itemId), onHover(itemId | null), onStarClick(star), onStarContext(star).
 * Labels and cards are HTML overlays projected from 3D positions (any image URL works,
 * text stays crisp). Styles: frontend/styles.css under "Classifier".
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { galaxyRadius, layout } from './classifierGraph.js';

const EXPAND_BASE = 170;     // a galaxy breaks apart when the camera is closer than this (+ size)
const CARD_DISTANCE = 120;   // adventures closer than this show their card
const MAX_CARDS = 30;
const FLY_MS = 1100;

/** http(s) only (cover images come from event data). */
function safeUrl(link) {
    if (typeof link !== 'string' || !link) return null;
    try {
        const u = new URL(link, window.location.href);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
        return null;
    }
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

        this.container = el('div', 'cls-root');
        parent.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x05050b, 1);
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x05050b, 0.0011);
        this.camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
        this.camera.position.set(0, 300, 360);
        this._fitted = false; // frame the content once, on the first update with something in it

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 25;
        this.controls.maxDistance = 1500;
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
        };

        this.stars = new Map();     // id -> { star, group, core, ring, glow, label, pos, target }
        this.galaxies = new Map();  // id -> { galaxy, group, body, glow, label, members, pos, target, expanded, color }
        this.cards = new Map();     // itemId -> card element
        this.passCount = 0;
        this.total = 0;
        this.selectedId = null;
        this.hoveredId = null;
        this.time = 0;

        this._buildBackdrop();
        this._buildPortal();
        this._buildLinks();
        this._bindEvents();

        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(this.container);
        this._resize();

        this._last = performance.now();
        const loop = (t) => {
            this._raf = requestAnimationFrame(loop);
            this._frame(t);
        };
        this._raf = requestAnimationFrame(loop);
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

    _glowSprite(color, scale, opacity = 0.8) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.shared.glow, color: new THREE.Color(color), transparent: true, opacity,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        s.scale.setScalar(scale);
        return s;
    }

    _buildBackdrop() {
        // a deterministic starfield
        const n = 2400, pos = new Float32Array(n * 3);
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < n; i++) {
            const r = 900 + rnd() * 1800, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
            pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.starfield = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0x9fb4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false,
        }));
        this.scene.add(this.starfield);

        // faint disc grid marking the plane
        const grid = new THREE.PolarGridHelper(320, 12, 6, 96, 0x1e1b4b, 0x13112e);
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
        grid.position.y = -40;
        this.scene.add(grid);
    }

    _buildPortal() {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
        ring.scale.setScalar(13);
        ring.rotation.x = Math.PI / 2;
        const ring2 = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.8 }));
        ring2.scale.setScalar(17);
        ring2.rotation.x = Math.PI / 2;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshBasicMaterial({
            color: 0x1a0b3d, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        }));
        disc.rotation.x = -Math.PI / 2;
        g.add(ring, ring2, disc, this._glowSprite('#7c3aed', 70, 0.5), this._glowSprite('#00f0ff', 30, 0.55));

        // swirl of motes
        const n = 220, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 14, r = 2.5 + (i / n) * 10;
            pos.set([Math.cos(a) * r, (Math.sin(i) * 0.8), Math.sin(a) * r], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.portalSwirl = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0x67e8f9, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        g.add(this.portalSwirl);
        this.portal = { group: g, ring, ring2 };
        this.scene.add(g);

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
            if (e) this._removeGalaxy(galaxy.id, e, true);
            this._addGalaxy(galaxy, sig, e?.pos);
        }

        // cards for items no longer in the pool
        const itemIds = new Set(model.galaxies.flatMap((g) => g.members.map((m) => m.id)));
        for (const [id, card] of this.cards) if (!itemIds.has(id)) { card.remove(); this.cards.delete(id); }

        // layout (warm start from where things are heading)
        const previous = new Map();
        for (const [id, e] of this.stars) if (e.target) previous.set(id, e.target.toArray());
        for (const [id, e] of this.galaxies) if (e.target) previous.set(id, e.target.toArray());
        const positions = layout(model, previous, previous.size ? 120 : 260);
        for (const [id, p] of positions) {
            const e = this.stars.get(id) ?? this.galaxies.get(id);
            if (!e) continue;
            const fresh = !e.target;
            e.target = new THREE.Vector3(...p);
            if (fresh && !e.pos) e.pos = e.target.clone();
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
        if (!this._fitted && model.total > 0) this._fit(positions);
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
        const core = new THREE.Mesh(this.shared.sphere, new THREE.MeshBasicMaterial({ color: star.color }));
        core.scale.setScalar(5);
        const ring = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: star.color, transparent: true, opacity: 0.9 }));
        ring.scale.setScalar(10);
        const glow = this._glowSprite(star.color, 46, 0.75);
        group.add(core, ring, glow);
        core.userData.star = star.id;
        this.scene.add(group);

        const label = el('div', 'cls-star');
        label.append(el('b'), el('small'));
        label.addEventListener('click', () => this.onStarClick(this.stars.get(star.id)?.star));
        label.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.onStarContext(this.stars.get(star.id)?.star); });
        this.labels.appendChild(label);

        const e = { star, group, core, ring, glow, label, pos: null, target: null };
        this.stars.set(star.id, e);
        return e;
    }

    _styleStar(e, star) {
        e.star = star;
        const color = new THREE.Color(star.color);
        e.core.material.color.copy(color);
        e.ring.material.color.copy(color);
        e.glow.material.color.copy(color);
        const active = star.role !== 'off';
        e.ring.visible = active;
        e.glow.scale.setScalar(star.collapsed ? 80 : active ? 58 : 40);
        e.label.dataset.role = star.role;
        e.label.style.setProperty('--c', star.color);
        e.label.title = `${star.group}: ${star.label}\nClick: ${star.kind === 'seal' ? 'seal / break the seal' : 'include → exclude → off'} · Right-click: ${star.collapsed ? 'expand' : 'collapse'}`;
        e.label.firstChild.textContent = `${star.role === 'include' ? '＋ ' : star.role === 'exclude' ? '－ ' : ''}${star.label}`;
        e.label.lastChild.textContent = `${star.group} · ${star.count}${star.collapsed ? ' · collapsed' : ''}`;
    }

    _removeStar(id, e) {
        this.scene.remove(e.group);
        e.core.material.dispose(); e.ring.material.dispose(); e.glow.material.dispose();
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
        const offsets = spherePoints(galaxy.members.length, r * 2.4 + 12);
        galaxy.members.forEach((item, i) => {
            const orb = new THREE.Mesh(this.shared.sphere, new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 1 }));
            orb.scale.setScalar(2.6);
            orb.userData.item = item.id;
            orb.visible = false;
            const halo = this._glowSprite(item.color, 14, 0.6);
            halo.visible = false;
            group.add(orb, halo);
            members.set(item.id, { item, orb, halo, offset: offsets[i] });
        });
        this.scene.add(group);

        const label = el('div', 'cls-galaxy');
        label.addEventListener('click', () => this._flyToGalaxy(galaxy.id));
        this.labels.appendChild(label);

        const e = { galaxy, sig, group, body, glow, label, members, pos: pos ? pos.clone() : null, target: null, expanded: false, color, radius: r };
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
            m.orb.material.opacity = g.passes ? 1 : 0.3;
            m.halo.material.opacity = g.passes ? 0.6 : 0.12;
        }
        e.label.textContent = String(g.members.length);
        e.label.classList.toggle('dim', !g.passes);
        const names = g.starIds.map((id) => this.stars.get(id)?.star.label).filter(Boolean);
        e.label.title = `${g.members.length} adventure${g.members.length === 1 ? '' : 's'}${names.length ? ': ' + names.join(' ∩ ') : ' (no visible links)'}${g.passes ? '' : ' (filtered out)'}\nClick to fly in`;
    }

    _removeGalaxy(id, e, keepCards = false) {
        this.scene.remove(e.group);
        e.body.material.dispose(); e.glow.material.dispose();
        for (const m of e.members.values()) {
            m.orb.material.dispose(); m.halo.material.dispose();
            if (!keepCards) { this.cards.get(m.item.id)?.remove(); this.cards.delete(m.item.id); }
        }
        e.label.remove();
        this.galaxies.delete(id);
    }

    _card(item) {
        let card = this.cards.get(item.id);
        if (card) return card;
        card = el('div', 'cls-card');
        card.style.setProperty('--c', item.color);
        const img = el('div', 'cls-card-img');
        const src = safeUrl(item.cover_url);
        if (src) {
            const i = document.createElement('img');
            i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.referrerPolicy = 'no-referrer';
            i.onerror = () => { i.remove(); img.classList.add('empty'); };
            i.src = src;
            img.appendChild(i);
        } else img.classList.add('empty');
        card.append(img, el('div', 'cls-card-title', item.title));
        card.addEventListener('click', (ev) => { ev.stopPropagation(); this.onSelect(item.id); });
        card.addEventListener('mouseenter', () => this.onHover(item.id));
        card.addEventListener('mouseleave', () => this.onHover(null));
        card.style.display = 'none';
        this.labels.appendChild(card);
        this.cards.set(item.id, card);
        return card;
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
                m.orb.scale.setScalar(sel ? 4.6 : hov ? 3.6 : 2.6);
                m.halo.scale.setScalar(sel ? 30 : hov ? 22 : 14);
                const card = this.cards.get(id);
                if (card) { card.classList.toggle('selected', sel); card.classList.toggle('hover', hov); }
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
            t0: performance.now(),
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
            if (e.expanded) for (const m of e.members.values()) targets.push(m.orb);
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
        const k = Math.min(1, dt * 3);

        if (this._fly) {
            const t = Math.min(1, (now - this._fly.t0) / FLY_MS);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            this.camera.position.lerpVectors(this._fly.fromPos, this._fly.toPos, ease);
            this.controls.target.lerpVectors(this._fly.fromTarget, this._fly.toTarget, ease);
            if (t >= 1) this._fly = null;
        }
        this.controls.update();

        // portal
        this.portal.ring.rotation.z += dt * 0.6;
        this.portal.ring2.rotation.z -= dt * 0.35;
        this.portalSwirl.rotation.y += dt * 0.9;
        this._place(this.portalLabel, new THREE.Vector3(0, 22, 0));
        this.portalLabel.textContent = `◈ ${this.passCount} / ${this.total} pass`;

        // stars
        for (const e of this.stars.values()) {
            if (!e.pos) continue;
            e.pos.lerp(e.target, k);
            e.group.position.copy(e.pos);
            e.ring.rotation.x = this.time * 0.8;
            e.ring.rotation.y = this.time * 0.5;
            this._place(e.label, e.pos.clone().add(new THREE.Vector3(0, 14, 0)));
        }

        // galaxies + level of detail
        const cam = this.camera.position;
        const cardCandidates = [];
        for (const e of this.galaxies.values()) {
            if (!e.pos) continue;
            e.pos.lerp(e.target, k);
            const bob = Math.sin(this.time * 0.7 + e.radius) * 1.5;
            e.group.position.set(e.pos.x, e.pos.y + bob, e.pos.z);
            const dist = cam.distanceTo(e.group.position);
            const hasSelected = this.selectedId != null && e.members.has(this.selectedId);
            const expanded = e.members.size === 1 || hasSelected || dist < EXPAND_BASE + e.radius * 8;
            e.expanded = expanded;

            e.body.visible = !expanded;
            e.glow.material.opacity = (expanded ? 0.15 : 0.9) * (e.galaxy.passes ? 1 : 0.3);
            const spin = this.time * 0.15;
            const cos = Math.cos(spin), sin = Math.sin(spin);
            for (const m of e.members.values()) {
                m.orb.visible = expanded;
                m.halo.visible = expanded;
                if (!expanded) continue;
                const o = m.offset;
                m.orb.position.set(o.x * cos - o.z * sin, o.y, o.x * sin + o.z * cos);
                m.halo.position.copy(m.orb.position);
                const world = m.orb.position.clone().add(e.group.position);
                const d = cam.distanceTo(world);
                if (m.item.id === this.selectedId || d < CARD_DISTANCE) cardCandidates.push({ m, world, d, passes: e.galaxy.passes });
            }
            const showCount = !expanded && e.members.size > 1;
            this._place(e.label, e.group.position.clone().add(new THREE.Vector3(0, -e.radius - 4, 0)), showCount);
        }

        // cards: nearest first, capped; the selected one always shows
        cardCandidates.sort((a, b) => (b.m.item.id === this.selectedId) - (a.m.item.id === this.selectedId) || a.d - b.d);
        const shown = new Set();
        cardCandidates.slice(0, MAX_CARDS).forEach(({ m, world, d, passes }, i) => {
            const card = this._card(m.item);
            const s = this._place(card, world.clone().add(new THREE.Vector3(0, 6, 0)));
            if (!s) return;
            const scale = Math.max(0.45, Math.min(1.1, 70 / d));
            card.style.transform += ` scale(${scale.toFixed(3)}) translateY(-60%)`;
            card.style.zIndex = String(1000 - i);
            card.classList.toggle('dim', !passes);
            card.classList.toggle('selected', m.item.id === this.selectedId);
            card.classList.toggle('hover', m.item.id === this.hoveredId);
            shown.add(m.item.id);
        });
        for (const [id, card] of this.cards) if (!shown.has(id)) card.style.display = 'none';

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
        cancelAnimationFrame(this._raf);
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
        this.renderer.dispose();
        this.container.remove();
    }
}
