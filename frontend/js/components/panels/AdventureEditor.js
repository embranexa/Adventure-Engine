import { useEffect, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ADVENTURE_TYPES } from '../../lifecycle.js';
import { confirmHere } from '../../lib/windows.js';
import { weekday } from '../../lib/occurrences.js';
import { PLACE_PLACEHOLDER, coordsText, readPlace } from '../../lib/places.js';

const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** Date -> "2026-11-20" (local). @param {Date} d */
const dayText = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** "2026-11-20" + minutes since midnight (local) -> ISO. @param {string} day @param {number} minutes */
function isoAt(day, minutes) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 0, minutes).toISOString();
}
/** Minutes since local midnight, snapped to a quarter hour. @param {Date} d */
const quarter = (d) => Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * A 24-hour time: hour and quarter-hour selects. `allowMidnightEnd` adds 24:00 (an end at
 * midnight). Value and onChange are minutes since midnight.
 * @param {{ value: number, onChange: (minutes: number) => void, allowMidnightEnd?: boolean, label: string }} props
 */
function TimeInput({ value, onChange, allowMidnightEnd = false, label }) {
    const h = Math.floor(value / 60), m = value % 60;
    const hours = Array.from({ length: allowMidnightEnd ? 25 : 24 }, (_, i) => i);
    return html`
        <span className="ae-time" aria-label=${label}>
            <select value=${h} onChange=${(/** @type {any} */ e) => { const nh = Number(e.target.value); onChange(nh * 60 + (nh === 24 ? 0 : m)); }}>
                ${hours.map((x) => html`<option key=${x} value=${x}>${pad2(x)}</option>`)}
            </select>
            <b>:</b>
            <select value=${m} disabled=${h === 24} onChange=${(/** @type {any} */ e) => onChange(h * 60 + Number(e.target.value))}>
                ${[0, 15, 30, 45].map((x) => html`<option key=${x} value=${x}>${pad2(x)}</option>`)}
            </select>
        </span>
    `;
}

/**
 * When an event happens: one-off or weekly; timed (24-hour clock, quarter hours) or whole
 * days. Every change saves at once.
 * @param {{ adventure: PoolItem & { kind: 'adventure' }, crawled: boolean, save: (changes: AdventureChanges) => Promise<string | null> }} props
 */
function WhenEditor({ adventure, crawled, save }) {
    const own = adventure.own;
    const start = adventure.start ? new Date(adventure.start) : null;
    const end = adventure.end ? new Date(adventure.end) : null;
    const allDay = Boolean(adventure.all_day);
    const rule = adventure.recurrence;
    const weeklyOn = Boolean(rule);
    const today = new Date();
    const startDay = start ? dayText(start) : '';
    const endDay = end ? dayText(end) : startDay;
    const startMin = start ? quarter(start) : 18 * 60;
    let endMin = end ? quarter(end) : startMin + 60;
    if (end && start && dayText(end) !== dayText(start) && quarter(end) === 0) endMin = 24 * 60; // ends at midnight
    const overridden = own.start != null || own.end != null || own.all_day != null || own.recurrence != null;

    /** Save a full description of the when (so every part agrees). */
    const commit = (/** @type {{ day?: string, endDay?: string, startMin?: number, endMin?: number, allDay?: boolean, days?: number[] | null, until?: string | null }} */ next) => {
        const v = { day: startDay || dayText(today), endDay, startMin, endMin, allDay, days: rule?.days ?? null, until: rule?.until ?? null, ...next };
        /** @type {AdventureChanges} */
        const changes = { all_day: v.allDay };
        if (v.allDay) {
            const last = v.endDay && v.endDay >= v.day ? v.endDay : v.day;
            changes.start_time = isoAt(v.day, 0);
            changes.end_time = isoAt(last, 0);
        } else {
            changes.start_time = isoAt(v.day, v.startMin);
            // timed: the end is on the start's day (or the next, when it's earlier or 24:00)
            const endDate = v.days || !v.endDay || v.endDay < v.day ? v.day : v.endDay;
            let endIso = isoAt(endDate, v.endMin);
            if (new Date(endIso) <= new Date(changes.start_time)) endIso = isoAt(v.day, v.endMin + (v.endMin <= v.startMin ? 24 * 60 : 0));
            changes.end_time = endIso;
        }
        changes.recurrence = v.days && v.days.length ? { days: v.days, until: v.until || null } : null;
        if (!own.timezone) changes.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return save(changes);
    };

    const setWeekly = (/** @type {boolean} */ on) => {
        if (on === weeklyOn) return;
        const first = startDay ? new Date(startDay + 'T00:00') : today;
        commit({ days: on ? [weekday(first)] : null, until: null });
    };
    const toggleDay = (/** @type {number} */ d) => {
        const days = new Set(rule?.days ?? []);
        if (days.has(d)) days.delete(d); else days.add(d);
        if (!days.size) return; // at least one day
        commit({ days: [...days].sort((a, b) => a - b) });
    };

    return html`
        <div className="ae-when">
            <div className="ae-label">
                When
                ${crawled && overridden && html`<em title="Set by hand; the source says otherwise">edited</em>`}
                ${crawled && overridden && html`<button type="button" className="ae-reset" title="Back to the source's time"
                    onClick=${() => save({ start_time: null, end_time: null, all_day: null, recurrence: null })}>↺</button>`}
            </div>
            <div className="ae-when-modes">
                <div className="ae-seg" role="radiogroup" aria-label="Repeats">
                    <button type="button" className=${!weeklyOn ? 'on' : ''} onClick=${() => setWeekly(false)}>One-off</button>
                    <button type="button" className=${weeklyOn ? 'on' : ''} onClick=${() => setWeekly(true)} disabled=${crawled}
                        title=${crawled ? 'Crawled events happen once' : 'Repeats every week'}>Weekly</button>
                </div>
                <div className="ae-seg" role="radiogroup" aria-label="Timed or whole days">
                    <button type="button" className=${!allDay ? 'on' : ''} onClick=${() => allDay && commit({ allDay: false })}>Timed</button>
                    <button type="button" className=${allDay ? 'on' : ''} onClick=${() => !allDay && commit({ allDay: true })}>All day</button>
                </div>
            </div>
            ${weeklyOn && html`
                <div className="ae-days" role="group" aria-label="Weekdays">
                    ${WEEKDAYS.map((name, d) => html`
                        <button key=${d} type="button" className=${rule?.days.includes(d) ? 'on' : ''} onClick=${() => toggleDay(d)}>${name}</button>
                    `)}
                </div>
            `}
            <div className="ae-when-grid">
                <span>${weeklyOn ? 'From' : allDay ? 'First day' : 'Starts'}</span>
                <span className="ae-when-row">
                    <input type="date" value=${startDay} onChange=${(/** @type {any} */ e) => e.target.value && commit({ day: e.target.value })} />
                    ${!allDay && html`<${TimeInput} label="Start time" value=${startMin} onChange=${(/** @type {number} */ v) => commit({ startMin: v })} />`}
                </span>
                ${!weeklyOn && html`
                    <span>${allDay ? 'Last day' : 'Ends'}</span>
                    <span className="ae-when-row">
                        <input type="date" value=${endDay} min=${startDay} onChange=${(/** @type {any} */ e) => e.target.value && commit({ endDay: e.target.value })} />
                        ${!allDay && html`<${TimeInput} label="End time" allowMidnightEnd=${true} value=${endMin} onChange=${(/** @type {number} */ v) => commit({ endMin: v })} />`}
                    </span>
                `}
                ${weeklyOn && !allDay && html`
                    <span>Ends</span>
                    <span className="ae-when-row"><${TimeInput} label="End time" allowMidnightEnd=${true} value=${endMin} onChange=${(/** @type {number} */ v) => commit({ endMin: v })} /></span>
                `}
                ${weeklyOn && html`
                    <span>Until</span>
                    <span className="ae-when-row">
                        <input type="date" value=${rule?.until ?? ''} min=${startDay} onChange=${(/** @type {any} */ e) => commit({ until: e.target.value || null })} />
                        ${rule?.until && html`<button type="button" className="ae-reset" title="Repeat forever" onClick=${() => commit({ until: null })}>∞</button>`}
                    </span>
                `}
            </div>
            ${!start && html`<span className="ae-hint">No time yet · pick a date to set one</span>`}
            ${start && html`<button type="button" className="ae-clear" onClick=${() => save({ start_time: null, end_time: null, all_day: null, recurrence: null })}>Clear time</button>`}
        </div>
    `;
}

/**
 * One editable field. Shows the current value (the adventure's own, else its event's);
 * saves on blur or Enter (Ctrl+Enter in a text area), Esc undoes the edit. A refused save
 * (onCommit resolves to an error) puts the saved value back.
 * @param {{ label: string, value: string, kind?: 'text' | 'url' | 'datetime-local' | 'textarea',
 *           placeholder?: string, overridden?: boolean, crawled?: boolean, autoFocus?: boolean,
 *           onCommit: (value: string) => Promise<string | null>, onReset?: () => void }} props
 */
export function Field({ label, value, kind = 'text', placeholder = '', overridden = false, crawled = false, autoFocus = false, onCommit, onReset }) {
    const [draft, setDraft] = useState(value);
    const ref = useRef(/** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (null));
    useEffect(() => setDraft(value), [value]);
    useEffect(() => {
        if (autoFocus && ref.current) { ref.current.focus(); ref.current.select(); }
    }, [autoFocus]);

    const commit = async () => {
        if (draft === value) return;
        if (await onCommit(draft)) setDraft(value); // refused: show what's actually saved
    };
    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
        if (e.key === 'Escape') { setDraft(value); /** @type {HTMLElement} */ (e.target).blur(); }
        if (e.key === 'Enter' && (kind !== 'textarea' || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
        }
    };
    const props = {
        ref, value: draft, placeholder, onKeyDown, onBlur: commit, spellCheck: kind === 'textarea',
        onInput: (/** @type {any} */ e) => setDraft(e.target.value),
    };

    return html`
        <label className="ae-field">
            <span className="ae-label">
                ${label}
                ${crawled && overridden && html`<em title="Set by hand; the source says otherwise">edited</em>`}
            </span>
            <span className="ae-input">
                ${kind === 'textarea'
                    ? html`<textarea ...${props} rows=${4}></textarea>`
                    : html`<input type=${kind === 'url' ? 'url' : kind} ...${props} />`}
                ${crawled && overridden && onReset && html`
                    <button type="button" className="ae-reset" onClick=${onReset} title="Back to the source's value">↺</button>
                `}
            </span>
        </label>
    `;
}

/**
 * Edit an adventure in place: its type (hand-made only), title, description, when/where
 * (not items), link and cover. Each field saves on its own; the card above updates live.
 * @param {{ adventure: PoolItem & { kind: 'adventure' }, focusTitle: boolean, onDone: () => void }} props
 */
export function AdventureEditor({ adventure, focusTitle, onDone }) {
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const entities = useWorkspaceStore((s) => s.entities);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [saving, setSaving] = useState(false);
    useEffect(() => setError(null), [adventure.id]);

    const own = adventure.own;
    const crawled = adventure.event_id != null;
    const placed = adventure.type !== 'item'; // items have no when/where
    // a hand-made event with a linked site takes its where from the site
    const site = !crawled && adventure.site_id ? entities.find((o) => o.id === adventure.site_id) ?? null : null;

    /** @param {AdventureChanges} changes @returns {Promise<string | null>} the error, if refused */
    const save = async (changes) => {
        setSaving(true);
        const err = await updateAdventure(adventure.id, changes);
        setError(err);
        setSaving(false);
        return err;
    };

    /** @param {AdventureType} type */
    const setType = (type) => {
        if (type === adventure.type) return;
        const losesWhenWhere = type === 'item' && (own.start || own.venue || own.address || own.city || own.lat != null);
        if (losesWhenWhere && !confirmHere(`An item has no when or where: its time and place will be cleared. Continue?`)) return;
        save({ type });
    };

    const [placeNote, setPlaceNote] = useState(/** @type {string | null} */ (null));
    useEffect(() => setPlaceNote(null), [adventure.id]);

    /** Coordinates as "lat, lon", or a Plus Code (full, or short with a town). @param {string} text */
    const saveCoords = async (text) => {
        setSaving(true);
        const place = await readPlace(text);
        if ('error' in place) { setSaving(false); setError(place.error); return place.error; }
        setPlaceNote(place.note);
        return save({ lat: place.lat, lon: place.lon });
    };

    /** Shared props for a plain text field. @param {'title' | 'description' | 'venue' | 'address' | 'city' | 'url' | 'cover_url' | 'costs' | 'rewards'} key */
    const text = (key) => ({
        value: /** @type {string | null} */ (adventure[key]) ?? '',
        overridden: key === 'costs' || key === 'rewards' ? false : own[key] != null,
        crawled,
        onCommit: (/** @type {string} */ v) => save({ [key]: v.trim() || null }),
        onReset: () => save({ [key]: null }),
    });

    return html`
        <div className="ae">
            <div className="ae-head">
                <span>Edit ${ADVENTURE_TYPES[adventure.type]?.label.toLowerCase() ?? 'adventure'}</span>
                ${saving ? html`<em>saving…</em>` : html`<em>${crawled ? `from ${adventure.source ?? 'a source'} · edits override it` : 'hand-made'}</em>`}
                <button className="btn ae-done" onClick=${onDone}>Done</button>
            </div>

            ${crawled
                ? html`<div className="ae-type locked" title="Crawled adventures are always events">${ADVENTURE_TYPES.event.glyph} Event</div>`
                : html`
                    <div className="ae-type" role="radiogroup" aria-label="Type">
                        ${Object.entries(ADVENTURE_TYPES).map(([key, t]) => html`
                            <button key=${key} type="button" role="radio" aria-checked=${adventure.type === key}
                                className=${adventure.type === key ? 'on' : ''} title=${t.hint}
                                onClick=${() => setType(/** @type {AdventureType} */ (key))}>${t.glyph} ${t.label}</button>
                        `)}
                    </div>
                `}

            <${Field} label="Title" ...${text('title')} autoFocus=${focusTitle} />
            <${Field} label="Description" kind="textarea" placeholder="What is it? Why does it matter?" ...${text('description')} />

            <div className="ae-pair">
                <${Field} label="Costs" placeholder="What it takes (money, time, gear…)" ...${text('costs')} />
                <${Field} label="Rewards" placeholder="What you get out of it" ...${text('rewards')} />
            </div>

            ${placed && html`
                <${WhenEditor} adventure=${adventure} crawled=${crawled} save=${save} />
                ${site
                    ? html`
                        <div className="ae-field">
                            <span className="ae-label">Where</span>
                            <div className="ae-site">
                                <span>⌖ <b>${site.name}</b>${[site.address, site.city].filter(Boolean).length ? ` · ${[site.address, site.city].filter(Boolean).join(', ')}` : ''}</span>
                                <button type="button" className="cls-layer" onClick=${() => { selectEntity(site.id); showPanel('codex'); }}>Open site</button>
                            </div>
                            <span className="ae-hint">From its linked site · unlink it below to type a place instead</span>
                        </div>
                    `
                    : html`
                        <${Field} label="Venue" placeholder="Where it happens (or link a site below)" ...${text('venue')} />
                        <${Field} label="Address" ...${text('address')} />
                        <div className="ae-pair">
                            <${Field} label="City" ...${text('city')} />
                            <${Field} label="Coordinates or Plus Code" placeholder=${PLACE_PLACEHOLDER} value=${coordsText(adventure.lat, adventure.lon)}
                                overridden=${own.lat != null} crawled=${crawled}
                                onCommit=${saveCoords} onReset=${() => { setPlaceNote(null); save({ lat: null, lon: null }); }} />
                        </div>
                        ${placeNote && html`<span className="ae-hint">⌖ ${placeNote}</span>`}
                    `}
            `}

            <${Field} label="Link" kind="url" placeholder="https://…" ...${text('url')} />
            <${Field} label="Cover image" kind="url" placeholder="https://… (image)" ...${text('cover_url')} />

            ${error && html`<div className="nc-error">${error}</div>`}
            <div className="ae-hint">Saves when you leave a field or press Enter · Esc undoes</div>
        </div>
    `;
}
