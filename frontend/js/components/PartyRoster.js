import { useEffect, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PARTY_STATUSES, STEWARD_ROLES } from '../lifecycle.js';
import { mayChange } from '../lib/archon.js';
import { archonOf, partyOf, wardensOf } from '../lib/complexGraph.js';
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
            onChange=${async (/** @type {any} */ e) => { if (mayChange(adventure, member, e.target.value)) onError(await setPartyMember(adventure.id, member.id, { status: e.target.value })); else e.target.value = status; }}>
            ${option(status)}
            ${next.length > 0 && html`<optgroup label="Next">${next.map(option)}</optgroup>`}
            <optgroup label="Other">${rest.map(option)}</optgroup>
        </select>
    `;
}

/** What a player does in this adventure, saved on leaving the box. @param {{ adventure: AdventureRecord, member: LinkedEntity, onError: (e: string | null) => void }} props */
export function RoleBox({ adventure, member, onError }) {
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const [draft, setDraft] = useState(member.role ?? '');
    useEffect(() => setDraft(member.role ?? ''), [member.role]);
    return html`<input className="pr-rolebox" value=${draft} maxLength=${60} placeholder="Role" aria-label=${`${member.name}’s role`}
        onInput=${(/** @type {any} */ e) => setDraft(e.target.value)}
        onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') /** @type {HTMLElement} */ (e.target).blur(); if (e.key === 'Escape') setDraft(member.role ?? ''); }}
        onBlur=${async () => { if (draft.trim() !== (member.role ?? '')) onError(await setPartyMember(adventure.id, member.id, { role: draft })); }} />`;
}

/**
 * An adventure's players with their statuses (and follow-ups due), compact: the Refinery
 * and Crucible. A name opens that player in the Combinator. Nothing when there's no one.
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
    const held = stewards ? [...adventure.stewards.filter((s) => s.role !== 'archon'), ...wardensOf(adventure, entities).map((w) => ({ id: w.id, name: w.name, type: w.type, role: /** @type {const} */ ('warden') }))] : [];
    if (!party.length && !held.length) return null;

    return html`
        <div className="pr">
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
                        ${m.id === archonOf(adventure) ? html`<span className="pr-crown" title="Archon: leads the adventure">♛</span>` : html`<i></i>`}
                        <button className="pr-name" disabled=${!pooled} title=${pooled ? 'Open in the Combinator' : 'Not in the current pool'} onClick=${() => openInComplex(adventure.id, m.id)}>${m.name}</button>
                        ${m.role && html`<span className="pr-role">${m.role}</span>`}
                        ${due && html`<span className=${`pr-due ${due <= today ? 'late' : ''}`} title="Follow up">◷ ${parseDay(due).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>`}
                        <${StatusSelect} adventure=${adventure} member=${m} onError=${setError} />
                        ${removable && html`<button className="ol-chip-x" aria-label=${`Unlink ${m.name}`} title="Unlink" onClick=${async () => { if (mayChange(adventure, m, null)) setError(await unlinkEntity(adventure.id, m.id)); }}>✕</button>`}
                    </div>
                `;
            })}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}
