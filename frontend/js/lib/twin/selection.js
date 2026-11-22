// @ts-nocheck -- three.js scene building; untyped like the scenes.
// The selection's floor circle (phase 7c), ported from the approved prototype
// (resources/signal chain digital twin/atelier.html); see PHASE7_PLAN.md.
//
// A magic circle of two counter-rotating layers on the floor around the machine holding
// the selected row, in the row's matter colour. When the selection moves, the old circle
// spins shut and the new one spins open.
//
//   const sel = makeSelection(shop, parent);
//   sel.set(at, radius, color)   // at: THREE.Vector3 or null (none)
//   sel.recolor(color)
//   sel.frame(dt), sel.dispose()

import * as THREE from 'three';

const OPEN_S = 0.8;
const CLOSE_S = 0.55;
const ease = (t) => 1 - Math.pow(1 - t, 3);

/** @param {any} S the machines' shop (makeShop) @param {THREE.Object3D} parent */
export function makeSelection(S, parent) {
    const geo = new THREE.CircleGeometry(1, 64);
    let cur = null;
    let old = [];

    const circle = (at, r, color) => {
        const g = new THREE.Group();
        const o = new THREE.Mesh(geo, S.additive(S.CIRCLE.outer, color, 0));
        const i = new THREE.Mesh(geo, S.additive(S.CIRCLE.inner, color, 0));
        o.scale.setScalar(r); i.scale.setScalar(r * 0.72);
        for (const m of [o, i]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.raycast = () => {}; g.add(m); }
        g.position.set(at.x, 0, at.z);
        g.scale.setScalar(0.01);
        parent.add(g);
        return { g, o, i, t: 0 };
    };
    const drop = (c) => { parent.remove(c.g); c.o.material.dispose(); c.i.material.dispose(); };

    return {
        /** Move the selection: the old circle closes, a new one opens at `at` (null: none). */
        set(at, r, color) {
            if (cur) { cur.t = 0; old.push(cur); }
            cur = at ? circle(at, r, color) : null;
        },
        recolor(color) {
            if (cur) for (const m of [cur.o, cur.i]) m.material.color.set(color);
        },
        frame(dt) {
            if (cur) {
                cur.t = Math.min(1, cur.t + dt / OPEN_S);
                const k = ease(cur.t);
                cur.g.scale.setScalar(0.05 + 0.95 * k);
                cur.o.material.opacity = 0.9 * k; cur.i.material.opacity = 0.8 * k;
                cur.o.rotation.z += dt * (0.2 + (1 - k) * 5); cur.i.rotation.z -= dt * (0.35 + (1 - k) * 7);
            }
            old = old.filter((s) => {
                s.t += dt / CLOSE_S;
                const k = 1 - ease(Math.min(1, s.t));
                s.g.scale.setScalar(Math.max(0.01, k));
                s.o.material.opacity = 0.9 * k; s.i.material.opacity = 0.8 * k;
                s.o.rotation.z -= dt * 6; s.i.rotation.z += dt * 8;
                if (s.t >= 1) { drop(s); return false; }
                return true;
            });
        },
        dispose() {
            if (cur) drop(cur);
            old.forEach(drop);
            cur = null; old = [];
            geo.dispose();
        },
    };
}
