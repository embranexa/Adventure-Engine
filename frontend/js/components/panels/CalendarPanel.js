import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { addDays, hourOf, layoutWeek, sameDay, startOfWeek } from './calendarLayout.js';
import { dayKey, parseDay } from '../../filters.js';

const FIRST_HOUR = 6;   // visible range: 06:00 ...
const LAST_HOUR = 24;   // ... to midnight
const HOUR_PX = 28;
const DEFAULT_SCROLL_HOUR = 9;

const fmtTime = (/** @type {Date} */ d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (/** @type {Date} */ d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });

/** Re-renders the caller every `ms` so the "now" line moves. @param {number} ms */
function useNow(ms) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), ms);
        return () => clearInterval(timer);
    }, [ms]);
    return now;
}

/**
 * Memoized: hovering or selecting re-renders only the blocks whose flags changed.
 * @param {{
 *   block: import('./calendarLayout.js').CalendarBlock,
 *   selected: boolean, hovered: boolean,
 *   selectItem: WorkspaceState['selectItem'], hoverItem: WorkspaceState['hoverItem'],
 * }} props
 */
function CalendarBlockImpl({ block, selected, hovered, selectItem, hoverItem }) {
    const { event } = block;
    const className = ['cal-block', selected && 'sel', hovered && 'hov',
        block.clippedTop && 'clip-top', block.clippedBottom && 'clip-bottom'].filter(Boolean).join(' ');
    return html`
        <div
            className=${className}
            data-id=${event.id}
            title=${`${event.title}\n${fmtTime(block.start)} – ${fmtTime(block.end)}`}
            style=${{
                '--c': event.color,
                top: `${block.top * HOUR_PX}px`,
                height: `${block.height * HOUR_PX}px`,
                left: `${(block.lane / block.lanes) * 100}%`,
                width: `${100 / block.lanes}%`,
            }}
            onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); selectItem(event.id, 'calendar'); }}
            onPointerEnter=${() => hoverItem(event.id)}
            onPointerLeave=${() => hoverItem(null)}
        >
            <b>${event.title}</b>
            <span>${fmtTime(block.start)}</span>
        </div>
    `;
}
const CalendarBlock = memo(CalendarBlockImpl);

/** Week view of crawled events (Mon–Sun, viewer's local time). */
export function CalendarPanel() {
    const events = useWorkspaceStore((s) => s.visibleItems); // the filtered subset
    const dateRange = useWorkspaceStore((s) => s.filters.date_range);
    const setDateRange = useWorkspaceStore((s) => s.setDateRange);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);

    const now = useNow(60_000);
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const revealRef = useRef(/** @type {string | null} */ (null));

    const days = useMemo(() => layoutWeek(events, weekStart, FIRST_HOUR, LAST_HOUR), [events, weekStart]);
    const weekCount = days.reduce((n, d) => n + d.blocks.length, 0);

    // A selection made in another view: jump to that event's week, then scroll to it.
    useEffect(() => {
        if (!selectedId || selectionSource === 'calendar') return;
        const event = itemsById[selectedId];
        if (!event?.start) return;
        const target = startOfWeek(new Date(event.start));
        if (target.getTime() !== weekStart.getTime()) setWeekStart(target);
        revealRef.current = selectedId;
    }, [selectedId, selectionSource]);

    // Runs after every render: performs a pending reveal once its block exists.
    useEffect(() => {
        const id = revealRef.current;
        const scroller = scrollRef.current;
        if (!id || !scroller) return;
        const el = /** @type {HTMLElement | null} */ (scroller.querySelector(`[data-id="${CSS.escape(id)}"]`));
        if (!el) return;
        revealRef.current = null;
        const top = el.offsetTop, bottom = top + el.offsetHeight;
        if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
            scroller.scrollTo({ top: Math.max(0, top - HOUR_PX), behavior: 'smooth' });
        }
    });

    // On a new week (or when events first arrive), scroll to the earliest event, else 9 AM.
    const hasEvents = events.length > 0;
    useEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller || revealRef.current) return;
        const tops = days.flatMap((d) => d.blocks.map((b) => b.top));
        const hour = tops.length ? Math.min(...tops) - 1 : DEFAULT_SCROLL_HOUR - FIRST_HOUR;
        scroller.scrollTop = Math.max(0, hour) * HOUR_PX;
    }, [weekStart, hasEvents]);

    // --- day-range filter: drag across day headers; click = one day; shift+click extends ---
    const [drag, setDrag] = useState(/** @type {{ anchor: Date, current: Date } | null} */ (null));
    const dragRef = useRef(drag);
    dragRef.current = drag;

    /** @param {Date} a @param {Date} b */
    const commitRange = (a, b) => {
        const [from, to] = a <= b ? [a, b] : [b, a];
        const start = dayKey(from), end = dayKey(to);
        if (dateRange && dateRange.start === start && dateRange.end === end) setDateRange(null); // same range again: clear
        else setDateRange({ start, end, mode: dateRange?.mode ?? 'include' });
    };

    useEffect(() => {
        if (!drag) return;
        const onUp = () => {
            const d = dragRef.current;
            setDrag(null);
            if (d) commitRange(d.anchor, d.current);
        };
        window.addEventListener('pointerup', onUp, { once: true });
        return () => window.removeEventListener('pointerup', onUp);
    }, [drag !== null, dateRange]);

    /** @param {PointerEvent} e @param {Date} day */
    const onHeadDown = (e, day) => {
        e.preventDefault();
        if (e.shiftKey && dateRange) { // extend the existing range to this day
            const start = parseDay(dateRange.start), end = parseDay(dateRange.end);
            commitRange(day < start ? day : start, day > end ? day : end);
            return;
        }
        setDrag({ anchor: day, current: day });
    };

    /** Highlighted days: the drag preview while dragging, else the active range. */
    const shown = drag
        ? (drag.anchor <= drag.current ? [drag.anchor, drag.current] : [drag.current, drag.anchor])
        : dateRange ? [parseDay(dateRange.start), parseDay(dateRange.end)] : null;
    const inShown = (/** @type {Date} */ day) => shown != null && day >= shown[0] && day <= shown[1];
    const rangeLabel = dateRange
        ? (dateRange.start === dateRange.end
            ? fmtDay(parseDay(dateRange.start))
            : `${fmtDay(parseDay(dateRange.start))} – ${fmtDay(parseDay(dateRange.end))}`)
        : null;

    const nowHour = hourOf(now);
    const showNow = nowHour >= FIRST_HOUR && nowHour <= LAST_HOUR;
    const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

    return html`
        <div className="panel-body calendar" style=${{ '--hour': `${HOUR_PX}px` }}>
            <div className="cal-bar">
                <button className="btn cal-btn" title="Previous week" onClick=${() => setWeekStart(addDays(weekStart, -7))}>‹</button>
                <div className="cal-range">
                    ${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}
                    <small>${weekCount} event${weekCount === 1 ? '' : 's'}</small>
                </div>
                <button className="btn cal-btn" title="Next week" onClick=${() => setWeekStart(addDays(weekStart, 7))}>›</button>
                <button className="btn cal-btn" onClick=${() => setWeekStart(startOfWeek(new Date()))}>Today</button>
                ${rangeLabel && html`
                    <span className=${`cal-filter ${dateRange?.mode}`} title="Date filter (drag across day headers to change)">
                        ${dateRange?.mode === 'exclude' ? '⊘' : '◷'} ${rangeLabel}
                        <button className="cal-filter-x" title="Clear date filter" onClick=${() => setDateRange(null)}>✕</button>
                    </span>
                `}
            </div>

            <div className="cal-head" title="Drag across days to filter by date · click a day for one day · shift+click to extend">
                <div />
                ${days.map((d) => html`
                    <div
                        key=${d.date.toDateString()}
                        className=${['cal-day', sameDay(d.date, now) && 'today', inShown(d.date) && `in-range ${drag ? 'preview' : dateRange?.mode}`].filter(Boolean).join(' ')}
                        onPointerDown=${(/** @type {PointerEvent} */ e) => onHeadDown(e, d.date)}
                        onPointerEnter=${() => drag && setDrag({ ...drag, current: d.date })}
                    >
                        ${d.date.toLocaleDateString([], { weekday: 'short' }).slice(0, 2)} ${d.date.getDate()}
                    </div>
                `)}
            </div>

            <div className="cal-scroll" ref=${scrollRef} onClick=${() => selectItem(null, 'calendar')}>
                <div className="cal-grid" style=${{ height: `${(LAST_HOUR - FIRST_HOUR) * HOUR_PX}px` }}>
                    <div className="cal-gutter">
                        ${hours.map((h) => html`
                            <span key=${h} style=${{ top: `${(h - FIRST_HOUR) * HOUR_PX + 1}px` }}>${String(h).padStart(2, '0')}</span>
                        `)}
                    </div>
                    ${days.map((d) => html`
                        <div key=${d.date.toDateString()} className=${`cal-col ${inShown(d.date) ? 'in-range' : ''}`}>
                            ${d.blocks.map((b) => html`
                                <${CalendarBlock}
                                    key=${b.event.id}
                                    block=${b}
                                    selected=${b.event.id === selectedId}
                                    hovered=${b.event.id === hoveredId}
                                    selectItem=${selectItem}
                                    hoverItem=${hoverItem}
                                />
                            `)}
                            ${showNow && sameDay(d.date, now) && html`
                                <div className="cal-now" style=${{ top: `${(nowHour - FIRST_HOUR) * HOUR_PX}px` }} />
                            `}
                        </div>
                    `)}
                </div>
            </div>
        </div>
    `;
}
