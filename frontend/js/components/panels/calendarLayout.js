// Pure layouts for the calendar panel (no React): the week (timed blocks in a grid, all-day
// items as banners across the top) and the month. All dates are in the viewer's local
// time, matching the grid and the "now" line. Weekly items appear on every occurrence
// (lib/occurrences.js).

import { occurrences } from '../../lib/occurrences.js';

/** Monday 00:00 (local) of the week containing `date`. @param {Date} date */
export function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}

/** @param {Date} date @param {number} days */
export function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/** @param {Date} a @param {Date} b */
export function sameDay(a, b) {
    return a.toDateString() === b.toDateString();
}

/** Hours since local midnight, e.g. 17.5 for 5:30 PM. @param {Date} d */
export function hourOf(d) {
    return d.getHours() + d.getMinutes() / 60;
}

/**
 * @typedef {{
 *   key: string, event: PoolItem, start: Date, end: Date,
 *   top: number, height: number,      // hours from the top of the visible range
 *   lane: number, lanes: number,      // side-by-side position among overlapping events
 *   clippedTop: boolean, clippedBottom: boolean,
 * }} CalendarBlock
 * @typedef {{ date: Date, blocks: CalendarBlock[] }} CalendarDay
 * @typedef {{ key: string, event: PoolItem, from: number, to: number, row: number,
 *             clipStart: boolean, clipEnd: boolean }} CalendarBanner  // from/to: day columns, inclusive
 * @typedef {{ days: CalendarDay[], banners: CalendarBanner[], bannerRows: number }} CalendarWeek
 */

/**
 * Lay out the week starting at `weekStart`: timed occurrences as blocks on the day they
 * start (anything outside [firstHour, lastHour) is clipped to the visible range; one
 * spanning midnight ends at the bottom), all-day ones as banners across the days they
 * cover, stacked in rows.
 * @param {PoolItem[]} events
 * @param {Date} weekStart  Monday 00:00 local
 * @param {number} firstHour  e.g. 6
 * @param {number} lastHour   e.g. 24
 * @returns {CalendarWeek}
 */
export function layoutWeek(events, weekStart, firstHour, lastHour) {
    /** @type {CalendarDay[]} */
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), blocks: [] }));
    const weekEnd = addDays(weekStart, 7);
    /** @type {CalendarBanner[]} */
    const banners = [];

    for (const event of events) {
        for (const occ of occurrences(event, weekStart, weekEnd)) {
            const { start, end } = occ;
            const key = `${event.id}@${start.getTime()}`;
            if (occ.allDay) {
                const from = Math.max(0, Math.round((start.getTime() - weekStart.getTime()) / 864e5));
                const lastDay = addDays(end, -1);
                const to = Math.min(6, Math.round((new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate()).getTime() - weekStart.getTime()) / 864e5));
                banners.push({ key, event, from, to: Math.max(from, to), row: 0, clipStart: start < weekStart, clipEnd: end > weekEnd });
                continue;
            }
            if (start < weekStart || start >= weekEnd) continue; // shown on the day it starts
            const day = days.find((d) => sameDay(d.date, start));
            if (!day) continue;
            const startH = hourOf(start);
            const endH = sameDay(start, end) ? hourOf(end) : 24; // runs past midnight
            const top = Math.max(startH, firstHour) - firstHour;
            const bottom = Math.min(endH, lastHour) - firstHour;
            day.blocks.push({
                key, event, start, end,
                top: Math.min(top, lastHour - firstHour - 0.5),
                height: Math.max(bottom - top, 0.5), // keep tiny/clipped events clickable
                lane: 0, lanes: 1,
                clippedTop: startH < firstHour,
                clippedBottom: endH > lastHour || !sameDay(start, end),
            });
        }
    }

    for (const day of days) packLanes(day.blocks);
    // banners: longest first, each in the first row where its days are free
    banners.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
    /** @type {boolean[][]} */
    const rows = [];
    for (const b of banners) {
        let r = rows.findIndex((row) => row.slice(b.from, b.to + 1).every((taken) => !taken));
        if (r < 0) { r = rows.length; rows.push(Array(7).fill(false)); }
        for (let d = b.from; d <= b.to; d++) rows[r][d] = true;
        b.row = r;
    }
    return { days, banners, bannerRows: rows.length };
}

/**
 * @typedef {{ key: string, event: PoolItem, start: Date, end: Date, allDay: boolean }} MonthEntry
 * @typedef {{ date: Date, inMonth: boolean, entries: MonthEntry[] }} MonthDay
 */

/**
 * Six weeks (Monday first) covering the month of `monthStart`: every day's entries,
 * all-day ones first, then by time. An all-day item is listed on each day it covers.
 * @param {PoolItem[]} events @param {Date} monthStart  any day in the month
 * @returns {MonthDay[][]}
 */
export function layoutMonth(events, monthStart) {
    const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(gridStart, 42);
    /** @type {MonthDay[]} */
    const cells = Array.from({ length: 42 }, (_, i) => {
        const date = addDays(gridStart, i);
        return { date, inMonth: date.getMonth() === first.getMonth(), entries: [] };
    });
    for (const event of events) {
        for (const occ of occurrences(event, gridStart, gridEnd)) {
            const key = `${event.id}@${occ.start.getTime()}`;
            for (const cell of cells) {
                const dayEnd = addDays(cell.date, 1);
                const covers = occ.allDay ? occ.start < dayEnd && occ.end > cell.date : sameDay(occ.start, cell.date);
                if (covers) cell.entries.push({ key, event, start: occ.start, end: occ.end, allDay: occ.allDay });
            }
        }
    }
    for (const cell of cells) cell.entries.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
    return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * Give overlapping blocks side-by-side lanes. Each run of transitively overlapping
 * blocks shares a lane count, so unrelated events elsewhere in the day stay full width.
 * @param {CalendarBlock[]} blocks
 */
function packLanes(blocks) {
    blocks.sort((a, b) => a.top - b.top || b.height - a.height);
    /** @type {CalendarBlock[]} */
    let group = [];
    /** @type {number[]} */
    let laneEnds = [];
    let groupEnd = -Infinity;

    const closeGroup = () => {
        for (const b of group) b.lanes = laneEnds.length;
        group = [];
        laneEnds = [];
    };

    for (const block of blocks) {
        if (block.top >= groupEnd) closeGroup();
        let lane = laneEnds.findIndex((end) => end <= block.top);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = block.top + block.height;
        block.lane = lane;
        group.push(block);
        groupEnd = Math.max(groupEnd, block.top + block.height);
    }
    closeGroup();
}
