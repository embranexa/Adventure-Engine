import { useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { OBJECT_TYPES, PHASE_STAGES } from '../../lifecycle.js';
import { PALETTE, objectColor } from '../../lib/lens.js';
import { Field } from './AdventureEditor.js';

/**
 * An object's colour (the Nexus, the lens): a preset swatch, any colour, or Auto (the
 * default picked from its id).
 * @param {{ obj: VObject, onChange: (color: string | null) => void }} props
 */
function ColorPicker({ obj, onChange }) {
    const current = objectColor(obj.id);
    return html`
        <div className="cx-colors" role="group" aria-label="Colour">
            <span className="cx-colors-title">Colour</span>
            ${PALETTE.map((c) => html`
                <button key=${c} className=${`cx-swatch ${obj.color === c ? 'on' : ''}`} style=${{ '--c': c }}
                    onClick=${() => onChange(c)} title=${c} aria-label=${`Colour ${c}`}></button>
            `)}
            <label className=${`cx-swatch cx-custom ${obj.color && !PALETTE.includes(obj.color) ? 'on' : ''}`} style=${{ '--c': current }} title="Any colour">
                <input type="color" value=${current} onChange=${(/** @type {any} */ e) => onChange(e.target.value)} aria-label="Any colour" />
            </label>
            <button className=${`cls-layer ${obj.color ? '' : 'on'}`} onClick=${() => onChange(null)}
                title="Go back to the default colour">Auto</button>
        </div>
    `;
}

const TYPE_KEYS = /** @type {ObjectType[]} */ (Object.keys(OBJECT_TYPES));

/** @param {number | null} lat @param {number | null} lon */
const coordsText = (lat, lon) => (lat != null && lon != null ? `${lat}, ${lon}` : '');

/** "34.05, -118.25" -> [lat, lon]; '' -> [null, null]; null if unreadable. @param {string} text */
function parseCoords(text) {
    if (!text.trim()) return [null, null];
    const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
}

/** One line under an object's name in the list. @param {VObject} o */
function subtitle(o) {
    if (o.type === 'site') return [o.address, o.city].filter(Boolean).join(', ') || (o.lat != null ? 'Pinned' : 'No location');
    if (o.type === 'contact') return o.details.handle || o.details.email || o.details.phone || '';
    return o.description?.split('\n')[0] ?? '';
}

/**
 * One object: its fields (by type), the adventures linked to it, and actions.
 * @param {{ obj: VObject, onBack: () => void }} props
 */
function ObjectDetail({ obj, onBack }) {
    const updateObject = useWorkspaceStore((s) => s.updateObject);
    const deleteObject = useWorkspaceStore((s) => s.deleteObject);
    const unlinkObject = useWorkspaceStore((s) => s.unlinkObject);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const anchorRingOnSite = useWorkspaceStore((s) => s.anchorRingOnSite);
    const focusOnAtlas = useWorkspaceStore((s) => s.focusOnAtlas);
    const anchoredId = useWorkspaceStore((s) => s.filters.ring?.center.site_id ?? null);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const t = OBJECT_TYPES[obj.type];
    const linked = adventures.filter((a) => a.objects.some((o) => o.id === obj.id));
    const located = obj.lat != null && obj.lon != null;

    /** @param {ObjectChanges} changes */
    const save = async (changes) => {
        const err = await updateObject(obj.id, changes);
        setError(err);
        return err;
    };
    /** @param {'name' | 'description' | 'url' | 'address' | 'city'} key */
    const text = (key) => ({
        value: obj[key] ?? '',
        onCommit: (/** @type {string} */ v) => save({ [key]: v.trim() || null }),
    });
    /** @param {'email' | 'phone' | 'handle'} key */
    const detail = (key) => ({
        value: obj.details[key] ?? '',
        onCommit: (/** @type {string} */ v) => save({ details: { [key]: v.trim() || null } }),
    });

    const remove = async () => {
        const note = linked.length ? ` It's linked to ${linked.length} ${linked.length === 1 ? 'adventure' : 'adventures'}; they stay, unlinked.` : '';
        if (!window.confirm(`Delete ${t.label.toLowerCase()} “${obj.name}”?${note}`)) return;
        const err = await deleteObject(obj.id);
        if (err) setError(err);
        else onBack();
    };

    return html`
        <div className="cx-detail">
            <div className="cx-detail-head">
                <button className="cls-layer" onClick=${onBack} title="Back to the list">← ${t.plural}</button>
                <span className=${`cx-badge t-${obj.type}`} style=${{ color: objectColor(obj.id) }}>${t.glyph} ${t.label}</span>
            </div>
            <${ColorPicker} obj=${obj} onChange=${(/** @type {string | null} */ color) => save({ color })} />

            <${Field} key=${`${obj.id}-name`} label="Name" ...${text('name')} />
            ${obj.type === 'contact' && html`
                <div className="ae-pair">
                    <${Field} label="Email" placeholder="name@example.com" ...${detail('email')} />
                    <${Field} label="Phone" ...${detail('phone')} />
                </div>
                <${Field} label="Handle" placeholder="@handle" ...${detail('handle')} />
            `}
            ${obj.type === 'site' && html`
                <${Field} label="Address" ...${text('address')} />
                <div className="ae-pair">
                    <${Field} label="City" ...${text('city')} />
                    <${Field} label="Coordinates" placeholder="lat, lon" value=${coordsText(obj.lat, obj.lon)}
                        onCommit=${(/** @type {string} */ v) => {
                            const c = parseCoords(v);
                            if (!c) { const err = 'Write coordinates as "lat, lon", e.g. 34.05, -118.25'; setError(err); return Promise.resolve(err); }
                            return save({ lat: c[0], lon: c[1] });
                        }} />
                </div>
                <div className="cx-actions">
                    <button className="btn" disabled=${!located} onClick=${() => located && focusOnAtlas(/** @type {number} */ (obj.lat), /** @type {number} */ (obj.lon))}
                        title=${located ? 'Fly there on the Atlas' : 'Give it coordinates first'}>⌖ Show on Atlas</button>
                    <button className=${`btn ${anchoredId === obj.id ? 'on' : ''}`} disabled=${!located} onClick=${() => anchorRingOnSite(obj.id)}
                        title="Center the proximity ring here; it follows the site">◎ ${anchoredId === obj.id ? 'Ring anchored' : 'Anchor ring'}</button>
                </div>
            `}
            <${Field} label=${obj.type === 'contact' ? 'Notes' : 'Description'} kind="textarea" ...${text('description')} />
            <${Field} label="Link" kind="url" placeholder="https://…" ...${text('url')} />
            ${error && html`<div className="nc-error">${error}</div>`}

            <div className="cx-linked">
                <div className="cx-linked-head">Linked adventures <b>${linked.length}</b></div>
                ${linked.length === 0 && html`<div className="cx-empty-line">None yet · link it from an adventure in the Refinery</div>`}
                ${linked.map((a) => {
                    const stage = PHASE_STAGES[a.phase];
                    const pooled = Boolean(itemsById[a.id]);
                    return html`
                        <div key=${a.id} className="cx-adv" style=${{ '--c': stage?.color }}>
                            <button className="cx-adv-name" disabled=${!pooled} onClick=${() => selectItem(a.id, 'codex')}
                                title=${pooled ? 'Select it' : 'Not in the current pool (Discovery mode)'}>
                                <i></i>${a.title}<em>${stage?.matter ?? ''}</em>
                            </button>
                            <button className="ol-chip-x" onClick=${async () => setError(await unlinkObject(a.id, obj.id))} title="Unlink" aria-label=${`Unlink ${a.title}`}>✕</button>
                        </div>
                    `;
                })}
            </div>

            <div className="cx-actions">
                <button className="btn ghost cx-delete" onClick=${remove}>✕ Delete ${t.label.toLowerCase()}</button>
            </div>
        </div>
    `;
}

/**
 * The Codex: virtual objects (pillars, sites, contacts) that adventures link to. Browse
 * by type, search, create; open one to edit it and see its adventures. Linking happens
 * in the Refinery; objects show as stars in the Nexus (in their colour), sites as pins on the Atlas.
 */
export function CodexPanel() {
    const objects = useWorkspaceStore((s) => s.objects);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const selectedId = useWorkspaceStore((s) => s.selectedObjectId);
    const selectObject = useWorkspaceStore((s) => s.selectObject);
    const createObject = useWorkspaceStore((s) => s.createObject);

    const [type, setType] = useState(/** @type {ObjectType | 'all'} */ ('all'));
    const [query, setQuery] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const counts = useMemo(() => {
        /** @type {Map<string, number>} */
        const m = new Map();
        for (const a of adventures) for (const o of a.objects) m.set(o.id, (m.get(o.id) ?? 0) + 1);
        return m;
    }, [adventures]);

    const selected = selectedId ? objects.find((o) => o.id === selectedId) : null;
    if (selected) {
        return html`<div className="panel-body codex"><${ObjectDetail} key=${selected.id} obj=${selected} onBack=${() => selectObject(null)} /></div>`;
    }

    const q = query.trim().toLowerCase();
    const shown = objects.filter((o) => (type === 'all' || o.type === type) && (!q || o.name.toLowerCase().includes(q)));

    /** @param {ObjectType} newType */
    const create = async (newType) => {
        const res = await createObject(newType, query.trim() ? { name: query.trim() } : {});
        if (typeof res === 'string') { setError(res); return; }
        setError(null);
        setQuery('');
        selectObject(res.id);
    };

    return html`
        <div className="panel-body codex">
            <div className="cx-types" role="tablist">
                <button role="tab" aria-selected=${type === 'all'} className=${`cls-layer ${type === 'all' ? 'on' : ''}`} onClick=${() => setType('all')}>
                    All <b>${objects.length}</b>
                </button>
                ${TYPE_KEYS.map((k) => html`
                    <button key=${k} role="tab" aria-selected=${type === k} className=${`cls-layer ${type === k ? 'on' : ''}`}
                        onClick=${() => setType(k)} title=${OBJECT_TYPES[k].hint}>
                        ${OBJECT_TYPES[k].glyph} ${OBJECT_TYPES[k].plural} <b>${objects.filter((o) => o.type === k).length}</b>
                    </button>
                `)}
            </div>
            <div className="cx-bar">
                <input className="cx-search" value=${query} placeholder=${type === 'all' ? 'Search or name a new object…' : `Search or name a new ${OBJECT_TYPES[type].label.toLowerCase()}…`}
                    aria-label="Search objects"
                    onInput=${(/** @type {any} */ e) => setQuery(e.target.value)}
                    onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && type !== 'all' && !shown.length) create(type); }} />
            </div>
            <div className="cx-new">
                ${(type === 'all' ? TYPE_KEYS : [type]).map((k) => html`
                    <button key=${k} className="btn" onClick=${() => create(k)}>
                        ✦ New ${OBJECT_TYPES[k].label.toLowerCase()}${q ? ` “${query.trim()}”` : ''}
                    </button>
                `)}
            </div>
            ${error && html`<div className="nc-error">${error}</div>`}
            <div className="cx-list">
                ${shown.length === 0 && html`
                    <div className="nc-empty cx-none">
                        ${objects.length ? 'Nothing matches' : 'The Codex is empty'}
                        <small>${objects.length ? 'Try another search, or create it above' : 'Pillars, sites and contacts you make here can be linked to adventures'}</small>
                    </div>
                `}
                ${shown.map((o) => html`
                    <button key=${o.id} className=${`cx-row t-${o.type}`} onClick=${() => selectObject(o.id)}>
                        <i style=${{ color: objectColor(o.id) }}>${OBJECT_TYPES[o.type].glyph}</i>
                        <span className="cx-row-text">
                            <b>${o.name}</b>
                            ${subtitle(o) && html`<small>${subtitle(o)}</small>`}
                        </span>
                        <em title="Linked adventures">${counts.get(o.id) ?? 0}</em>
                    </button>
                `)}
            </div>
        </div>
    `;
}
