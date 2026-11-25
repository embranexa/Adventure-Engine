import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { BEFORE_CRUCIBLE, BOUNTY_RANGES, DEFAULT_BOUNTY, actionShare, bountyTotal } from '../lib/bounty.js';

const FIELDS = /** @type {const} */ ([
    ['effort', 'Effort', 'How much work it is'],
    ['resistance', 'Resistance', 'How much you don’t want to'],
    ['ratio', 'Payout lever', 'The share its quests pay'],
]);
const SAVE_MS = 350;

/**
 * What an adventure is worth, in the Anvil: effort, resistance and the payout lever. It
 * locks on reaching the Crucible.
 * @param {{ adventure: AdventureRecord }} props
 */
export function BountyControl({ adventure }) {
    const saveBounty = useWorkspaceStore((s) => s.saveBounty);
    const stored = adventure.bounty;
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(stored ?? DEFAULT_BOUNTY);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const pending = useRef(/** @type {typeof DEFAULT_BOUNTY | null} */ (null));
    const timer = useRef(/** @type {any} */ (0));
    const locked = !!stored?.locked_at, settable = BEFORE_CRUCIBLE.has(adventure.phase) && !locked;

    const flush = async () => {
        clearTimeout(timer.current);
        const next = pending.current;
        pending.current = null;
        if (next) setError(await saveBounty(adventure.id, next));
    };
    useEffect(() => () => { flush(); }, []);
    useEffect(() => { if (!pending.current) setDraft(stored ?? DEFAULT_BOUNTY); }, [stored]);

    const save = (/** @type {typeof DEFAULT_BOUNTY} */ next) => {
        setDraft(next);
        pending.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_MS);
    };
    const clear = async () => { clearTimeout(timer.current); pending.current = null; setError(await saveBounty(adventure.id, null)); setOpen(false); };

    if (!stored && !settable) return null; // it got past the Anvil without one
    const total = bountyTotal(draft), share = actionShare(draft);
    return html`
        <div className="bounty">
            <button className=${`cls-layer ${open ? 'on' : ''}`} aria-expanded=${open} onClick=${() => { if (!open && !stored && settable) save(DEFAULT_BOUNTY); setOpen(!open); }}
                title=${locked ? 'Its bounty, locked on leaving the Anvil' : 'What is it worth?'}>
                <i className="amb"></i> ${stored || pending.current ? total : 'Set bounty'}${locked ? ' 🔒' : ''}
            </button>
            ${open && html`
                <div className="bounty-pop">
                    ${FIELDS.map(([key, label, hint]) => html`
                        <label key=${key} title=${hint}><span>${label} <b>${draft[key]}${key === 'ratio' ? '%' : ''}</b></span>
                            <input type="range" min=${BOUNTY_RANGES[key][0]} max=${BOUNTY_RANGES[key][1]} step=${key === 'ratio' ? 5 : 1} value=${draft[key]} disabled=${!settable}
                                onInput=${(/** @type {any} */ e) => save({ effort: draft.effort, resistance: draft.resistance, ratio: draft.ratio, [key]: Number(e.target.value) })} />
                        </label>
                    `)}
                    ${total
                        ? html`<div className="bounty-split"><span style=${{ width: `${draft.ratio}%` }}>${share || ''}</span><span>${total - share}</span></div>
                            <p>${share} from its quests, ${total - share} when it’s enshrined.</p>`
                        : html`<p>No resistance, no pay.</p>`}
                    ${locked && html`<p>Locked. Paid so far: ${stored.paid_actions + stored.paid_seal}.</p>`}
                    ${error && html`<div className="nc-error" role="alert">${error}</div>`}
                    ${settable && html`<div><button className="cls-layer" onClick=${clear}>Remove bounty</button></div>`}
                </div>
            `}
        </div>
    `;
}
