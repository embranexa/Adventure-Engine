import { useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { formatEventWhen, formatPrice, safeHttpUrl } from '../../events.js';
import { MAIN_ROUTE, PHASE_STAGES, stageOf } from '../../lifecycle.js';

// details keys shown in their own rows; any others are listed generically below
const KNOWN_DETAILS = new Set([
    'free', 'price_cents', 'price_min_cents', 'price_max_cents',
    'sold_out', 'registration', 'hosts', 'guest_count',
]);

/** @param {unknown} value */
function formatValue(value) {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

/** @param {{ src: string }} props */
function CoverImage({ src }) {
    const [failed, setFailed] = useState(false);
    if (failed) return html`<div className="nc-img empty" />`;
    return html`
        <div className="nc-img">
            <img src=${src} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${() => setFailed(true)} />
        </div>
    `;
}

/** @param {{ event: PoolItem }} props */
function EventDetails({ event }) {
    const details = event.details || {};
    const image = safeHttpUrl(event.cover_url);
    const link = safeHttpUrl(event.url);
    const price = formatPrice(details);
    const hosts = Array.isArray(details.hosts) ? details.hosts.join(', ') : null;

    const where = event.location_approximate
        ? `Approximate location${event.city ? ` · ${event.city}` : ''}`
        : [event.venue, event.address].filter(Boolean).join(' — ') || event.city || 'Unknown';

    /** @type {[string, string][]} */
    const rows = [
        ['When', formatEventWhen(event)],
        ['Where', where],
    ];
    if (event.lat != null && event.lon != null) rows.push(['Coords', `${event.lat.toFixed(5)}, ${event.lon.toFixed(5)}`]);
    if (price) rows.push(['Price', details.sold_out ? `${price} (sold out)` : price]);
    else if (details.sold_out) rows.push(['Price', 'Sold out']);
    if (hosts) rows.push(['Hosts', hosts]);
    if (typeof details.guest_count === 'number') rows.push(['Guests', details.guest_count.toLocaleString()]);
    if (details.registration) rows.push(['Status', String(details.registration)]);
    rows.push(['Source', event.source ?? 'Hand-made']);
    for (const [key, value] of Object.entries(details)) {
        if (!KNOWN_DETAILS.has(key) && value != null) rows.push([key.replace(/_/g, ' '), formatValue(value)]);
    }

    const stage = stageOf(event);

    return html`
        <div className="nc-head">
            <span className="nc-tag" style=${stage ? { background: stage.color } : undefined}>
                ${stage ? stage.matter.toUpperCase() : 'LOCKED'}
            </span>
            <span className="nc-title">${event.title}</span>
        </div>
        ${stage && html`<div className="nc-stage">${stage.module} · ${stage.hint}</div>`}
        <${ItemActions} item=${event} />
        ${image ? html`<${CoverImage} key=${image} src=${image} />` : html`<div className="nc-img empty" />`}
        <dl className="nc-rows">
            ${rows.map(([label, value], i) => html`
                <dt key=${'k' + i}>${label}</dt>
                <dd key=${'v' + i}>${value}</dd>
            `)}
        </dl>
        ${link && html`
            <a className="btn nc-link" href=${link} target="_blank" rel="noopener noreferrer">
                Open event page ↗
            </a>
        `}
    `;
}

/**
 * Triage and phase controls for the selected item.
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
            ? html`<button className="btn nc-act" onClick=${() => reviveEvent(item.id)}>↺ Revive from Limbo</button>`
            : html`
                <button className="btn nc-act pass" onClick=${() => passEvent(item.id)} title="Becomes an adventure (ore in the Hopper)">✦ Pass → Hopper</button>
                <button className="btn nc-act" onClick=${() => ignoreEvent(item.id)} title="Rejected; can be revived later">✕ Ignore → Limbo</button>
            `;
    } else if (item.phase === 'killed') {
        const from = item.phase_before_kill ? PHASE_STAGES[item.phase_before_kill].module : 'the Hopper';
        controls = html`<button className="btn nc-act" onClick=${() => reviveAdventure(item.id)}>↺ Revive → ${from}</button>`;
    } else {
        controls = html`
            <div className="nc-route">
                ${MAIN_ROUTE.map((phase) => html`
                    <button
                        key=${phase}
                        className=${`nc-step ${phase === item.phase ? 'current' : ''}`}
                        style=${{ '--s': PHASE_STAGES[phase].color }}
                        title=${`${PHASE_STAGES[phase].module} (${PHASE_STAGES[phase].matter}): ${PHASE_STAGES[phase].hint}`}
                        onClick=${() => setPhase(item.id, phase)}
                    >${PHASE_STAGES[phase].module}</button>
                `)}
            </div>
            ${item.phase === 'completed' && html`
                <button className="btn nc-act" onClick=${() => setPhase(item.id, 'decommissioned')}>⌛ Decommission → Archive</button>
            `}
            <button className="btn nc-act kill" onClick=${() => killAdventure(item.id)} title="Kept in the Necropolis; can be revived">☠ Kill → Necropolis</button>
        `;
    }

    return html`
        <div className="nc-actions">
            ${controls}
            ${error && html`<div className="nc-error">${error}</div>`}
        </div>
    `;
}

/** Details of the selected item, with its triage / phase controls. */
export function NodeCard() {
    const event = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId] : null));
    const hoverItem = useWorkspaceStore((s) => s.hoverItem);
    const mode = useWorkspaceStore((s) => s.mode);

    return html`
        <div
            className="panel-body node-card"
            style=${event ? { '--c': event.color } : undefined}
            onPointerEnter=${() => event && hoverItem(event.id)}
            onPointerLeave=${() => event && hoverItem(null)}
        >
            ${event
                ? html`<${EventDetails} event=${event} />`
                : html`<div className="nc-empty">No target locked<small>${mode === 'discovery'
                    ? 'Select an omen to review it'
                    : 'Select an adventure in the calendar or map'}</small></div>`}
        </div>
    `;
}
