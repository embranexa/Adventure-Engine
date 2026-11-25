import { useMemo } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { onControl } from '../../lib/cards.js';
import { formatEventWhen } from '../../events.js';
import { Objectives } from '../Objectives.js';
import { Buffs } from '../Buffs.js';
import { SeriesDates } from '../SeriesDates.js';
import { ArenaParty } from '../ArenaParty.js';
import { QuestCover, dueLabel } from './QuestsPanel.js';

/**
 * The Arena: every adventure under way (animus) and who is in it, with what they bring.
 * Completing it makes an artifact.
 */
export function ArenaPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const live = useMemo(() => adventures.filter((a) => a.phase === 'consuming'), [adventures]);

    if (!live.length) return html`<div className="panel-body quests arena"><div className="nc-empty">No animus yet<small>Adventures under way appear here with their party</small></div></div>`;
    return html`
        <div className="panel-body quests arena">
            <div className="ql-head"><b>${live.length}</b> ${PHASE_STAGES.consuming.matter}</div>
            <div className="ql-list">
                ${live.map((a) => {
                    const pooled = Boolean(itemsById[a.id]), due = a.recurrence ? null : dueLabel(a.start);
                    return html`
                        <section key=${a.id} className=${['ql-group', pooled && 'pooled', a.id === selectedId && 'selected', a.id === hoveredId && 'hovered'].filter(Boolean).join(' ')}
                            title=${pooled ? '' : 'Not in the current pool (Discovery mode or filtered out)'}
                            onClick=${(/** @type {MouseEvent} */ e) => pooled && !onControl(e) && selectItem(a.id, 'arena')}
                            onPointerEnter=${() => pooled && hoverItem(a.id)} onPointerLeave=${() => pooled && hoverItem(null)}>
                            <${QuestCover} key=${`${a.id}:${a.cover_url ?? ''}`} adventure=${a} />
                            <div className="ql-body">
                                <div className="ql-adventure"><span className="ql-title">${a.title}</span>
                                    ${a.collaboration && html`<span className="pr-flag" title="Collaboration">☉</span>`}
                                    ${due && html`<span className="ql-due">${due}</span>`}</div>
                                ${(a.start || a.venue) && html`<div className="ql-due">${[a.start && formatEventWhen({ ...a, kind: 'adventure' }), a.venue || a.city].filter(Boolean).join(' · ')}</div>`}
                                ${a.adversaries.length > 0 && html`<div className="pr-foes">⚔ ${a.adversaries.map((x) => x.name).join(', ')}</div>`}
                                <${Objectives} adventure=${a} />
                                <${ArenaParty} adventure=${a} />
                                <${Buffs} adventure=${a} />
                                ${a.recurrence ? html`<${SeriesDates} adventure=${a} />` : html`<div className="pr-foot">
                                    <button className="btn" onClick=${() => setPhase(a.id, 'completed')} title="Done: it becomes an artifact in the Treasury">✦ Complete</button>
                                </div>`}
                            </div>
                        </section>
                    `;
                })}
            </div>
        </div>
    `;
}
