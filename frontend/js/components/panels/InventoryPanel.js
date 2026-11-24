import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { activeEffects, adventureColor, gearSets, modelSpec, owned, sheetOf } from '../../lib/items.js';
import { Amp, EffectRows } from '../EffectRows.js';
import { targetLabel } from '../../lib/targets.js';
import { Forge } from '../Forge.js';
import { Cabinet } from '../Cabinet.js';

const SAVE_MS = 700;

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'octagon', sealColor: '#5fe0e6', seed: 'inventory', points: 8 };

/** @param {{ phase: Phase }} props */
const Matter = ({ phase }) => html`<span style=${{ color: PHASE_STAGES[phase].light }}>${PHASE_STAGES[phase].matter}</span>`;

/**
 * One item: what it's for, its effects, its set, and its model. Saved as you edit.
 * @param {{ adventure: AdventureRecord, set: { deity: { id: string, name: string } | null, items: AdventureRecord[] } }} props
 */
function ItemSheetView({ adventure, set }) {
    const saveItem = useWorkspaceStore((s) => s.saveItem);
    const [sheet, setSheet] = useState(() => sheetOf(adventure));
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const pending = useRef(/** @type {Partial<ItemSheet>} */ ({}));
    const timer = useRef(/** @type {any} */ (0));

    const flush = async () => {
        clearTimeout(timer.current);
        const changes = pending.current;
        pending.current = {};
        if (Object.keys(changes).length) setError(await saveItem(adventure.id, changes));
    };
    useEffect(() => () => { flush(); }, []);
    // changed elsewhere (another window, or a recipe saved from a session): show it, unless editing
    useEffect(() => { if (!Object.keys(pending.current).length) setSheet(sheetOf(adventure)); }, [adventure.item]);

    const change = (/** @type {Partial<ItemSheet>} */ c) => {
        setSheet((s) => ({ ...s, ...c }));
        pending.current = { ...pending.current, ...c };
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_MS);
    };
    const have = set.items.filter(owned).length;

    return html`
        <section className="nec-pane">
            <h3>${adventure.title ?? 'Untitled'}</h3>
            <p className="nec-dim"><${Matter} phase=${adventure.phase} />${set.deity && ` · ⟁ ${set.deity.name}`}</p>
            <label className="ana-field"><span>Purpose</span><textarea className="ana-notes" rows=${2} maxLength=${5000} value=${sheet.purpose} placeholder="What it is for" onInput=${(/** @type {any} */ e) => change({ purpose: e.target.value })}></textarea></label>
            <h4>Buffs and debuffs</h4>
            <${EffectRows} effects=${sheet.effects} onChange=${(/** @type {ItemEffect[]} */ effects) => change({ effects })} />
            <p className="nec-dim">Attributes and skills it amplifies. They count in an adventure of the same deity once it's equipped there (the Arena).</p>
            ${set.deity && html`
                <h4>${set.deity.name} set</h4>
                <div className="inv-set" style=${{ '--c': adventureColor(adventure) }}><i style=${{ width: `${(have / set.items.length) * 100}%` }}></i></div>
                <p className="nec-dim">${have} of ${set.items.length} owned${have === set.items.length ? ': the set is complete' : ''}</p>
            `}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
        <${Forge} adventure=${adventure} model=${sheet.model} onChange=${(/** @type {ModelPart[] | null} */ model) => change({ model })} />
    `;
}

/**
 * The Inventory: every living item, in alcoves partitioned by gear set (a deity's items),
 * and the selected one's sheet and model.
 */
export function InventoryPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const selectedItemId = useWorkspaceStore((s) => s.selectedItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const mode = useWorkspaceStore((s) => s.mode);
    const [picked, setPicked] = useState(/** @type {string | null} */ (null));

    const sets = useMemo(() => gearSets(adventures), [adventures]);
    const items = useMemo(() => sets.flatMap((s) => s.items), [sets]);
    useEffect(() => { if (selectedItemId && items.some((a) => a.id === selectedItemId)) setPicked(selectedItemId); }, [selectedItemId]);
    const shown = items.find((a) => a.id === picked) ?? items[0] ?? null;
    const effects = useMemo(() => activeEffects(adventures), [adventures]);

    const groups = useMemo(() => sets.map((s) => ({
        title: `${s.deity?.name ?? 'No deity'} · ${s.items.filter(owned).length} of ${s.items.length}`,
        items: s.items.map((a) => {
            const spec = modelSpec(a);
            return { id: a.id, label: a.title ?? 'Untitled', sub: html`<${Matter} phase=${a.phase} />`, model: { ...spec, type: spec.parts ? 'recipe' : 'vessel' } };
        }),
    })), [sets, entities]);

    const pick = (/** @type {string} */ id) => {
        setPicked(id);
        if (mode === 'adventures') selectItem(id, 'inventory');
    };
    const nameOf = (/** @type {string} */ target) => targetLabel(target, entities);

    if (!shown) return html`<div className="panel-body inventory"><div className="nc-empty">No items yet<small>Item adventures appear here, by the deity they serve</small></div></div>`;
    const set = /** @type {(typeof sets)[number]} */ (sets.find((s) => s.items.includes(shown)));
    return html`
        <div className="panel-body inventory"><div className="inv-grid">
            <div className="inv-cab"><${Cabinet} groups=${groups} look=${LOOK} selectedId=${shown.id} onSelect=${pick} label="Items" /></div>
            <div className="inv-side">
                ${effects.length > 0 && html`
                    <section className="nec-pane"><h4>Owned effects</h4>
                        <div className="inv-active">${effects.map(([t, n]) => html`<span key=${t}>${nameOf(t)} <${Amp} rating=${n} total=${true} /></span>`)}</div>
                    </section>
                `}
                <${ItemSheetView} key=${shown.id} adventure=${shown} set=${set} />
            </div>
        </div></div>
    `;
}
