import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { centrifugeOrder, useWorkspaceStore } from '../../store.js';
import { formatEventWhen, formatPrice, safeHttpUrl } from '../../events.js';
import { ADVENTURE_FLAGS, ADVENTURE_TYPES, MAIN_ROUTE, PHASE_STAGES, hasWhenWhere, stageOf } from '../../lifecycle.js';
import { AdventureEditor } from './AdventureEditor.js';
import { ObjectLinks } from '../ObjectLinks.js';

// details keys shown in their own rows; any others are listed generically below
const KNOWN_DETAILS = new Set([
    'free', 'price_cents', 'price_min_cents', 'price_max_cents',
    'sold_out', 'registration', 'hosts', 'guest_count', 'located',
]);

// Alchemical element glyphs (18×18): fire, water, air, earth, aether
const ELEMENT_PATHS = {
    fire: 'M9 2.5 L16 15 H2 Z',
    water: 'M2 3 H16 L9 15.5 Z',
    air: 'M9 2.5 L16 15 H2 Z M4.6 10.4 H13.4',
    earth: 'M2 3 H16 L9 15.5 Z M4.6 7.6 H13.4',
    aether: 'M9 2.5 A6.5 6.5 0 1 1 8.99 2.5 Z M9 7.2 A1.8 1.8 0 1 1 8.99 7.2 Z',
};

/** Display names of details keys that aren't self-explanatory. */
const DETAIL_LABELS = /** @type {Record<string, string>} */ ({ price_text: 'price as listed', area: 'area (as listed)' });

/** 'https://www.instagram.com/owl.dtla' -> 'instagram.com/owl.dtla'. @param {string} url */
function linkLabel(url) {
    try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').slice(0, 48); } catch { return url; }
}

/** @param {unknown} value */
function formatValue(value) {
    const text = Array.isArray(value) && value.every((v) => typeof v === 'string') ? value.join(', ')
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

/** A stat set by hand on the adventure (empty until then). @param {Record<string, unknown> | undefined} stats @param {string} key */
function stat(stats, key) {
    const v = stats?.[key];
    return v == null || v === '' ? null : v;
}

/** @param {{ src: string | null }} props */
function CardArt({ src }) {
    const [failed, setFailed] = useState(false);
    return html`
        <div className="tcard-art">
            ${src && !failed
                ? html`<img src=${src} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${() => setFailed(true)} />`
                : html`<span>NO IMAGE</span>`}
        </div>
    `;
}

/**
 * The selected item as a trading card. Four designators: matter (foil frame + strip),
 * pillar (banner), difficulty (pips), element (corner badge). Pillar, difficulty,
 * element and HP/ATK/DEF are set by hand later; until then they show as empty.
 * @param {{ item: PoolItem }} props
 */
function TradingCard({ item }) {
    const stage = stageOf(item);
    const stats = item.kind === 'adventure' ? item.stats : undefined;
    const element = /** @type {keyof typeof ELEMENT_PATHS | null} */ (stat(stats, 'element'));
    const pillar = /** @type {string | null} */ (stat(stats, 'pillar'));
    const difficulty = Math.max(0, Math.min(5, Number(stat(stats, 'difficulty')) || 0));
    const kind = item.kind === 'adventure' ? ADVENTURE_TYPES[item.type] : null;
    const when = !hasWhenWhere(item) ? `${kind?.glyph ?? ''} ${kind?.label ?? ''}`.trim()
        : item.start ? formatEventWhen(item) : 'Undated';
    const place = hasWhenWhere(item) ? (item.location_approximate ? item.city : (item.venue || item.city)) : null;

    return html`
        <div
            className="tcard"
            style=${{ '--c': stage?.color, '--d': stage?.deep, '--l': stage?.light }}
        >
            <div className="tcard-element" title=${element ? `Element: ${element}` : 'Element not set'}>
                ${element && ELEMENT_PATHS[element]
                    ? html`<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#e6e8ec" stroke-width="1.5"><path d=${ELEMENT_PATHS[element]}></path></svg>`
                    : '?'}
            </div>
            <div className="tcard-body">
                <div className="tcard-banner">
                    <span className="tcard-title">${item.title}</span>
                    ${pillar && html`<span className="tcard-pillar">${pillar}</span>`}
                </div>
                <${CardArt} key=${item.id} src=${safeHttpUrl(item.cover_url)} />
                <div className="tcard-strip">
                    <span>★ ${stage ? stage.matter : 'unknown'}</span>
                    <span className="pips" title=${difficulty ? `Difficulty ${difficulty} of 5` : 'Difficulty not set'}>
                        ${[1, 2, 3, 4, 5].map((n) => html`<span key=${n} className=${`pip ${n <= difficulty ? 'on' : ''}`}></span>`)}
                    </span>
                </div>
                <div className="tcard-lore">${when}${place ? ` · ${place}` : ''}</div>
                <div className="tcard-stats">
                    <span>HP ${stat(stats, 'hp') ?? '—'}</span>
                    <span>ATK ${stat(stats, 'atk') ?? '—'}</span>
                    <span>DEF ${stat(stats, 'def') ?? '—'}</span>
                </div>
            </div>
        </div>
    `;
}

/** Detail rows under the card. @param {{ event: PoolItem }} props */
function EventRows({ event }) {
    const placed = hasWhenWhere(event);
    const kind = event.kind === 'adventure' ? ADVENTURE_TYPES[event.type] : null;
    const description = event.kind === 'adventure' ? event.description : null;
    const details = event.details || {};
    const link = safeHttpUrl(event.url);
    const price = formatPrice(details);
    const hosts = Array.isArray(details.hosts) ? details.hosts.join(', ') : null;
    const where = event.location_approximate
        ? `Approximate location${event.city ? ` · ${event.city}` : ''}`
        : [event.venue, event.address].filter(Boolean).join(' — ') || event.city || 'Unknown';

    /** @type {[string, unknown][]} */
    const rows = [];
    if (kind) rows.push(['Type', `${kind.glyph} ${kind.label}`]);
    if (placed) {
        rows.push(['When', event.start ? formatEventWhen(event) : 'Undated'], ['Where', where]);
        if (event.lat != null && event.lon != null) {
            // located by the geocoder (services/geocode.py): say how precisely
            const by = typeof details.located === 'string' ? ` · by ${details.located}` : '';
            rows.push(['Coords', `${event.lat.toFixed(5)}, ${event.lon.toFixed(5)}${by}`]);
        }
    }
    if (price) rows.push(['Price', details.sold_out ? `${price} (sold out)` : price]);
    else if (details.sold_out) rows.push(['Price', 'Sold out']);
    if (hosts) rows.push(['Hosts', hosts]);
    if (typeof details.guest_count === 'number') rows.push(['Guests', details.guest_count.toLocaleString()]);
    if (details.registration) rows.push(['Status', String(details.registration)]);
    rows.push(['Source', event.source ?? 'Hand-made']);
    for (const [key, value] of Object.entries(details)) {
        if (KNOWN_DETAILS.has(key) || value == null) continue;
        // links beside the event page (19hz: the organizer's Instagram / Facebook): clickable
        if (key === 'links' && Array.isArray(value)) {
            const urls = value.map((v) => safeHttpUrl(String(v))).filter(Boolean);
            if (urls.length) rows.push(['Other links', html`${urls.map((u, k) => html`${k ? ' · ' : ''}<a key=${u} href=${u} target="_blank" rel="noopener noreferrer">${linkLabel(u)}</a>`)}`]);
            continue;
        }
        rows.push([DETAIL_LABELS[key] ?? key.replace(/_/g, ' '), formatValue(value)]);
    }

    return html`
        ${description && html`<p className="nc-desc">${description}</p>`}
        <dl className="nc-rows">
            ${rows.map(([label, value], i) => html`
                <dt key=${'k' + i}>${label}</dt>
                <dd key=${'v' + i}>${value}</dd>
            `)}
        </dl>
        ${link && html`<a className="btn nc-link" href=${link} target="_blank" rel="noopener noreferrer">${event.source ? 'Open event page ↗' : 'Open link ↗'}</a>`}
    `;
}

/**
 * Comb through the Centrifuge: the previous and next prima materia in time order (the
 * earliest first; undated ones last). ◀ on the first wraps to the last, ▶ on the last to the first.
 * @param {{ item: PoolItem }} props
 */
function CentrifugeComb({ item }) {
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const itemsById = useWorkspaceStore((s) => s.itemsById);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const order = useMemo(() => centrifugeOrder(rawEvents, itemsById), [rawEvents, itemsById]);
    const i = order.indexOf(item.id);
    if (i < 0 || order.length < 2) return null;
    const go = (/** @type {number} */ step) => { selectItem(order[(i + step + order.length) % order.length], 'triage'); };
    return html`
        <div className="nc-comb" role="group" aria-label="Prima materia in the Centrifuge">
            <button className="btn" onClick=${() => go(-1)} title="The earlier prima materia" aria-label="Earlier">◀</button>
            <span>${i + 1} <small>of ${order.length} in the Centrifuge</small></span>
            <button className="btn" onClick=${() => go(1)} title="The later prima materia" aria-label="Later">▶</button>
        </div>
    `;
}

/**
 * Triage and stage controls for the selected item.
 * @param {{ item: PoolItem }} props
 */
function ItemActions({ item }) {
    const passEvent = useWorkspaceStore((s) => s.passEvent);
    const ignoreEvent = useWorkspaceStore((s) => s.ignoreEvent);
    const reviveEvent = useWorkspaceStore((s) => s.reviveEvent);
    const killAdventure = useWorkspaceStore((s) => s.killAdventure);
    const reviveAdventure = useWorkspaceStore((s) => s.reviveAdventure);
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const error = useWorkspaceStore((s) => s.actionError);

    let controls;
    if (item.kind === 'omen') {
        controls = item.review === 'ignored'
            ? html`<button className="btn nc-act" onClick=${() => reviveEvent(item.id)}
                title="Back into play: its killed adventure returns where it was, else the event goes back to the Centrifuge">↺ Revive</button>`
            : html`
                <button className="btn nc-act pass" onClick=${() => passEvent(item.id)} title="Becomes an adventure: ore">✦ Pass → Ore</button>
                <button className="btn nc-act" onClick=${() => ignoreEvent(item.id)} title="Rejected, to dross; can be revived later">✕ Ignore → Dross</button>
            `;
    } else if (item.phase === 'killed') {
        const from = item.phase_before_kill ? PHASE_STAGES[item.phase_before_kill].matter : 'ore';
        controls = html`<button className="btn nc-act" onClick=${() => reviveAdventure(item.id)}>↺ Revive → ${from}</button>`;
    } else {
        controls = html`
            <div className="nc-route">
                ${MAIN_ROUTE.map((phase) => html`
                    <button
                        key=${phase}
                        className=${`nc-step ${phase === item.phase ? 'current' : ''}`}
                        style=${{ '--s': PHASE_STAGES[phase].color }}
                        title=${`${PHASE_STAGES[phase].matter}: ${PHASE_STAGES[phase].hint}`}
                        onClick=${() => setPhase(item.id, phase)}
                    >${PHASE_STAGES[phase].matter}</button>
                `)}
            </div>
            ${item.phase === 'completed' && html`
                <button className="btn nc-act" onClick=${() => setPhase(item.id, 'decommissioned')}>⌛ Decommission → Relic</button>
            `}
            <button className="btn nc-act kill" onClick=${() => killAdventure(item.id)} title="Becomes a vestige; can be revived">☠ Kill → Vestige</button>
        `;
    }

    return html`
        <div className="nc-actions">
            ${item.kind === 'omen' && item.review === 'new' && html`<${CentrifugeComb} item=${item} />`}
            ${controls}
            ${error && html`<div className="nc-error">${error}</div>`}
        </div>
    `;
}

/**
 * The adventure's flags: one toggle each (lit when set). Saved at once.
 * @param {{ adventure: PoolItem & { kind: 'adventure' } }} props
 */
function FlagToggles({ adventure }) {
    const updateAdventure = useWorkspaceStore((s) => s.updateAdventure);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const flags = new Set(adventure.flags ?? []);
    const toggle = async (/** @type {AdventureFlag} */ f) => {
        const next = new Set(flags);
        if (next.has(f)) next.delete(f); else next.add(f);
        setError(await updateAdventure(adventure.id, { flags: [...next] }));
    };
    return html`
        <div className="nc-flags">
            ${Object.entries(ADVENTURE_FLAGS).map(([key, f]) => html`
                <button key=${key} className=${`nc-flag ${flags.has(/** @type {AdventureFlag} */ (key)) ? 'on' : ''}`} style=${{ '--f': f.color }}
                    title=${`${flags.has(/** @type {AdventureFlag} */ (key)) ? 'Unflag' : 'Flag as'} ${f.label.toLowerCase()}`}
                    onClick=${() => toggle(/** @type {AdventureFlag} */ (key))}>
                    <span>${f.glyph}</span> ${f.label}
                </button>
            `)}
            ${error && html`<div className="nc-error">${error}</div>`}
        </div>
    `;
}

/** Buttons that make a hand-made adventure (it opens here, in edit mode). */
export function NewAdventureButtons() {
    const createAdventure = useWorkspaceStore((s) => s.createAdventure);
    return html`
        <div className="nc-new">
            ${Object.entries(ADVENTURE_TYPES).map(([key, t]) => html`
                <button key=${key} className="btn" title=${t.hint}
                    onClick=${() => createAdventure(/** @type {AdventureType} */ (key))}>✦ New ${t.label.toLowerCase()}</button>
            `)}
        </div>
    `;
}

/** The selected item: its trading card, triage / stage controls and details; adventures
 *  can be edited in place (✎), and a freshly made one opens in edit mode. */
export function NodeCard() {
    const event = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId] : null));
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);
    const mode = useWorkspaceStore((s) => s.mode);
    const editingId = useWorkspaceStore((s) => s.editingAdventureId);
    const setEditingAdventure = useWorkspaceStore((s) => s.setEditingAdventure);
    const actionError = useWorkspaceStore((s) => s.actionError);
    const stage = event ? stageOf(event) : null;

    const [editing, setEditing] = useState(false);
    const fresh = event != null && editingId === event.id; // just created here
    useEffect(() => { setEditing(fresh); }, [event?.id, fresh]);

    const stopEditing = () => {
        setEditing(false);
        if (fresh) setEditingAdventure(null);
    };

    return html`
        <div
            className="panel-body node-card"
            onPointerEnter=${() => event && hoverItem(event.id)}
            onPointerLeave=${() => event && hoverItem(null)}
        >
            ${event
                ? html`
                    <${TradingCard} item=${event} />
                    ${stage && html`
                        <div className="nc-stage">
                            <span>${stage.matter} · ${stage.hint}</span>
                            ${event.kind === 'adventure' && !editing && html`
                                <button className="cls-layer nc-edit" onClick=${() => setEditing(true)} title="Edit this adventure">✎ Edit</button>
                            `}
                        </div>
                    `}
                    ${event.kind === 'adventure' && editing
                        ? html`<${AdventureEditor} adventure=${event} focusTitle=${fresh} onDone=${stopEditing} />`
                        : html`<${ItemActions} item=${event} />`}
                    ${event.kind === 'adventure' && !editing && html`<${FlagToggles} adventure=${event} />`}
                    ${event.kind === 'adventure' && html`<${ObjectLinks} adventure=${event} />`}
                    ${!(event.kind === 'adventure' && editing) && html`<${EventRows} event=${event} />`}
                `
                : html`
                    <div className="nc-empty">Nothing selected
                        <small>${mode === 'discovery'
                            ? 'Select an event to review it, or make an adventure from scratch'
                            : 'Select an adventure in the Nexus, Atlas or Calendar, or make one from scratch'}</small>
                        <${NewAdventureButtons} />
                        ${actionError && html`<div className="nc-error">${actionError}</div>`}
                    </div>
                `}
        </div>
    `;
}
