import { useEffect, useMemo, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { MATERIALS, modelSpec, partMade, proposalOf, sheetOf } from '../lib/items.js';
import { confirmHere } from '../lib/windows.js';
import { ModelView } from './ModelView.js';

/** @type {Record<AdventureType, string>} */
const PLACEHOLDERS = {
    item: 'A pair of insoles with a grid of sensor pads, each with a ribbon cable to a small board',
    event: 'A warehouse dance floor with a mirror ball over it and two speaker stacks',
    performance: 'An upright piano with sheet music and a single spotlight',
    battle: 'Two chess kings facing each other on a cracked board',
};

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
                    <select value=${p.act ?? ''} aria-label=${`Quest that makes ${p.name}`} onChange=${(/** @type {any} */ e) => put(i, { act: e.target.value || null })}>
                        <option value="">No quest</option>
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
 * @param {{ adventure: AdventureRecord, model: ModelPart[] | null, onChange: (m: ModelPart[] | null) => void, stage?: boolean }} props
 *   stage: draw the model here (the Refinery shows it on the card instead)
 */
export function Forge({ adventure, model, onChange, stage = true }) {
    const forgeModel = useWorkspaceStore((s) => s.forgeModel);
    const acceptModel = useWorkspaceStore((s) => s.acceptModel);
    const dismissModel = useWorkspaceStore((s) => s.dismissModel);
    const forge = adventure.item?.forge ?? null, forging = forge?.status === 'forging';
    const proposal = proposalOf(adventure);
    const [text, setText] = useState('');
    const [finished, setFinished] = useState(false);
    const [adjusting, setAdjusting] = useState(false);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const shown = proposal ?? model;
    const spec = useMemo(
        () => modelSpec({ ...adventure, item: { ...sheetOf(adventure), model: shown, face: 'model' } }, { finished: finished || !!proposal }),
        [adventure, shown, finished, proposal],
    );
    const run = async (/** @type {Promise<string | null>} */ p) => { const e = await p; setError(e); return !e; };
    const send = async () => {
        if (!text.trim()) { setError('Describe it first.'); return; }
        if (await run(forgeModel(adventure.id, text))) setText('');
    };

    return html`
        <section className="nec-pane">
            <div className="ana-row"><h4>Forge</h4>
                ${proposal ? html`<span className="inv-tag">Proposal</span>` : model && html`<span className="nec-dim">${model.filter((p) => partMade(adventure, p)).length} of ${model.length} parts made</span>`}
            </div>
            ${stage && html`<div className=${`inv-stage ${forging ? 'forging' : ''}`}>
                <${ModelView} spec=${spec} orbit=${true} distance=${132} label=${`Model of ${adventure.title}. Drag to turn it.`} />
                ${forging && html`<span className="inv-forging">Forging · <${Elapsed} since=${forge?.at ?? ''} /></span>`}
            </div>`}
            ${!stage && forging && html`<p className="nec-dim">Forging · <${Elapsed} since=${forge?.at ?? ''} /></p>`}
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
                    <span>${shown ? 'Ask for a change' : `Describe ${adventure.type === 'item' ? 'the object' : 'its model'}`}</span>
                    <textarea className="ana-notes" rows=${3} maxLength=${2000} value=${text}
                        placeholder=${shown ? 'Thicker cable, darker casing' : PLACEHOLDERS[adventure.type]}
                        onInput=${(/** @type {any} */ e) => setText(e.target.value)}
                        onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}></textarea>
                </label>
                <div className="nec-actions">
                    <button className="btn inv-forge" onClick=${send}>${shown ? 'Reforge' : 'Forge'}</button>
                    ${model && !proposal && html`
                        ${stage && html`<button className=${`cls-layer ${finished ? 'on' : ''}`} aria-pressed=${finished} onClick=${() => setFinished(!finished)}>Show finished</button>`}
                        <button className=${`cls-layer ${adjusting ? 'on' : ''}`} aria-expanded=${adjusting} onClick=${() => setAdjusting(!adjusting)}>Adjust</button>
                    `}
                </div>
                <p className="nec-dim">Claude gets its title, notes, roadmap and cover, and uses your Claude plan.</p>
            `}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            ${adjusting && model && !proposal && !forging && html`<${Adjust} adventure=${adventure} model=${model} onChange=${onChange} />`}
        </section>
    `;
}
