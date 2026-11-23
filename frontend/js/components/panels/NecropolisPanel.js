import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { EPITAPH_CAUSES, PHASE_STAGES } from '../../lifecycle.js';
import { adventureColor } from '../../lib/items.js';
import { confirmHere } from '../../lib/windows.js';
import { Cabinet } from '../Cabinet.js';

const CAUSES = /** @type {EpitaphCause[]} */ (Object.keys(EPITAPH_CAUSES));
const EMBER = '#e0744f';

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'lancet', sealColor: EMBER, seed: 'necropolis', points: 5, dim: true };

/** @param {AdventureRecord} a */
const colorOf = (a) => adventureColor(a, EMBER);

/**
 * Write a dead adventure's epitaph: a cause, and a note if you like.
 * @param {{ adventure: AdventureRecord, onDone: () => void }} props
 */
function EpitaphForm({ adventure, onDone }) {
    const saveEpitaph = useWorkspaceStore((s) => s.saveEpitaph);
    const [cause, setCause] = useState(/** @type {EpitaphCause | null} */ (adventure.epitaph?.cause ?? null));
    const [note, setNote] = useState(adventure.epitaph?.note ?? '');
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [saving, setSaving] = useState(false);

    const carve = async () => {
        if (!cause) { setError('Choose a cause.'); return; }
        setSaving(true);
        const problem = await saveEpitaph(adventure.id, cause, note);
        setSaving(false);
        if (problem) setError(problem); else onDone();
    };

    return html`
        <div className="nec-form">
            <div className="nec-causes" role="group" aria-label="Cause">
                ${CAUSES.map((c) => html`
                    <button key=${c} className=${`cls-layer ${cause === c ? 'on' : ''}`} aria-pressed=${cause === c} onClick=${() => setCause(c)}>${EPITAPH_CAUSES[c]}</button>
                `)}
            </div>
            <textarea rows=${3} maxLength=${2000} value=${note} placeholder="In your words (optional)" aria-label="Epitaph"
                onInput=${(/** @type {any} */ e) => setNote(e.target.value)}
                onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) carve(); }}></textarea>
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            <div className="nec-actions">
                <button className="btn" disabled=${saving} onClick=${carve}>Carve</button>
                <button className="btn ghost" onClick=${onDone}>Cancel</button>
            </div>
        </div>
    `;
}

/**
 * The Necropolis: every killed adventure, newest first, its candles lit once it has an
 * epitaph; the selected one's epitaph; and what they died of.
 */
export function NecropolisPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const selectedItemId = useWorkspaceStore((s) => s.selectedItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const reviveAdventure = useWorkspaceStore((s) => s.reviveAdventure);
    const abandonAdventure = useWorkspaceStore((s) => s.abandonAdventure);
    const clearEpitaph = useWorkspaceStore((s) => s.clearEpitaph);
    const mode = useWorkspaceStore((s) => s.mode);
    useWorkspaceStore((s) => s.entities); // deity colours
    const [picked, setPicked] = useState(/** @type {string | null} */ (null));
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const dead = useMemo(
        () => adventures.filter((a) => a.phase === 'killed')
            .sort((a, b) => (b.phase_changed_at ?? '').localeCompare(a.phase_changed_at ?? '')),
        [adventures],
    );
    // a vestige selected elsewhere shows here too
    useEffect(() => { if (selectedItemId && dead.some((a) => a.id === selectedItemId)) setPicked(selectedItemId); }, [selectedItemId]);
    const shown = dead.find((a) => a.id === picked) ?? dead[0] ?? null;
    useEffect(() => { setEditing(false); setError(null); }, [shown?.id]);

    const groups = useMemo(() => [{
        items: dead.map((a) => ({
            id: a.id, label: a.title ?? 'Untitled', sub: a.epitaph ? EPITAPH_CAUSES[a.epitaph.cause] : 'No epitaph',
            model: { type: 'urn', id: a.id, color: colorOf(a), on: !!a.epitaph, lit: !!a.epitaph, points: 5 },
        })),
    }], [dead]);

    const tally = CAUSES.map((c) => ({ c, n: dead.filter((a) => a.epitaph?.cause === c).length })).filter((x) => x.n).sort((x, y) => y.n - x.n);
    const unwritten = dead.filter((a) => !a.epitaph).length;

    const abandon = async (/** @type {AdventureRecord} */ a) => {
        if (confirmHere(`Abandon “${a.title ?? 'Untitled'}”? It is deleted for good, with its roadmap, links and epitaph. This can’t be undone.`)) setError(await abandonAdventure(a.id));
    };

    const pick = (/** @type {string} */ id) => {
        setPicked(id);
        if (mode === 'adventures') selectItem(id, 'necropolis');
    };

    return html`
        <div className="panel-body necropolis">
            <${Cabinet} groups=${groups} look=${LOOK} selectedId=${shown?.id ?? null} onSelect=${pick} label="Vestiges">
                <div className="nec-below">
                    <section className="nec-pane">
                        ${!shown && html`<p className="nec-dim">Nothing has died yet.</p>`}
                        ${shown && html`
                            <h3>${shown.title ?? 'Untitled'}</h3>
                            ${editing
                                ? html`<${EpitaphForm} key=${shown.id} adventure=${shown} onDone=${() => setEditing(false)} />`
                                : html`
                                    ${shown.epitaph?.note && html`<blockquote>“${shown.epitaph.note}”</blockquote>`}
                                    <p className="nec-dim">
                                        ${shown.epitaph ? EPITAPH_CAUSES[shown.epitaph.cause] : 'Its candles are unlit. Carve an epitaph to light them.'}
                                        ${shown.phase_before_kill && `${shown.epitaph ? ' · died' : ' Died'} as ${PHASE_STAGES[shown.phase_before_kill].matter}`}
                                        ${shown.phase_changed_at && `, ${new Date(shown.phase_changed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`}
                                    </p>
                                    <div className="nec-actions">
                                        <button className="btn" onClick=${() => setEditing(true)}>${shown.epitaph ? 'Recarve' : 'Carve epitaph'}</button>
                                        ${shown.epitaph && html`<button className="btn ghost" onClick=${async () => setError(await clearEpitaph(shown.id))}>Erase</button>`}
                                        <button className="btn ghost" onClick=${() => reviveAdventure(shown.id)}>↺ Revive</button>
                                        <button className="btn ghost nec-abandon" onClick=${() => abandon(shown)} title="Delete it for good">Abandon</button>
                                    </div>
                                    ${error && html`<div className="nc-error" role="alert">${error}</div>`}
                                `}
                        `}
                    </section>
                    <section className="nec-pane">
                        <h4>Why adventures die</h4>
                        ${tally.map(({ c, n }) => html`
                            <div key=${c} className="nec-bar"><span>${EPITAPH_CAUSES[c]}</span><b>${n}</b><i style=${{ width: `${(n / dead.length) * 100}%` }}></i></div>
                        `)}
                        ${!tally.length && html`<p className="nec-dim">Causes gather here as you carve epitaphs.</p>`}
                        ${tally.length > 0 && unwritten > 0 && html`<p className="nec-dim">${unwritten} without an epitaph</p>`}
                    </section>
                </div>
            <//>
        </div>
    `;
}
