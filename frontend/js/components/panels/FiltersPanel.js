import { useMemo } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { UNKNOWN, facetCounts, formatDistance, hasActiveFilters, isSealed, parseDay } from '../../filters.js';

const fmtDay = (/** @type {string} */ d) => parseDay(d).toLocaleDateString([], { month: 'short', day: 'numeric' });

/**
 * One filterable value (a virtual object): click cycles off -> include -> exclude -> off.
 * @param {{ label: string, count: number, mode: FilterMode | undefined, onClick: () => void }} props
 */
function Chip({ label, count, mode, onClick }) {
    const title = mode === 'include' ? 'Included (click to exclude)'
        : mode === 'exclude' ? 'Excluded (click to turn off)'
            : 'Click to include';
    return html`
        <button className=${`fchip ${mode ?? ''}`} onClick=${onClick} title=${title}>
            ${mode === 'include' ? '＋ ' : mode === 'exclude' ? '－ ' : ''}${label}<b>${count}</b>
        </button>
    `;
}

/**
 * The active filter as a list of virtual objects: Hermetic Seal, range filters (from the
 * calendar and map), and the derived facets with counts. Edits apply everywhere at once.
 */
export function FiltersPanel() {
    const mode = useWorkspaceStore((s) => s.mode);
    const items = useWorkspaceStore((s) => s.items);
    const visibleCount = useWorkspaceStore((s) => s.visibleItems.length);
    const filters = useWorkspaceStore((s) => s.filters);
    const cycleFacet = useWorkspaceStore((s) => s.cycleFacet);
    const toggleSeal = useWorkspaceStore((s) => s.toggleSeal);
    const toggleRangeMode = useWorkspaceStore((s) => s.toggleRangeMode);
    const setDateRange = useWorkspaceStore((s) => s.setDateRange);
    const setRing = useWorkspaceStore((s) => s.setRing);
    const clearFilters = useWorkspaceStore((s) => s.clearFilters);

    const groups = useMemo(() => facetCounts(items, mode), [items, mode]);
    const sealedCount = useMemo(() => {
        const now = Date.now();
        return mode === 'adventures' ? items.filter((i) => isSealed(i, now)).length : 0;
    }, [items, mode]);

    const { date_range: range, ring } = filters;

    return html`
        <div className="panel-body filters">
            <div className="flt-result">
                <span><b>${visibleCount}</b> of ${items.length} ${mode === 'discovery' ? 'omens' : 'adventures'} pass</span>
                ${hasActiveFilters(filters) && html`<button className="btn flt-clear" onClick=${clearFilters}>Clear filters</button>`}
            </div>

            ${mode === 'adventures' && html`
                <section className="flt-group">
                    <h4>Hermetic Seal</h4>
                    <button className=${`fchip seal ${filters.seal ? 'exclude' : ''}`} onClick=${toggleSeal}
                        title="Hides past adventures and those in the Treasury, Necropolis and Archive">
                        ${filters.seal ? '⛬ Sealed: past, Treasury, Necropolis, Archive' : '⛬ Seal broken: showing everything'}
                        <b>${sealedCount}</b>
                    </button>
                </section>
            `}

            <section className="flt-group">
                <h4>Ranges</h4>
                ${range
                    ? html`
                        <span className=${`fchip range ${range.mode}`}>
                            <button className="flt-mode" onClick=${() => toggleRangeMode('date_range')} title="Switch include / exclude">
                                ${range.mode === 'include' ? '＋' : '－'}
                            </button>
                            ◷ ${range.start === range.end ? fmtDay(range.start) : `${fmtDay(range.start)} – ${fmtDay(range.end)}`}
                            <button className="flt-x" onClick=${() => setDateRange(null)} title="Remove">✕</button>
                        </span>`
                    : html`<span className="flt-hint">◷ Drag across days in the calendar header</span>`}
                ${ring
                    ? html`
                        <span className=${`fchip range ${ring.mode}`}>
                            <button className="flt-mode" onClick=${() => toggleRangeMode('ring')} title="Switch include (inside) / exclude (outside)">
                                ${ring.mode === 'include' ? '＋' : '－'}
                            </button>
                            ◎ ${formatDistance(ring.radius_km, filters.units)} ${ring.mode === 'include' ? 'around' : 'away from'} ${ring.center.label || 'point'}
                            <button className="flt-x" onClick=${() => setRing(null)} title="Remove">✕</button>
                        </span>`
                    : html`<span className="flt-hint">◎ Place a proximity ring on the map</span>`}
            </section>

            ${groups.map(({ facet, values }) => html`
                <section key=${facet.key} className="flt-group">
                    <h4>${facet.label}</h4>
                    <div className="flt-chips">
                        ${values.map(([value, count]) => html`
                            <${Chip}
                                key=${value}
                                label=${value === UNKNOWN ? 'Unknown' : facet.display ? facet.display(value) : value}
                                count=${count}
                                mode=${filters.facets[facet.key]?.[value]}
                                onClick=${() => cycleFacet(facet.key, value)}
                            />
                        `)}
                        ${values.length === 0 && html`<span className="flt-hint">Nothing in this pool yet</span>`}
                    </div>
                </section>
            `)}
        </div>
    `;
}
