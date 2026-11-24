// @ts-nocheck -- imperative three.js; the three ES module is untyped here.

/**
 * Adventure models standing on the Atlas, like extrusions of the map: a MapLibre custom layer
 * drawn with the same three.js (and finish) as the cabinets. levelMap.js, which is on an
 * older three.js, owns the events and says where each one stands.
 *
 *   const models = new MapModels();
 *   map.addLayer(models.layer);
 *   models.update([{ id, spec, at: MercatorCoordinate, m }]);   // spec: lib/items.js modelSpec
 *   models.place(id, { size, visible, lift });   // metres tall; each frame
 *   models.heightOf(id)   // how tall it stands now, in metres
 *
 * Each model is drawn with its own matrix, worked out in double precision, in local metres
 * (x east, y up, z south), so it stays steady at any zoom.
 */

import * as THREE from 'three';
import { disposeGroup, makeKit, studio } from './cabinet/kit.js';
import { drawRecipe } from './cabinet/recipe.js';

const RISE_S = 1.1;          // a model grows out of the ground this long
const PLINTH = 0.05;         // the plinth's height, of the model's

export class MapModels {
    constructor() {
        this.items = new Map();
        this.kit = makeKit();
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight('#dfe6f5', '#141a2c', 1.1));
        const key = new THREE.DirectionalLight('#fff4e0', 2.6); key.position.set(-3, 5, 4);
        this.scene.add(key);
        this.camera = new THREE.Camera();
        this.layer = {
            id: 'lm-models', type: 'custom', renderingMode: '3d',
            onAdd: (map, gl) => {
                this.map = map;
                this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl });
                this.renderer.autoClear = false;
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            },
            render: (gl, args) => this._render(args?.defaultProjectionData?.mainMatrix ?? args),
            onRemove: () => this.dispose(),
        };
    }

    update(list) {
        const ids = new Set(list.map((x) => x.id));
        for (const [id, it] of this.items) if (!ids.has(id)) { this._drop(it); this.items.delete(id); }
        for (const { id, spec, at, m } of list) {
            const sig = JSON.stringify([spec.parts, spec.color]);
            let it = this.items.get(id);
            if (it && it.sig !== sig) { this._drop(it); it = { ...it, ...this._build(spec), sig }; this.items.set(id, it); }
            if (!it) { it = { ...this._build(spec), sig, size: 0, visible: false, lift: 0, born: performance.now() }; this.items.set(id, it); }
            it.at = at;
            it.m = m;
        }
    }

    /** The model, scaled to stand 1 tall on a plinth, its foot on the ground. */
    _build(spec) {
        const group = new THREE.Group(), body = new THREE.Group();
        drawRecipe(this.kit, body, spec.parts, spec.color);
        const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
        const k = 1 / Math.max(size.y, size.x * 0.7, size.z * 0.7, 1e-3), wide = Math.hypot(size.x, size.z) * k;
        body.scale.setScalar(k);
        body.position.set(-mid.x * k, PLINTH - box.min.y * k, -mid.z * k);
        group.add(body);
        // the plinth: a slab of the city's own blue, rimmed in the model's colour
        const r = Math.max(0.32, wide * 0.56), hex = new THREE.CylinderGeometry(r, r * 1.04, PLINTH, 6);
        this.kit.mesh(hex, new THREE.MeshStandardMaterial({ color: '#16233f', roughness: 0.85 }), group, 0, PLINTH / 2, 0);
        const rim = new THREE.LineSegments(new THREE.EdgesGeometry(hex), new THREE.LineBasicMaterial({ color: spec.color }));
        rim.position.y = PLINTH / 2;
        group.add(rim);
        group.traverse((o) => { o.frustumCulled = false; });
        return { group, tall: size.y * k + PLINTH };
    }

    _drop(it) { this.scene.remove(it.group); disposeGroup(it.group); }

    place(id, { size, visible, lift = 0 }) {
        const it = this.items.get(id);
        if (it) Object.assign(it, { size, visible, lift });
    }

    heightOf(id) { const it = this.items.get(id); return it ? it.tall * it.size : 0; }

    _render(matrix) {
        const shown = [...this.items.values()].filter((it) => it.visible && it.size > 0);
        if (!matrix || !shown.length) return;
        this.renderer.resetState();
        if (!this.scene.environment) { // here, where the map expects its GL state to be disturbed
            this.env = studio(this.renderer);
            this.scene.environment = this.env.texture;
            this.renderer.resetState();
        }
        const main = new THREE.Matrix4().fromArray(matrix), local = new THREE.Matrix4(), eye = new THREE.Vector4();
        for (const it of shown) {
            const s = it.m * it.size * (1 + it.lift), grow = Math.min(1, (performance.now() - it.born) / 1000 / RISE_S);
            const rise = 1 - (1 - grow) ** 3;
            // model (x east, y up, z south) -> mercator (x east, y south, z up)
            local.set(s, 0, 0, it.at.x, 0, 0, s, it.at.y, 0, s * Math.max(0.01, rise), 0, 0, 0, 0, 0, 1);
            const full = local.premultiply(main);
            // where the eye is, so highlights and reflections fall right: the point all rays meet at
            eye.set(0, 0, 1, 0).applyMatrix4(full.clone().invert());
            const at = new THREE.Vector3(eye.x / eye.w, eye.y / eye.w, eye.z / eye.w);
            this.camera.matrixWorld.makeTranslation(at.x, at.y, at.z);
            this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
            this.camera.projectionMatrix.copy(full).multiply(this.camera.matrixWorld);
            this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
            this.camera.matrixWorldAutoUpdate = false;
            this.scene.add(it.group);
            this.renderer.render(this.scene, this.camera);
            this.scene.remove(it.group);
        }
        this.renderer.resetState();
    }

    dispose() {
        for (const it of this.items.values()) this._drop(it);
        this.items.clear();
        this.env?.dispose();
        this.kit.dispose();
        this.renderer?.dispose();
    }
}
