// Cabinet layout (pure): where each alcove sits, in pixels of the scrolled content. The
// buttons (components/Cabinet.js) and the 3D cabinet behind them (cabinetScene.js) both use
// it, so they always line up.

/** @typedef {{ id: string | null, x: number, y: number, w: number, h: number }} CabinetCell  top-left corner; id null = an empty alcove */
/** @typedef {{ y: number, h: number, title: string | null, rows: number[] }} CabinetGroup  `rows`: each row's top; `y`/`h` span the rows */
/**
 * @typedef {object} CabinetLayout
 * @property {number} width
 * @property {number} height           of the whole cabinet
 * @property {number} x0               left edge of the first column
 * @property {number[]} cols           each column's left edge, plus the right edge of the last
 * @property {number} cellW
 * @property {number} cellH
 * @property {number} crestY           the crest's centre
 * @property {CabinetGroup[]} groups
 * @property {CabinetCell[]} cells     every alcove, empty ones included
 */

export const LABEL_H = 60;      // the band under each alcove's shelf
const CREST_H = 98, FOOT_H = 22, TITLE_H = 44;

/**
 * Lay groups of items out in alcoves. Each group starts a new row, under its title if it
 * has one; its last row is filled up with empty alcoves.
 * @param {number} width  of the panel's content
 * @param {{ title?: string | null, ids: string[] }[]} groups
 * @param {{ minW?: number, cellH?: number, minCols?: number, maxCols?: number }} [options]
 * @returns {CabinetLayout}
 */
export function cabinetLayout(width, groups, { minW = 176, cellH = 246, minCols = 2, maxCols = Infinity } = {}) {
    const pad = width < 520 ? 14 : 30;
    const inner = Math.max(1, width - 2 * pad);
    const n = Math.min(maxCols, Math.max(minCols, Math.floor(inner / minW)));
    const cellW = inner / n;
    /** @type {CabinetCell[]} */
    const cells = [];
    /** @type {CabinetGroup[]} */
    const placed = [];
    let y = CREST_H;
    for (const g of groups) {
        if (g.title) y += TITLE_H;
        const rows = Math.max(1, Math.ceil(g.ids.length / n));
        placed.push({ y, h: rows * cellH, title: g.title ?? null, rows: Array.from({ length: rows }, (_, i) => y + i * cellH) });
        for (let i = 0; i < rows * n; i++) {
            cells.push({ id: g.ids[i] ?? null, x: pad + (i % n) * cellW, y: y + Math.floor(i / n) * cellH, w: cellW, h: cellH });
        }
        y += rows * cellH + FOOT_H;
    }
    return {
        width, height: y, x0: pad, cols: Array.from({ length: n + 1 }, (_, i) => pad + i * cellW),
        cellW, cellH, crestY: CREST_H - 43, groups: placed, cells,
    };
}
