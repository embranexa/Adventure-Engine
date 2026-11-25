// When an item happens (pure, no React): one-off or weekly, timed or all day.
// See resources/UPGRADES_PLAN.md (U4) and the Adventure model (backend/db/models.py).
//
// An item has `start` / `end` (ISO), `all_day` and `recurrence` ({ freq: 'weekly',
// days: [0..6] with Monday = 0, until: 'YYYY-MM-DD' | null }). For a weekly item, start and
// end are the first occurrence: its date, its time of day and its length. All-day items
// span whole days: start and end are the first and last day's local midnights.
// Everything here works in the viewer's local time, like the calendar.

const HOUR_MS = 36e5;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_LEN_MS = HOUR_MS; // a timed item without an end lasts an hour

/** @typedef {{ start: Date, end: Date, allDay: boolean }} Occurrence */

/** Monday = 0 ... Sunday = 6. @param {Date} d */
export const weekday = (d) => (d.getDay() + 6) % 7;

/** Local midnight of a date. @param {Date} d */
export function dayStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** @param {Date} d @param {number} n */
function plusDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

/** Local date -> "2026-11-20". @param {Date} d */
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-11-20" -> local midnight. @param {string} s */
function parseDay(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * The first occurrence, or null when the item has no (valid) start. All-day: start at the
 * first day's midnight, end at the midnight after the last day.
 * @param {{ start?: string | null, end?: string | null, all_day?: boolean | null }} item
 * @returns {Occurrence | null}
 */
export function firstOccurrence(item) {
    if (!item.start) return null;
    const start = new Date(item.start);
    if (Number.isNaN(start.getTime())) return null;
    let end = item.end ? new Date(item.end) : null;
    if (item.all_day) {
        const from = dayStart(start);
        const last = end && !Number.isNaN(end.getTime()) && end >= from ? dayStart(end) : from;
        return { start: from, end: plusDays(last, 1), allDay: true };
    }
    if (!end || Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + DEFAULT_LEN_MS);
    return { start, end, allDay: false };
}

/** The item's weekly rule, or null. @param {{ recurrence?: any }} item */
function weekly(item) {
    const r = item.recurrence;
    return r && r.freq === 'weekly' && Array.isArray(r.days) && r.days.length ? r : null;
}

/**
 * Every occurrence overlapping [from, to) (local Dates), oldest first. A series' dates that
 * are artifacts (done_dates) are left out: the artifacts stand there themselves.
 * @param {{ start?: string | null, end?: string | null, all_day?: boolean | null, recurrence?: any, done_dates?: string[] }} item
 * @param {Date} from @param {Date} to
 * @returns {Occurrence[]}
 */
export function occurrences(item, from, to) {
    const first = firstOccurrence(item);
    if (!first) return [];
    const rule = weekly(item);
    if (!rule) return first.start < to && first.end > from ? [first] : [];
    const len = first.end.getTime() - first.start.getTime();
    const days = new Set(rule.days);
    const until = rule.until ? plusDays(parseDay(rule.until), 1) : null; // the until day counts
    const out = [];
    // walk days from the later of (first day, a bit before `from`) up to `to`
    let day = dayStart(new Date(Math.max(first.start.getTime(), from.getTime() - len - DAY_MS)));
    if (day < dayStart(first.start)) day = dayStart(first.start);
    for (let guard = 0; day < to && guard < 800; guard++, day = plusDays(day, 1)) {
        if (until && day >= until) break;
        if (!days.has(weekday(day)) && !(guard === 0 && day.getTime() === dayStart(first.start).getTime())) continue;
        if (item.done_dates?.includes(dayKey(day))) continue;
        const start = new Date(day);
        start.setHours(first.start.getHours(), first.start.getMinutes(), 0, 0);
        const end = new Date(start.getTime() + len);
        if (start < first.start) continue;
        if (start < to && end > from) out.push({ start, end, allDay: first.allDay });
    }
    return out;
}

/**
 * The whole span the item can occur in, in ms: [first start, last end]; the end is
 * Infinity for a weekly item without an end date. Null without a start.
 * @param {{ start?: string | null, end?: string | null, all_day?: boolean | null, recurrence?: any }} item
 * @returns {[number, number] | null}
 */
export function span(item) {
    const first = firstOccurrence(item);
    if (!first) return null;
    const rule = weekly(item);
    if (!rule) return [first.start.getTime(), first.end.getTime()];
    if (!rule.until) return [first.start.getTime(), Infinity];
    const len = first.end.getTime() - first.start.getTime();
    return [first.start.getTime(), plusDays(parseDay(rule.until), 1).getTime() + len];
}

/** Does any occurrence overlap [from, to)? @param {any} item @param {Date} from @param {Date} to */
export function occursIn(item, from, to) {
    return occurrences(item, from, to).length > 0;
}

/**
 * A weekly item's latest dates that have started, newest first; `done`: it's an artifact.
 * @param {AdventureRecord} item @param {Date} now @param {number} [max]
 */
export function pastDates(item, now, max = 6) {
    const first = firstOccurrence(item);
    if (!first || !weekly(item)) return [];
    const from = new Date(Math.max(first.start.getTime(), now.getTime() - (max + 1) * 7 * DAY_MS));
    return occurrences({ ...item, done_dates: [] }, from, now).filter((o) => weekly(item)?.days.includes(weekday(o.start)))
        .reverse().slice(0, max).map((o) => ({ ...o, key: dayKey(o.start), done: item.done_dates.includes(dayKey(o.start)) }));
}

/** "Mon, Thu" style label for a weekly rule. @param {{ days: number[] }} rule */
export function weekdaysLabel(rule) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return [...rule.days].sort((a, b) => a - b).map((d) => names[d]).join(', ');
}
