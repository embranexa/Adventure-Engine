import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PARTY_STATUSES, STEWARD_ROLES } from '../lifecycle.js';
import { partyOf, wardensOf } from '../lib/complexGraph.js';
import { dayKey, parseDay } from '../filters.js';

const STATUSES = /** @type {PartyStatus[]} */ (Object.keys(PARTY_STATUSES));

/** Aftermath waits for a completed adventure. @param {AdventureRecord} adventure @param {PartyStatus} s */
const allowed = (adventure, s) => PARTY_STATUSES[s].stage !== 'aftermath' || adventure.phase === 'completed' || adventure.phase === 'decommissioned';

/** A player's status as a menu: the natural next steps first. @param {{ adventure: AdventureRecord, member: LinkedEntity, onError: (e: string | null) => void }} props */
export function StatusSelect({ adventure, member, onError }) {
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const status = member.status ?? 'resonant', s = PARTY_STATUSES[status];
    const next = s.next.filter((k) => allowed(adventure, k));
    const rest = STATUSES.filter((k) => k !== status && !next.includes(k) && allowed(adventure, k));
    const option = (/** @type {PartyStatus} */ k) => html`<option key=${k} value=${k}>${PARTY_STATUSES[k].label}</option>`;
    return html`
        <select className="pr-status" value=${status} style=${{ '--c': s.color }} aria-label=${`${member.name}’s status`} title=${s.hint}
            onChange=${async (/** @type {any} */ e) => onError(await setPartyMember(adventure.id, member.id, { status: e.target.value }))}>
            ${option(status)}
            ${next.length > 0 && html`<optgroup label="Next">${next.map(option)}</optgroup>`}
            <optgroup label="Other">${rest.map(option)}</optgroup>
        </select>
    `;
}

/**
 * An adventure's players with their statuses (and follow-ups due), compact: the Refinery,
 * Crucible and Arena. A name opens that player in the Complex. Nothing when there's no one.
 * @param {{ adventure: AdventureRecord, stewards?: boolean, removable?: boolean }} props
 */
export function PartyRoster({ adventure, stewards = false, removable = false }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const pooled = useWorkspaceStore((s) => Boolean(s.itemsById[adventure.id]));
    const openInComplex = useWorkspaceStore((s) => s.openInComplex);
    const unlinkEntity = useWorkspaceStore((s) => s.unlinkEntity);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const party = partyOf(adventure), today = dayKey(new Date());
    /** @type {{ id: string, name: string, role: StewardRole, type: EntityType }[]} */
    const held = stewards ? [...adventure.stewards, ...wardensOf(adventure, entities).map((w) => ({ id: w.id, name: w.name, type: w.type, role: /** @type {const} */ ('warden') }))] : [];
    if (!party.length && !held.length) return null;

    return html`
        <div className="pr" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
            ${held.length > 0 && html`
                <div className="pr-stewards">
                    ${held.map((s) => html`<button key=${s.role + s.id} disabled=${!pooled} style=${{ '--c': STEWARD_ROLES[s.role].color }} title=${STEWARD_ROLES[s.role].hint}
                        onClick=${() => openInComplex(adventure.id, s.type === 'player' ? s.id : null)}><small>${STEWARD_ROLES[s.role].label}</small>${s.name}</button>`)}
                </div>
            `}
            ${party.map((m) => {
                const open = m.status != null && PARTY_STATUSES[m.status].stage === 'recruitment' && m.status !== 'resisted';
                const due = open && m.follow_up ? m.follow_up : null;
                return html`
                    <div key=${m.id} className="pr-row" style=${{ '--c': PARTY_STATUSES[m.status ?? 'resonant'].color }}>
                        <i></i>
                        <button className="pr-name" disabled=${!pooled} title=${pooled ? 'Open in the Complex' : 'Not in the current pool'} onClick=${() => openInComplex(adventure.id, m.id)}>${m.name}</button>
                        ${due && html`<span className=${`pr-due ${due <= today ? 'late' : ''}`} title="Follow up">◷ ${parseDay(due).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>`}
                        <${StatusSelect} adventure=${adventure} member=${m} onError=${setError} />
                        ${removable && html`<button className="ol-chip-x" aria-label=${`Unlink ${m.name}`} title="Unlink" onClick=${async () => setError(await unlinkEntity(adventure.id, m.id))}>✕</button>`}
                    </div>
                `;
            })}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
