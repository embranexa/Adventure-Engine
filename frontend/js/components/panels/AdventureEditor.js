import { useEffect, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ADVENTURE_TYPES } from '../../lifecycle.js';
import { confirmHere } from '../../lib/windows.js';

/** ISO time -> value for <input type="datetime-local"> (local time). @param {string | null} iso */
function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) -> ISO with offset, or null. @param {string} value */
function fromLocalInput(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {number | null} lat @param {number | null} lon */
const coordsText = (lat, lon) => (lat != null && lon != null ? `${lat}, ${lon}` : '');

/** "34.05, -118.25" -> [lat, lon]; '' -> [null, null]; null if unreadable. @param {string} text */
function parseCoords(text) {
    if (!text.trim()) return [null, null];
    const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
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
 * (events only), link and cover. Each field saves on its own; the card above updates live.
 * @param {{ adventure: PoolItem & { kind: 'adventure' }, focusTitle: boolean, onDone: () => void }} props
 */
export function AdventureEditor({ adventure, focusTitle, onDone }) {
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const objects = useWorkspaceStore((s) => s.objects);
    const selectObject = useWorkspaceStore((s) => s.selectObject);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [saving, setSaving] = useState(false);
    useEffect(() => setError(null), [adventure.id]);

    const own = adventure.own;
    const crawled = adventure.event_id != null;
    const isEvent = adventure.type === 'event';
    // a hand-made event with a linked site takes its where from the site
    const site = !crawled && adventure.site_id ? objects.find((o) => o.id === adventure.site_id) ?? null : null;

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
        const losesWhenWhere = isEvent && (own.start || own.venue || own.address || own.city || own.lat != null);
        if (losesWhenWhere && !confirmHere(`A ${type} has no when or where: its time and place will be cleared. Continue?`)) return;
        save({ type });
    };

    /** @param {'start_time' | 'end_time'} field @param {string} value */
    const saveTime = (field, value) => {
        const iso = fromLocalInput(value);
        /** @type {AdventureChanges} */
        const changes = { [field]: iso };
        if (iso && !own.timezone) changes.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return save(changes);
    };

    /** @param {string} text */
    const saveCoords = (text) => {
        const coords = parseCoords(text);
        if (!coords) {
            const err = 'Write coordinates as "lat, lon", e.g. 34.05, -118.25';
            setError(err);
            return Promise.resolve(err);
        }
        return save({ lat: coords[0], lon: coords[1] });
    };

    /** Shared props for a plain text field. @param {'title' | 'description' | 'venue' | 'address' | 'city' | 'url' | 'cover_url'} key */
    const text = (key) => ({
        value: /** @type {string | null} */ (adventure[key]) ?? '',
        overridden: own[key] != null,
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

            ${isEvent && html`
                <div className="ae-pair">
                    <${Field} label="Starts" kind="datetime-local" value=${toLocalInput(adventure.start)}
                        overridden=${own.start != null} crawled=${crawled}
                        onCommit=${(/** @type {string} */ v) => saveTime('start_time', v)} onReset=${() => save({ start_time: null })} />
                    <${Field} label="Ends" kind="datetime-local" value=${toLocalInput(adventure.end)}
                        overridden=${own.end != null} crawled=${crawled}
                        onCommit=${(/** @type {string} */ v) => saveTime('end_time', v)} onReset=${() => save({ end_time: null })} />
                </div>
                ${site
                    ? html`
                        <div className="ae-field">
                            <span className="ae-label">Where</span>
                            <div className="ae-site">
                                <span>⌖ <b>${site.name}</b>${[site.address, site.city].filter(Boolean).length ? ` · ${[site.address, site.city].filter(Boolean).join(', ')}` : ''}</span>
                                <button type="button" className="cls-layer" onClick=${() => { selectObject(site.id); showPanel('codex'); }}>Open site</button>
                            </div>
                            <span className="ae-hint">From its linked site · unlink it below to type a place instead</span>
                        </div>
                    `
                    : html`
                        <${Field} label="Venue" placeholder="Where it happens (or link a site below)" ...${text('venue')} />
                        <${Field} label="Address" ...${text('address')} />
                        <div className="ae-pair">
                            <${Field} label="City" ...${text('city')} />
                            <${Field} label="Coordinates" placeholder="lat, lon" value=${coordsText(adventure.lat, adventure.lon)}
                                overridden=${own.lat != null} crawled=${crawled}
                                onCommit=${saveCoords} onReset=${() => save({ lat: null, lon: null })} />
                        </div>
                    `}
            `}

            <${Field} label="Link" kind="url" placeholder="https://…" ...${text('url')} />
            <${Field} label="Cover image" kind="url" placeholder="https://… (image)" ...${text('cover_url')} />

            ${error && html`<div className="nc-error">${error}</div>`}
            <div className="ae-hint">Saves when you leave a field or press Enter · Esc undoes</div>
        </div>
    `;
}
