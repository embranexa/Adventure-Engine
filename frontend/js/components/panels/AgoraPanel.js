import { useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { remaining } from '../../lib/bounty.js';
import { Cabinet } from '../Cabinet.js';

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'arch', sealColor: '#f2c230', seed: 'agora', points: 8 };
const LAYOUT = { minCols: 3, maxCols: 3, cellH: 330 };
const KINDS = { action: 'Quests', enshrined: 'Enshrinings', reversal: 'Reversals' };

/** The vessel grows with what it holds: the next hundred above the balance, at least 200. @param {number} balance */
const capacity = (balance) => Math.max(200, Math.ceil((balance + 1) / 100) * 100);

/**
 * The Agora: the ambrosia you hold, as a vessel, with the ledger behind it and what your
 * locked bounties still owe. Elixir and nectar are locked.
 */
export function AgoraPanel() {
    const ambrosia = useWorkspaceStore((s) => s.ambrosia);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const [note, setNote] = useState(/** @type {string | null} */ (null));
    const { balance, entries, by_kind: byKind } = ambrosia;
    const cap = capacity(balance);

    const groups = useMemo(() => [{
        items: [
            { id: 'elixir', label: 'Elixir', sub: 'Locked', model: { type: 'flask', id: 'elixir', color: '#5fd0c5', on: false, points: 6 } },
            { id: 'ambrosia', label: 'Ambrosia', sub: `${balance} held`, model: { type: 'amphora', id: 'ambrosia', color: '#e9b949', on: true, points: 7, rings: 2, level: Math.max(0, balance) / cap, marks: cap / 100 } },
            { id: 'nectar', label: 'Nectar', sub: 'Locked', model: { type: 'flask', id: 'nectar', color: '#f08fb0', on: false, points: 5 } },
        ],
    }], [balance, cap]);

    const owed = useMemo(
        () => adventures.map((a) => ({ a, n: remaining(a) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n),
        [adventures],
    );
    const total = owed.reduce((n, x) => n + x.n, 0);

    return html`
        <div className="panel-body agora">
            <${Cabinet} groups=${groups} look=${LOOK} options=${LAYOUT} selectedId=${null} label="Vessels"
                onSelect=${(/** @type {string} */ id) => setNote(id === 'ambrosia' ? null : `${id === 'elixir' ? 'Elixir' : 'Nectar'} is locked. What opens it hasn’t been decided.`)}>
                <div className="nec-below">
                    <section className="nec-pane">
                        ${note && html`<p className="nec-dim" role="status">${note}</p>`}
                        <div className="ag-total"><b>${balance}</b><span>ambrosia held · the vessel holds ${cap}</span></div>
                        <h4>Ledger</h4>
                        ${!entries.length && html`<p className="nec-dim">Nothing earned yet. Set a bounty in the Anvil: its quests pay as you finish them, and enshrining pays the rest.</p>`}
                        <div className="ag-ledger">
                            ${entries.map((e) => html`
                                <div key=${e.id} className="ag-row">
                                    <time dateTime=${e.at}>${new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time>
                                    <span>${e.label}</span>
                                    <b className=${e.amount < 0 ? 'down' : 'up'}>${e.amount > 0 ? '+' : ''}${e.amount}</b>
                                    <em>${e.balance}</em>
                                </div>
                            `)}
                        </div>
                    </section>
                    <section className="nec-pane">
                        <div className="ag-total"><b>${total}</b><span>still to be earned</span></div>
                        ${owed.map(({ a, n }) => html`
                            <button key=${a.id} className="ag-owed" disabled=${!itemsById[a.id]} onClick=${() => selectItem(a.id, 'agora')}>
                                <span>${a.title ?? 'Untitled'}<small style=${{ color: PHASE_STAGES[a.phase].light }}>${a.phase === 'completed' ? 'waiting to be enshrined' : PHASE_STAGES[a.phase].matter}</small></span><b>${n}</b>
                            </button>
                        `)}
                        ${!owed.length && html`<p className="nec-dim">No locked bounties. One locks when its adventure reaches the Crucible.</p>`}
                        ${Object.keys(byKind).length > 0 && html`
                            <h4>By source</h4>
                            ${Object.entries(KINDS).map(([k, label]) => byKind[k] != null && html`<div key=${k} className="ana-read"><span>${label}</span><b>${byKind[k]}</b></div>`)}
                        `}
                    </section>
                </div>
            <//>
        </div>
    `;
}
