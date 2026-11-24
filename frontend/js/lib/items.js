// Items and their sheets (pure): gear sets, effects, and how an item's model looks now.

import { entityColor } from './lens.js';
import { coverSrc } from './covers.js';
import { verdictRings } from './analysis.js';

/** Material roles (same list in backend/services/items.py). */
export const MATERIALS = ['steel', 'dark', 'brass', 'copper', 'pale', 'tint', 'glow', 'glass', 'screen'];

/** An adventure's colour: its deity's, else a fallback. @param {AdventureRecord} a @param {string} [fallback] */
export function adventureColor(a, fallback = '#cfd3da') {
    const deity = a.entities.find((o) => o.type === 'deity');
    return deity ? entityColor(deity.id) : fallback;
}

/** Its sigil's points: more for a longer roadmap. @param {AdventureRecord} a */
export const sigilPoints = (a) => Math.max(4, Math.min(9, 4 + (a.roadmap?.actions.length ?? 0)));

/** An item is owned once it's completed. @param {AdventureRecord} a */
export const owned = (a) => a.phase === 'completed' || a.phase === 'decommissioned';

/**
 * Whether a part of an item's model is made: solid, else a blueprint. A part tied to an
 * action is made when that's done; the rest once construction starts.
 * @param {AdventureRecord} a @param {ModelPart} part
 */
export function partMade(a, part) {
    if (owned(a)) return true;
    if (part.act != null) return a.roadmap?.done?.includes(part.act) ?? false;
    return a.phase === 'constructing' || a.phase === 'consuming';
}

/**
 * What a 3D view needs to show an adventure: its model with each part made or not, or the
 * default, a card with its cover.
 * @param {AdventureRecord} a @param {{ finished?: boolean, fallback?: string }} [options]
 */
export function modelSpec(a, { finished = false, fallback } = {}) {
    const parts = a.type === 'item' && a.item?.model ? a.item.model.filter((p) => p.on).map((p) => ({ ...p, made: finished || partMade(a, p) })) : null;
    return {
        id: a.id, kind: a.type, color: adventureColor(a, fallback), points: sigilPoints(a), on: owned(a),
        rings: a.enshrining?.sealed_at ? verdictRings(a.enshrining.verdict) : 0, cover: coverSrc(a.cover_url), parts,
    };
}

/**
 * The living items by gear set: a deity's items form its set (an item with several deities
 * goes with its first). Items without one come last.
 * @param {AdventureRecord[]} adventures
 * @returns {{ deity: { id: string, name: string } | null, items: AdventureRecord[] }[]}
 */
export function gearSets(adventures) {
    /** @type {Map<string, { deity: { id: string, name: string } | null, items: AdventureRecord[] }>} */
    const sets = new Map();
    for (const a of adventures) {
        if (a.type !== 'item' || a.phase === 'killed' || a.phase === 'decommissioned') continue;
        const deity = a.entities.find((o) => o.type === 'deity') ?? null, key = deity?.id ?? '';
        if (!sets.has(key)) sets.set(key, { deity: deity && { id: deity.id, name: deity.name }, items: [] });
        sets.get(key)?.items.push(a);
    }
    return [...sets.values()].sort((x, y) => Number(!x.deity) - Number(!y.deity) || (x.deity?.name ?? '').localeCompare(y.deity?.name ?? ''));
}

/** Owned items' effects added up by skill. @param {AdventureRecord[]} adventures @returns {[string, number][]} */
export function activeEffects(adventures) {
    return sumBySkill(adventures.filter((a) => a.type === 'item' && a.phase === 'completed').flatMap((a) => a.item?.effects ?? []));
}

/** @param {{ skill: string, rating: number }[]} effects @returns {[string, number][]} */
export function sumBySkill(effects) {
    /** @type {Map<string, number>} */
    const sum = new Map();
    for (const e of effects) sum.set(e.skill, (sum.get(e.skill) ?? 0) + e.rating);
    return [...sum].filter(([, n]) => n);
}

/** Its gear set: owned items that share a deity with it. @param {AdventureRecord} adventure @param {AdventureRecord[]} adventures */
export function gearFor(adventure, adventures) {
    const deities = new Set(adventure.entities.filter((e) => e.type === 'deity').map((e) => e.id));
    return adventures.filter((a) => a.type === 'item' && a.id !== adventure.id && owned(a) && a.entities.some((e) => deities.has(e.id)));
}

/**
 * Its preparations, with each one's name and effects. An item that has left the gear set
 * stays listed, but gives nothing.
 * @param {AdventureRecord} adventure @param {AdventureRecord[]} adventures
 */
export function readied(adventure, adventures) {
    const gear = new Map(gearFor(adventure, adventures).map((a) => [a.id, a]));
    return adventure.preparations.map((prep) => {
        if (!prep.item) return { prep, label: prep.text, effects: prep.effects, lost: false };
        const item = gear.get(prep.item);
        return { prep, label: (item ?? adventures.find((a) => a.id === prep.item))?.title ?? 'Gone', effects: item?.item?.effects ?? [], lost: !item };
    });
}

/** The effects at work in an adventure: those of its checked preparations.
 *  @param {AdventureRecord} adventure @param {AdventureRecord[]} adventures */
export function effectsAtWork(adventure, adventures) {
    return readied(adventure, adventures).filter((r) => r.prep.checked).flatMap((r) => (r.effects.length
        ? r.effects.map((e) => ({ key: `${r.prep.id}:${e.skill}`, label: r.label, skill: /** @type {string | null} */ (e.skill), rating: e.rating }))
        : [{ key: r.prep.id, label: r.label, skill: null, rating: 0 }]));
}
