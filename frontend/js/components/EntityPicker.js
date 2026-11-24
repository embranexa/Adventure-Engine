import { useMemo, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ENTITY_TYPES } from '../lifecycle.js';
import { keepInView, matchesByType } from '../lib/entityOptions.js';

/** @type {string[]} */
const NONE = [];
/** @type {{ id: string, label: string, hint: string }[]} */
const NO_FIXED = [];

/**
 * Entities of some types, picked by a type-ahead: chips of those picked (click opens one in
 * the Codex, ✕ removes it) and an input that adds an existing entity or makes a new one.
 * Leave `ids` chips out with `chips={false}`.
 * @param {{ ids: string[], types: EntityType[], placeholder: string, chips?: boolean,
 *           suggest?: string[], fixed?: { id: string, label: string, hint: string }[], fixedTitle?: string,
 *           onAdd: (id: string) => void, onRemove?: (id: string) => void }} props
 *   suggest: names of the first type to offer making, if they aren't there yet
 *   fixed: choices that aren't entities, offered first under `fixedTitle`
 */
export function EntityPicker({ ids, types, placeholder, chips = true, suggest = NONE, fixed = NO_FIXED, fixedTitle = '', onAdd, onRemove }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const closing = useRef(/** @type {any} */ (0)); // closes a moment after focus leaves, unless it returns
    const [active, setActive] = useState(0);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const q = query.trim().toLowerCase();
    const options = useMemo(() => {
        const pool = entities.filter((e) => types.includes(e.type));
        /** @type {({ fixed: { id: string, label: string, hint: string }, obj?: undefined, type?: undefined, name?: undefined } | { fixed?: undefined, obj: Entity, type?: undefined, name?: undefined } | { fixed?: undefined, obj?: undefined, type: EntityType, name: string })[]} */
        const list = fixed.filter((f) => !ids.includes(f.id) && f.label.toLowerCase().includes(q)).map((f) => ({ fixed: f }));
        list.push(...matchesByType(pool.filter((e) => !ids.includes(e.id)), q).map((obj) => ({ obj })));
        if (q) for (const type of types) if (!pool.some((e) => e.type === type && e.name.toLowerCase() === q) && !suggest.some((n) => n.toLowerCase() === q)) list.push({ type, name: query.trim() });
        const there = new Set(pool.map((e) => e.name.toLowerCase()));
        for (const name of suggest) if (!there.has(name.toLowerCase()) && name.toLowerCase().includes(q)) list.push({ type: types[0], name });
        return list;
    }, [entities, ids.join(), types.join(), q]);

    /** @param {(typeof options)[number]} option */
    const choose = async (option) => {
        setQuery('');
        setActive(0);
        setError(null);
        if (option.fixed) { onAdd(option.fixed.id); return; }
        if (option.obj) { onAdd(option.obj.id); return; }
        const res = await createEntity(option.type, { name: option.name });
        if (typeof res === 'string') setError(res);
        else onAdd(res.id);
    };
    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); choose(options[active]); }
        else if (e.key === 'Escape') { setQuery(''); setOpen(false); }
    };
    const picked = chips ? ids.map((id) => entities.find((e) => e.id === id)).filter((e) => e != null) : [];

    return html`
        ${picked.length > 0 && html`
            <div className="ol-chips">
                ${picked.map((e) => html`
                    <span key=${e.id} className=${`ol-chip t-${e.type}`}>
                        <button className="ol-chip-name" title=${`${ENTITY_TYPES[e.type].label} · open in the Codex`}
                            onClick=${() => { selectEntity(e.id); showPanel('codex'); }}><i>${ENTITY_TYPES[e.type].glyph}</i>${e.name}</button>
                        ${onRemove && html`<button className="ol-chip-x" onClick=${() => onRemove(e.id)} aria-label=${`Remove ${e.name}`} title="Remove">✕</button>`}
                    </span>
                `)}
            </div>
        `}
        <div className="ol-add">
            <input className="ol-input" value=${query} placeholder=${placeholder} aria-label=${placeholder.replace(/^\+ |…$/g, '')}
                onInput=${(/** @type {any} */ e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
                onFocus=${() => { clearTimeout(closing.current); setOpen(true); }}
                onBlur=${() => { closing.current = setTimeout(() => setOpen(false), 120); }}
                onKeyDown=${onKeyDown} />
            ${open && options.length > 0 && html`
                <div className="ol-menu" role="listbox">
                    ${options.map((o, i) => {
                        const groupOf = (/** @type {typeof o} */ x) => (x.fixed ? fixedTitle : x.obj ? ENTITY_TYPES[x.obj.type].plural : 'New');
                        const group = groupOf(o);
                        const before = options[i - 1], last = before && groupOf(before);
                        return html`${(types.length > 1 || fixed.length > 0) && group !== last && html`<div key=${`g-${group}`} className="ol-group">${group}</div>`}<button key=${o.fixed ? o.fixed.id : o.obj ? o.obj.id : `new-${o.type}-${o.name}`} role="option" ref=${i === active ? keepInView : undefined} aria-selected=${i === active}
                            className=${`ol-option ${i === active ? 'active' : ''} ${o.fixed || o.obj ? 'link' : 'create'}`}
                            onMouseDown=${(/** @type {Event} */ e) => e.preventDefault()} onClick=${() => choose(o)} onMouseEnter=${() => setActive(i)}>
                            ${o.fixed
                                ? html`<i>❖</i><span title=${o.fixed.hint}>${o.fixed.label}</span>`
                                : o.obj
                                ? html`<i>${ENTITY_TYPES[o.obj.type].glyph}</i><span>${o.obj.name}</span>`
                                : html`<i>✦</i><span>New ${ENTITY_TYPES[o.type].label.toLowerCase()} “${o.name}”</span>`}
                        </button>`;
                    })}
                </div>
            `}
        </div>
        ${error && html`<div className="nc-error">${error}</div>`}
    `;
}
