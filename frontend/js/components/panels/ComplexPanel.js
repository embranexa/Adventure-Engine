import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ENTITY_TYPES, PARTY_STATUSES, STEWARD_ROLES } from '../../lifecycle.js';
import { buildComplex, buildResonance, partyOf, rankPlayers, wardensOf } from '../../lib/complexGraph.js';
import { EntityPicker } from '../EntityPicker.js';
import { ArchetypeBadge, Warmth } from '../PlayerFields.js';
import { Field } from './AdventureEditor.js';

const STATUSES = /** @type {PartyStatus[]} */ (Object.keys(PARTY_STATUSES));
const MODES = /** @type {const} */ ({ complex: 'Complex', resonance: 'Resonance' });
const STAGES = /** @type {const} */ ({ recruitment: 'Recruitment', active: 'Active', aftermath: 'Aftermath' });

/** @param {string} iso */
const day = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** A player's status changes in this party. @param {{ log: PartyLogEntry[], playerId: string }} props */
function History({ log, playerId }) {
    const rows = log.filter((r) => r.player_id === playerId);
    if (!rows.length) return null;
    const name = (/** @type {PartyStatus | null} */ s, /** @type {string} */ none) => (s
        ? html`<b style=${{ color: PARTY_STATUSES[s].color }}>${PARTY_STATUSES[s].label}</b>` : none);
    return html`
        <div className="cpx-history">
            ${rows.map((r) => html`<div key=${r.id}><time>${day(r.at)}</time>${name(r.from, 'joined')} ⟶ ${name(r.to, 'left')}</div>`)}
        </div>
    `;
}

/**
 * A player in this adventure: their profile, what they share with it, and their place in
 * the party (status, proposal note, follow-up, history).
 * @param {{ adventure: AdventureRecord, player: Entity, log: PartyLogEntry[], onBack: () => void }} props
 */
function PlayerDetail({ adventure, player, log, onBack }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const unlinkEntity = useWorkspaceStore((s) => s.unlinkEntity);
    const setSteward = useWorkspaceStore((s) => s.setSteward);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const { shared, member } = rankPlayers(adventure, entities).find((r) => r.player.id === player.id) ?? { shared: [], member: null };
    const status = member?.status ?? null;
    const done = adventure.phase === 'completed' || adventure.phase === 'decommissioned';
    const roles = adventure.stewards.filter((s) => s.id === player.id).map((s) => s.role);

    /** @param {{ status?: PartyStatus, note?: string | null, follow_up?: string | null }} changes */
    const save = async (changes) => {
        const err = await setPartyMember(adventure.id, player.id, changes);
        setError(err);
        return err;
    };
    const allowed = (/** @type {PartyStatus} */ s) => done || PARTY_STATUSES[s].stage !== 'aftermath';
    const next = status ? PARTY_STATUSES[status].next.filter(allowed) : [];

    return html`
        <div className="cpx-detail">
            <div className="cx-detail-head">
                <button className="cls-layer" onClick=${onBack}>← Back</button>
                <button className="cls-layer" onClick=${() => { selectEntity(player.id); showPanel('codex'); }} title="Edit the profile in the Codex">Codex ⟶</button>
            </div>
            <div className="cpx-name">☉ ${player.name}</div>
            <div className="cpx-profile"><${ArchetypeBadge} id=${player.details.archetype} /><${Warmth} value=${player.details.warmth} /></div>
            ${(player.details.tags?.length ?? 0) > 0 && html`<div className="cpx-tags">${player.details.tags?.map((t) => html`<span key=${t}>${t}</span>`)}</div>`}
            <div className="cpx-contact">
                ${[player.details.handle, player.details.email, player.details.phone].filter(Boolean).map((c) => html`<span key=${c}>${c}</span>`)}
            </div>
            ${player.description && html`<p className="cpx-bio">${player.description}</p>`}

            <div className="cx-linked-head">Shares <b>${shared.length}</b></div>
            ${shared.length
                ? html`<div className="cpx-shared">${shared.map((e) => html`<span key=${e.id}>${ENTITY_TYPES[e.type].glyph} ${e.name}</span>`)}</div>`
                : html`<div className="cx-empty-line">Nothing in common yet</div>`}

            <div className="cx-linked-head">Bond</div>
            ${!status && html`<button className="btn" onClick=${() => save({ status: 'resonant' })}>✦ Promote to resonant</button>`}
            ${status && html`
                <div className="cpx-status" style=${{ '--c': PARTY_STATUSES[status].color }} title=${PARTY_STATUSES[status].hint}>
                    <i></i><b>${PARTY_STATUSES[status].label}</b>${member?.status_at && html`<small>since ${day(member.status_at)}</small>`}
                </div>
                <div className="cpx-steps">
                    ${next.map((s) => html`<button key=${s} className="btn" style=${{ '--c': PARTY_STATUSES[s].color }} title=${PARTY_STATUSES[s].hint} onClick=${() => save({ status: s })}>⟶ ${PARTY_STATUSES[s].label}</button>`)}
                    <select className="pl-select" value="" aria-label="Any status" onChange=${(/** @type {any} */ e) => e.target.value && save({ status: e.target.value })}>
                        <option value="">Other…</option>
                        ${STATUSES.filter((s) => s !== status && !next.includes(s)).map((s) => html`
                            <option key=${s} value=${s} disabled=${!allowed(s)}>${PARTY_STATUSES[s].label}${allowed(s) ? '' : ' (when completed)'}</option>`)}
                    </select>
                </div>
                <${Field} key=${`${player.id}-note`} label="Proposal and notes" kind="textarea" value=${member?.note ?? ''} onCommit=${(/** @type {string} */ v) => save({ note: v })} />
                <label className="ae-field">
                    <span className="ae-label">Follow up</span>
                    <input className="pl-select" type="date" value=${member?.follow_up ?? ''} onChange=${(/** @type {any} */ e) => save({ follow_up: e.target.value || null })} />
                </label>
            `}

            <div className="cx-linked-head">Steward</div>
            <div className="cpx-steps">
                ${/** @type {('herald' | 'commissioner')[]} */ (['herald', 'commissioner']).map((role) => html`
                    <button key=${role} className=${`cls-layer ${roles.includes(role) ? 'on' : ''}`} title=${STEWARD_ROLES[role].hint}
                        style=${roles.includes(role) ? { color: STEWARD_ROLES[role].color } : undefined}
                        onClick=${async () => setError(await setSteward(adventure.id, player.id, role, !roles.includes(role)))}>${STEWARD_ROLES[role].label}</button>`)}
            </div>
            <${History} log=${log} playerId=${player.id} />
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            ${status && html`<div className="cx-actions"><button className="btn ghost cx-delete" onClick=${async () => setError(await unlinkEntity(adventure.id, player.id))}>✕ Remove from party</button></div>`}
        </div>
    `;
}

/** The stewards and cohort, editable. @param {{ adventure: AdventureRecord, onOpen: (playerId: string) => void }} props */
function Roster({ adventure, onOpen }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const setSteward = useWorkspaceStore((s) => s.setSteward);
    const setWarden = useWorkspaceStore((s) => s.setWarden);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const party = partyOf(adventure), site = entities.find((e) => e.id === adventure.site_id) ?? null;
    const wardens = wardensOf(adventure, entities);

    return html`
        <div className="cpx-detail">
            <div className="cx-linked-head">Cohort <b>${party.length}</b></div>
            ${Object.entries(STAGES).map(([stage, label]) => {
                const rows = party.filter((m) => PARTY_STATUSES[m.status ?? 'resonant'].stage === stage);
                return rows.length > 0 && html`
                    <div key=${stage} className="cpx-group"><small>${label}</small>
                        ${rows.map((m) => {
                            const s = PARTY_STATUSES[m.status ?? 'resonant'];
                            return html`<button key=${m.id} className="cpx-row" style=${{ '--c': s.color }} onClick=${() => onOpen(m.id)}><i></i><b>${m.name}</b><em>${s.label}</em></button>`;
                        })}
                    </div>`;
            })}
            <${EntityPicker} ids=${party.map((m) => m.id)} chips=${false} types=${['player']} placeholder="+ Add a player as resonant…"
                onAdd=${async (/** @type {string} */ id) => setError(await setPartyMember(adventure.id, id, {}))} />

            ${/** @type {('herald' | 'commissioner')[]} */ (['herald', 'commissioner']).map((role) => html`
                <div key=${role} className="ol">
                    <div className="cx-linked-head" style=${{ color: STEWARD_ROLES[role].color }}>${STEWARD_ROLES[role].label}s</div>
                    <${EntityPicker} ids=${adventure.stewards.filter((s) => s.role === role).map((s) => s.id)} types=${['player', 'organization']} placeholder=${`+ ${STEWARD_ROLES[role].hint}…`}
                        onAdd=${async (/** @type {string} */ id) => setError(await setSteward(adventure.id, id, role, true))}
                        onRemove=${async (/** @type {string} */ id) => setError(await setSteward(adventure.id, id, role, false))} />
                </div>`)}
            <div className="ol">
                <div className="cx-linked-head" style=${{ color: STEWARD_ROLES.warden.color }}>Wardens</div>
                ${site
                    ? html`<${EntityPicker} ids=${wardens.map((w) => w.id)} types=${['player', 'organization']} placeholder=${`+ Who keeps ${site.name}…`}
                        onAdd=${async (/** @type {string} */ id) => setError(await setWarden(site.id, id, true))}
                        onRemove=${async (/** @type {string} */ id) => setError(await setWarden(site.id, id, false))} />`
                    : html`<div className="cx-empty-line">Link a site in the Refinery to give it wardens</div>`}
            </div>
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </div>
    `;
}

/** Every player by resonance, with a button to promote. @param {{ adventure: AdventureRecord, onOpen: (playerId: string) => void }} props */
function ResonanceList({ adventure, onOpen }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const [query, setQuery] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const ranked = useMemo(() => rankPlayers(adventure, entities), [adventure, entities]);
    const q = query.trim().toLowerCase();
    const shown = ranked.filter(({ player: p }) => !q || [p.name, p.details.archetype ?? '', ...(p.details.tags ?? [])].some((t) => t.toLowerCase().includes(q)));
    const anchors = adventure.entities.filter((e) => e.type !== 'player').length;

    return html`
        <div className="cpx-detail">
            ${!anchors && html`<div className="ae-hint">Nothing to resonate with: link deities, sites, organizations or skills to this adventure in the Refinery</div>`}
            <input className="cx-search" value=${query} placeholder="Name, archetype or tag…" aria-label="Search players" onInput=${(/** @type {any} */ e) => setQuery(e.target.value)} />
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            ${!shown.length && html`<div className="cx-empty-line">${ranked.length ? 'Nobody matches' : 'No players yet: make them in the Codex'}</div>`}
            ${shown.map(({ player, shared, score, member }) => html`
                <div key=${player.id} className="cpx-card">
                    <button className="cpx-card-main" onClick=${() => onOpen(player.id)}>
                        <span><b>${player.name}</b><em title="Shared entities, plus a tenth of its warmth">⚡ ${score.toFixed(1)}</em></span>
                        <span><${ArchetypeBadge} id=${player.details.archetype} /></span>
                        <small>${shared.length ? shared.map((e) => `${ENTITY_TYPES[e.type].glyph} ${e.name}`).join('  ') : 'Nothing shared'}</small>
                    </button>
                    ${member?.status
                        ? html`<span className="cpx-card-status" style=${{ color: PARTY_STATUSES[member.status].color }}>${PARTY_STATUSES[member.status].label}</span>`
                        : html`<button className="btn" title="Promote to resonant" aria-label=${`Promote ${player.name} to resonant`} onClick=${async () => setError(await setPartyMember(adventure.id, player.id, { status: 'resonant' }))}>✦</button>`}
                </div>
            `)}
        </div>
    `;
}

/**
 * The Complex: how players connect to the selected adventure. Complex mode shows its
 * substrate (adventure, site, party), stewards and cohort; Resonance mode ranks every
 * player by the entities they share with it. Follows the selection like the node card.
 */
export function ComplexPanel() {
    const item = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId] : null));
    const entities = useWorkspaceStore((s) => s.entities);
    const partyHistory = useWorkspaceStore((s) => s.partyHistory);
    const adventure = item?.kind === 'adventure' ? item : null;

    const [mode, setMode] = useState(/** @type {keyof typeof MODES} */ ('complex'));
    const [playerId, setPlayerId] = useState(/** @type {string | null} */ (null));
    const [nodeId, setNodeId] = useState(/** @type {string | null} */ (null));
    const [log, setLog] = useState(/** @type {PartyLogEntry[]} */ ([]));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));

    useEffect(() => { setPlayerId(null); setNodeId(null); }, [adventure?.id]);

    const graph = useMemo(() => (!adventure ? { nodes: [], edges: [] } : mode === 'complex' ? buildComplex(adventure, entities) : buildResonance(adventure, entities)),
        [adventure, entities, mode]);

    // the history follows the party
    const statuses = adventure ? partyOf(adventure).map((m) => m.id + m.status).join() : '';
    useEffect(() => {
        setLog([]);
        if (!adventure) return;
        let stale = false;
        partyHistory(adventure.id).then((rows) => { if (!stale) setLog(rows); });
        return () => { stale = true; };
    }, [adventure?.id, statuses]);

    // another panel asked for a player (openInComplex)
    const focus = useWorkspaceStore((s) => s.complexFocus);
    useEffect(() => { if (focus && focus.adventureId === adventure?.id) open(focus.playerId); }, [focus]);

    /** Open a player, from a list or the scene. @param {string | null} id */
    const open = (id) => { setPlayerId(id); setNodeId(id ? `p:${id}` : null); };

    const select = useRef((/** @type {string | null} */ id) => {});
    select.current = (id) => {
        const node = graph.nodes.find((n) => n.id === id);
        const entity = node?.entityId ? entities.find((e) => e.id === node.entityId) : null;
        setNodeId(id);
        setPlayerId(entity?.type === 'player' ? entity.id : null);
    };

    useEffect(() => {
        let disposed = false;
        import('../../lib/complexScene.js')
            .then(({ ComplexScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new ComplexScene(hostRef.current, { onSelect: (/** @type {string | null} */ id) => select.current(id) });
                setStatus('ready');
            })
            .catch((err) => {
                console.error('[complex] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => { disposed = true; sceneRef.current?.dispose(); sceneRef.current = null; };
    }, []);

    const shownKey = `${adventure?.id}|${mode}`, lastKey = useRef('');
    useEffect(() => {
        if (!sceneRef.current) return;
        sceneRef.current.update(graph, { selectedId: nodeId, refit: lastKey.current !== shownKey });
        lastKey.current = shownKey;
    }, [graph, nodeId, status, shownKey]);

    const player = playerId ? entities.find((e) => e.id === playerId && e.type === 'player') ?? null : null;

    return html`
        <div className="panel-body complex"><div className="cpx">
            <div className="cpx-scene">
                <div className="alm-host" ref=${hostRef}></div>
                ${status !== 'ready' && html`<div className="map-status">${status === 'loading' ? 'Gathering the complex…' : 'The Complex failed to load (see console)'}</div>`}
                ${status === 'ready' && !adventure && html`
                    <div className="nc-empty alm-overlay-empty">${item ? 'Raw events have no party' : 'Nothing selected'}
                        <small>${item ? 'Pass it first: it becomes ore' : 'Select an adventure to see who it connects'}</small></div>`}
                ${adventure && html`
                    <div className="alm-hud" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                        ${Object.entries(MODES).map(([k, label]) => html`<button key=${k} className=${`cls-layer ${mode === k ? 'on' : ''}`} aria-pressed=${mode === k}
                            onClick=${() => { setMode(/** @type {keyof typeof MODES} */ (k)); open(null); }}>${label}</button>`)}
                        ${adventure.collaboration && html`<span className="cpx-flag" title="Someone is bonded, emergent or in the aftermath">☉ Collaboration</span>`}
                    </div>
                    <button className="btn view-home" title="Frame everything" onClick=${() => sceneRef.current?.fit()}>⌂</button>`}
            </div>
            ${adventure && html`
                <aside className="cpx-side">
                    ${player
                        ? html`<${PlayerDetail} key=${player.id} adventure=${adventure} player=${player} log=${log} onBack=${() => open(null)} />`
                        : mode === 'complex'
                            ? html`<${Roster} key=${adventure.id} adventure=${adventure} onOpen=${open} />`
                            : html`<${ResonanceList} key=${adventure.id} adventure=${adventure} onOpen=${open} />`}
                </aside>`}
        </div></div>
    `;
}
