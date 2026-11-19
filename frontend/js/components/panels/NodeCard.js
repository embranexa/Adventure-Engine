import { useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { formatEventWhen, formatPrice, safeHttpUrl } from '../../events.js';

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

/** @param {{ event: EventItem }} props */
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
    rows.push(['Source', event.source]);
    for (const [key, value] of Object.entries(details)) {
        if (!KNOWN_DETAILS.has(key) && value != null) rows.push([key.replace(/_/g, ' '), formatValue(value)]);
    }

    return html`
        <div className="nc-head">
            <span className="nc-tag">LOCKED</span>
            <span className="nc-title">${event.title}</span>
        </div>
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

/** Details of the selected event. */
export function NodeCard() {
    const event = useWorkspaceStore((s) => (s.selectedEventId ? s.eventsById[s.selectedEventId] : null));
    const hoverEvent = useWorkspaceStore((s) => s.hoverEvent);

    return html`
        <div
            className="panel-body node-card"
            style=${event ? { '--c': event.color } : undefined}
            onPointerEnter=${() => event && hoverEvent(event.id)}
            onPointerLeave=${() => event && hoverEvent(null)}
        >
            ${event
                ? html`<${EventDetails} event=${event} />`
                : html`<div className="nc-empty">No target locked<small>Select an event in the calendar</small></div>`}
        </div>
    `;
}
