// A rune for each archetype, drawn in white (a material tints it): the corner marks of the
// paragons' alcoves. Each says its verb; some through its organ too. Within about 48 of the origin.

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
    // protects: a whole shield, and a star kept behind it
    paladin(g) {
        curve(g, 'M0 -44 C14 -34 28 -31 40 -31 C41 2 30 30 0 47 C-30 30 -41 2 -40 -31 C-28 -31 -14 -34 0 -44 Z');
        curve(g, 'M0 -31 C10 -24 19 -22 28 -21 C28 2 20 21 0 33 C-20 21 -28 2 -28 -21 C-19 -22 -10 -24 0 -31 Z');
        solid(g, [[0, -17], [4, -3], [15, 1], [4, 5], [0, 19], [-4, 5], [-15, 1], [-4, -3]]);
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
    mariner(g) {
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

/** Runes of an exploitative aspect that has its own; the others are turned over.
 *  @type {Partial<Record<Archetype, (g: G) => void>>} */
const SHADOW_RUNES = {
    // destroys: a spear through a shield, the shield in two
    paladin(g) {
        for (const f of [-1, 1]) {
            g.save(); g.translate(f * 7, 5); g.rotate(f * 0.14);
            curve(g, f < 0 ? 'M-4 -30 C-26 -28 -38 -12 -36 6 C-34 24 -18 36 -2 38 L-10 24 L-1 12 L-11 0 L-2 -14 Z' : 'M4 -30 C26 -28 38 -12 36 6 C34 24 18 36 2 38 L-4 25 L6 13 L-3 1 L7 -13 Z');
            g.restore();
        }
        over(g, () => line(g, [[0, -18], [0, 48]])); solid(g, [[0, -50], [10, -30], [0, -14], [-10, -30]]);
        both(g, () => { line(g, [[26, -38], [34, -46]]); line(g, [[40, -22], [49, -26]]); });
    },
};

/** A deity's, by its form. @type {Record<DeityForm, (g: G) => void>} */
const DEITY_RUNES = {
    // a wave leaving a chip
    music(g) {
        g.strokeRect(-22, -22, 44, 44);
        for (const k of [-12, 0, 12]) { line(g, [[k, -22], [k, -38]]); line(g, [[k, 22], [k, 38]]); line(g, [[-22, k], [-38, k]]); line(g, [[22, k], [38, k]]); }
        curve(g, 'M-15 0 C-11 -18 -6 -18 -2 0 C2 18 8 18 14 0');
    },
    // a dancer, and the ribbon's turn
    dance(g) {
        ring(g, 4, -36, 7, true);
        curve(g, 'M4 -26 C-2 -14 -2 -4 2 6 L-8 44'); curve(g, 'M2 6 C14 10 24 8 32 -2'); curve(g, 'M2 -18 C-12 -22 -22 -30 -26 -42'); curve(g, 'M2 -18 C14 -16 24 -22 30 -34');
        curve(g, 'M-40 8 C-46 34 8 44 40 24');
    },
    // a hearth under one roof
    family(g) {
        line(g, [[-44, -6], [0, -42], [44, -6]]); line(g, [[-32, -14], [-32, 40], [32, 40], [32, -14]]);
        curve(g, 'M0 34 C-16 24 -18 10 -6 -2 C-6 6 0 8 2 -8 C18 6 18 24 0 34 Z');
    },
    // steps to a star
    career(g) {
        line(g, [[-44, 44], [-44, 26], [-18, 26], [-18, 8], [8, 8], [8, -10], [34, -10], [34, 44]]);
        solid(g, [[20, -48], [24, -38], [35, -35], [24, -32], [20, -22], [16, -32], [5, -35], [16, -38]]);
    },
    // a spade in chains
    games(g) {
        curve(g, 'M0 -40 C6 -24 32 -12 32 8 C32 24 12 26 4 14 L10 36 L-10 36 L-4 14 C-12 26 -32 24 -32 8 C-32 -12 -6 -24 0 -40 Z');
        both(g, () => { for (const y of [-30, -8, 14, 36]) { g.beginPath(); g.ellipse(45, y, 5, 10, 0, 0, Math.PI * 2); g.stroke(); } });
    },
};

/** @param {(g: G) => void} draw @param {number} size @param {boolean} [turned] */
function runeCanvas(draw, size, turned = false) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = /** @type {G} */ (c.getContext('2d'));
    g.translate(size / 2, size / 2);
    g.scale(size / 110, size / 110);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineWidth = 5.5; g.lineCap = g.lineJoin = 'round';
    if (turned) g.rotate(Math.PI);
    draw(g);
    return c;
}

/** @param {Archetype} id @param {number} [size] @param {boolean} [dark] @returns {HTMLCanvasElement} */
export function archetypeRune(id, size = 160, dark = false) {
    const own = dark ? SHADOW_RUNES[id] : null;
    return runeCanvas(own ?? RUNES[id], size, dark && !own);
}

/** @param {DeityForm} form @param {number} [size] */
export const deityRune = (form, size = 160) => runeCanvas(DEITY_RUNES[form], size);
