import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PARTY_STATUSES } from '../lifecycle.js';
import { partyOf } from '../lib/complexGraph.js';
import { Field } from './panels/AdventureEditor.js';

const AFTERMATH = /** @type {PartyStatus[]} */ (Object.keys(PARTY_STATUSES).filter((s) => PARTY_STATUSES[/** @type {PartyStatus} */ (s)].stage === 'aftermath'));

/**
 * What became of each player who took part (the Treasury): an aftermath, and the impact they
 * had. Saved at once, apart from the analysis; never required to seal.
 * @param {{ adventure: AdventureRecord, editing: boolean }} props
 */
export function AftermathPane({ adventure, editing }) {
    const setPartyMember = useWorkspaceStore((s) => s.setPartyMember);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const took = partyOf(adventure).filter((m) => m.status && PARTY_STATUSES[m.status].stage !== 'recruitment');
    if (!took.length) return null;

    return html`
        <section className="nec-pane">
            <h4>Party</h4>
            ${took.map((m) => {
                const status = /** @type {PartyStatus} */ (m.status), s = PARTY_STATUSES[status];
                /** @param {Parameters<WorkspaceState['setPartyMember']>[2]} changes */
                const save = async (changes) => { const err = await setPartyMember(adventure.id, m.id, changes); setError(err); return err; };
                return html`
                    <div key=${m.id} className="aft" style=${{ '--c': s.color }}>
                        <div className="aft-head"><i></i><b>${m.name}</b><em>${s.label}</em></div>
                        ${editing && html`
                            <div className="aft-choices" role="group" aria-label=${`Aftermath with ${m.name}`}>
                                ${AFTERMATH.map((k) => html`<button key=${k} aria-pressed=${k === status} className=${`cls-layer ${k === status ? 'on' : ''}`} title=${PARTY_STATUSES[k].hint}
                                    style=${{ '--c': PARTY_STATUSES[k].color }} onClick=${() => k !== status && save({ status: k })}>${PARTY_STATUSES[k].label}</button>`)}
                            </div>
                            <${Field} label="Impact" kind="textarea" placeholder="What they changed" value=${m.impact ?? ''} onCommit=${(/** @type {string} */ v) => save({ impact: v })} />`}
                        ${!editing && m.impact && html`<p className="ana-notes-read">${m.impact}</p>`}
                    </div>
                `;
            })}
            ${error && html`<div className="nc-error" role="alert">${error}</div>`}
        </section>
    `;
}
