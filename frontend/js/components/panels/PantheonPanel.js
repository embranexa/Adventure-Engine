import { useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES, SEEKING_PHASES } from '../../lifecycle.js';
import { DEITY_FORMS, FAVOR_STATES, factorOf, favorOf, favorState, signed } from '../../lib/favor.js';
import { entityColor } from '../../lib/lens.js';
import { Cabinet } from '../Cabinet.js';
import { Factor } from '../Factor.js';

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'arch', sealColor: '#c86bf0', seed: 'pantheon', points: 9 };
const SIZE = { cellH: 320, minW: 210, maxCols: 3 };
const FORMS = /** @type {DeityForm[]} */ (Object.keys(DEITY_FORMS));
/** Their places are fixed: by form, then the formless by name. @param {Entity} d */
const place = (d) => (d.details.form ? FORMS.indexOf(d.details.form) : FORMS.length);
const MAX_DEMAND = 99;

/** One adventure and how much it gives. @param {{ a: AdventureRecord, deity: Entity, note: string, color: string }} props */
function Offering({ a, deity, note, color }) {
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const inPool = useWorkspaceStore((s) => Boolean(s.itemsById[a.id]));
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    return html`<button className="aft-head pan-row" style=${{ '--c': color }} disabled=${!inPool} title=${inPool ? 'Select it' : 'Not in the current pool'}
        onClick=${() => { selectItem(a.id, 'pantheon'); showPanel(a.phase === 'completed' ? 'treasury' : 'node'); }}>
        <i></i><b>${a.title ?? 'Untitled'}</b><${Factor} value=${factorOf(a, deity.id)} name=${deity.name} /><em>${note}</em></button>`;
}

/** One deity: its demand, what it has been offered, and what would appease it. @param {{ deity: Entity }} props */
function DeitySheet({ deity }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const updateEntity = useWorkspaceStore((s) => s.updateEntity);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const f = favorOf(deity, adventures), state = FAVOR_STATES[f.state];
    const linked = adventures.filter((a) => factorOf(a, deity.id)).sort((x, y) => factorOf(y, deity.id) - factorOf(x, deity.id));
    const unsealed = linked.filter((a) => a.phase === 'completed' && !a.enshrining?.sealed_at);
    const seeking = linked.filter((a) => SEEKING_PHASES.includes(a.phase));
    const demand = async (/** @type {number} */ n) => setError(await updateEntity(deity.id, { details: { demand: Math.max(0, Math.min(MAX_DEMAND, n)) } }));
    /** What favor it would leave. @param {AdventureRecord} a */
    const after = (a) => { const n = f.favor + factorOf(a, deity.id); return `⟶ ${signed(n)} ${FAVOR_STATES[favorState(n)].label.toLowerCase()}`; };
    /** @param {AdventureRecord} a */
    const tint = (a) => FAVOR_STATES[favorState(f.favor + factorOf(a, deity.id))].color;

    return html`
        <section className="nec-pane" style=${{ '--c': state.color }}>
            <div className="cx-detail-head"><h3>${deity.name}</h3>
                <button className="cls-layer" onClick=${() => { selectEntity(deity.id); showPanel('codex'); }}>Codex ⟶</button></div>
            ${deity.description && html`<p className="cpx-bio">${deity.description}</p>`}
            <div className="pan-favor"><b>${signed(f.favor)}</b><span>${state.label}<small>${state.range}</small></span></div>
            <div className="pan-sum">
                <div><small>Supply</small><b>${f.supply}</b></div><i>−</i>
                <div><small>Demand</small><span className="pan-step">
                    <button type="button" aria-label="Less demand" disabled=${f.demand <= 0} onClick=${() => demand(f.demand - 1)}>−</button>
                    <b>${f.demand}</b>
                    <button type="button" aria-label="More demand" disabled=${f.demand >= MAX_DEMAND} onClick=${() => demand(f.demand + 1)}>+</button></span></div>
                <i>=</i><div><small>Favor</small><b className="pan-c">${signed(f.favor)}</b></div>
            </div>
            <label className="ae-field pan-form"><span className="ae-label">Form</span>
                <select className="pl-select" value=${deity.details.form ?? ''} onChange=${async (/** @type {any} */ e) => setError(await updateEntity(deity.id, { details: { form: e.target.value || null } }))}>
                    <option value="">Magic circle</option>
                    ${FORMS.map((k) => html`<option key=${k} value=${k}>${DEITY_FORMS[k]}</option>`)}
                </select></label>
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        ${unsealed.length > 0 && html`
            <section className="nec-pane"><h4>Waiting to be sealed</h4>
                ${unsealed.map((a) => html`<${Offering} key=${a.id} a=${a} deity=${deity} color=${tint(a)} note=${after(a)} />`)}
            </section>`}
        <section className="nec-pane"><h4>Would appease</h4>
            ${!seeking.length && html`<p className="nec-dim">No living adventure serves ${deity.name}</p>`}
            ${seeking.map((a) => html`<${Offering} key=${a.id} a=${a} deity=${deity} color=${PHASE_STAGES[a.phase].color} note=${after(a)} />`)}
        </section>
        <section className="nec-pane"><h4>Offerings</h4>
            ${!f.offerings.length && html`<p className="nec-dim">Sealed artifacts that serve ${deity.name} stand here until they’re archived</p>`}
            ${f.offerings.map((a) => html`<${Offering} key=${a.id} a=${a} deity=${deity} color=${PHASE_STAGES.completed.color} note="" />`)}
        </section>
    `;
}

/**
 * The Pantheon: each deity in its own place, its form in its own colour, its altar in its
 * state's. Favor is supply (the fulfillment factors of sealed artifacts in the Treasury)
 * minus demand (set here).
 */
export function PantheonPanel() {
    const entities = useWorkspaceStore((s) => s.entities);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const [picked, setPicked] = useState(/** @type {string | null} */ (null));
    const deities = useMemo(() => entities.filter((e) => e.type === 'deity')
        .map((deity) => ({ deity, ...favorOf(deity, adventures) }))
        .sort((x, y) => place(x.deity) - place(y.deity) || x.deity.name.localeCompare(y.deity.name)), [entities, adventures]);
    const groups = useMemo(() => [{
        items: deities.map(({ deity: d, favor, state, supply }) => ({
            id: d.id, label: d.name, sub: html`<span style=${{ color: FAVOR_STATES[state].color }}>${FAVOR_STATES[state].label} ${signed(favor)}</span>`,
            model: { type: 'deity', id: d.id, form: d.details.form, color: FAVOR_STATES[state].color, own: entityColor(d.id), on: favor >= 0,
                points: 3 + (d.id.charCodeAt(0) % 7), rings: FAVOR_STATES[state].rings, supply },
        })),
    }], [deities]);

    // opens on the neediest
    const shown = (deities.find((d) => d.deity.id === picked) ?? [...deities].sort((x, y) => x.favor - y.favor)[0])?.deity;
    if (!shown) return html`<div className="panel-body inventory"><div className="nc-empty">No deities yet<small>Deities you make in the Codex stand here</small></div></div>`;
    return html`
        <div className="panel-body inventory"><div className="inv-grid">
            <div className="inv-cab"><${Cabinet} groups=${groups} look=${LOOK} options=${SIZE} selectedId=${shown.id} onSelect=${setPicked} label="Deities" /></div>
            <div className="inv-side"><${DeitySheet} key=${shown.id} deity=${shown} /></div>
        </div></div>
    `;
}
