import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ARCHETYPES, ATTRIBUTES, ORDERS, PARTY_STATUSES, STEWARD_ROLES } from '../../lifecycle.js';
import { entityColor } from '../../lib/lens.js';
import { ASPECTS, PARAGONS, SHADOWS, facing, paragonColor } from '../../lib/paragons.js';
import { drawParagonCard } from '../../lib/paragonCard.js';
import { Cabinet } from '../Cabinet.js';
import { EntityPicker } from '../EntityPicker.js';
import { Field } from './AdventureEditor.js';
import { ArchetypeBadge, PlayerFields } from '../PlayerFields.js';

const IDS = /** @type {Archetype[]} */ (Object.keys(ARCHETYPES));

/** A player's history: the adventures they were linked to, latest first, and how it went.
 *  @param {AdventureRecord[]} adventures @param {string} id */
const recordOf = (adventures, id) => adventures
    .flatMap((a) => a.entities.filter((e) => e.id === id && e.status).map((m) => ({ a, m, status: /** @type {PartyStatus} */ (m.status) })))
    .sort((x, y) => (y.m.status_at ?? '').localeCompare(x.m.status_at ?? ''));

/** One player: profile, and what you've done together. @param {{ player: Entity, onBack: () => void }} props */
function PlayerSheet({ player, onBack }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const updateEntity = useWorkspaceStore((s) => s.updateEntity);
    const openInComplex = useWorkspaceStore((s) => s.openInComplex);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const record = recordOf(adventures, player.id);
    const roles = [
        ...adventures.flatMap((a) => a.stewards.filter((s) => s.id === player.id).map((s) => ({ key: a.id + s.role, role: /** @type {StewardRole} */ (s.role), name: a.title ?? 'Untitled' }))),
        ...entities.filter((e) => e.wardens.includes(player.id)).map((e) => ({ key: e.id, role: /** @type {StewardRole} */ ('warden'), name: e.name })),
    ];
    const save = async (/** @type {EntityChanges} */ changes) => { const err = await updateEntity(player.id, changes); setError(err); return err; };

    return html`
        <div><button className="cls-layer" onClick=${onBack}>⟵ ${player.details.archetype ? ARCHETYPES[player.details.archetype].label : 'Archetype'}</button></div>
        <section className="nec-pane">
            <div className="cx-detail-head"><h3>${player.name}</h3>
                <button className="cls-layer" onClick=${() => { selectEntity(player.id); showPanel('codex'); }}>Codex ⟶</button></div>
            <${ArchetypeBadge} id=${player.details.archetype} aspect=${player.details.aspect} />
            ${player.description && html`<p className="cpx-bio">${player.description}</p>`}
            <${PlayerFields} player=${player} save=${save} onError=${setError} />
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        <section className="nec-pane">
            <h4>Together</h4>
            ${!record.length && html`<p className="nec-dim">No adventures yet</p>`}
            ${record.map(({ a, m, status }) => html`
                <div key=${a.id} className="aft" style=${{ '--c': PARTY_STATUSES[status].color }}>
                    <button className="aft-head" disabled=${!itemsById[a.id]} title=${itemsById[a.id] ? 'Open in the Combinator' : 'Not in the current pool'} onClick=${() => openInComplex(a.id, player.id)}>
                        <i></i><b>${a.title}</b><em>${PARTY_STATUSES[status].label}</em></button>
                    ${m.impact && html`<p className="ana-notes-read">${m.impact}</p>`}
                </div>
            `)}
            ${roles.length > 0 && html`<h4>Stewardships</h4>`}
            ${roles.map((r) => html`<div key=${r.key} className="aft-head" style=${{ '--c': STEWARD_ROLES[r.role].color }}><i></i><b>${r.name}</b><em>${STEWARD_ROLES[r.role].label}</em></div>`)}
        </section>
    `;
}

const GROUPS = /** @type {Order[]} */ (Object.keys(ORDERS));
/** @type {Record<Aspect, import('../Cabinet.js').CabinetStyle>} */
const LOOKS = {
    constructive: { shape: 'arch', sealColor: '#f2c14e', seed: 'paragons', points: 12, moral: 'virtue' },
    exploitative: { shape: 'arch', sealColor: '#e0242e', seed: 'vice', points: 13, dim: true, moral: 'vice', wash: '#d01f2a' },
};
const PARAGON_SIZE = { cellH: 290, minCols: 3, maxCols: 3 };   // an order is three, so no spare alcoves
const ASPECT_IDS = /** @type {Aspect[]} */ (Object.keys(ASPECTS));
const SKILL = /** @type {EntityType[]} */ (['skill']);

/** An archetype's card: click to turn the whole Cohort to the other aspect.
 *  @param {{ id: Archetype, aspect: Aspect, onFlip: () => void }} props */
function ParagonCard({ id, aspect, onFlip }) {
    const ref = useRef(/** @type {HTMLCanvasElement | null} */ (null));
    useEffect(() => {
        let stale = false;
        const draw = () => { if (!stale && ref.current) drawParagonCard(ref.current, id, aspect); };
        draw();
        document.fonts.load('600 52px "Saira Condensed"').then(draw, () => {}); // again in its own face
        return () => { stale = true; };
    }, [id, aspect]);
    return html`<button key=${aspect} className="paragon-flip" title="Turn it over" aria-label=${`${facing(id, aspect).label}: ${PARAGONS[id].emblem}. Turn it over`} onClick=${onFlip}><canvas className="paragon-card" ref=${ref}></canvas></button>`;
}

/** One archetype in an aspect: its card, what it is, its skills, and who has it.
 *  @param {{ id: Archetype, aspect: Aspect, players: Entity[], onPlayer: (id: string) => void, onFlip: () => void }} props */
function ParagonSheet({ id, aspect, players, onPlayer, onFlip }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const notes = useWorkspaceStore((s) => s.paragons[id]);
    const setParagon = useWorkspaceStore((s) => s.setParagon);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const dark = aspect === 'exploitative', f = dark ? SHADOWS[id] : null;
    const a = ARCHETYPES[id], d = PARAGONS[id], order = ORDERS[a.order];
    const skills = (notes?.skills ?? []).filter((s) => entities.some((e) => e.id === s));
    const linked = new Set(skills.map((s) => entities.find((e) => e.id === s)?.name.toLowerCase()));
    const suggested = d.skills.filter((s) => !linked.has(s.toLowerCase()));
    const add = (/** @type {string} */ skill) => setParagon(id, { skills: [...skills, skill] });
    /** Link the Codex skill of that name, making it (fed by this archetype's attributes) if needed. @param {string} name */
    const take = async (name) => {
        const known = entities.find((e) => e.type === 'skill' && e.name.toLowerCase() === name.toLowerCase());
        const res = known ?? await createEntity('skill', { name, details: { attributes: a.attributes } });
        if (typeof res === 'string') setError(res);
        else { setError(null); add(res.id); }
    };
    return html`
        <${ParagonCard} id=${id} aspect=${aspect} onFlip=${onFlip} />
        <section className="nec-pane" style=${{ '--c': dark ? ASPECTS.exploitative.color : d.color }}>
            <h3>${dark ? html`<i className="pl-rev">${a.glyph}</i>` : a.glyph} ${(f ?? a).label} <em className="paragon-verb">${(f ?? a).verb}</em></h3>
            <dl className="paragon-facts">
                <dt>Paragon</dt><dd>${a.paragon}</dd><dt>Order</dt><dd>${order.label}: ${order.is}</dd>
                <dt>Organ</dt><dd>${a.organ}</dd><dt>Medium</dt><dd>${a.medium}</dd>
                <dt>Operator</dt><dd>${(f ?? a).operator}</dd><dt>Variants</dt><dd>${(f ?? d).variants}</dd>
                <dt>Exemplars</dt><dd>${(f ?? d).exemplars}</dd>
                <dt>Attributes</dt><dd>${a.attributes.map((x) => html`<span key=${x} className="paragon-attr" title=${ATTRIBUTES[x].hint}>❖ ${ATTRIBUTES[x].label}</span>`)}</dd>
            </dl>
            ${f && html`<p className="cpx-bio">${f.description}</p>`}
            ${!f && html`
            <${Field} label="Description" kind="textarea" value=${notes?.description ?? d.description}
                onCommit=${(/** @type {string} */ v) => { setParagon(id, { description: v.trim() && v.trim() !== d.description ? v.trim().slice(0, 5000) : null }); return null; }} />
            <h4>Skills</h4>
            <${EntityPicker} ids=${skills} types=${SKILL} placeholder="+ A skill…" onAdd=${add} onRemove=${(/** @type {string} */ s) => setParagon(id, { skills: skills.filter((x) => x !== s) })} />
            ${suggested.length > 0 && html`<div className="paragon-suggest"><small>Suggested</small>${suggested.map((s) => html`<button key=${s} className="cls-layer" title="Link it, making it in the Codex if it isn’t there" onClick=${() => take(s)}>+ ${s}</button>`)}</div>`}`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        <section className="nec-pane">
            <h4>Players</h4>
            ${!players.length && html`<p className="nec-dim">No one yet</p>`}
            ${players.map((p) => html`<button key=${p.id} className="aft-head" style=${{ '--c': entityColor(p.id) }} onClick=${() => onPlayer(p.id)}><i></i><b>${p.name}</b><em>${'●'.repeat(p.details.warmth ?? 0)}</em></button>`)}
        </section>
    `;
}

const PIPS = 5;

/** How many players have an archetype, as pips. @param {number} n */
const count = (n) => html`<span className="paragon-count" title=${`${n} player${n === 1 ? '' : 's'}`}>${n ? '☉'.repeat(Math.min(n, PIPS)) : '·'}${n > PIPS ? ` +${n - PIPS}` : ''}</span>`;

/**
 * The Cohort: the twelve archetypes by order, a statue each, in one of two aspects (virtue or
 * vice). A statue lights once a player has its archetype in that aspect (not judged: virtue);
 * the sheet has its card and its players, warmest first. A player opens in place of the card.
 */
export function CohortPanel() {
    const entities = useWorkspaceStore((s) => s.entities);
    const [aspect, setAspect] = useState(/** @type {Aspect} */ ('constructive'));
    const [picked, setPicked] = useState(/** @type {Archetype} */ ('vanguard'));
    const [playerId, setPlayerId] = useState(/** @type {string | null} */ (null));
    const dark = aspect === 'exploitative';
    const players = useMemo(() => entities.filter((e) => e.type === 'player')
        .sort((x, y) => (y.details.warmth ?? 0) - (x.details.warmth ?? 0) || x.name.localeCompare(y.name)), [entities]);
    const of = (/** @type {Archetype} */ id) => players.filter((e) => e.details.archetype === id && (e.details.aspect ?? 'constructive') === aspect);
    const groups = useMemo(() => GROUPS.map((group) => ({
        title: `${ORDERS[group].label} · ${ORDERS[group].is}`, theme: group, accent: dark ? ASPECTS.exploitative.color : ORDERS[group].color,
        items: IDS.filter((id) => ARCHETYPES[id].order === group).map((id) => ({
            id, label: facing(id, aspect).label, sub: html`${facing(id, aspect).verb} ${count(of(id).length)}`,
            model: { type: 'paragon', id, paragon: id, dark, color: paragonColor(id, aspect), on: of(id).length > 0, points: IDS.indexOf(id) + 3, rings: 2 },
        })),
    })), [players, aspect]);
    const player = players.find((e) => e.id === playerId);
    const turn = (/** @type {Aspect} */ to) => { setAspect(to); setPlayerId(null); };
    return html`
        <div className=${`panel-body inventory cohort ${dark ? 'vice' : 'virtue'}`}>
            <div className="cohort-modes" role="tablist" aria-label="Aspect">${ASPECT_IDS.map((k) => html`
                <button key=${k} role="tab" aria-selected=${aspect === k} className=${`cls-layer ${aspect === k ? 'on' : ''}`} style=${{ '--c': ASPECTS[k].color }} title=${ASPECTS[k].hint} onClick=${() => turn(k)}>${ASPECTS[k].label}</button>`)}</div>
            <div className="inv-grid">
                <div className="inv-cab"><${Cabinet} key=${aspect} groups=${groups} look=${LOOKS[aspect]} options=${PARAGON_SIZE} selectedId=${picked} label="Paragons"
                    onSelect=${(/** @type {Archetype} */ id) => { setPicked(id); setPlayerId(null); }} /></div>
                <div className="inv-side">${player
                    ? html`<${PlayerSheet} key=${player.id} player=${player} onBack=${() => setPlayerId(null)} />`
                    : html`<${ParagonSheet} key=${picked} id=${picked} aspect=${aspect} players=${of(picked)} onPlayer=${setPlayerId} onFlip=${() => turn(dark ? 'constructive' : 'exploitative')} />`}</div>
            </div>
        </div>
    `;
}
