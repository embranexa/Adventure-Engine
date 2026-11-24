import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { PHASE_STAGES } from '../../lifecycle.js';
import { analyze, promotionTarget, toggleDone } from '../../lib/roadmap.js';
import { safeHttpUrl } from '../../events.js';
import { nextActionPay, remaining } from '../../lib/bounty.js';
import { modelSpec } from '../../lib/items.js';
import { ModelView } from '../ModelView.js';
import { PartyRoster } from '../PartyRoster.js';
import { PromoteButton } from '../PromoteButton.js';

const DAY_MS = 86_400_000;
const COMPLETE_DELAY_MS = 420; // let the check land before the quest leaves

/** "today", "in 3 days", "2 days ago"; null when undated. @param {string | null} iso */
export function dueLabel(iso) {
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
 * An item's model, or an adventure's cover image, down the left side of its card (nothing
 * when it has neither, or the image won't load).
 * @param {{ adventure: AdventureRecord }} props
 */
export function QuestCover({ adventure }) {
    const src = safeHttpUrl(adventure.cover_url);
    const [failed, setFailed] = useState(false);
    const spec = useMemo(() => (adventure.type === 'item' ? modelSpec(adventure) : null), [adventure]);
    if (spec) return html`<div className="ql-cover"><${ModelView} spec=${spec} distance=${140} label=${adventure.title ?? ''} /></div>`;
    if (!src || failed) return null;
    return html`
        <div className="ql-cover">
            <img src=${src} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${() => setFailed(true)} />
        </div>
    `;
}

/**
 * The quest log: for every adventure that is alloy (constructing), its bottlenecks —
 * the first unfinished actions of its roadmap, the ones not waiting on anything else.
 * Completing one may unlock the next. A finished roadmap offers its promotion.
 * Each adventure card hovers and selects like the other panels.
 */
export function QuestsPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);
    const saveRoadmap = useWorkspaceStore((s) => s.saveRoadmap);
    const pins = useWorkspaceStore((s) => s.pins);
    const setPins = useWorkspaceStore((s) => s.setPins);
    const [completing, setCompleting] = useState(() => new Set(/** @type {string[]} */ ([])));

    const groups = useMemo(
        () => adventures
            .filter((a) => a.phase === 'constructing')
            .map((a) => ({ adventure: a, analysis: analyze(a.roadmap) })),
        [adventures],
    );
    const questCount = groups.reduce((n, g) => n + g.analysis.bottlenecks.length, 0);
    const crucible = PHASE_STAGES.constructing;

    // the anvil: pinned actions, in order. Done ones (and deleted ones) leave it; locked ones
    // wait out of sight until they're ready again.
    useEffect(() => {
        if (!adventures.length) return;
        const kept = pins.filter((p) => {
            const road = adventures.find((a) => a.id === p.adventure)?.roadmap;
            return road?.actions.some((x) => x.id === p.action) && !road.done.includes(p.action);
        });
        if (kept.length !== pins.length) setPins(kept);
    }, [adventures, pins]);
    const anvil = pins.flatMap((pin) => {
        const g = groups.find((x) => x.adventure.id === pin.adventure), quest = g?.analysis.bottlenecks.find((q) => q.id === pin.action);
        return g && quest ? [{ pin, adventure: g.adventure, quest }] : [];
    });
    const pinned = (/** @type {string} */ a, /** @type {string} */ q) => pins.some((p) => p.adventure === a && p.action === q);
    const lay = (/** @type {string} */ adventure, /** @type {string} */ action) => setPins([...pins, { adventure, action }]);
    const lift = (/** @type {Pin} */ pin) => setPins(pins.filter((p) => p !== pin));
    /** Swap with the one shown above or below. @param {number} i @param {1 | -1} way */
    const move = (i, way) => {
        const next = [...pins], x = next.indexOf(anvil[i].pin), y = next.indexOf(anvil[i + way].pin);
        [next[x], next[y]] = [next[y], next[x]];
        setPins(next);
    };

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

    // Like the other panels: hover highlights the adventure everywhere, click selects it.
    // Only for adventures in the current pool (not in Discovery mode, not filtered out).
    /** @param {string} id */
    const inPool = (id) => Boolean(itemsById[id]);

    if (!groups.length) {
        return html`
            <div className="panel-body quests">
                <div className="nc-empty">No alloy yet
                    <small>Adventures that become alloy list their next actions here</small>
                </div>
            </div>
        `;
    }

    return html`
        <div className="panel-body quests">
            <div className="ql-head">
                <b>${questCount}</b> ${questCount === 1 ? 'quest' : 'quests'}
                <span>· ${groups.length} ${crucible.matter}</span>
            </div>
            <div className="ql-list">
                ${anvil.length > 0 && html`
                    <section className="anvil">
                        <div className="anvil-head">⚒ On the anvil <b>${anvil.length}</b></div>
                        ${anvil.map(({ pin, adventure, quest }, i) => {
                            const pay = nextActionPay(adventure);
                            return html`
                                <div key=${`${adventure.id}:${quest.id}`} className=${`ql-quest ${completing.has(`${adventure.id}:${quest.id}`) ? 'completing' : ''}`}>
                                    <button className="ql-check" onClick=${() => complete(adventure, quest.id)} aria-label=${`Complete ${quest.title}`} title="Complete">
                                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg></button>
                                    <span className="ql-quest-text">
                                        <span className="ql-quest-title">${quest.title}</span>
                                        ${quest.notes && html`<span className="ql-quest-notes">${quest.notes}</span>`}
                                        <button className="anvil-of" disabled=${!inPool(adventure.id)} onClick=${() => selectItem(adventure.id, 'quests')}>${adventure.title}</button>
                                    </span>
                                    ${pay > 0 && html`<span className="ql-pay" title="Ambrosia for the next action">+${pay}</span>`}
                                    <span className="anvil-move">
                                        <button disabled=${i === 0} aria-label=${`Move ${quest.title} up`} onClick=${() => move(i, -1)}>▲</button>
                                        <button disabled=${i === anvil.length - 1} aria-label=${`Move ${quest.title} down`} onClick=${() => move(i, 1)}>▼</button>
                                    </span>
                                    <button className="anvil-btn on" aria-label=${`Take ${quest.title} off the anvil`} title="Take off the anvil" onClick=${() => lift(pin)}>⚒</button>
                                </div>`;
                        })}
                    </section>`}
                ${groups.map(({ adventure, analysis }) => {
                    const due = dueLabel(adventure.start);
                    const target = promotionTarget(adventure.phase);
                    const pct = analysis.total ? Math.round((analysis.doneCount / analysis.total) * 100) : 0;
                    const pay = nextActionPay(adventure), left = remaining(adventure);
                    const pooled = inPool(adventure.id);
                    const className = ['ql-group', pooled && 'pooled', adventure.id === selectedId && 'selected',
                        adventure.id === hoveredId && 'hovered'].filter(Boolean).join(' ');
                    return html`
                        <section
                            key=${adventure.id}
                            className=${className}
                            title=${pooled ? '' : 'Not in the current pool (Discovery mode or filtered out)'}
                            onClick=${() => pooled && selectItem(adventure.id, 'quests')}
                            onPointerEnter=${() => pooled && hoverItem(adventure.id)}
                            onPointerLeave=${() => pooled && hoverItem(null)}
                        >
                            <${QuestCover} key=${`${adventure.id}:${adventure.cover_url ?? ''}`} adventure=${adventure} />
                            <div className="ql-body">
                            <div className="ql-adventure">
                                <span className="ql-title">${adventure.title}</span>
                                ${left > 0 && html`<span className="ql-pay" title="Ambrosia still to be earned"><i className="amb"></i>${left}</span>`}
                                ${due && html`<span className="ql-due">${due}</span>`}
                            </div>
                            ${analysis.total > 0 && html`
                                <div className="ql-progress" title=${`${analysis.doneCount} of ${analysis.total} actions done`}>
                                    <span className="alm-meter"><i style=${{ width: `${pct}%` }}></i></span>
                                    <span>${analysis.doneCount}/${analysis.total}</span>
                                </div>
                            `}
                            ${analysis.total === 0 && html`
                                <div className="ql-none">No roadmap yet — draft one in the Alembic</div>
                            `}
                            ${analysis.complete && target && html`<${PromoteButton} adventureId=${adventure.id} target=${target} compact=${true} />`}
                            ${analysis.bottlenecks.filter((q) => !pinned(adventure.id, q.id)).map((quest) => {
                                const key = `${adventure.id}:${quest.id}`;
                                return html`
                                    <div key=${quest.id} className=${`ql-quest ${completing.has(key) ? 'completing' : ''}`}>
                                        <button className="ql-check" onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); complete(adventure, quest.id); }}
                                            aria-label=${`Complete ${quest.title}`} title="Complete">
                                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>
                                        </button>
                                        <span className="ql-quest-text">
                                            <span className="ql-quest-title">${quest.title}</span>
                                            ${quest.notes && html`<span className="ql-quest-notes">${quest.notes}</span>`}
                                        </span>
                                        ${pay > 0 && html`<span className="ql-pay" title="Ambrosia for the next action">+${pay}</span>`}
                                        <button className="anvil-btn" aria-label=${`Lay ${quest.title} on the anvil`} title="Lay on the anvil: to the top"
                                            onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); lay(adventure.id, quest.id); }}>⚒</button>
                                        <span className="ql-quest-id">${quest.id}</span>
                                    </div>
                                `;
                            })}
                            <${PartyRoster} adventure=${adventure} />
                            </div>
                        </section>
                    `;
                })}
            </div>
        </div>
    `;
}
