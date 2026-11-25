// What an artifact taught (pure): skills practiced (by its done quests) and proven (by plays
// that came off), and the attributes those skills feed. Derived, never stored; it counts once sealed.

import { ATTRIBUTES } from '../lifecycle.js';

/** Grades of a play that didn't come off. */
const FAILED = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

/** @typedef {{ skill: Entity, count: number }} Grown */
/** @typedef {{ practiced: Grown[], proven: Grown[], attributes: { id: Attribute, count: number }[] }} Growth */

/** @param {AdventureRecord} a */
const isSealed = (a) => Boolean(a.enshrining?.sealed_at) && (a.phase === 'completed' || a.phase === 'decommissioned');

/**
 * The roadmap an artifact's quests come from: its own, or its series' for the first date
 * sealed (a series' quests are done once).
 * @param {AdventureRecord} a @param {AdventureRecord[]} adventures
 */
export function questsOf(a, adventures) {
    if (a.roadmap || !a.series_id) return a.roadmap;
    const dates = adventures.filter((x) => x.series_id === a.series_id && x.phase !== 'killed');
    if (dates.some((x) => x.roadmap)) return null;   // one was completed whole, with the quests
    const first = dates.filter(isSealed).sort((x, y) => (x.enshrining?.sealed_at ?? '').localeCompare(y.enshrining?.sealed_at ?? ''))[0];
    return !first || first.id === a.id ? adventures.find((x) => x.id === a.series_id)?.roadmap ?? null : null;
}

/**
 * @param {AdventureRecord} a @param {{ skills: string[], grade: string }[]} moves  its plays (a draft's, while editing)
 * @param {AdventureRecord[]} adventures @param {Entity[]} entities @returns {Growth}
 */
export function growth(a, moves, adventures, entities) {
    const road = questsOf(a, adventures), done = new Set(road?.done ?? []);
    const count = (/** @type {string[]} */ ids) => {
        /** @type {Map<string, number>} */
        const n = new Map();
        for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
        return [...n].flatMap(([id, c]) => { const skill = entities.find((e) => e.id === id && e.type === 'skill'); return skill ? [{ skill, count: c }] : []; })
            .sort((x, y) => y.count - x.count || x.skill.name.localeCompare(y.skill.name));
    };
    const practiced = count((road?.actions ?? []).filter((q) => done.has(q.id)).flatMap((q) => q.skills ?? []));
    const proven = count(moves.filter((m) => !FAILED.has(m.grade)).flatMap((m) => m.skills));
    const grown = new Map([...practiced, ...proven].map((g) => [g.skill.id, g.skill]));
    const attributes = /** @type {Attribute[]} */ (Object.keys(ATTRIBUTES))
        .map((id) => ({ id, count: [...grown.values()].filter((s) => s.details.attributes?.includes(id)).length })).filter((x) => x.count)
        .sort((x, y) => y.count - x.count);
    return { practiced, proven, attributes };
}

/** Where a skill has grown: sealed artifacts, latest first. @param {string} skillId @param {AdventureRecord[]} adventures @param {Entity[]} entities */
export function skillRecord(skillId, adventures, entities) {
    return adventures.filter(isSealed).map((a) => {
        const g = growth(a, a.enshrining?.moves ?? [], adventures, entities), of = (/** @type {Grown[]} */ l) => l.find((x) => x.skill.id === skillId)?.count ?? 0;
        return { a, practiced: of(g.practiced), proven: of(g.proven) };
    }).filter((r) => r.practiced || r.proven).sort((x, y) => (y.a.enshrining?.sealed_at ?? '').localeCompare(x.a.enshrining?.sealed_at ?? ''));
}
