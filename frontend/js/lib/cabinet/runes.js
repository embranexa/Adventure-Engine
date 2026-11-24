// A rune for each archetype, drawn in white (a material tints it): the corner marks of the
// idols' alcoves. Each says its verb; some through its organ too. Within about 48 of the origin.

/** @typedef {CanvasRenderingContext2D} G */
const line = (/** @type {G} */ g, /** @type {number[][]} */ pts, close = false) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); g.stroke(); };
const solid = (/** @type {G} */ g, /** @type {number[][]} */ pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); };
const ring = (/** @type {G} */ g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r, fill = false) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) g.fill(); else g.stroke(); };
const arc = (/** @type {G} */ g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r, /** @type {number} */ a, /** @type {number} */ b) => { g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); };
const curve = (/** @type {G} */ g, /** @type {string} */ d) => g.stroke(new Path2D(d));
const both = (/** @type {G} */ g, /** @type {() => void} */ f) => { f(); g.save(); g.scale(-1, 1); f(); g.restore(); };
/** A strand that passes over what's already drawn: it clears a margin, then draws. @param {G} g @param {() => void} f */
const over = (g, f) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 16; g.lineCap = 'butt'; f(); g.restore(); f(); };

/** @type {Record<Archetype, (g: G) => void>} */
const RUNES = {
    // destroys: a spear through a shield, the shield in two
    juggernaut(g) {
        for (const f of [-1, 1]) {
            g.save(); g.translate(f * 7, 5); g.rotate(f * 0.14);
            curve(g, f < 0 ? 'M-4 -30 C-26 -28 -38 -12 -36 6 C-34 24 -18 36 -2 38 L-10 24 L-1 12 L-11 0 L-2 -14 Z' : 'M4 -30 C26 -28 38 -12 36 6 C34 24 18 36 2 38 L-4 25 L6 13 L-3 1 L7 -13 Z');
            g.restore();
        }
        over(g, () => line(g, [[0, -18], [0, 48]])); solid(g, [[0, -50], [10, -30], [0, -14], [-10, -30]]);
        both(g, () => { line(g, [[26, -38], [34, -46]]); line(g, [[40, -22], [49, -26]]); });
    },
    // builds (hands): a palm with a gear turning in it
    artificer(g) {
        curve(g, 'M-24 44 L-26 8 M24 44 C30 28 27 16 26 8'); line(g, [[-24, 44], [24, 44]]);
        line(g, [[-26, 10], [-43, -6]]);
        [[-18, -32], [-4, -43], [11, -39], [26, -26]].forEach(([x, y], i) => line(g, [[-16 + i * 13, -4 + Math.abs(i - 1.5) * 2], [x, y]]));
        ring(g, 0, 21, 9.5); ring(g, 0, 21, 2.6, true);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(g, [[Math.cos(a) * 11, 21 + Math.sin(a) * 11], [Math.cos(a) * 14.5, 21 + Math.sin(a) * 14.5]]); }
    },
    // transports: a wheel rolling along a river
    terraformer(g) {
        ring(g, -6, -8, 27); ring(g, -6, -8, 5, true);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; line(g, [[-6 + Math.cos(a) * 7, -8 + Math.sin(a) * 7], [-6 + Math.cos(a) * 27, -8 + Math.sin(a) * 27]]); }
        line(g, [[30, -26], [46, -8], [30, 10]]);
        curve(g, 'M-46 34 C-34 24 -24 24 -14 34 C-4 44 6 44 16 34 C26 24 36 24 46 34');
    },
    // weaves: a labyrinth, and the one thread run through it to the centre
    wizard(g) {
        const D = Math.PI / 180, on = (/** @type {number} */ r, /** @type {number} */ a) => [Math.cos(a * D) * r, Math.sin(a * D) * r];
        g.save(); g.lineWidth = 3.4; g.globalAlpha = 0.75;
        // walls, each ring open in one place: [radius, gap's angle, half its width]
        for (const [r, gap, half] of [[47, 90, 14], [31, -55, 21], [15.5, 195, 44]]) arc(g, 0, 0, r, (gap + half) * D, (gap - half + 360) * D);
        for (const [r0, r1, a] of [[31, 47, 128], [31, 47, 200], [15.5, 31, 20], [15.5, 31, 110]]) line(g, [on(r0, a), on(r1, a)]);   // dead ends
        g.restore();
        g.save(); g.lineWidth = 7;
        g.beginPath(); g.moveTo(0, 53); g.lineTo(0, 39); g.arc(0, 0, 39, 90 * D, -55 * D, true); g.lineTo(on(23.2, -55)[0], on(23.2, -55)[1]); g.arc(0, 0, 23.2, -55 * D, -165 * D, true); g.lineTo(0, 0); g.stroke();
        ring(g, 0, 0, 6.5, true);
        g.restore();
    },
    // discovers (eyes): an eye opening under a lifted veil, a star for a pupil
    ranger(g) {
        curve(g, 'M-46 10 C-26 -18 26 -18 46 10 C26 38 -26 38 -46 10 Z'); ring(g, 0, 10, 15);
        solid(g, [[0, -1], [3, 7], [11, 10], [3, 13], [0, 21], [-3, 13], [-11, 10], [-3, 7]]);
        curve(g, 'M-40 -18 C-22 -36 22 -36 40 -18');
        line(g, [[0, -34], [0, -48]]); both(g, () => line(g, [[20, -32], [26, -44]]));
    },
    // exchanges: two arrows round a coin
    merchant(g) {
        ring(g, 0, 0, 17); line(g, [[0, -8], [0, 8]]); line(g, [[-6, 0], [6, 0]]);
        for (const turn of [0, Math.PI]) { g.save(); g.rotate(turn); arc(g, 0, 0, 37, -2.75, -0.5); line(g, [[18, -27], [33, -18], [38, -36]]); g.restore(); }
    },
    // attracts (loins): a lodestone chalice, drawing sparks to its flame
    enchanter(g) {
        curve(g, 'M-34 -16 C-34 20 -14 26 0 44 C14 26 34 20 34 -16'); curve(g, 'M-18 -16 C-18 6 -8 12 0 20 C8 12 18 6 18 -16');
        both(g, () => line(g, [[18, -16], [34, -16]])); both(g, () => line(g, [[17, -6], [34, -6]]));
        curve(g, 'M0 -34 C10 -20 10 -8 0 2 C-10 -8 -10 -20 0 -34 Z');
        both(g, () => { line(g, [[26, -30], [34, -42]]); line(g, [[40, -26], [48, -34]]); });
    },
    // restores (heart): a heart with a flame in it, two leaves growing from it
    druid(g) {
        curve(g, 'M0 46 C-28 24 -40 8 -36 -8 C-32 -24 -8 -24 0 -6 C8 -24 32 -24 36 -8 C40 8 28 24 0 46 Z');
        curve(g, 'M0 2 C9 12 11 19 8 25 C4 31 -4 31 -8 25 C-11 19 -9 12 0 2 Z');
        line(g, [[0, -8], [0, -30]]);
        both(g, () => curve(g, 'M0 -28 C4 -44 18 -48 28 -46 C28 -34 16 -26 0 -28 Z'));
    },
    // captivates: a lyre whose sound goes out both ways
    bard(g) {
        curve(g, 'M0 36 C-22 36 -26 14 -18 -4 C-14 -14 -18 -26 -28 -28'); curve(g, 'M0 36 C22 36 26 14 18 -4 C14 -14 18 -26 28 -28');
        line(g, [[-19, -20], [19, -20]]); for (const x of [-7, 0, 7]) line(g, [[x, -20], [x, 26]]);
        line(g, [[-9, 46], [9, 46]]); line(g, [[0, 36], [0, 46]]);
        both(g, () => { arc(g, 14, 4, 18, -0.6, 0.6); arc(g, 14, 4, 31, -0.6, 0.6); });
        ring(g, 0, -40, 5, true);
    },
    // leads: a spearhead, the ranks behind it
    vanguard(g) {
        solid(g, [[0, -48], [17, -16], [0, -24], [-17, -16]]);
        for (const [y, w] of [[0, 24], [19, 33], [38, 42]]) line(g, [[-w, y + w * 0.34], [0, y - 8], [w, y + w * 0.34]]);
    },
    // binds (ligament): two bones lashed together
    templar(g) {
        both(g, () => { curve(g, 'M46 -34 C40 -42 28 -38 30 -28 C20 -32 12 -22 18 -14 L9 -6'); curve(g, 'M46 34 C40 42 28 38 30 28 C20 32 12 22 18 14 L9 6'); });
        both(g, () => { curve(g, 'M46 -34 C54 -26 48 -18 40 -20'); curve(g, 'M46 34 C54 26 48 18 40 20'); });
        for (const y of [-9, 0, 9]) over(g, () => curve(g, `M-17 ${y + 4} C-8 ${y - 5} 8 ${y + 5} 17 ${y - 4}`));
        ring(g, 0, 0, 22);
    },
    // reconciles: two rings linked, and what they share
    cleric(g) {
        arc(g, -15, 0, 28, 0, Math.PI * 2);
        over(g, () => arc(g, 15, 0, 28, 0, Math.PI * 2));
        over(g, () => arc(g, -15, 0, 28, -1.35, -0.6));   // linked: the first passes back over at the top
        solid(g, [[0, -10], [7, 0], [0, 10], [-7, 0]]);
        line(g, [[0, -34], [0, -46]]); line(g, [[0, 34], [0, 46]]);
    },
};

/** @param {Archetype} id @param {number} [size] @returns {HTMLCanvasElement} */
export function archetypeRune(id, size = 160) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = /** @type {G} */ (c.getContext('2d'));
    g.translate(size / 2, size / 2);
    g.scale(size / 110, size / 110);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineWidth = 5.5; g.lineCap = g.lineJoin = 'round';
    RUNES[id](g);
    return c;
}
