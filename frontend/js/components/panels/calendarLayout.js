// Pure week-view layout for the calendar panel (no React). All dates are in the
// viewer's local time, matching the grid and the "now" line.

const DEFAULT_DURATION_H = 1; // for events without an end time

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
 *   event: PoolItem, start: Date, end: Date,
 *   top: number, height: number,      // hours from the top of the visible range
 *   lane: number, lanes: number,      // side-by-side position among overlapping events
 *   clippedTop: boolean, clippedBottom: boolean,
 * }} CalendarBlock
 * @typedef {{ date: Date, blocks: CalendarBlock[] }} CalendarDay
 */

/**
 * Place events into the 7 days of the week starting at `weekStart`.
 * Events are shown on the day they start; anything outside [firstHour, lastHour)
 * is clipped to the visible range (an event spanning midnight ends at the bottom).
 * @param {PoolItem[]} events
 * @param {Date} weekStart  Monday 00:00 local
 * @param {number} firstHour  e.g. 6
 * @param {number} lastHour   e.g. 24
 * @returns {CalendarDay[]}
 */
export function layoutWeek(events, weekStart, firstHour, lastHour) {
    /** @type {CalendarDay[]} */
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), blocks: [] }));
    const weekEnd = addDays(weekStart, 7);

    for (const event of events) {
        if (!event.start) continue; // undated (e.g. a hand-made adventure)
        const start = new Date(event.start);
        if (Number.isNaN(start.getTime()) || start < weekStart || start >= weekEnd) continue;
        let end = event.end ? new Date(event.end) : null;
        if (!end || Number.isNaN(end.getTime()) || end <= start) {
            end = new Date(start.getTime() + DEFAULT_DURATION_H * 36e5);
        }

        const day = days.find((d) => sameDay(d.date, start));
        if (!day) continue;

        const startH = hourOf(start);
        const endH = sameDay(start, end) ? hourOf(end) : 24; // runs past midnight
        const top = Math.max(startH, firstHour) - firstHour;
        const bottom = Math.min(endH, lastHour) - firstHour;
        day.blocks.push({
            event, start, end,
            top: Math.min(top, lastHour - firstHour - 0.5),
            height: Math.max(bottom - top, 0.5), // keep tiny/clipped events clickable
            lane: 0, lanes: 1,
            clippedTop: startH < firstHour,
            clippedBottom: endH > lastHour || !sameDay(start, end),
        });
    }

    for (const day of days) packLanes(day.blocks);
    return days;
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
