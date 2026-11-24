// The collaboration complex (pure: no React, no three.js): what complexScene.js draws.
// See resources/collaboration tool suite/BUILD_PLAN.md.
//
//   buildComplex(adventure, entities)    adventure, site and party; stewards; the cohort
//   buildResonance(adventure, entities)  the adventure, its entities, and the players sharing them
//   rankPlayers(adventure, entities)     every player by resonance
//
// Routing rules: heralds and commissioners reach the adventure, wardens only the site, the
// cohort only the party; only the adventure joins site and party.

import { ARCHETYPES, ENTITY_TYPES, PARTY_STATUSES, PHASE_STAGES, STEWARD_ROLES } from '../lifecycle.js';
import { entityColor } from './lens.js';

/**
 * @typedef {{ id: string, entityId: string | null, kind: 'core' | 'steward' | 'player' | 'entity', label: string, sub: string, color: string,
 *   pos: [number, number, number], size: number, dim?: boolean, glow?: boolean }} GraphNode
 * @typedef {{ a: string, b: string, color: string, width: number, style: 'solid' | 'dashed' | 'triple' | 'jagged',
 *   arrow?: boolean, flow?: boolean, dim?: boolean }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} Graph
 * @typedef {{ player: Entity, shared: Entity[], score: number, member: LinkedEntity | null }} Ranked
 */

const ADVERSARY = '#ef4444';
const BACKBONE = '#f5c542';
/** The adventure takes its matter's colour. */
const CORE_COLORS = { site: '#06b6d4', party: '#3b82f6' };
/** How each bond is drawn. @type {Record<PartyStatus, Pick<GraphEdge, 'width' | 'style'> & { flow?: boolean, dim?: boolean }>} */
const BONDS = {
    resonant: { width: 0.35, style: 'solid', dim: true }, charging: { width: 0.5, style: 'dashed', flow: true },
    attuning: { width: 0.7, style: 'solid', flow: true }, resisted: { width: 0.5, style: 'dashed', dim: true },
    bonded: { width: 1.1, style: 'solid' }, emergent: { width: 0.8, style: 'solid', flow: true },
    annealed: { width: 0.6, style: 'triple' }, neutralized: { width: 0.55, style: 'solid' }, repelled: { width: 0.8, style: 'jagged' },
};
const STATUS_ORDER = /** @type {PartyStatus[]} */ (Object.keys(PARTY_STATUSES));
const MAX_RESONANT = 30; // players drawn in the resonance view (the list shows all)
/** A little warmth breaks ties, and never outweighs a shared entity. */
const WARMTH_WEIGHT = 0.1;

/** An adventure's players. @param {AdventureRecord} adventure */
export const partyOf = (adventure) => adventure.entities.filter((e) => e.type === 'player')
    .sort((x, y) => STATUS_ORDER.indexOf(x.status ?? 'resonant') - STATUS_ORDER.indexOf(y.status ?? 'resonant') || x.name.localeCompare(y.name));

/** An adventure's wardens: its site's. @param {AdventureRecord} adventure @param {Entity[]} entities */
export function wardensOf(adventure, entities) {
    const site = entities.find((e) => e.id === adventure.site_id);
    return (site?.wardens ?? []).map((id) => entities.find((e) => e.id === id)).filter((e) => e != null);
}

/** Every player by resonance: one point per shared entity, plus a touch of warmth.
 *  @param {AdventureRecord} adventure @param {Entity[]} entities @returns {Ranked[]} */
export function rankPlayers(adventure, entities) {
    const ids = new Set(adventure.entities.map((e) => e.id));
    const members = new Map(partyOf(adventure).map((m) => [m.id, m]));
    const byId = new Map(entities.map((e) => [e.id, e]));
    return entities.filter((e) => e.type === 'player').map((player) => {
        const shared = player.affinities.filter((id) => ids.has(id)).map((id) => byId.get(id)).filter((e) => e != null);
        return { player, shared, score: shared.length + (player.details.warmth ?? 0) * WARMTH_WEIGHT, member: members.get(player.id) ?? null };
    }).sort((x, y) => y.score - x.score || x.player.name.localeCompare(y.player.name));
}

/** Points along an arc (degrees, 0 = +x, turning towards +z), staggered in height and radius so many still fit.
 *  @param {number} n @param {[number, number]} centre x, z @param {number} from @param {number} to @param {number} r
 *  @returns {[number, number, number][]} */
function arc(n, [cx, cz], from, to, r) {
    const rows = n > 10 ? 3 : n > 5 ? 2 : 1;
    return Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1), a = ((from + (to - from) * t) * Math.PI) / 180, row = i % rows;
        const rr = r + row * 20;
        return [cx + Math.cos(a) * rr, 10 + Math.sin(i * 2.4) * 7 + row * 9, cz + Math.sin(a) * rr];
    });
}

/** @param {AdventureRecord} adventure @param {Entity[]} entities @returns {Graph} */
export function buildComplex(adventure, entities) {
    const site = entities.find((e) => e.id === adventure.site_id) ?? null;
    const party = partyOf(adventure);
    /** @type {Graph} */
    const g = { nodes: [], edges: [] };
    g.nodes.push({ id: 'adventure', entityId: null, kind: 'core', label: adventure.title ?? 'Untitled', sub: 'Adventure', color: PHASE_STAGES[adventure.phase].color, pos: [0, 6, 0], size: 22 });
    g.nodes.push({ id: 'party', entityId: null, kind: 'core', label: party.length ? `${party.length} ${party.length === 1 ? 'player' : 'players'}` : 'No one yet', sub: 'Party', color: CORE_COLORS.party, pos: [72, 6, 0], size: 17 });
    g.edges.push({ a: 'adventure', b: 'party', color: BACKBONE, width: 1.2, style: 'solid' });
    if (site) {
        g.nodes.push({ id: 'site', entityId: site.id, kind: 'core', label: site.name, sub: 'Site', color: CORE_COLORS.site, pos: [-72, 6, 0], size: 17 });
        g.edges.push({ a: 'adventure', b: 'site', color: BACKBONE, width: 1.2, style: 'solid' });
        const wardens = wardensOf(adventure, entities);
        arc(wardens.length, [-72, 0], 125, 235, 52).forEach((pos, i) => steward(wardens[i], 'warden', 'site', pos));
    }
    const spread = adventure.stewards.length > 1 ? 70 : 0;
    arc(adventure.stewards.length, [0, 0], 252 - spread / 2, 252 + spread / 2, 78).forEach((pos, i) => steward(adventure.stewards[i], adventure.stewards[i].role, 'adventure', pos));
    const wide = Math.min(115, 24 + party.length * 14);
    arc(party.length, [72, 0], party.length > 1 ? -wide : 0, party.length > 1 ? wide : 0, 72).forEach((pos, i) => {
        const m = party[i], status = m.status ?? 'resonant', s = PARTY_STATUSES[status];
        const arch = entities.find((e) => e.id === m.id)?.details.archetype;
        g.nodes.push({
            id: `p:${m.id}`, entityId: m.id, kind: 'player', label: m.name, sub: `${arch ? `${ARCHETYPES[arch].glyph} ` : ''}${s.label}`, color: s.color, pos,
            size: s.stage === 'recruitment' ? 4 : 5.5, dim: status === 'resisted', glow: s.stage !== 'recruitment',
        });
        g.edges.push({ a: `p:${m.id}`, b: 'party', color: s.color, ...BONDS[status] });
    });
    // adversaries face the adventure
    const foes = adventure.adversaries, half = foes.length > 1 ? Math.min(60, foes.length * 14) : 0;
    arc(foes.length, [0, 0], 100 - half, 100 + half, 78).forEach((pos, i) => {
        const id = `foe:${foes[i].entity_id ?? foes[i].name}`;
        g.nodes.push({ id, entityId: foes[i].entity_id, kind: 'steward', label: foes[i].name, sub: '⚔ Adversary', color: ADVERSARY, pos, size: 5, glow: true });
        g.edges.push({ a: id, b: 'adventure', color: ADVERSARY, width: 0.8, style: 'jagged', arrow: true });
    });
    return g;

    /** @param {{ id: string, name: string }} e @param {StewardRole} role @param {string} to @param {[number, number, number]} pos */
    function steward(e, role, to, pos) {
        const r = STEWARD_ROLES[role], id = `${role}:${e.id}`;
        g.nodes.push({ id, entityId: e.id, kind: 'steward', label: e.name, sub: r.label, color: r.color, pos, size: 5, glow: true });
        g.edges.push({ a: id, b: to, color: r.color, width: 0.7, style: role === 'herald' ? 'dashed' : 'solid', arrow: true });
    }
}

/** @param {AdventureRecord} adventure @param {Entity[]} entities @returns {Graph} */
export function buildResonance(adventure, entities) {
    /** @type {Graph} */
    const g = { nodes: [], edges: [] };
    g.nodes.push({ id: 'adventure', entityId: null, kind: 'core', label: adventure.title ?? 'Untitled', sub: 'Adventure', color: PHASE_STAGES[adventure.phase].color, pos: [0, 6, 0], size: 20 });
    const links = adventure.entities.filter((e) => e.type !== 'player');
    links.forEach((e, i) => {
        const a = (i / links.length) * Math.PI * 2 - Math.PI / 2;
        g.nodes.push({ id: e.id, entityId: e.id, kind: 'entity', label: e.name, sub: `${ENTITY_TYPES[e.type].glyph} ${ENTITY_TYPES[e.type].label}`, color: entityColor(e.id), pos: [Math.cos(a) * 56, 6, Math.sin(a) * 56], size: 4.5 });
        g.edges.push({ a: 'adventure', b: e.id, color: BACKBONE, width: 0.8, style: 'solid' });
    });
    const ranked = rankPlayers(adventure, entities).filter((r) => r.shared.length || r.member).slice(0, MAX_RESONANT);
    // each player near the entities it shares: sorted by their mean direction, then spaced evenly
    const at = new Map(g.nodes.map((n) => [n.id, n.pos]));
    const angle = (/** @type {Ranked} */ r) => {
        let x = 0, z = 0;
        for (const s of r.shared) { const p = at.get(s.id); if (p) { x += p[0]; z += p[2]; } }
        return Math.atan2(z, x);
    };
    const ring = ranked.map((r) => ({ r, a: angle(r) })).sort((x, y) => x.a - y.a);
    const step = (Math.PI * 2) / Math.max(1, ring.length), offset = ring[0]?.a ?? 0;
    ring.forEach(({ r }, i) => {
        const a = offset + i * step, score = r.shared.length, color = r.member ? PARTY_STATUSES[r.member.status ?? 'resonant'].color : '#dfe2e7';
        const id = `p:${r.player.id}`;
        g.nodes.push({
            id, entityId: r.player.id, kind: 'player', label: r.player.name, sub: r.member ? `${score} · ${PARTY_STATUSES[r.member.status ?? 'resonant'].label}` : `${score} shared`,
            color, pos: [Math.cos(a) * 112, 10 + score * 5, Math.sin(a) * 112], size: 3.2 + Math.min(4, score), dim: !score, glow: score > 1,
        });
        for (const s of r.shared) g.edges.push({ a: id, b: s.id, color: BACKBONE, width: 0.4, style: 'solid', flow: score > 1, dim: score < 2 });
    });
    return g;
}
