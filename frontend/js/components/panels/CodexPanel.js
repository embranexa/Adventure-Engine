import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { ARCHETYPES, ENTITY_TYPES, UNLINKABLE, PARTY_STATUSES, PHASE_STAGES, STEWARD_ROLES } from '../../lifecycle.js';
import { PLACE_PLACEHOLDER, coordsText, readPlace } from '../../lib/places.js';
import { PALETTE, entityColor } from '../../lib/lens.js';
import { EntityPicker } from '../EntityPicker.js';
import { PlayerFields } from '../PlayerFields.js';
import { Field } from './AdventureEditor.js';
import { mayChange } from '../../lib/archon.js';
import { confirmHere } from '../../lib/windows.js';

/**
 * An entity's colour (the Nexus, the lens): a preset swatch, any colour, or Auto (the
 * default picked from its id).
 * @param {{ obj: Entity, onChange: (color: string | null) => void }} props
 */
function ColorPicker({ obj, onChange }) {
    const current = entityColor(obj.id);
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

const TYPE_KEYS = /** @type {EntityType[]} */ (Object.keys(ENTITY_TYPES));

/** One line under an entity's name in the list. @param {Entity} o */
function subtitle(o) {
    if (o.type === 'site') return [o.address, o.city].filter(Boolean).join(', ') || (o.lat != null ? 'Pinned' : 'No location');
    if (o.type === 'player') return [o.details.archetype && ARCHETYPES[o.details.archetype].label, o.details.handle || o.details.email || o.details.phone].filter(Boolean).join(' · ');
    return o.description?.split('\n')[0] ?? '';
}

/**
 * One entity: its fields (by type), the adventures linked to it, and actions.
 * @param {{ obj: Entity, onBack: () => void }} props
 */
function EntityDetail({ obj, onBack }) {
    const updateEntity = useWorkspaceStore((s) => s.updateEntity);
    const deleteEntity = useWorkspaceStore((s) => s.deleteEntity);
    const unlinkEntity = useWorkspaceStore((s) => s.unlinkEntity);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const anchorRingOnSite = useWorkspaceStore((s) => s.anchorRingOnSite);
    const focusOnAtlas = useWorkspaceStore((s) => s.focusOnAtlas);
    const anchoredId = useWorkspaceStore((s) => s.filters.ring?.center.site_id ?? null);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [placeNote, setPlaceNote] = useState(/** @type {string | null} */ (null));
    useEffect(() => setPlaceNote(null), [obj.id]);

    const t = ENTITY_TYPES[obj.type];
    const setWarden = useWorkspaceStore((s) => s.setWarden);
    const entities = useWorkspaceStore((s) => s.entities);
    const held = adventures.flatMap((a) => a.stewards.filter((s) => s.id === obj.id).map((s) => ({ a, role: s.role })));
    const kept = entities.filter((e) => e.wardens.includes(obj.id));
    const spellSkills = entities.filter((e) => obj.skills.includes(e.id));
    const linked = adventures.filter((a) => a.entities.some((o) => o.id === obj.id));
    const located = obj.lat != null && obj.lon != null;

    /** @param {EntityChanges} changes */
    const save = async (changes) => {
        const err = await updateEntity(obj.id, changes);
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
        if (!confirmHere(`Delete ${t.label.toLowerCase()} “${obj.name}”?${note}`)) return;
        const err = await deleteEntity(obj.id);
        if (err) setError(err);
        else onBack();
    };

    return html`
        <div className="cx-detail">
            <div className="cx-detail-head">
                <button className="cls-layer" onClick=${onBack} title="Back to the list">← ${t.plural}</button>
                <span className=${`cx-badge t-${obj.type}`} style=${{ color: entityColor(obj.id) }}>${t.glyph} ${t.label}</span>
            </div>
            <${ColorPicker} obj=${obj} onChange=${(/** @type {string | null} */ color) => save({ color })} />

            <${Field} key=${`${obj.id}-name`} label="Name" ...${text('name')} />
            ${obj.type === 'player' && html`
                <div className="ae-pair">
                    <${Field} label="Email" placeholder="name@example.com" ...${detail('email')} />
                    <${Field} label="Phone" ...${detail('phone')} />
                </div>
                <${Field} label="Handle" placeholder="@handle" ...${detail('handle')} />
                <${PlayerFields} player=${obj} save=${save} onError=${setError} />
            `}
            ${obj.type === 'site' && html`
                <${Field} label="Address" ...${text('address')} />
                <div className="ae-pair">
                    <${Field} label="City" ...${text('city')} />
                    <${Field} label="Coordinates or Plus Code" placeholder=${PLACE_PLACEHOLDER} value=${coordsText(obj.lat, obj.lon)}
                        onCommit=${async (/** @type {string} */ v) => {
                            const place = await readPlace(v);
                            if ('error' in place) { setError(place.error); return place.error; }
                            setPlaceNote(place.note);
                            return save({ lat: place.lat, lon: place.lon });
                        }} />
                </div>
                ${placeNote && html`<span className="ae-hint">⌖ ${placeNote}</span>`}
                <div className="cx-actions">
                    <button className="btn" disabled=${!located} onClick=${() => located && focusOnAtlas(/** @type {number} */ (obj.lat), /** @type {number} */ (obj.lon))}
                        title=${located ? 'Fly there on the Atlas' : 'Give it coordinates first'}>⌖ Show on Atlas</button>
                    <button className=${`btn ${anchoredId === obj.id ? 'on' : ''}`} disabled=${!located} onClick=${() => anchorRingOnSite(obj.id)}
                        title="Center the proximity ring here; it follows the site">◎ ${anchoredId === obj.id ? 'Ring anchored' : 'Anchor ring'}</button>
                </div>
                <div className="ol">
                    <div className="ol-head">Wardens</div>
                    <${EntityPicker} ids=${obj.wardens} types=${['player', 'organization']} placeholder="+ Who keeps this site…"
                        onAdd=${async (/** @type {string} */ id) => setError(await setWarden(obj.id, id, true))}
                        onRemove=${async (/** @type {string} */ id) => setError(await setWarden(obj.id, id, false))} />
                </div>
            `}
            ${obj.type === 'spell' && html`
                <div className="ol">
                    <div className="ol-head">Cast with</div>
                    ${spellSkills.length
                        ? html`<div className="ol-chips">${spellSkills.map((k) => html`<span key=${k.id} className="ol-chip"><button className="ol-chip-name" onClick=${() => selectEntity(k.id)}><i>✧</i>${k.name}</button></span>`)}</div>`
                        : html`<div className="cx-empty-line">No skills yet · they come from sealed plays in the Treasury</div>`}
                </div>
            `}
            ${(held.length > 0 || kept.length > 0) && html`
                <div className="cx-linked">
                    <div className="cx-linked-head">Stewardships <b>${held.length + kept.length}</b></div>
                    ${held.map(({ a, role }) => html`
                        <div key=${a.id + role} className="cx-adv" style=${{ '--c': STEWARD_ROLES[role].color }}>
                            <button className="cx-adv-name" disabled=${!itemsById[a.id]} onClick=${() => selectItem(a.id, 'codex')}><i></i>${a.title}<em>${STEWARD_ROLES[role].label}</em></button>
                        </div>`)}
                    ${kept.map((site) => html`
                        <div key=${site.id} className="cx-adv" style=${{ '--c': STEWARD_ROLES.warden.color }}>
                            <button className="cx-adv-name" onClick=${() => selectEntity(site.id)}><i></i>${site.name}<em>${STEWARD_ROLES.warden.label}</em></button>
                        </div>`)}
                </div>
            `}
            <${Field} label=${obj.type === 'player' ? 'Notes' : 'Description'} kind="textarea" ...${text('description')} />
            <${Field} label="Link" kind="url" placeholder="https://…" ...${text('url')} />
            ${error && html`<div className="nc-error">${error}</div>`}

            ${!UNLINKABLE.includes(obj.type) && html`<div className="cx-linked">
                <div className="cx-linked-head">Linked adventures <b>${linked.length}</b></div>
                ${linked.length === 0 && html`<div className="cx-empty-line">None yet · link it from an adventure in the Refinery</div>`}
                ${linked.map((a) => {
                    const stage = PHASE_STAGES[a.phase];
                    const pooled = Boolean(itemsById[a.id]);
                    const status = a.entities.find((o) => o.id === obj.id)?.status;
                    return html`
                        <div key=${a.id} className="cx-adv" style=${{ '--c': stage?.color }}>
                            <button className="cx-adv-name" disabled=${!pooled} onClick=${() => selectItem(a.id, 'codex')}
                                title=${pooled ? 'Select it' : 'Not in the current pool (Discovery mode)'}>
                                <i></i>${a.title}${status && html`<small style=${{ color: PARTY_STATUSES[status].color }}>${PARTY_STATUSES[status].label}</small>`}<em>${stage?.matter ?? ''}</em>
                            </button>
                            <button className="ol-chip-x" onClick=${async () => { if (mayChange(a, obj, null)) setError(await unlinkEntity(a.id, obj.id)); }} title="Unlink" aria-label=${`Unlink ${a.title}`}>✕</button>
                        </div>
                    `;
                })}
            </div>`}

            <div className="cx-actions">
                <button className="btn ghost cx-delete" onClick=${remove}>✕ Delete ${t.label.toLowerCase()}</button>
            </div>
        </div>
    `;
}

/**
 * The Codex: entities (deities, sites, players, organizations, skills, spells) that adventures link to. Browse
 * by type, search, create; open one to edit it and see its adventures. Linking happens
 * in the Refinery; entities show as stars in the Nexus (in their colour), sites as pins on the Atlas.
 */
export function CodexPanel() {
    const entities = useWorkspaceStore((s) => s.entities);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const selectedId = useWorkspaceStore((s) => s.selectedEntityId);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const createEntity = useWorkspaceStore((s) => s.createEntity);

    const [type, setType] = useState(/** @type {EntityType | 'all'} */ ('all'));
    const [query, setQuery] = useState('');
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const counts = useMemo(() => {
        /** @type {Map<string, number>} */
        const m = new Map();
        for (const a of adventures) for (const o of a.entities) m.set(o.id, (m.get(o.id) ?? 0) + 1);
        return m;
    }, [adventures]);

    const selected = selectedId ? entities.find((o) => o.id === selectedId) : null;
    if (selected) {
        return html`<div className="panel-body codex"><${EntityDetail} key=${selected.id} obj=${selected} onBack=${() => selectEntity(null)} /></div>`;
    }

    const q = query.trim().toLowerCase();
    const shown = entities.filter((o) => (type === 'all' || o.type === type) && (!q || o.name.toLowerCase().includes(q)));

    /** @param {EntityType} newType */
    const create = async (newType) => {
        const res = await createEntity(newType, query.trim() ? { name: query.trim() } : {});
        if (typeof res === 'string') { setError(res); return; }
        setError(null);
        setQuery('');
        selectEntity(res.id);
    };

    return html`
        <div className="panel-body codex">
            <div className="cx-types" role="tablist">
                <button role="tab" aria-selected=${type === 'all'} className=${`cls-layer ${type === 'all' ? 'on' : ''}`} onClick=${() => setType('all')}>
                    All <b>${entities.length}</b>
                </button>
                ${TYPE_KEYS.map((k) => html`
                    <button key=${k} role="tab" aria-selected=${type === k} className=${`cls-layer ${type === k ? 'on' : ''}`}
                        onClick=${() => setType(k)} title=${ENTITY_TYPES[k].hint}>
                        ${ENTITY_TYPES[k].glyph} ${ENTITY_TYPES[k].plural} <b>${entities.filter((o) => o.type === k).length}</b>
                    </button>
                `)}
            </div>
            <div className="cx-bar">
                <input className="cx-search" value=${query} placeholder=${type === 'all' ? 'Search or name a new entity…' : `Search or name a new ${ENTITY_TYPES[type].label.toLowerCase()}…`}
                    aria-label="Search entities"
                    onInput=${(/** @type {any} */ e) => setQuery(e.target.value)}
                    onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && type !== 'all' && !shown.length) create(type); }} />
            </div>
            <div className="cx-new">
                ${(type === 'all' ? TYPE_KEYS : [type]).map((k) => html`
                    <button key=${k} className="btn" onClick=${() => create(k)}>
                        ✦ New ${ENTITY_TYPES[k].label.toLowerCase()}${q ? ` “${query.trim()}”` : ''}
                    </button>
                `)}
            </div>
            ${error && html`<div className="nc-error">${error}</div>`}
            <div className="cx-list">
                ${shown.length === 0 && html`
                    <div className="nc-empty cx-none">
                        ${entities.length ? 'Nothing matches' : 'The Codex is empty'}
                        <small>${entities.length ? 'Try another search, or create it above' : 'Deities, sites, players, organizations, skills and spells live here; all but spells can be linked to adventures'}</small>
                    </div>
                `}
                ${shown.map((o) => html`
                    <button key=${o.id} className=${`cx-row t-${o.type}`} onClick=${() => selectEntity(o.id)}>
                        <i style=${{ color: entityColor(o.id) }}>${ENTITY_TYPES[o.type].glyph}</i>
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
