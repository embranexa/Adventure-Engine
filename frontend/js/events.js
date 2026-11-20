// Pure helpers for pool items: omens (raw events) and adventures. No React, no store.

import { stageColor } from './lifecycle.js';

/**
 * Turn a list of pool records (omens or adventures) into store state. Items whose
 * data didn't change keep the same object, so memoized components showing them skip
 * re-rendering. The color is the item's stage (matter) color, the same in every view.
 * @param {PoolRecord[]} incoming
 * @param {Record<string, PoolItem>} previous
 * @returns {{ items: PoolItem[], itemsById: Record<string, PoolItem> }}
 */
export function indexItems(incoming, previous) {
    /** @type {Record<string, PoolItem>} */
    const itemsById = {};
    const items = incoming.map((record) => {
        const old = previous[record.id];
        const item = old && sameRecord(old, record)
            ? old
            : { ...record, color: stageColor(record) };
        itemsById[item.id] = item;
        return item;
    });
    return { items, itemsById };
}

/** @param {PoolItem} item @param {PoolRecord} record */
function sameRecord(item, record) {
    const { color, ...rest } = item;
    return JSON.stringify(rest) === JSON.stringify(record);
}

/**
 * True when two lists hold the same items in the same order (by reference).
 * @param {PoolItem[]} a @param {PoolItem[]} b
 */
export function sameList(a, b) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

// --- display helpers ---

/**
 * Absolute http(s) URL, or null. Guards links and images from event data
 * (blocks javascript: and other schemes).
 * @param {unknown} link
 */
export function safeHttpUrl(link) {
    if (typeof link !== 'string' || !link) return null;
    try {
        const url = new URL(link, window.location.href);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

/** @param {string | null} iso */
export function parseTime(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Intl formatter in the event's own timezone (falls back to the viewer's).
 * @param {string | null} timeZone @param {Intl.DateTimeFormatOptions} options
 */
function formatter(timeZone, options) {
    try {
        return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timeZone ?? undefined });
    } catch {
        return new Intl.DateTimeFormat(undefined, options); // unknown timezone name
    }
}

/**
 * "Thu, Nov 20, 5:00 PM – 7:00 PM PST" in the event's timezone.
 * @param {PoolRecord} ev
 */
export function formatEventWhen(ev) {
    const start = parseTime(ev.start);
    if (!start) return 'Unknown time';
    const end = parseTime(ev.end);
    const day = formatter(ev.timezone, { weekday: 'short', month: 'short', day: 'numeric' });
    const time = formatter(ev.timezone, { hour: 'numeric', minute: '2-digit' });
    const zone = formatter(ev.timezone, { timeZoneName: 'short' })
        .formatToParts(start).find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (!end) return `${day.format(start)}, ${time.format(start)} ${zone}`;
    const sameDay = day.format(start) === day.format(end);
    const endText = sameDay ? time.format(end) : `${day.format(end)}, ${time.format(end)}`;
    return `${day.format(start)}, ${time.format(start)} – ${endText} ${zone}`;
}

/** @param {number} cents */
const dollars = (cents) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);

/**
 * "Free", "$25", "$10 – $40", or null when the source gave no price.
 * @param {Record<string, unknown>} details
 */
export function formatPrice(details) {
    if (details.free) return 'Free';
    /** @param {string} key */
    const num = (key) => (typeof details[key] === 'number' ? /** @type {number} */ (details[key]) : null);
    const price = num('price_cents'), min = num('price_min_cents'), max = num('price_max_cents');
    if (min != null && max != null && min !== max) return `${dollars(min)} – ${dollars(max)}`;
    const single = price ?? min ?? max;
    return single != null ? dollars(single) : null;
}
