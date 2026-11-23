// @ts-nocheck -- three.js geometry; untyped like the scenes.
// Draws a model recipe: data, never code (checked in backend/services/items.py). A part that
// isn't made yet is a blueprint in the item's colour; a made one wears its material.

import * as THREE from 'three';

const V = (p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0);
const RAD = Math.PI / 180;

function screenTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 80;
    const g = c.getContext('2d'), q = g.createLinearGradient(0, 0, 0, 80);
    q.addColorStop(0, '#1a0b3d'); q.addColorStop(1, '#3a1266'); g.fillStyle = q; g.fillRect(0, 0, 128, 80);
    const s = g.createLinearGradient(0, 14, 0, 56); s.addColorStop(0, '#ffd166'); s.addColorStop(1, '#f0439a');
    g.fillStyle = s; g.beginPath(); g.arc(64, 38, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a0f52'; for (let i = 0; i < 5; i++) g.fillRect(40, 40 + i * 5, 48, 1 + i * 0.5);
    g.strokeStyle = '#4fd8d0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 62 + i * i * 1.2); g.lineTo(128, 62 + i * i * 1.2); g.stroke(); }
    return c;
}

/** A material role. Every model wears the same finish, whoever wrote the recipe. */
function role(K, mat, color) {
    const { std } = K;
    const side = THREE.DoubleSide;
    switch (mat) {
        case 'dark': return std({ color: '#16181d', metalness: 0.6, roughness: 0.5, side });
        case 'brass': return std({ color: '#c9974a', metalness: 1, roughness: 0.26, side });
        case 'copper': return std({ color: '#c8733f', metalness: 1, roughness: 0.3, side });
        case 'pale': return std({ color: '#c3c6cb', metalness: 0.1, roughness: 0.55, envMapIntensity: 0.5, side });
        case 'tint': return std({ color, metalness: 0.45, roughness: 0.35, side });
        case 'glow': return std({ color: '#050505', emissive: color, emissiveIntensity: 1.15, roughness: 0.4, side });
        case 'glass': return std({ color: '#bfe4ee', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false, side });
        case 'screen': return new THREE.MeshBasicMaterial({ map: K.texture(screenTexture()), color: '#dddddd', side });
        default: return std({ color: '#808183', metalness: 0.95, roughness: 0.34, side });
    }
}

const outline = (pts, sharp) => (sharp ? pts.map((p) => new THREE.Vector2(p[0], p[1]))
    : new THREE.CatmullRomCurve3(pts.map(V), true, 'centripetal').getPoints(64).slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y)));

function geometry(p) {
    switch (p.shape) {
        case 'box': return new THREE.BoxGeometry(...p.size);
        case 'plane': return new THREE.PlaneGeometry(...p.size);
        case 'cyl': return new THREE.CylinderGeometry(p.r, p.r2 ?? p.r, p.h, 24);
        case 'sphere': return new THREE.SphereGeometry(p.r, 20, 14);
        case 'torus': return new THREE.TorusGeometry(p.r, p.t, 10, 56);
        case 'gem': return new THREE.OctahedronGeometry(p.r);
        case 'lathe': return new THREE.LatheGeometry(p.pts.map((q) => new THREE.Vector2(q[0], q[1])), 36);
        case 'tube': return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.pts.map(V)), 32, p.r, 8);
        case 'pill': {
            const s = new THREE.Shape();
            s.absarc(0, p.h / 2, p.r, 0, Math.PI, false); s.absarc(0, -p.h / 2, p.r, Math.PI, Math.PI * 2, false);
            return new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false, curveSegments: 8 });
        }
        case 'extrude': return new THREE.ExtrudeGeometry(new THREE.Shape(outline(p.pts, p.sharp)), { depth: p.depth, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.4, bevelSegments: 2 });
        case 'loop': {
            const o = outline(p.pts, p.sharp), path = new THREE.CurvePath();
            o.forEach((q, i) => { const n = o[(i + 1) % o.length]; path.add(new THREE.LineCurve3(new THREE.Vector3(q.x, q.y, 0), new THREE.Vector3(n.x, n.y, 0))); });
            return new THREE.TubeGeometry(path, Math.max(64, o.length * 2), p.r, 6, true);
        }
        case 'gear': {
            const s = new THREE.Shape();
            for (let i = 0; i < p.n * 4; i++) { const a = (i / (p.n * 4)) * Math.PI * 2, r = i % 4 < 2 ? p.r : p.r * 0.86; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
            const h = new THREE.Path(); h.absarc(0, 0, p.r * 0.62, 0, Math.PI * 2, true); s.holes.push(h);
            return new THREE.ExtrudeGeometry(s, { depth: p.r * 0.14, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
        }
        default: return new THREE.SphereGeometry(3, 12, 8);
    }
}

/**
 * Add a recipe's parts to `group` (about 80 units across, centred on its origin).
 * @param {ReturnType<import('./kit.js').makeKit>} K
 * @param {(ModelPart & { made: boolean })[]} parts
 */
export function drawRecipe(K, group, parts, color) {
    for (const p of parts) {
        let geo = geometry(p), mat = null;
        if (p.made) mat = role(K, p.mat, color);
        else {
            const solid = geo;
            geo = new THREE.EdgesGeometry(solid, 28);
            solid.dispose();
            mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false });
        }
        const rot = (p.rot ?? [0, 0, 0]).map((d) => d * RAD);
        for (const side of p.mirror ? [1, -1] : [1]) {
            const flip = new THREE.Group(); flip.scale.x = side; group.add(flip);
            const turns = p.spin ?? 1;
            for (let s = 0; s < turns; s++) {
                const turn = new THREE.Group(); turn.rotation[p.axis ?? 'y'] = (s / turns) * Math.PI * 2; flip.add(turn);
                const base = new THREE.Group(); base.position.set(...(p.at ?? [0, 0, 0])); turn.add(base);
                const each = p.repeat && p.shape === 'pill'; // a pill turns in its own place, other repeats together
                if (!each) base.rotation.set(...rot);
                for (const q of p.repeat ?? [[0, 0, 0]]) {
                    const o = p.made ? new THREE.Mesh(geo, mat) : new THREE.LineSegments(geo, mat);
                    o.position.set(q[0], q[1], q[2] ?? 0);
                    if (each) o.rotation.set(...rot);
                    if (q[3]) o.rotation.z += q[3] * RAD;
                    if (p.face) o.rotation.y = Math.atan2(q[0], q[2] ?? 0);
                    o.scale.setScalar(p.k ?? 1);
                    base.add(o);
                }
            }
        }
    }
}

/** A cabinet model: the recipe turning over a low foot. */
export function recipeModel(K, group, m) {
    const { M, lathe, ring } = K;
    lathe([[0, 0], [27, 0], [27, 2], [23, 4.5], [23, 7.5], [0, 7.5]], M.steel, group);
    ring(23.4, 0.7, M.trim, group, 0, 6.6); ring(27, 0.6, M.trim, group, 0, 1);
    const hold = new THREE.Group(); hold.position.y = 50; group.add(hold);
    drawRecipe(K, hold, m.parts, m.color);
    let angle = m.id.charCodeAt(0) % 6, last = null;
    return {
        frame(t, hover) {
            if (last != null) angle += (t - last) * 0.0003 * (1 + 3 * hover);
            last = t;
            hold.rotation.y = angle;
            hold.position.y = 50 + Math.sin(t / 1100 + angle) * 1.2;
        },
    };
}
