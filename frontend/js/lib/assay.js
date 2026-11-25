// What the Assay button would send (pure), and its results in words.

import { passes } from '../filters.js';

const REST_MS = 7 * 864e5;   // as backend/services/assay.py REST

/** Whether a specimen was read lately. @param {EventRecord} e @param {number} now */
export const triedLately = (e, now) => Boolean(e.assay?.at) && now - new Date(/** @type {string} */ (e.assay?.at)).getTime() < REST_MS;

/** The Centrifuge's specimens that pass the Nexus's filter and weren't read lately.
 *  @param {EventRecord[]} rawEvents @param {FilterState} filters @param {number} now */
export const assayable = (rawEvents, filters, now) => rawEvents.filter((e) => e.review === 'new' && e.missing.length > 0 && !triedLately(e, now)
    && passes(/** @type {PoolItem} */ ({ ...e, kind: 'omen' }), filters, 'discovery', now)).map((e) => e.id);

/** @type {Record<string, { label: string, color: string }>} */
export const OUTCOMES = {
    ok: { label: 'Read', color: '#3ccf8e' },
    empty: { label: 'Nothing readable', color: '#8a8d9a' },
    mismatch: { label: 'Another date', color: '#f2b134' },
    blocked: { label: 'Blocked', color: '#f0643c' },
    error: { label: 'Failed', color: '#ef3e4a' },
};

/** Field names as people say them. @type {Record<string, string>} */
export const FIELD_NAMES = { title: 'title', description: 'description', start_time: 'start', end_time: 'end', venue: 'venue', address: 'address', city: 'city', lat: 'exact location', cover_url: 'cover', costs: 'costs' };

/** What was found, in words. @param {string[]} keys */
export const named = (keys) => Object.keys(FIELD_NAMES).filter((k) => keys.includes(k)).map((k) => FIELD_NAMES[k]).join(', ');

/** A link's site. @param {string | null} url */
export function siteOf(url) {
    try { return new URL(/** @type {string} */ (url)).hostname.replace(/^www\./, ''); } catch { return 'no link'; }
}
