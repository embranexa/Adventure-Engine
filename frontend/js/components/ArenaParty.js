import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ENTITY_TYPES, PARTY_STATUSES, STEWARD_ROLES } from '../lifecycle.js';
import { archonOf, rankPlayers, wardensOf } from '../lib/complexGraph.js';
import { ArchetypeBadge, Warmth } from './PlayerFields.js';
import { RoleBox, StatusSelect } from './PartyRoster.js';

/**
 * Who is in an adventure under way (the Arena): its ministry, then each player taking part
 * with their archetype, role and what they share with it; those still being recruited after.
 * @param {{ adventure: AdventureRecord }} props
 */
export function ArenaParty({ adventure }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const pooled = useWorkspaceStore((s) => Boolean(s.itemsById[adventure.id]));
    const openInComplex = useWorkspaceStore((s) => s.openInComplex);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const lead = archonOf(adventure);
    const members = rankPlayers(adventure, entities).flatMap((r) => (r.member ? [{ ...r, member: r.member, stage: PARTY_STATUSES[r.member.status ?? 'resonant'].stage }] : []));
    const inIt = members.filter((m) => m.stage !== 'recruitment').sort((x, y) => Number(y.player.id === lead) - Number(x.player.id === lead) || y.score - x.score);
    const waiting = members.filter((m) => m.stage === 'recruitment');
    const held = [...adventure.stewards.filter((s) => s.role !== 'archon'), ...wardensOf(adventure, entities).map((w) => ({ id: w.id, name: w.name, role: /** @type {const} */ ('warden') }))];
    if (!members.length && !held.length) return null;

    const name = (/** @type {Entity} */ p) => html`
        <button className="pr-name" disabled=${!pooled} title=${pooled ? 'Open in the Combinator' : 'Not in the current pool'} onClick=${() => openInComplex(adventure.id, p.id)}>${p.name}</button>`;
    return html`
        <div className="ap">
            ${held.length > 0 && html`<div className="pr-stewards">${held.map((s) => html`
                <button key=${s.role + s.id} disabled=${!pooled} style=${{ '--c': STEWARD_ROLES[s.role].color }} title=${STEWARD_ROLES[s.role].hint} onClick=${() => openInComplex(adventure.id, null)}><small>${STEWARD_ROLES[s.role].label}</small>${s.name}</button>`)}</div>`}
            ${inIt.length > 0 && html`<div className="ol-head">Party <b>${inIt.length}</b></div>`}
            ${inIt.map(({ player, member, shared }) => html`
                <div key=${player.id} className="ap-card" style=${{ '--c': PARTY_STATUSES[member.status ?? 'bonded'].color }}>
                    <div className="ap-top">
                        ${player.id === lead && html`<span className="pr-crown" title="Archon: leads the adventure">♛</span>`}
                        ${name(player)}
                        <${RoleBox} adventure=${adventure} member=${member} onError=${setError} />
                        <${StatusSelect} adventure=${adventure} member=${member} onError=${setError} />
                    </div>
                    <div className="ap-top"><${ArchetypeBadge} id=${player.details.archetype} aspect=${player.details.aspect} /><${Warmth} value=${player.details.warmth} /></div>
                    <div className="ap-res" title="Resonance: what they share with this adventure">
                        <b>⚡ ${shared.length}</b>${shared.map((e) => html`<span key=${e.id}>${ENTITY_TYPES[e.type].glyph} ${e.name}</span>`)}
                    </div>
                </div>
            `)}
            ${waiting.length > 0 && html`
                <div className="ap-waiting">
                    <div className="ol-head">Not yet in</div>
                    ${waiting.map(({ player, member }) => html`
                        <div key=${player.id} className="pr-row" style=${{ '--c': PARTY_STATUSES[member.status ?? 'resonant'].color }}><i></i>${name(player)}<${StatusSelect} adventure=${adventure} member=${member} onError=${setError} /></div>`)}
                </div>`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
