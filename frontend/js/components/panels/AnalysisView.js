import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ADVENTURE_TYPES, ENTITY_TYPES } from '../../lifecycle.js';
import {
    GRADES, GRADE_KEYS, accuracy, blankAnalysis, gradeCounts, played, turningPoint, verdictName, winLine,
} from '../../lib/analysis.js';
import { remaining } from '../../lib/bounty.js';
import { confirmHere } from '../../lib/windows.js';
import { safeHttpUrl } from '../../events.js';
import { GradeIcon } from '../GradeIcon.js';

const SAVE_MS = 700;
const ROWS = /** @type {const} */ ([['Exciting', 2], ['Neutral', 1], ['Boring', 0]]);
const COLS = ['Defeat', 'Draw', 'Success'];

/** The stored analysis as an editable copy. @param {AdventureRecord} a @returns {Analysis} */
function editable(a) {
    const e = a.enshrining;
    if (!e) return { ...blankAnalysis(), moves: [{ text: '', grade: 'good', better: '', skills: [] }] };
    return {
        verdict: e.verdict, link: e.link ?? '', notes: e.notes,
        gains: e.gains.map((x) => ({ ...x })), losses: e.losses.map((x) => ({ ...x })), discoveries: e.discoveries.map((x) => ({ ...x })),
        moves: e.moves.map((m) => ({ ...m, better: m.better ?? '', skills: [...m.skills] })),
    };
}

/** The winning chances after each move, with its icon. @param {{ moves: AnalysisMove[] }} props */
function EvalGraph({ moves }) {
    const list = played(moves), line = winLine(moves);
    const x = (/** @type {number} */ i) => 2 + (i / Math.max(1, line.length - 1)) * 94, y = (/** @type {number} */ v) => 112 - v * 104;
    const pts = line.map((v, i) => `${x(i) * 6},${y(v)}`).join(' ');
    return html`
        <div className="ana-graph">
            <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Winning chances after each move">
                <polygon points=${`12,120 ${pts} ${x(line.length - 1) * 6},120`} fill="#cfd3da"></polygon>
                <line x1="0" x2="600" y1="60" y2="60" stroke="#7a808a" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"></line>
            </svg>
            ${list.map((m, i) => html`<span key=${i} style=${{ left: `${x(i + 1)}%`, top: `${y(line[i + 1]) / 1.2}%` }}><${GradeIcon} grade=${m.grade} size=${20} /></span>`)}
        </div>
    `;
}

/**
 * Spoils or tithes: what, how much, of what.
 * @param {{ title: string, cls: string, rows: AnalysisLine[], editing: boolean, placeholder: string, add: string, onChange: (rows: AnalysisLine[]) => void }} props
 */
function Lines({ title, cls, rows, editing, placeholder, add, onChange }) {
    const put = (/** @type {number} */ i, /** @type {Partial<AnalysisLine>} */ c) => onChange(rows.map((r, j) => (j === i ? { ...r, ...c } : r)));
    return html`
        <h4 className=${cls}>${title}</h4>
        ${rows.map((r, i) => editing
            ? html`
                <div className="ana-line" key=${i}>
                    <input type="text" value=${r.name} maxLength=${200} placeholder=${placeholder} aria-label=${`${title} ${i + 1}`} onInput=${(/** @type {any} */ e) => put(i, { name: e.target.value })} />
                    <input type="text" className="qty" value=${r.qty} maxLength=${40} placeholder="Amount" aria-label="Amount" onInput=${(/** @type {any} */ e) => put(i, { qty: e.target.value })} />
                    <input type="text" className="qty" value=${r.unit} maxLength=${40} placeholder="Unit" aria-label="Unit" onInput=${(/** @type {any} */ e) => put(i, { unit: e.target.value })} />
                    <button className="pclose" aria-label="Remove" onClick=${() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
                </div>`
            : html`<div className="ana-read" key=${i}><span>${r.name}</span><b>${[r.qty, r.unit].filter(Boolean).join(' ')}</b></div>`)}
        ${!editing && !rows.length && html`<p className="nec-dim">None</p>`}
        ${editing && html`<div><button className="cls-layer" onClick=${() => onChange([...rows, { name: '', qty: '', unit: '' }])}>${add}</button></div>`}
    `;
}

/**
 * One move: what you did, its grade, the better line, and the skills it used.
 * @param {{ move: AnalysisMove, n: number, editing: boolean, skills: Entity[], open: boolean, onOpen: () => void,
 *           onChange: (c: Partial<AnalysisMove>) => void, onRemove: () => void }} props
 */
function MoveRow({ move, n, editing, skills, open, onOpen, onChange, onRemove }) {
    const grade = GRADES[move.grade], used = skills.filter((s) => move.skills.includes(s.id));
    if (!editing) {
        return html`
            <div className="ana-move read" style=${{ '--g': grade.color }}>
                <span className="ana-n">${n}</span>
                <${GradeIcon} grade=${move.grade} size=${24} />
                <div className="ana-text">
                    <span>${move.text}</span>
                    ${move.better && html`<em>Better: ${move.better}</em>`}
                    ${used.length > 0 && html`<small>${used.map((s) => `✧ ${s.name}`).join('   ')}</small>`}
                </div>
                <b>${grade.label}</b>
            </div>
        `;
    }
    return html`
        <div className="ana-move" style=${{ '--g': grade.color }}>
            <span className="ana-n">${n}</span>
            <input className="ana-did" type="text" value=${move.text} maxLength=${500} placeholder="The move you made" aria-label=${`Move ${n}`} onInput=${(/** @type {any} */ e) => onChange({ text: e.target.value })} />
            <button className="ana-grade" aria-expanded=${open} aria-label=${`Grade of move ${n}: ${grade.label}`} onClick=${onOpen}><${GradeIcon} grade=${move.grade} size=${24} /><span>${grade.label}</span></button>
            <input className="ana-better" type="text" value=${move.better} maxLength=${500} placeholder=${grade.delta < 0 ? 'Better line' : 'Better line, if any'} aria-label=${`Better line for move ${n}`} onInput=${(/** @type {any} */ e) => onChange({ better: e.target.value })} />
            <button className="pclose" aria-label=${`Remove move ${n}`} onClick=${onRemove}>✕</button>
            ${open && html`
                <div className="ana-palette">
                    ${GRADE_KEYS.map((k) => html`
                        <button key=${k} title=${GRADES[k].hint} aria-pressed=${k === move.grade} onClick=${() => { onChange({ grade: k }); onOpen(); }}>
                            <${GradeIcon} grade=${k} size=${28} /><span>${GRADES[k].label}</span>
                        </button>
                    `)}
                </div>
            `}
            ${skills.length > 0 && html`
                <div className="ana-skills">
                    ${skills.map((s) => html`
                        <button key=${s.id} className=${`cls-layer ${move.skills.includes(s.id) ? 'on' : ''}`} aria-pressed=${move.skills.includes(s.id)}
                            onClick=${() => onChange({ skills: move.skills.includes(s.id) ? move.skills.filter((x) => x !== s.id) : [...move.skills, s.id] })}>✧ ${s.name}</button>
                    `)}
                </div>
            `}
        </div>
    `;
}

/**
 * A completed adventure's analysis: edited as a draft (saved as you type) until it's sealed,
 * then read; Amend opens it again and reseals it.
 * @param {{ adventure: AdventureRecord, onBack: () => void, onSealed: (a: Analysis, discovered: string[], amended: boolean, pay: number) => void }} props
 */
export function AnalysisView({ adventure, onBack, onSealed }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const saveEnshrining = useWorkspaceStore((s) => s.saveEnshrining);
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const sealed = adventure.enshrining?.sealed_at ?? null;
    const [rec, setRec] = useState(() => editable(adventure));
    const [amending, setAmending] = useState(false);
    const [openMove, setOpenMove] = useState(/** @type {number | null} */ (null));
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const editing = !sealed || amending;
    const skills = useMemo(() => entities.filter((e) => e.type === 'skill'), [entities]);

    // a sealed one shows what's stored (it may be amended in another window)
    useEffect(() => { if (sealed && !amending) setRec(editable(adventure)); }, [adventure.enshrining, amending]);

    // drafts save as you type, and what's pending is saved on the way out
    const pending = useRef(/** @type {Analysis | null} */ (null));
    const timer = useRef(/** @type {any} */ (0));
    const flush = async () => {
        clearTimeout(timer.current);
        const next = pending.current;
        pending.current = null;
        if (!next) return;
        const res = await saveEnshrining(adventure.id, next, false);
        if (typeof res === 'string') { setError(res); setStatus('Not saved'); } else { setError(null); setStatus('Draft saved'); }
    };
    useEffect(() => () => { flush(); }, []);

    const change = (/** @type {Partial<Analysis>} */ c) => {
        const next = { ...rec, ...c };
        setRec(next);
        if (sealed) return; // amending: saved when resealed
        pending.current = next;
        setStatus('Saving…');
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_MS);
    };
    const putMove = (/** @type {number} */ i, /** @type {Partial<AnalysisMove>} */ c) => change({ moves: rec.moves.map((m, j) => (j === i ? { ...m, ...c } : m)) });
    const putFound = (/** @type {number} */ i, /** @type {Partial<Discovery>} */ c) => change({ discoveries: rec.discoveries.map((d, j) => (j === i ? { ...d, entity_id: null, ...c } : d)) });

    const seal = async () => {
        clearTimeout(timer.current);
        pending.current = null;
        setBusy(true);
        const pay = remaining(adventure); // what sealing it now pays
        const res = await saveEnshrining(adventure.id, rec, true);
        setBusy(false);
        if (typeof res === 'string') { setError(res); pending.current = sealed ? null : rec; return; }
        setError(null); setAmending(false); setStatus('');
        onSealed(rec, res.discovered, !!sealed, pay);
    };
    const uncomplete = async () => {
        if (!confirmHere(`Return “${adventure.title ?? 'Untitled'}” to the Arena? Its seal is broken; everything you wrote stays as a draft.`)) return;
        await flush();
        await setPhase(adventure.id, 'consuming');
        onBack();
    };

    const acc = accuracy(rec.moves), turn = turningPoint(rec.moves), counts = gradeCounts(rec.moves);
    const type = ADVENTURE_TYPES[adventure.type], link = safeHttpUrl(rec.link);

    return html`
        <div className="ana">
            <div className="ana-head">
                <button className="btn ghost" onClick=${onBack}>◀ Cabinet</button>
                <div><h3>${adventure.title ?? 'Untitled'}</h3><small>${type.glyph} ${type.label}${adventure.entities.filter((e) => e.type === 'deity').map((e) => ` · ⟁ ${e.name}`).join('')}</small></div>
                <span className="ana-status">${editing ? status : `Sealed ${new Date(/** @type {string} */ (sealed)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}${adventure.enshrining?.amended_at ? ', amended' : ''}`}</span>
            </div>
            <div className="ana-cols">
                <section className="nec-pane">
                    <div className="ana-row"><h4>Play by play</h4><span className="ana-score">${acc != null && `accuracy ${acc.toFixed(1)}`}${turn && ` · turning point: move ${turn}`}</span></div>
                    <${EvalGraph} moves=${rec.moves} />
                    ${counts.length > 0 && html`<div className="ana-counts">${counts.map(([g, n]) => html`<span key=${g} title=${GRADES[g].label}><${GradeIcon} grade=${g} size=${18} /> ${n}</span>`)}</div>`}
                    <div>
                        ${rec.moves.map((m, i) => html`
                            <${MoveRow} key=${i} move=${m} n=${i + 1} editing=${editing} skills=${skills} open=${openMove === i}
                                onOpen=${() => setOpenMove(openMove === i ? null : i)} onChange=${(/** @type {Partial<AnalysisMove>} */ c) => putMove(i, c)}
                                onRemove=${() => { setOpenMove(null); change({ moves: rec.moves.filter((_, j) => j !== i) }); }} />
                        `)}
                        ${!editing && !rec.moves.length && html`<p className="nec-dim">No moves recorded.</p>`}
                    </div>
                    ${editing && html`
                        <div><button className="cls-layer" onClick=${() => change({ moves: [...rec.moves, { text: '', grade: 'good', better: '', skills: [] }] })}>+ Move</button></div>
                        <p className="nec-dim">Moves don’t change skill levels: a skill is learned when the move succeeds in live play.${skills.length ? '' : ' Skills you add to the Codex can be tagged here.'}</p>
                    `}
                </section>
                <div className="ana-side">
                    <section className="nec-pane">
                        <h4>Verdict${editing ? '' : `: ${verdictName(rec.verdict)}`}</h4>
                        <div className="ana-verdict" role="group" aria-label="Verdict">
                            ${ROWS.map(([label, y]) => html`
                                <span key=${label} className="y">${label}</span>
                                ${[0, 1, 2].map((x) => html`
                                    <button key=${`${x}${y}`} disabled=${!editing} style=${{ '--k': `${4 + (x + y) * 5}%` }} aria-pressed=${rec.verdict?.[0] === x && rec.verdict?.[1] === y}
                                        onClick=${() => change({ verdict: [x, y] })}>${verdictName([x, y])}</button>
                                `)}
                            `)}
                            <span></span>${COLS.map((c) => html`<span key=${c}>${c}</span>`)}
                        </div>
                        ${adventure.type === 'performance' && (editing
                            ? html`<label className="ana-field"><span>Link to the performance (required)</span><input type="url" value=${rec.link} placeholder="https://" onInput=${(/** @type {any} */ e) => change({ link: e.target.value })} /></label>`
                            : link && html`<a className="cls-layer" href=${link} target="_blank" rel="noreferrer noopener">Watch the performance ↗</a>`)}
                    </section>
                    <section className="nec-pane">
                        <h4>Discovered entities</h4>
                        ${rec.discoveries.map((d, i) => {
                            const known = entities.some((e) => e.type === d.type && e.name.toLowerCase() === d.name.trim().toLowerCase());
                            return editing
                                ? html`
                                    <div className="ana-line" key=${i}>
                                        <input type="text" value=${d.name} maxLength=${200} list=${`found-${d.type}`} placeholder="Name" aria-label="Entity name" onInput=${(/** @type {any} */ e) => putFound(i, { name: e.target.value })} />
                                        <select value=${d.type} aria-label="Entity type" onChange=${(/** @type {any} */ e) => putFound(i, { type: e.target.value })}>
                                            ${Object.entries(ENTITY_TYPES).map(([k, t]) => html`<option key=${k} value=${k}>${t.label}</option>`)}
                                        </select>
                                        <button className="pclose" aria-label="Remove" onClick=${() => change({ discoveries: rec.discoveries.filter((_, j) => j !== i) })}>✕</button>
                                        ${known && html`<small>In the Codex</small>`}
                                    </div>`
                                : html`<div className="ana-read" key=${i}><span>${ENTITY_TYPES[d.type].glyph} ${d.name}</span><b>${ENTITY_TYPES[d.type].label}</b></div>`;
                        })}
                        ${!editing && !rec.discoveries.length && html`<p className="nec-dim">None</p>`}
                        ${editing && html`
                            ${[...new Set(rec.discoveries.map((d) => d.type))].map((t) => html`<datalist key=${t} id=${`found-${t}`}>${entities.filter((e) => e.type === t).map((e) => html`<option key=${e.id} value=${e.name}></option>`)}</datalist>`)}
                            <div><button className="cls-layer" onClick=${() => change({ discoveries: [...rec.discoveries, { type: 'contact', name: '', entity_id: null }] })}>+ Entity</button></div>
                        `}
                    </section>
                    <section className="nec-pane">
                        <${Lines} title="Spoils" cls="spoils" rows=${rec.gains} editing=${editing} placeholder="What you won" add="+ Spoil" onChange=${(/** @type {AnalysisLine[]} */ gains) => change({ gains })} />
                        <${Lines} title="Tithes" cls="tithes" rows=${rec.losses} editing=${editing} placeholder="What it took" add="+ Tithe" onChange=${(/** @type {AnalysisLine[]} */ losses) => change({ losses })} />
                    </section>
                    <section className="nec-pane">
                        <h4>Notes</h4>
                        ${editing
                            ? html`<textarea className="ana-notes" rows=${4} maxLength=${20000} value=${rec.notes} aria-label="Notes" onInput=${(/** @type {any} */ e) => change({ notes: e.target.value })}></textarea>`
                            : html`<p className="ana-notes-read">${rec.notes || 'None'}</p>`}
                    </section>
                    ${!sealed && remaining(adventure) > 0 && html`<p className="ql-pay"><i className="amb"></i>${remaining(adventure)} ambrosia on sealing</p>`}
                    ${error && html`<div className="nc-error" role="alert">${error}</div>`}
                    <div className="nec-actions">
                        ${editing && html`<button className="btn ana-seal" disabled=${busy} onClick=${seal}>${sealed ? 'Reseal' : 'Seal and enshrine'}</button>`}
                        ${amending && html`<button className="btn ghost" onClick=${() => { setAmending(false); setError(null); setOpenMove(null); }}>Cancel</button>`}
                        ${!editing && html`<button className="btn" onClick=${() => setAmending(true)}>Amend</button>`}
                        ${!amending && html`<button className="btn ghost nec-abandon" onClick=${uncomplete} title="Back to the Arena; what you wrote is kept">Un-complete</button>`}
                    </div>
                </div>
            </div>
        </div>
    `;
}
