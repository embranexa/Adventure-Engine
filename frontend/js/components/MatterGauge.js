import { useMemo } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { MAIN_ROUTE, GRADE_STAGES, PHASE_STAGES, REVIEW_STAGES, rawMatter } from '../lifecycle.js';

/**
 * The analytics strip under the top bar: one vial per stage, filled by how many
 * items are there, named by matter. Adventures mode counts phases; Discovery counts
 * specimens and ore (harvested or fed) and tailings.
 */
export function MatterGauge() {
    const mode = useWorkspaceStore((s) => s.mode);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);

    const rows = useMemo(() => {
        /** @type {{ key: string, name: string, count: number, color: string, deep: string }[]} */
        let list;
        if (mode === 'discovery') {
            list = Object.entries({ ...GRADE_STAGES, ignored: REVIEW_STAGES.ignored }).map(([key, s]) => ({
                key, name: s.matter, color: s.color, deep: s.deep, count: rawEvents.filter((e) => rawMatter(e) === key).length,
            }));
        } else {
            list = MAIN_ROUTE.map((p) => ({
                key: p, name: PHASE_STAGES[p].matter, color: PHASE_STAGES[p].color, deep: PHASE_STAGES[p].deep,
                count: adventures.filter((a) => a.phase === p).length,
            }));
        }
        const max = Math.max(1, ...list.map((r) => r.count));
        return list.map((r) => ({ ...r, fill: `${Math.round((r.count / max) * 88)}%` }));
    }, [mode, adventures, rawEvents]);

    return html`
        <div className="gauge" aria-label="Matter by type">
            <span className="gauge-title">Matter</span>
            ${rows.map((r) => html`
                <div key=${r.key} className="gauge-item" style=${{ '--c': r.color, '--d': r.deep }} title=${`${r.count} ${r.name}`}>
                    <div className="gauge-vial"><div className="gauge-fill" style=${{ height: r.fill }}></div></div>
                    <span className="gauge-name">${r.name}</span>
                    <b className="gauge-count">${r.count}</b>
                </div>
            `)}
        </div>
    `;
}
