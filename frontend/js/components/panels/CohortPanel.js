import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ARCHETYPES, ARCHETYPE_GROUPS, PARTY_STATUSES, STEWARD_ROLES } from '../../lifecycle.js';
import { entityColor } from '../../lib/lens.js';
import { IDOLS } from '../../lib/idols.js';
import { drawIdolCard } from '../../lib/idolCard.js';
import { Cabinet } from '../Cabinet.js';
import { EntityPicker } from '../EntityPicker.js';
import { Field } from './AdventureEditor.js';
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

const GROUPS = /** @type {(keyof typeof ARCHETYPE_GROUPS)[]} */ (Object.keys(ARCHETYPE_GROUPS));
const IDOL_LOOK = /** @type {import('../Cabinet.js').CabinetStyle} */ ({ shape: 'arch', sealColor: '#f2c14e', seed: 'idols', points: 12 });
const IDOL_SIZE = { minW: 170, cellH: 290 };
const SKILL = /** @type {EntityType[]} */ (['skill']);
const MODES = /** @type {const} */ ({ players: 'Players', idols: 'Idols' });

/** An archetype's card. @param {{ id: Archetype }} props */
function IdolCard({ id }) {
    const ref = useRef(/** @type {HTMLCanvasElement | null} */ (null));
    useEffect(() => {
        let stale = false;
        const draw = () => { if (!stale && ref.current) drawIdolCard(ref.current, id); };
        draw();
        document.fonts.load('600 52px "Saira Condensed"').then(draw, () => {}); // again in its own face
        return () => { stale = true; };
    }, [id]);
    return html`<canvas className="idol-card" ref=${ref} role="img" aria-label=${`${ARCHETYPES[id].label}: ${IDOLS[id].emblem}`}></canvas>`;
}

/** One archetype: its card, what it is, its skills, and who has it. @param {{ id: Archetype, players: Entity[], onPlayer: (id: string) => void }} props */
function IdolSheet({ id, players, onPlayer }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const notes = useWorkspaceStore((s) => s.idols[id]);
    const setIdol = useWorkspaceStore((s) => s.setIdol);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const a = ARCHETYPES[id], d = IDOLS[id];
    const skills = (notes?.skills ?? []).filter((s) => entities.some((e) => e.id === s));
    const linked = new Set(skills.map((s) => entities.find((e) => e.id === s)?.name.toLowerCase()));
    const suggested = d.skills.filter((s) => !linked.has(s.toLowerCase()));
    const add = (/** @type {string} */ skill) => setIdol(id, { skills: [...skills, skill] });
    /** Link the Codex skill of that name, making it if needed. @param {string} name */
    const take = async (name) => {
        const known = entities.find((e) => e.type === 'skill' && e.name.toLowerCase() === name.toLowerCase());
        const res = known ?? await createEntity('skill', { name });
        if (typeof res === 'string') setError(res);
        else { setError(null); add(res.id); }
    };
    return html`
        <${IdolCard} id=${id} />
        <section className="nec-pane" style=${{ '--c': d.color }}>
            <h3>${a.glyph} ${a.label}</h3>
            <dl className="idol-facts">
                <dt>Idol</dt><dd>${a.idol}</dd><dt>Operator</dt><dd>${a.operator}</dd><dt>Medium</dt><dd>${a.medium}</dd>
                <dt>Characters</dt><dd>${d.characters}</dd><dt>Emblem</dt><dd>${d.emblem}</dd>
            </dl>
            <${Field} label="Description" kind="textarea" value=${notes?.description ?? d.description}
                onCommit=${(/** @type {string} */ v) => { setIdol(id, { description: v.trim() && v.trim() !== d.description ? v.trim().slice(0, 5000) : null }); return null; }} />
            <h4>Skills</h4>
            <${EntityPicker} ids=${skills} types=${SKILL} placeholder="+ A skill…" onAdd=${add} onRemove=${(/** @type {string} */ s) => setIdol(id, { skills: skills.filter((x) => x !== s) })} />
            ${suggested.length > 0 && html`<div className="idol-suggest"><small>Suggested</small>${suggested.map((s) => html`<button key=${s} className="cls-layer" title="Link it, making it in the Codex if it isn’t there" onClick=${() => take(s)}>+ ${s}</button>`)}</div>`}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        <section className="nec-pane">
            <h4>Players</h4>
            ${!players.length && html`<p className="nec-dim">No one yet</p>`}
            ${players.map((p) => html`<button key=${p.id} className="aft-head" style=${{ '--c': entityColor(p.id) }} onClick=${() => onPlayer(p.id)}><i></i><b>${p.name}</b><em>${'●'.repeat(p.details.warmth ?? 0)}</em></button>`)}
        </section>
    `;
}

/** The twelve idols, by group. @param {{ onPlayer: (id: string) => void }} props */
function IdolGallery({ onPlayer }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const [picked, setPicked] = useState(/** @type {Archetype} */ ('vanguard'));
    const of = (/** @type {Archetype} */ id) => entities.filter((e) => e.type === 'player' && e.details.archetype === id);
    const groups = useMemo(() => GROUPS.map((group) => ({
        title: ARCHETYPE_GROUPS[group],
        items: IDS.filter((id) => ARCHETYPES[id].group === group).map((id) => ({
            id, label: ARCHETYPES[id].label, sub: ARCHETYPES[id].idol,
            model: { type: 'idol', id, idol: id, color: IDOLS[id].color, on: of(id).length > 0, points: IDS.indexOf(id) + 3, rings: 2 },
        })),
    })), [entities]);
    return html`
        <div className="inv-cab"><${Cabinet} groups=${groups} look=${IDOL_LOOK} options=${IDOL_SIZE} selectedId=${picked} onSelect=${setPicked} label="Idols" /></div>
        <div className="inv-side"><${IdolSheet} key=${picked} id=${picked} players=${of(picked)} onPlayer=${onPlayer} /></div>
    `;
}

/**
 * The Cohort: every player in a cabinet partitioned by archetype, warmest first, as a sigil
 * (points: the archetype; rings: warmth; lit once you've collaborated). Idols shows the archetypes themselves: a statue
 * each, lit once someone has it, and a card.
 */
export function CohortPanel() {
    const entities = useWorkspaceStore((s) => s.entities);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const [picked, setPicked] = useState(/** @type {string | null} */ (null));
    const [mode, setMode] = useState(/** @type {keyof typeof MODES} */ ('players'));

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
    return html`
        <div className="panel-body inventory cohort">
            <div className="cohort-modes" role="tablist">${Object.entries(MODES).map(([k, label]) => html`
                <button key=${k} role="tab" aria-selected=${mode === k} className=${`cls-layer ${mode === k ? 'on' : ''}`} onClick=${() => setMode(/** @type {keyof typeof MODES} */ (k))}>${label}</button>`)}</div>
            <div className="inv-grid">
                ${mode === 'idols' && html`<${IdolGallery} key="idols" onPlayer=${(/** @type {string} */ id) => { setPicked(id); setMode('players'); }} />`}
                ${mode === 'players' && !player && html`<div className="nc-empty">No players yet<small>Players you make in the Codex stand here, by archetype</small></div>`}
                ${mode === 'players' && player && html`
                    <div className="inv-cab" key="cab"><${Cabinet} groups=${groups} look=${LOOK} selectedId=${player.id} onSelect=${setPicked} label="Players" /></div>
                    <div className="inv-side" key="side"><${PlayerSheet} key=${player.id} player=${player} /></div>`}
            </div>
        </div>
    `;
}
