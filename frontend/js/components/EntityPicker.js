import { useMemo, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ENTITY_TYPES } from '../lifecycle.js';

const MAX_SUGGESTIONS = 8;

/**
 * Entities of some types, picked by a type-ahead: chips of those picked (click opens one in
 * the Codex, ✕ removes it) and an input that adds an existing entity or makes a new one.
 * Leave `ids` chips out with `chips={false}`.
 * @param {{ ids: string[], types: EntityType[], placeholder: string, chips?: boolean,
 *           onAdd: (id: string) => void, onRemove?: (id: string) => void }} props
 */
export function EntityPicker({ ids, types, placeholder, chips = true, onAdd, onRemove }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const q = query.trim().toLowerCase();
    const options = useMemo(() => {
        const pool = entities.filter((e) => types.includes(e.type));
        /** @type {({ obj: Entity, type?: undefined } | { obj?: undefined, type: EntityType })[]} */
        const list = pool.filter((e) => !ids.includes(e.id) && (!q || e.name.toLowerCase().includes(q)))
            .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
            .slice(0, MAX_SUGGESTIONS).map((obj) => ({ obj }));
        if (q) for (const type of types) if (!pool.some((e) => e.type === type && e.name.toLowerCase() === q)) list.push({ type });
        return list;
    }, [entities, ids.join(), types.join(), q]);

    /** @param {(typeof options)[number]} option */
    const choose = async (option) => {
        const name = query.trim();
        setQuery('');
        setActive(0);
        setError(null);
        if (option.obj) { onAdd(option.obj.id); return; }
        const res = await createEntity(option.type, { name });
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
                onFocus=${() => setOpen(true)}
                onBlur=${() => setTimeout(() => setOpen(false), 120)}
                onKeyDown=${onKeyDown} />
            ${open && options.length > 0 && html`
                <div className="ol-menu" role="listbox">
                    ${options.map((o, i) => html`
                        <button key=${o.obj ? o.obj.id : `new-${o.type}`} role="option" aria-selected=${i === active}
                            className=${`ol-option ${i === active ? 'active' : ''} ${o.obj ? 'link' : 'create'}`}
                            onMouseDown=${(/** @type {Event} */ e) => e.preventDefault()} onClick=${() => choose(o)} onMouseEnter=${() => setActive(i)}>
                            ${o.obj
                                ? html`<i>${ENTITY_TYPES[o.obj.type].glyph}</i><span>${o.obj.name}</span><em>${ENTITY_TYPES[o.obj.type].label}</em>`
                                : html`<i>✦</i><span>New ${ENTITY_TYPES[o.type].label.toLowerCase()} “${query.trim()}”</span>`}
                        </button>
                    `)}
                </div>
            `}
        </div>
        ${error && html`<div className="nc-error">${error}</div>`}
    `;
}
