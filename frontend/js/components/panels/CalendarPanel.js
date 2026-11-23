import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { addDays, hourOf, layoutMonth, layoutWeek, sameDay, startOfWeek } from './calendarLayout.js';
import { dayKey, parseDay } from '../../filters.js';
import { stageOf } from '../../lifecycle.js';
import { byMatter, itemLensColor, lensLabel, lensValues } from '../../lib/lens.js';
import { focusedWindow } from '../../lib/windows.js';

const FIRST_HOUR = 6;   // visible range: 06:00 ...
const LAST_HOUR = 24;   // ... to midnight
const HOUR_PX = 28;
const DEFAULT_SCROLL_HOUR = 9;
const BANNER_PX = 20;
const MONTH_SHOWN = 4;   // entries listed per day in the month view (then "+N more")
const VIEW_KEY = 'calendar-view';

/** @returns {'week' | 'month'} */
function savedView() {
    try { return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; }
}

const fmtTime = (/** @type {Date} */ d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
 *   selected: boolean, hovered: boolean, lens: LensKey,
 *   selectItem: WorkspaceState['selectItem'], hoverItem: WorkspaceState['hoverItem'],
 * }} props
 */
function CalendarBlockImpl({ block, selected, hovered, lens, selectItem, hoverItem }) {
    const { event } = block;
    // coloured and labelled by the lens (Matter: the stage)
    const tag = byMatter(lens) ? stageOf(event)?.matter ?? '' : lensLabel(lens, lensValues(event, lens)[0]);
    const className = ['cal-block', selected && 'sel', hovered && 'hov',
        block.clippedTop && 'clip-top', block.clippedBottom && 'clip-bottom'].filter(Boolean).join(' ');
    return html`
        <div
            className=${className}
            data-id=${event.id}
            title=${`${event.title}\n${fmtTime(block.start)} – ${fmtTime(block.end)}`}
            style=${{
                '--c': itemLensColor(event, lens),
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
            <span>${tag} · ${fmtTime(block.start)}</span>
        </div>
    `;
}
const CalendarBlock = memo(CalendarBlockImpl);

/**
 * An all-day item: a banner across the days it covers, at the top of the week.
 * @param {{ banner: import('./calendarLayout.js').CalendarBanner, selected: boolean, hovered: boolean, lens: LensKey,
 *           selectItem: WorkspaceState['selectItem'], hoverItem: WorkspaceState['hoverItem'] }} props
 */
function CalendarBannerImpl({ banner, selected, hovered, lens, selectItem, hoverItem }) {
    const { event } = banner;
    const className = ['cal-banner', selected && 'sel', hovered && 'hov', banner.clipStart && 'clip-start', banner.clipEnd && 'clip-end'].filter(Boolean).join(' ');
    return html`
        <div className=${className} data-id=${event.id} title=${`${event.title}\nAll day`}
            style=${{ '--c': itemLensColor(event, lens), gridColumn: `${banner.from + 2} / ${banner.to + 3}`, gridRow: banner.row + 1 }}
            onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); selectItem(event.id, 'calendar'); }}
            onPointerEnter=${() => hoverItem(event.id)} onPointerLeave=${() => hoverItem(null)}>
            ${event.title}
        </div>
    `;
}
const CalendarBanner = memo(CalendarBannerImpl);

/** The calendar: a week (Mon–Sun) or a month, in the viewer's local time. Weekly items
 *  show on every occurrence; all-day items as banners at the top of their days. */
export function CalendarPanel() {
    const events = useWorkspaceStore((s) => s.visibleItems); // the filtered subset
    const dateRange = useWorkspaceStore((s) => s.filters.date_range);
    const setDateRange = useWorkspaceStore((s) => s.setDateRange);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectedId = useWorkspaceStore((s) => s.selectedItemId);
    const selectionSource = useWorkspaceStore((s) => s.selectionSource);
    const hoveredId = useWorkspaceStore((s) => s.hoveredItemId);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const lens = useWorkspaceStore((s) => s.filters.lens);
    useWorkspaceStore((s) => s.entities); // entity colours (Codex) feed the lens colours
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);

    const now = useNow(60_000);
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [view, setViewState] = useState(savedView);
    const [monthAnchor, setMonthAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const setView = (/** @type {'week' | 'month'} */ v) => {
        setViewState(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* still switches for this session */ }
        if (v === 'month') setMonthAnchor(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1));
    };
    const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const revealRef = useRef(/** @type {string | null} */ (null));

    const week = useMemo(() => layoutWeek(events, weekStart, FIRST_HOUR, LAST_HOUR), [events, weekStart]);
    const days = week.days;
    const weekCount = days.reduce((n, d) => n + d.blocks.length, 0) + week.banners.length;
    const month = useMemo(() => (view === 'month' ? layoutMonth(events, monthAnchor) : null), [view, events, monthAnchor]);
    const monthCount = month ? new Set(month.flat().filter((d) => d.inMonth).flatMap((d) => d.entries.map((e) => e.key))).size : 0;

    // A selection made in another view: jump to that event's week, then scroll to it.
    useEffect(() => {
        if (!selectedId || selectionSource === 'calendar') return;
        const event = itemsById[selectedId];
        if (!event?.start) return;
        const target = startOfWeek(new Date(event.start));
        if (target.getTime() !== weekStart.getTime()) setWeekStart(target);
        const first = new Date(event.start);
        setMonthAnchor(new Date(first.getFullYear(), first.getMonth(), 1));
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

    // --- day-range filter: drag across day headers (week) or day cells (month);
    //     click = one day; shift+click extends ---
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
        const win = focusedWindow(); // the drag's window (the panel may be popped out)
        win.addEventListener('pointerup', onUp, { once: true });
        return () => win.removeEventListener('pointerup', onUp);
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
                <div className="sc-views" role="group" aria-label="View">
                    <button className=${`sc-view ${view === 'week' ? 'active' : ''}`} onClick=${() => setView('week')}>Week</button>
                    <button className=${`sc-view ${view === 'month' ? 'active' : ''}`} onClick=${() => setView('month')}>Month</button>
                </div>
                ${view === 'week' ? html`
                    <button className="btn cal-btn" title="Previous week" onClick=${() => setWeekStart(addDays(weekStart, -7))}>‹</button>
                    <div className="cal-range">
                        ${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}
                        <small>${weekCount} event${weekCount === 1 ? '' : 's'}</small>
                    </div>
                    <button className="btn cal-btn" title="Next week" onClick=${() => setWeekStart(addDays(weekStart, 7))}>›</button>
                ` : html`
                    <button className="btn cal-btn" title="Previous month" onClick=${() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}>‹</button>
                    <div className="cal-range">
                        ${monthAnchor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                        <small>${monthCount} event${monthCount === 1 ? '' : 's'}</small>
                    </div>
                    <button className="btn cal-btn" title="Next month" onClick=${() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}>›</button>
                `}
                <button className="btn cal-btn" onClick=${() => { setWeekStart(startOfWeek(new Date())); setMonthAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }}>Today</button>
                ${rangeLabel && html`
                    <span className=${`cal-filter ${dateRange?.mode}`} title="Date filter (drag across day headers to change)">
                        ${dateRange?.mode === 'exclude' ? '⊘' : '◷'} ${rangeLabel}
                        <button className="cal-filter-x" title="Clear date filter" onClick=${() => setDateRange(null)}>✕</button>
                    </span>
                `}
            </div>

            ${view === 'month' && month && html`
                <div className="cal-month" onClick=${() => selectItem(null, 'calendar')}
                    title="Drag across days to filter by date · click a day for one day · shift+click to extend">
                    <div className="cal-month-head">
                        ${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => html`<div key=${d}>${d}</div>`)}
                    </div>
                    ${month.map((weekDays, w) => html`
                        <div key=${w} className="cal-month-week">
                            ${weekDays.map((cell) => html`
                                <div key=${cell.date.toDateString()}
                                    className=${['cal-mday', !cell.inMonth && 'out', sameDay(cell.date, now) && 'today', inShown(cell.date) && `in-range ${drag ? 'preview' : dateRange?.mode}`].filter(Boolean).join(' ')}
                                    onPointerDown=${(/** @type {PointerEvent} */ e) => {
                                        // an event, the day number (opens the week) or "+N more" keep their own clicks
                                        if (/** @type {Element} */ (e.target).closest('.cal-mentry, .cal-mday-num, .cal-more')) return;
                                        onHeadDown(e, cell.date);
                                    }}
                                    onPointerEnter=${() => drag && setDrag({ ...drag, current: cell.date })}>
                                    <button className="cal-mday-num" title="Open this week"
                                        onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); setWeekStart(startOfWeek(cell.date)); setView('week'); }}>
                                        ${cell.date.getDate()}
                                    </button>
                                    ${cell.entries.slice(0, MONTH_SHOWN).map((entry) => html`
                                        <div key=${entry.key}
                                            className=${['cal-mentry', entry.allDay && 'all-day', entry.event.id === selectedId && 'sel', entry.event.id === hoveredId && 'hov'].filter(Boolean).join(' ')}
                                            style=${{ '--c': itemLensColor(entry.event, lens) }}
                                            title=${`${entry.event.title}\n${entry.allDay ? 'All day' : `${fmtTime(entry.start)} – ${fmtTime(entry.end)}`}`}
                                            onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); selectItem(entry.event.id, 'calendar'); }}
                                            onPointerEnter=${() => hoverItem(entry.event.id)} onPointerLeave=${() => hoverItem(null)}>
                                            ${!entry.allDay && html`<i>${fmtTime(entry.start)}</i>`}${entry.event.title}
                                        </div>
                                    `)}
                                    ${cell.entries.length > MONTH_SHOWN && html`<span className="cal-more">+${cell.entries.length - MONTH_SHOWN} more</span>`}
                                </div>
                            `)}
                        </div>
                    `)}
                </div>
            `}

            ${view === 'week' && html`
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

            ${week.bannerRows > 0 && html`
                <div className="cal-allday" style=${{ gridTemplateRows: `repeat(${week.bannerRows}, ${BANNER_PX}px)` }}>
                    <span className="cal-allday-label" style=${{ gridRow: `1 / ${week.bannerRows + 1}` }}>all day</span>
                    ${week.banners.map((b) => html`
                        <${CalendarBanner} key=${b.key} banner=${b} selected=${b.event.id === selectedId} hovered=${b.event.id === hoveredId}
                            lens=${lens} selectItem=${selectItem} hoverItem=${hoverItem} />
                    `)}
                </div>
            `}

            <div className="cal-scroll" ref=${scrollRef} onClick=${() => selectItem(null, 'calendar')}>
                <div className="cal-grid" style=${{ height: `${(LAST_HOUR - FIRST_HOUR) * HOUR_PX}px` }}>
                    ${showNow && days.some((d) => sameDay(d.date, now)) && html`
                        <div className="cal-now-guide" style=${{ top: `${(nowHour - FIRST_HOUR) * HOUR_PX}px` }} />
                    `}
                    <div className="cal-gutter">
                        ${showNow && days.some((d) => sameDay(d.date, now)) && html`
                            <span className="cal-now-tag" style=${{ top: `${(nowHour - FIRST_HOUR) * HOUR_PX - 6}px` }}>
                                ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                        `}
                        ${hours.map((h) => html`
                            <span key=${h} style=${{ top: `${(h - FIRST_HOUR) * HOUR_PX + 1}px` }}>${String(h).padStart(2, '0')}</span>
                        `)}
                    </div>
                    ${days.map((d) => html`
                        <div key=${d.date.toDateString()} className=${`cal-col ${inShown(d.date) ? 'in-range' : ''}`}>
                            ${d.blocks.map((b) => html`
                                <${CalendarBlock}
                                    key=${b.key}
                                    block=${b}
                                    selected=${b.event.id === selectedId}
                                    hovered=${b.event.id === hoveredId}
                                    lens=${lens}
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
            `}
        </div>
    `;
}
