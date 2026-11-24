import { useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ARCHETYPES, ARCHETYPE_GROUPS, PARTY_STATUSES, STEWARD_ROLES } from '../../lifecycle.js';
import { entityColor } from '../../lib/lens.js';
import { Cabinet } from '../Cabinet.js';
import { ArchetypeBadge, PlayerFields } from '../PlayerFields.js';

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'lancet', sealColor: '#7fb2ff', seed: 'cohort', points: 12 };
const IDS = /** @type {Archetype[]} */ (Object.keys(ARCHETYPES));

/** A player's history: the adventures they were linked to, latest first, and how it went.
 *  @param {AdventureRecord[]} adventures @param {string} id */
const recordOf = (adventures, id) => adventures
    .flatMap((a) => a.entities.filter((e) => e.id === id && e.status).map((m) => ({ a, m, status: /** @type {PartyStatus} */ (m.status) })))
    .sort((x, y) => (y.m.status_at ?? '').localeCompare(x.m.status_at ?? ''));

/** One player: profile, and what you've done together. @param {{ player: Entity }} props */
function PlayerSheet({ player }) {
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
        <section className="nec-pane">
            <div className="cx-detail-head"><h3>${player.name}</h3>
                <button className="cls-layer" onClick=${() => { selectEntity(player.id); showPanel('codex'); }}>Codex ⟶</button></div>
            <${ArchetypeBadge} id=${player.details.archetype} />
            ${player.description && html`<p className="cpx-bio">${player.description}</p>`}
            <${PlayerFields} player=${player} save=${save} onError=${setError} />
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        <section className="nec-pane">
            <h4>Together</h4>
            ${!record.length && html`<p className="nec-dim">No adventures yet</p>`}
            ${record.map(({ a, m, status }) => html`
                <div key=${a.id} className="aft" style=${{ '--c': PARTY_STATUSES[status].color }}>
                    <button className="aft-head" disabled=${!itemsById[a.id]} title=${itemsById[a.id] ? 'Open in the Complex' : 'Not in the current pool'} onClick=${() => openInComplex(a.id, player.id)}>
                        <i></i><b>${a.title}</b><em>${PARTY_STATUSES[status].label}</em></button>
                    ${m.impact && html`<p className="ana-notes-read">${m.impact}</p>`}
                </div>
            `)}
            ${roles.length > 0 && html`<h4>Stewardships</h4>`}
            ${roles.map((r) => html`<div key=${r.key} className="aft-head" style=${{ '--c': STEWARD_ROLES[r.role].color }}><i></i><b>${r.name}</b><em>${STEWARD_ROLES[r.role].label}</em></div>`)}
        </section>
    `;
}

/**
 * The Cohort: every player in a cabinet partitioned by archetype, warmest first, as a sigil
 * (points: the archetype; rings: warmth; lit once you've collaborated).
 */
export function CohortPanel() {
    const entities = useWorkspaceStore((s) => s.entities);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const [picked, setPicked] = useState(/** @type {string | null} */ (null));

    const groups = useMemo(() => {
        const players = entities.filter((e) => e.type === 'player')
            .sort((x, y) => (y.details.warmth ?? 0) - (x.details.warmth ?? 0) || x.name.localeCompare(y.name));
        const proven = new Set(adventures.flatMap((a) => a.entities.filter((e) => e.status && PARTY_STATUSES[e.status].stage !== 'recruitment').map((e) => e.id)));
        const item = (/** @type {Entity} */ p) => {
            const id = p.details.archetype, warmth = p.details.warmth ?? 0;
            return {
                id: p.id, label: p.name, sub: html`<span title=${`Warmth ${warmth} of 5`}>${'●'.repeat(warmth)}${'○'.repeat(5 - warmth)}</span>`,
                model: { type: 'sigil', id: p.id, color: entityColor(p.id), on: proven.has(p.id), points: id ? IDS.indexOf(id) + 3 : 3, rings: warmth, glyph: id ? ARCHETYPES[id].glyph : '☉' },
            };
        };
        const shelf = (/** @type {Archetype | undefined} */ id) => players.filter((p) => p.details.archetype === id).map(item);
        return [...IDS.map((id) => ({ title: `${ARCHETYPE_GROUPS[ARCHETYPES[id].group]} · ${ARCHETYPES[id].label}`, items: shelf(id) })), { title: 'No archetype', items: shelf(undefined) }]
            .filter((g) => g.items.length);
    }, [entities, adventures]);

    const all = groups.flatMap((g) => g.items);
    const player = entities.find((e) => e.id === (all.some((i) => i.id === picked) ? picked : all[0]?.id));
    if (!player) return html`<div className="panel-body inventory"><div className="nc-empty">No players yet<small>Players you make in the Codex stand here, by archetype</small></div></div>`;
    return html`
        <div className="panel-body inventory"><div className="inv-grid">
            <div className="inv-cab"><${Cabinet} groups=${groups} look=${LOOK} selectedId=${player.id} onSelect=${setPicked} label="Players" /></div>
            <div className="inv-side"><${PlayerSheet} key=${player.id} player=${player} /></div>
        </div></div>
    `;
}
