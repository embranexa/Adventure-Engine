import { useMemo } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { OUTCOMES, assayable, siteOf } from '../../lib/assay.js';

/**
 * The Assayer: specimens being read, one at a time, and how each site has answered. Assay
 * sends the Centrifuge's specimens that pass the Nexus's filter.
 */
export function AssayerPanel() {
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const draft = useWorkspaceStore((s) => s.draftFilters);
    const assayEvents = useWorkspaceStore((s) => s.assayEvents);
    const stopAssay = useWorkspaceStore((s) => s.stopAssay);
    const error = useWorkspaceStore((s) => s.actionError);
    const ready = useMemo(() => assayable(rawEvents, draft, Date.now()), [rawEvents, draft]);
    const queue = rawEvents.filter((e) => e.review === 'assaying').sort((x, y) => x.start.localeCompare(y.start));
    const sites = useMemo(() => {
        /** @type {Map<string, { site: string, n: number, ore: number, by: Record<string, number> }>} */
        const m = new Map();
        for (const e of rawEvents) {
            if (!e.assay?.outcome) continue;
            const site = siteOf(e.url), row = m.get(site) ?? { site, n: 0, ore: 0, by: {} };
            m.set(site, row);
            row.n += 1; row.ore += e.missing.length ? 0 : 1; row.by[e.assay.outcome] = (row.by[e.assay.outcome] ?? 0) + 1;
        }
        return [...m.values()].sort((x, y) => y.n - x.n || x.site.localeCompare(y.site));
    }, [rawEvents]);
    return html`
        <div className="panel-body assayer">
            <section className="nec-pane">
                <div className="cx-detail-head"><h3>${queue.length ? `Reading ${queue.length}` : 'Still'}</h3>
                    ${queue.length > 0 ? html`<button className="btn" onClick=${stopAssay} title="Everything waiting goes back to the Centrifuge">■ Stop</button>`
                        : html`<button className="btn" disabled=${!ready.length} onClick=${() => assayEvents(ready)} title="The Centrifuge’s specimens that pass the Nexus’s filter">⚖ Assay ${ready.length}</button>`}</div>
                ${queue.slice(0, 12).map((e, i) => html`<div key=${e.id} className=${`as-item ${i ? '' : 'now'}`}><i></i><b>${e.title}</b><em>${siteOf(e.url)}</em></div>`)}
                ${queue.length > 12 && html`<p className="nec-dim">and ${queue.length - 12} more</p>`}
                ${!queue.length && html`<p className="nec-dim">${ready.length ? 'One page at a time: what each specimen lacks is read from its link.' : 'Feed the Centrifuge, or widen the Nexus’s filter: no specimen there is waiting to be read.'}</p>`}
                ${error && html`<div className="nc-error" role="alert">${error}</div>`}
            </section>
            ${sites.length > 0 && html`<section className="nec-pane"><h4>Sites</h4>
                ${sites.map((s) => html`<div key=${s.site} className="as-site"><b>${s.site}</b><small>${s.ore} of ${s.n} ore</small>
                    <span>${Object.entries(s.by).map(([k, n]) => html`<i key=${k} style=${{ flexGrow: n, background: OUTCOMES[k]?.color }} title=${`${OUTCOMES[k]?.label}: ${n}`}></i>`)}</span></div>`)}
            </section>`}
        </div>
    `;
}
