// What the entity dropdowns offer (pure): matches grouped by type, in the Codex's type order.

import { ENTITY_TYPES } from '../lifecycle.js';

const PER_TYPE = 8;
const ORDER = /** @type {EntityType[]} */ (Object.keys(ENTITY_TYPES));

/**
 * Entities matching `q` (lower case), by type; within one, those starting with it first. At
 * most PER_TYPE of each.
 * @param {Entity[]} pool @param {string} q
 */
export function matchesByType(pool, q) {
    const starts = (/** @type {Entity} */ e) => Number(!e.name.toLowerCase().startsWith(q));
    const found = pool.filter((e) => !q || e.name.toLowerCase().includes(q)).sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
    return ORDER.flatMap((type) => found.filter((e) => e.type === type).slice(0, PER_TYPE));
}

/** Scroll a menu (and only the menu) so this option shows. @param {HTMLElement | null} option */
export function keepInView(option) {
    const menu = option?.parentElement;
    if (!option || !menu) return;
    const m = menu.getBoundingClientRect(), o = option.getBoundingClientRect();
    if (o.top < m.top) menu.scrollTop -= m.top - o.top + 26; // and the group's name above it
    else if (o.bottom > m.bottom) menu.scrollTop += o.bottom - m.bottom + 4;
}
