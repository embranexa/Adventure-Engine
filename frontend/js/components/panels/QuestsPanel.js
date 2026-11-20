import { useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { analyze, promotionTarget, toggleDone } from '../../lib/roadmap.js';
import { PromoteButton } from '../PromoteButton.js';

const DAY_MS = 86_400_000;
const COMPLETE_DELAY_MS = 420; // let the check land before the quest leaves

/** "today", "in 3 days", "2 days ago"; null when undated. @param {string | null} iso */
function dueLabel(iso) {
    if (!iso) return null;
    const start = new Date(iso);
    if (Number.isNaN(start.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(start);
    day.setHours(0, 0, 0, 0);
    const days = Math.round((day.getTime() - today.getTime()) / DAY_MS);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/**
 * The quest log (the Crucible): for every adventure in the Crucible, its bottlenecks —
 * the first unfinished actions of its roadmap, the ones not waiting on anything else.
 * Completing one may unlock the next. A finished roadmap offers its promotion.
 */
export function QuestsPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const mode = useWorkspaceStore((s) => s.mode);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const saveRoadmap = useWorkspaceStore((s) => s.saveRoadmap);
    const [completing, setCompleting] = useState(() => new Set(/** @type {string[]} */ ([])));

    const groups = useMemo(
        () => adventures
            .filter((a) => a.phase === 'constructing')
            .map((a) => ({ adventure: a, analysis: analyze(a.roadmap) })),
        [adventures],
    );
    const questCount = groups.reduce((n, g) => n + g.analysis.bottlenecks.length, 0);
    const crucible = PHASE_STAGES.constructing;

    /** @param {AdventureRecord} adventure @param {string} actionId */
    const complete = (adventure, actionId) => {
        const key = `${adventure.id}:${actionId}`;
        if (completing.has(key)) return;
        setCompleting((prev) => new Set(prev).add(key));
        setTimeout(() => {
            const current = useWorkspaceStore.getState().adventures.find((a) => a.id === adventure.id);
            if (current?.roadmap) saveRoadmap(adventure.id, toggleDone(current.roadmap, actionId));
            setCompleting((prev) => { const next = new Set(prev); next.delete(key); return next; });
        }, COMPLETE_DELAY_MS);
    };

    /** @param {string} id */
    const select = (id) => { if (mode === 'adventures') selectItem(id, 'quests'); };

    if (!groups.length) {
        return html`
            <div className="panel-body quests">
                <div className="nc-empty">The Crucible is empty
                    <small>Adventures moved to the Crucible list their next actions here</small>
                </div>
            </div>
        `;
    }

    return html`
        <div className="panel-body quests">
            <div className="ql-head">
                <b>${questCount}</b> ${questCount === 1 ? 'quest' : 'quests'}
                <span>· ${groups.length} in the ${crucible.module}</span>
            </div>
            <div className="ql-list">
                ${groups.map(({ adventure, analysis }) => {
                    const due = dueLabel(adventure.start);
                    const target = promotionTarget(adventure.phase);
                    const pct = analysis.total ? Math.round((analysis.doneCount / analysis.total) * 100) : 0;
                    return html`
                        <section key=${adventure.id} className=${`ql-group ${adventure.id === selectedId ? 'selected' : ''}`}>
                            <button className="ql-adventure" onClick=${() => select(adventure.id)}
                                disabled=${mode !== 'adventures'} title=${mode === 'adventures' ? 'Select this adventure' : 'Switch to Adventures to select it'}>
                                <span className="ql-title">${adventure.title}</span>
                                ${due && html`<span className="ql-due">${due}</span>`}
                            </button>
                            ${analysis.total > 0 && html`
                                <div className="ql-progress" title=${`${analysis.doneCount} of ${analysis.total} actions done`}>
                                    <span className="alm-meter"><i style=${{ width: `${pct}%` }}></i></span>
                                    <span>${analysis.doneCount}/${analysis.total}</span>
                                </div>
                            `}
                            ${analysis.total === 0 && html`
                                <button className="ql-none" onClick=${() => select(adventure.id)} disabled=${mode !== 'adventures'}>
                                    No roadmap yet — draft one in the Alembic
                                </button>
                            `}
                            ${analysis.complete && target && html`<${PromoteButton} adventureId=${adventure.id} target=${target} compact=${true} />`}
                            ${analysis.bottlenecks.map((quest) => {
                                const key = `${adventure.id}:${quest.id}`;
                                return html`
                                    <div key=${quest.id} className=${`ql-quest ${completing.has(key) ? 'completing' : ''}`}>
                                        <button className="ql-check" onClick=${() => complete(adventure, quest.id)}
                                            aria-label=${`Complete ${quest.title}`} title="Complete">
                                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>
                                        </button>
                                        <span className="ql-quest-title">${quest.title}</span>
                                        <span className="ql-quest-id">${quest.id}</span>
                                    </div>
                                `;
                            })}
                        </section>
                    `;
                })}
            </div>
        </div>
    `;
}
