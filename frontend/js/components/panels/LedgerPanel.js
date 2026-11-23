import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { formatPrice, parseTime } from '../../events.js';
import { ADVENTURE_FLAGS, stageOf } from '../../lifecycle.js';
import { itemLensColor } from '../../lib/lens.js';
import { cityName, itemMetro, itemRegion } from '../../lib/regions.js';

const SORT_KEY = 'ledger-sort';

/** Cents for sorting by price: the lowest it can cost (free = 0), null if unknown. @param {Record<string, unknown>} d */
function priceCents(d) {
    if (d.free) return 0;
    const n = [d.price_cents, d.price_min_cents, d.price_max_cents].find((v) => typeof v === 'number');
    return typeof n === 'number' ? n : null;
}

const FLAG_ORDER = /** @type {AdventureFlag[]} */ (Object.keys(ADVENTURE_FLAGS));
/** @param {PoolItem} i @returns {AdventureFlag[]} */
const flagsOf = (i) => (i.kind === 'adventure' ? FLAG_ORDER.filter((f) => i.flags?.includes(f)) : []);

/** @param {unknown} v */
const tagsOf = (v) => (Array.isArray(v) ? v.filter((t) => typeof t === 'string') : []);

/**
 * The columns. `sort` gives the value rows are ordered by (null/undefined always last);
 * `show` what the cell says.
 * @type {{ key: string, label: string, sort: (i: PoolItem) => string | number | null | undefined, show: (i: PoolItem) => string, cls?: string }[]}
 */
const COLUMNS = [
    { key: 'title', label: 'Title', cls: 'ld-title', sort: (i) => i.title?.toLowerCase(), show: (i) => i.title ?? 'Untitled' },
    {
        // sorts by the most significant flag (ADVENTURE_FLAGS order), unflagged last
        key: 'flags', label: 'Flags', cls: 'ld-flags',
        sort: (i) => { const f = flagsOf(i); return f.length ? FLAG_ORDER.indexOf(f[0]) : null; },
        show: (i) => flagsOf(i).map((f) => ADVENTURE_FLAGS[f].glyph).join(' ') || '',
    },
    {
        key: 'when', label: 'When', sort: (i) => parseTime(i.start)?.getTime(),
        show: (i) => parseTime(i.start)?.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? '—',
    },
    { key: 'where', label: 'Where', sort: (i) => (i.venue || i.city || '').toLowerCase() || null, show: (i) => (i.location_approximate ? cityName(i.city) : i.venue || cityName(i.city)) ?? '—' },
    { key: 'city', label: 'City', sort: (i) => cityName(i.city)?.toLowerCase(), show: (i) => cityName(i.city) ?? '—' },
    { key: 'region', label: 'Region', sort: (i) => itemRegion(i), show: (i) => itemRegion(i) ?? '—' },
    { key: 'metro', label: 'Metro', sort: (i) => itemMetro(i), show: (i) => itemMetro(i) ?? '—' },
    { key: 'price', label: 'Price', sort: (i) => priceCents(i.details ?? {}), show: (i) => formatPrice(i.details ?? {}) ?? '—' },
    { key: 'guests', label: 'Going', sort: (i) => (typeof i.details?.guest_count === 'number' ? i.details.guest_count : null), show: (i) => (typeof i.details?.guest_count === 'number' ? i.details.guest_count.toLocaleString() : '—') },
    { key: 'tags', label: 'Tags', cls: 'ld-tags', sort: (i) => tagsOf(i.details?.tags).join(', ').toLowerCase() || null, show: (i) => tagsOf(i.details?.tags).join(', ') || '—' },
    { key: 'source', label: 'Source', sort: (i) => i.source ?? null, show: (i) => i.source ?? 'hand-made' },
    { key: 'matter', label: 'Matter', sort: (i) => stageOf(i)?.matter ?? null, show: (i) => stageOf(i)?.matter ?? '—' },
];

/** @returns {{ key: string, dir: 1 | -1 }} */
function savedSort() {
    try {
        const s = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null');
        if (s && COLUMNS.some((c) => c.key === s.key) && (s.dir === 1 || s.dir === -1)) return s;
    } catch { /* storage unavailable: use the default */ }
    return { key: 'when', dir: 1 };
}

/**
 * The Ledger: the matter the filters pass (the same subset as the Calendar and Atlas), as a
 * list. Click a column to sort by it (again to reverse); click a row to select it.
 */
export function LedgerPanel() {
    const items = useWorkspaceStore((s) => s.visibleItems);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);
    const lens = useWorkspaceStore((s) => s.filters.lens);
    useWorkspaceStore((s) => s.objects); // object colours feed the lens colours
    const [sort, setSort] = useState(savedSort);
    const bodyRef = useRef(/** @type {HTMLDivElement | null} */ (null));

    const rows = useMemo(() => {
        const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[1];
        const keyed = items.map((item) => ({ item, v: col.sort(item) }));
        keyed.sort((a, b) => {
            const an = a.v == null || a.v === '', bn = b.v == null || b.v === '';
            if (an || bn) return an === bn ? 0 : an ? 1 : -1; // unknowns last, either direction
            return (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * sort.dir;
        });
        return keyed.map((k) => k.item);
    }, [items, sort]);

    const sortBy = (/** @type {string} */ key) => {
        const next = { key, dir: /** @type {1 | -1} */ (sort.key === key ? -sort.dir : 1) };
        setSort(next);
        try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch { /* not kept */ }
    };

    // a selection made elsewhere scrolls its row into view
    useEffect(() => {
        if (!selectedId || selectionSource === 'ledger') return;
        bodyRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [selectedId, selectionSource]);

    return html`
        <div className="panel-body ledger">
            <div className="ld-bar">
                <span><b>${rows.length}</b> shown</span>
                <span className="ld-hint">click a column to sort · again to reverse</span>
            </div>
            <div className="ld-scroll" ref=${bodyRef}>
                <table className="ld-table">
                    <thead>
                        <tr>
                            <th className="ld-dot"></th>
                            ${COLUMNS.map((c) => html`
                                <th key=${c.key} className=${`${c.cls ?? ''} ${sort.key === c.key ? 'on' : ''}`} onClick=${() => sortBy(c.key)}
                                    title=${`Sort by ${c.label.toLowerCase()}`}>
                                    ${c.label}${sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                                </th>
                            `)}
                        </tr>
                    </thead>
                    <tbody onMouseLeave=${() => hoverItem(null)}>
                        ${rows.map((item) => html`
                            <tr key=${item.id} data-id=${item.id}
                                className=${[item.id === selectedId && 'selected', item.id === hoveredId && 'hovered'].filter(Boolean).join(' ')}
                                onClick=${() => selectItem(item.id, 'ledger')} onMouseEnter=${() => hoverItem(item.id)}>
                                <td className="ld-dot"><i style=${{ background: itemLensColor(item, lens) }}></i></td>
                                ${COLUMNS.map((c) => html`<td key=${c.key} className=${c.cls ?? ''}>${c.show(item)}</td>`)}
                            </tr>
                        `)}
                    </tbody>
                </table>
                ${rows.length === 0 && html`<div className="ld-empty">Nothing passes the filters</div>`}
            </div>
        </div>
    `;
}
