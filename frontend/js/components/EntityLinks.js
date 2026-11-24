import { useMemo, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ENTITY_TYPES } from '../lifecycle.js';
import { PartyRoster } from './PartyRoster.js';

const MAX_SUGGESTIONS = 8;

/**
 * The adventure's links to entities (the Codex), in the Refinery: chips grouped by
 * type (click opens the entity in the Codex, ✕ unlinks) and a type-ahead to link an
 * existing entity or create a new one. An event has one site: linking another replaces it.
 * @param {{ adventure: PoolItem & { kind: 'adventure' } }} props
 */
export function EntityLinks({ adventure }) {
    const entities = useWorkspaceStore((s) => s.entities);
    const linkEntity = useWorkspaceStore((s) => s.linkEntity);
    const unlinkEntity = useWorkspaceStore((s) => s.unlinkEntity);
    const createEntity = useWorkspaceStore((s) => s.createEntity);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);

    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

    const linkedIds = new Set(adventure.entities.map((o) => o.id));
    const q = query.trim().toLowerCase();

    /** Options: matching unlinked entities, then "create" for each type. */
    const options = useMemo(() => {
        /** @type {({ kind: 'link', obj: Entity } | { kind: 'create', type: EntityType })[]} */
        const list = entities
            .filter((o) => !linkedIds.has(o.id) && (!q || o.name.toLowerCase().includes(q)))
            .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
            .slice(0, MAX_SUGGESTIONS)
            .map((obj) => ({ kind: /** @type {const} */ ('link'), obj }));
        const exact = entities.some((o) => o.name.toLowerCase() === q);
        if (q && !exact) {
            for (const type of /** @type {EntityType[]} */ (Object.keys(ENTITY_TYPES))) list.push({ kind: 'create', type });
        }
        return list;
    }, [entities, q, adventure.entities]);

    /** @param {Promise<string | null>} promise */
    const run = async (promise) => setError(await promise);

    /** @param {(typeof options)[number]} option */
    const choose = async (option) => {
        setQuery('');
        setActive(0);
        if (option.kind === 'link') {
            run(linkEntity(adventure.id, option.obj.id));
            return;
        }
        const res = await createEntity(option.type, { name: query.trim() });
        if (typeof res === 'string') { setError(res); return; }
        run(linkEntity(adventure.id, res.id));
    };

    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]); }
        else if (e.key === 'Escape') { setQuery(''); setOpen(false); inputRef.current?.blur(); }
    };

    const byType = /** @type {[EntityType, LinkedEntity[]][]} */ (
        Object.keys(ENTITY_TYPES).map((t) => [t, adventure.entities.filter((o) => o.type === t)]).filter(([t, list]) => t !== 'player' && list.length)); // players are in the roster

    return html`
        <div className="ol">
            <div className="ol-head">Links
                <button className="cls-layer ol-complex" onClick=${() => showPanel('complex')} title="Its players and stewards">${adventure.collaboration ? '☉ Collaboration' : 'Complex'} ⟶</button>
            </div>
            ${byType.length > 0 && html`
                <div className="ol-chips">
                    ${byType.map(([type, list]) => list.map((o) => html`
                        <span key=${o.id} className=${`ol-chip t-${type}`}>
                            <button className="ol-chip-name" onClick=${() => { selectEntity(o.id); showPanel('codex'); }}
                                title=${`${ENTITY_TYPES[type].label} · open in the Codex`}>
                                <i>${ENTITY_TYPES[type].glyph}</i>${o.name}
                            </button>
                            <button className="ol-chip-x" onClick=${() => run(unlinkEntity(adventure.id, o.id))}
                                aria-label=${`Unlink ${o.name}`} title="Unlink">✕</button>
                        </span>
                    `))}
                </div>
            `}
            <div className="ol-add">
                <input
                    ref=${inputRef}
                    className="ol-input"
                    value=${query}
                    placeholder=${'+ Link a deity, site, player, organization, skill or spell…'}
                    aria-label="Link an entity"
                    onInput=${(/** @type {any} */ e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
                    onFocus=${() => setOpen(true)}
                    onBlur=${() => setTimeout(() => setOpen(false), 120)}
                    onKeyDown=${onKeyDown}
                />
                ${open && options.length > 0 && html`
                    <div className="ol-menu" role="listbox">
                        ${options.map((option, i) => html`
                            <button
                                key=${option.kind === 'link' ? option.obj.id : `new-${option.type}`}
                                role="option"
                                aria-selected=${i === active}
                                className=${`ol-option ${i === active ? 'active' : ''} ${option.kind}`}
                                onMouseDown=${(/** @type {Event} */ e) => e.preventDefault()}
                                onClick=${() => choose(option)}
                                onMouseEnter=${() => setActive(i)}
                            >
                                ${option.kind === 'link'
                                    ? html`<i>${ENTITY_TYPES[option.obj.type].glyph}</i><span>${option.obj.name}</span><em>${ENTITY_TYPES[option.obj.type].label}</em>`
                                    : html`<i>✦</i><span>New ${ENTITY_TYPES[option.type].label.toLowerCase()} “${query.trim()}”</span>`}
                            </button>
                        `)}
                    </div>
                `}
            </div>
            <${PartyRoster} adventure=${adventure} stewards=${true} removable=${true} />
            ${adventure.type !== 'item' && html`<div className="ol-hint">One site only: linking another replaces it${adventure.event_id ? '' : ' · its site is its where'}</div>`}
            ${error && html`<div className="nc-error">${error}</div>`}
        </div>
    `;
}
