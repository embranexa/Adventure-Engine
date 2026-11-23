import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { MATERIALS, activeEffects, adventureColor, gearSets, modelSpec, owned, partMade } from '../../lib/items.js';
import { confirmHere } from '../../lib/windows.js';
import { Cabinet } from '../Cabinet.js';
import { ModelView } from '../ModelView.js';

const SAVE_MS = 700;

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'octagon', sealColor: '#5fe0e6', seed: 'inventory', points: 8 };

/** @param {AdventureRecord} a @returns {ItemSheet} */
const sheetOf = (a) => a.item ?? { purpose: '', effects: [], model: null, forge: null };

/** @param {{ phase: Phase }} props */
const Matter = ({ phase }) => html`<span style=${{ color: PHASE_STAGES[phase].light }}>${PHASE_STAGES[phase].matter}</span>`;

/** Minutes and seconds since a time, ticking. @param {{ since: string }} props */
function Elapsed({ since }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
    return html`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Adjust a model by hand: hide, resize or re-material its parts, tie them to actions, or
 * edit the recipe itself.
 * @param {{ adventure: AdventureRecord, model: ModelPart[], onChange: (m: ModelPart[] | null) => void }} props
 */
function Adjust({ adventure, model, onChange }) {
    const [paste, setPaste] = useState(/** @type {string | null} */ (null));
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const actions = adventure.roadmap?.actions ?? [], done = new Set(adventure.roadmap?.done ?? []);
    const put = (/** @type {number} */ i, /** @type {Partial<ModelPart>} */ c) => onChange(model.map((p, j) => (j === i ? { ...p, ...c } : p)));
    const load = () => {
        try {
            const parts = JSON.parse(paste ?? '');
            if (!Array.isArray(parts) || !parts.length) throw new Error('a recipe is a list of parts');
            onChange(parts); setPaste(null); setError(null);
        } catch (e) { setError(`Not a recipe: ${/** @type {Error} */ (e).message}`); }
    };
    return html`
        <div className="inv-parts">
            ${model.map((p, i) => html`
                <div className="inv-part" key=${i}>
                    <input type="checkbox" checked=${p.on} aria-label=${`Show ${p.name}`} onChange=${(/** @type {any} */ e) => put(i, { on: e.target.checked })} />
                    <b title=${partMade(adventure, p) ? 'Made' : 'Not made yet'}>${partMade(adventure, p) ? '◆' : '◇'} ${p.name}</b>
                    <select value=${p.mat} aria-label=${`Material of ${p.name}`} onChange=${(/** @type {any} */ e) => put(i, { mat: e.target.value })}>${MATERIALS.map((m) => html`<option key=${m}>${m}</option>`)}</select>
                    <input type="range" min="0.4" max="1.8" step="0.05" value=${p.k} aria-label=${`Size of ${p.name}`} onInput=${(/** @type {any} */ e) => put(i, { k: Number(e.target.value) })} />
                    <select value=${p.act ?? ''} aria-label=${`Action that makes ${p.name}`} onChange=${(/** @type {any} */ e) => put(i, { act: e.target.value || null })}>
                        <option value="">No action</option>
                        ${actions.map((a) => html`<option key=${a.id} value=${a.id}>${done.has(a.id) ? '✓ ' : ''}${a.title}</option>`)}
                    </select>
                </div>
            `)}
        </div>
        ${paste == null
            ? html`<div className="nec-actions">
                <button className="cls-layer" onClick=${() => setPaste(JSON.stringify(model, null, 1))}>Recipe</button>
                <button className="cls-layer" onClick=${() => { if (confirmHere(`Remove the model of “${adventure.title}”?`)) onChange(null); }}>Remove model</button>
              </div>`
            : html`
                <textarea className="ana-notes inv-recipe" rows=${8} value=${paste} spellCheck=${false} aria-label="Recipe" onInput=${(/** @type {any} */ e) => setPaste(e.target.value)}></textarea>
                ${error && html`<div className="nc-error" role="alert">${error}</div>`}
                <div className="nec-actions"><button className="cls-layer" onClick=${load}>Use this recipe</button><button className="cls-layer" onClick=${() => { setPaste(null); setError(null); }}>Close</button></div>
            `}
    `;
}

/**
 * The Forge: describe the object and Claude models it. What comes back is a proposal to
 * accept, dismiss or ask changes to.
 * @param {{ adventure: AdventureRecord, model: ModelPart[] | null, onChange: (m: ModelPart[] | null) => void }} props
 */
function Forge({ adventure, model, onChange }) {
    const forgeModel = useWorkspaceStore((s) => s.forgeModel);
    const acceptModel = useWorkspaceStore((s) => s.acceptModel);
    const dismissModel = useWorkspaceStore((s) => s.dismissModel);
    const forge = adventure.item?.forge ?? null, forging = forge?.status === 'forging';
    const proposal = forge?.status === 'forging' ? null : forge?.proposal ?? null;
    const [text, setText] = useState('');
    const [finished, setFinished] = useState(false);
    const [adjusting, setAdjusting] = useState(false);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const shown = proposal ?? model;
    const spec = useMemo(
        () => modelSpec({ ...adventure, item: { ...sheetOf(adventure), model: shown } }, { finished: finished || !!proposal }),
        [adventure, shown, finished, proposal],
    );
    const run = async (/** @type {Promise<string | null>} */ p) => { const e = await p; setError(e); return !e; };
    const send = async () => {
        if (!text.trim()) { setError('Describe the object first.'); return; }
        if (await run(forgeModel(adventure.id, text))) setText('');
    };

    return html`
        <section className="nec-pane">
            <div className="ana-row"><h4>Forge</h4>
                ${proposal ? html`<span className="inv-tag">Proposal</span>` : model && html`<span className="nec-dim">${model.filter((p) => partMade(adventure, p)).length} of ${model.length} parts made</span>`}
            </div>
            <div className=${`inv-stage ${forging ? 'forging' : ''}`}>
                <${ModelView} spec=${spec} orbit=${true} distance=${132} label=${`Model of ${adventure.title}. Drag to turn it.`} />
                ${forging && html`<span className="inv-forging">Forging · <${Elapsed} since=${forge?.at ?? ''} /></span>`}
            </div>
            ${forging && html`
                <p className="nec-dim">“${forge?.text}”. Usually about a minute; you can leave and come back.</p>
                <div className="nec-actions"><button className="cls-layer" onClick=${() => run(dismissModel(adventure.id))}>Stop</button></div>
            `}
            ${proposal && forge?.status === 'ready' && html`
                <div className="nec-actions">
                    <button className="btn" onClick=${() => run(acceptModel(adventure.id))}>Accept</button>
                    <button className="btn ghost" onClick=${() => run(dismissModel(adventure.id))}>Dismiss</button>
                </div>
            `}
            ${forge?.status === 'failed' && html`
                <div className="nc-error" role="alert">${forge.error}</div>
                <div className="nec-actions">
                    <button className="cls-layer" onClick=${() => run(forgeModel(adventure.id, forge.text))}>Try again</button>
                    ${proposal && html`<button className="cls-layer" onClick=${() => run(acceptModel(adventure.id))}>Accept the earlier one</button>`}
                    <button className="cls-layer" onClick=${() => run(dismissModel(adventure.id))}>Dismiss</button>
                </div>
            `}
            ${!forging && html`
                <label className="ana-field">
                    <span>${shown ? 'Ask for a change' : 'Describe the object'}</span>
                    <textarea className="ana-notes" rows=${3} maxLength=${2000} value=${text}
                        placeholder=${shown ? 'Thicker cable, darker casing' : 'A pair of insoles with a grid of sensor pads, each with a ribbon cable to a small board'}
                        onInput=${(/** @type {any} */ e) => setText(e.target.value)}
                        onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}></textarea>
                </label>
                <div className="nec-actions">
                    <button className="btn inv-forge" onClick=${send}>${shown ? 'Reforge' : 'Forge'}</button>
                    ${model && !proposal && html`
                        <button className=${`cls-layer ${finished ? 'on' : ''}`} aria-pressed=${finished} onClick=${() => setFinished(!finished)}>Show finished</button>
                        <button className=${`cls-layer ${adjusting ? 'on' : ''}`} aria-expanded=${adjusting} onClick=${() => setAdjusting(!adjusting)}>Adjust</button>
                    `}
                </div>
                <p className="nec-dim">Claude gets the item’s title, purpose, notes, roadmap and cover, and uses your Claude plan.</p>
            `}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            ${adjusting && model && !proposal && !forging && html`<${Adjust} adventure=${adventure} model=${model} onChange=${onChange} />`}
        </section>
    `;
}

/**
 * One item: what it's for, its effects, its set, and its model. Saved as you edit.
 * @param {{ adventure: AdventureRecord, set: { deity: { id: string, name: string } | null, items: AdventureRecord[] } }} props
 */
function ItemSheetView({ adventure, set }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const saveItem = useWorkspaceStore((s) => s.saveItem);
    const [sheet, setSheet] = useState(() => sheetOf(adventure));
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const pending = useRef(/** @type {Partial<ItemSheet>} */ ({}));
    const timer = useRef(/** @type {any} */ (0));
    const skills = entities.filter((e) => e.type === 'skill');

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
    const putEffect = (/** @type {number} */ i, /** @type {Partial<ItemEffect>} */ c) => change({ effects: sheet.effects.map((e, j) => (j === i ? { ...e, ...c } : e)) });
    const addEffect = (/** @type {number} */ amount) => change({ effects: [...sheet.effects, { text: '', target: 'other', amount }] });
    const have = set.items.filter(owned).length;

    return html`
        <section className="nec-pane">
            <h3>${adventure.title ?? 'Untitled'}</h3>
            <p className="nec-dim"><${Matter} phase=${adventure.phase} />${set.deity && ` · ⟁ ${set.deity.name}`}</p>
            <label className="ana-field"><span>Purpose</span><textarea className="ana-notes" rows=${2} maxLength=${5000} value=${sheet.purpose} placeholder="What it is for" onInput=${(/** @type {any} */ e) => change({ purpose: e.target.value })}></textarea></label>
            <h4>Boosts, buffs and debuffs</h4>
            ${sheet.effects.map((e, i) => html`
                <div className="inv-fx" key=${i}>
                    <b className=${e.amount < 0 ? 'down' : 'up'}>${e.amount < 0 ? '▼' : '▲'}</b>
                    <input type="text" value=${e.text} maxLength=${200} placeholder="Effect" aria-label="Effect" onInput=${(/** @type {any} */ ev) => putEffect(i, { text: ev.target.value })} />
                    <select value=${e.target} aria-label="Affects" onChange=${(/** @type {any} */ ev) => putEffect(i, { target: ev.target.value })}>
                        ${skills.map((s) => html`<option key=${s.id} value=${s.id}>✧ ${s.name}</option>`)}
                        <option value="favor">Favor</option><option value="other">Other</option>
                    </select>
                    <input type="number" step="5" min="-1000" max="1000" value=${e.amount} aria-label="Percent" onInput=${(/** @type {any} */ ev) => putEffect(i, { amount: Number(ev.target.value) || 0 })} />
                    <button className="pclose" aria-label="Remove effect" onClick=${() => change({ effects: sheet.effects.filter((_, j) => j !== i) })}>✕</button>
                </div>
            `)}
            <div className="nec-actions"><button className="cls-layer" onClick=${() => addEffect(10)}>+ Buff</button><button className="cls-layer" onClick=${() => addEffect(-10)}>+ Debuff</button></div>
            <p className="nec-dim">Percentages, active while the item is an artifact. Recorded for now: nothing applies them yet.</p>
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
    const nameOf = (/** @type {string} */ target) => (target === 'favor' ? 'Favor' : entities.find((e) => e.id === target)?.name ?? 'Unknown skill');

    if (!shown) return html`<div className="panel-body inventory"><div className="nc-empty">No items yet<small>Item adventures appear here, by the deity they serve</small></div></div>`;
    const set = /** @type {(typeof sets)[number]} */ (sets.find((s) => s.items.includes(shown)));
    return html`
        <div className="panel-body inventory"><div className="inv-grid">
            <div className="inv-cab"><${Cabinet} groups=${groups} look=${LOOK} selectedId=${shown.id} onSelect=${pick} label="Items" /></div>
            <div className="inv-side">
                ${effects.length > 0 && html`
                    <section className="nec-pane"><h4>Active effects</h4>
                        <div className="inv-active">${effects.map(([t, n]) => html`<span key=${t} className=${n < 0 ? 'down' : 'up'}>${nameOf(t)} ${n > 0 ? '+' : ''}${n}%</span>`)}</div>
                    </section>
                `}
                <${ItemSheetView} key=${shown.id} adventure=${shown} set=${set} />
            </div>
        </div></div>
    `;
}
