import { useMemo } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { OBJECT_TYPES } from '../../lifecycle.js';
import { LENSES } from '../../lib/lens.js';
import { pipeFlows, twinModel } from '../../lib/twinModel.js';
import { OUTSIDE, twinNodes, twinPipes } from '../../lib/twinTopology.js';

const ZONE_LABELS = { net: 'Net · events', core: 'Core · adventures', viewer: 'Viewers' };
const RECENT = 15;

/** @param {number} n */
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** @param {string} iso */
function clock(iso) {
    const d = new Date(iso);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Do what clicking a machine does: switch mode or shades if needed, then open its panel.
 * @param {import('../../lib/twinTopology.js').TwinAction} action
 */
function runAction(action) {
    const s = useWorkspaceStore.getState();
    if (action.mode) s.setMode(action.mode);
    if (action.shades && !useWorkspaceStore.getState().showShades) s.toggleShades();
    if (action.create) {
        s.setMode('adventures');
        s.selectItem(null, 'twin'); // the Refiner shows the create buttons when nothing is selected
    }
    s.showPanel(action.panel);
}

/** The lit part of a level as a stacked bar, one segment per lens value. @param {{ level: import('../../lib/twinModel.js').TwinLevel }} props */
function Bands({ level }) {
    if (!level.total) return html`<span className="sc-dim">—</span>`;
    return html`
        <div className="sc-bar" title=${level.bands.map((b) => `${b.label}: ${fmt(b.count)}`).join('\n') || 'nothing lit'}>
            ${level.bands.map((b) => html`
                <i key=${b.value} style=${{ flexGrow: b.count, background: b.color }}></i>
            `)}
            ${level.total > level.lit && html`<i className="ghost" style=${{ flexGrow: level.total - level.lit }}></i>`}
        </div>
    `;
}

/**
 * The Signal Chain, phase 2: the twin's model as plain tables, to check the numbers
 * before it becomes 3D. Levels per machine (lit = passes the applied filter, split by
 * the lens), flows over 7 days, the counting rules, and the latest moves.
 */
export function SignalChainPanel() {
    const rawEvents = useWorkspaceStore((s) => s.rawEvents);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const objects = useWorkspaceStore((s) => s.objects);
    const filters = useWorkspaceStore((s) => s.filters);
    const sources = useWorkspaceStore((s) => s.sources);
    const transitions = useWorkspaceStore((s) => s.transitions);
    const flows = useWorkspaceStore((s) => s.flows);
    const setLens = useWorkspaceStore((s) => s.setLens);

    const sourceNames = useMemo(() => Object.keys(sources), [sources]);
    const nodes = useMemo(() => twinNodes(sourceNames), [sourceNames]);
    const pipes = useMemo(() => twinPipes(sourceNames), [sourceNames]);
    const model = useMemo(
        () => twinModel({ rawEvents, adventures, objects, filters, lens: filters.lens, now: Date.now() }),
        [rawEvents, adventures, objects, filters],
    );
    const routed = useMemo(() => pipeFlows(flows, pipes), [flows, pipes]);
    const flowIn = useMemo(() => {
        /** @type {Record<string, { in: number, out: number }>} */
        const io = {};
        for (const f of flows) {
            (io[f.to] ??= { in: 0, out: 0 }).in += f.count;
            (io[f.from] ??= { in: 0, out: 0 }).out += f.count;
        }
        return io;
    }, [flows]);

    // names for the latest moves
    const titleOf = useMemo(() => {
        /** @type {Map<string, string>} */
        const m = new Map();
        for (const e of rawEvents) m.set(e.id, e.title);
        for (const a of adventures) m.set(a.id, a.title);
        for (const o of objects) m.set(o.id, o.name);
        return m;
    }, [rawEvents, adventures, objects]);

    const zones = /** @type {const} */ (['net', 'core', 'viewer']);
    const busyPipes = pipes.filter((p) => routed.byPipe[p.id].forward || routed.byPipe[p.id].backward);

    return html`
        <div className="panel-body signal-chain">
            <div className="sc-head">
                <span className=${`sc-check ${model.check.ok ? 'ok' : 'bad'}`}
                    title=${model.check.ok ? 'Both counting rules hold' : model.check.problems.join('\n')}>
                    ${model.check.ok ? '✓ Counts balance' : `⚠ ${model.check.problems[0]}`}
                </span>
                <span className="sc-spacer"></span>
                <label className="sc-lens">Lens
                    <select className="btn" value=${filters.lens}
                        onChange=${(/** @type {any} */ e) => setLens(e.target.value)}>
                        ${LENSES.map((l) => html`<option key=${l.key} value=${l.key}>${l.label}</option>`)}
                    </select>
                </label>
            </div>

            <div className="sc-scroll">
                ${zones.map((zone) => html`
                    <table key=${zone} className="sc-table sc-zone">
                        <colgroup>
                            <col className="c-name" /><col className="c-kind" /><col className="c-num" /><col className="c-num" />
                            <col /><col className="c-num" /><col className="c-num" />
                        </colgroup>
                        <thead>
                            <tr><th colSpan="2">${ZONE_LABELS[zone]}</th><th>Held</th><th>Lit</th><th className="sc-bands">Lit by lens · ghost</th><th>In 7d</th><th>Out 7d</th></tr>
                        </thead>
                        <tbody>
                            ${nodes.filter((n) => n.zone === zone).map((n) => {
                                const level = model.levels[n.id] ?? { total: 0, lit: 0, bands: [] };
                                const io = flowIn[n.id] ?? { in: 0, out: 0 };
                                const action = n.action;
                                const isCodex = n.holds === 'objects';
                                return html`
                                    <tr key=${n.id} className=${n.locked ? 'locked' : ''}>
                                        <td className="sc-name">
                                            ${action && !n.locked
                                                ? html`<button className="sc-link" onClick=${() => runAction(action)}
                                                    title=${`Open ${action.panel}${action.mode ? ` (${action.mode})` : ''}`}>${n.label}</button>`
                                                : n.label}
                                            ${n.locked && html`<span className="sc-lock" title="Not built yet">🔒</span>`}
                                        </td>
                                        <td className="sc-dim">${n.kind}${n.matter ? ` · ${n.matter}` : ''}</td>
                                        ${isCodex
                                            ? html`<td>${model.codex.total}</td><td colSpan="2" className="sc-dim">
                                                ${Object.entries(model.codex.byType).map(([t, c]) => `${OBJECT_TYPES[/** @type {ObjectType} */ (t)].glyph} ${c}`).join('   ')}
                                              </td>`
                                            : n.holds
                                                ? html`<td>${level.total}</td><td>${level.lit}</td><td><${Bands} level=${level} /></td>`
                                                : html`<td className="sc-dim">—</td><td className="sc-dim">—</td><td></td>`}
                                        <td>${io.in || ''}</td><td>${io.out || ''}</td>
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                `)}

                <table className="sc-table">
                    <thead><tr><th>Pipe (7 days)</th><th>⟶</th><th>⟵</th></tr></thead>
                    <tbody>
                        ${busyPipes.map((p) => html`
                            <tr key=${p.id}>
                                <td>${p.a === OUTSIDE ? 'outside' : p.a} ${p.kind === 'conveyor' ? '⛓' : '—'} ${p.b}</td>
                                <td>${routed.byPipe[p.id].forward || ''}</td>
                                <td>${routed.byPipe[p.id].backward || ''}</td>
                            </tr>
                        `)}
                        ${routed.unrouted.map((f) => html`
                            <tr key=${`${f.from}>${f.to}`} className="bad"><td>no pipe: ${f.from} → ${f.to}</td><td>${f.count}</td><td></td></tr>
                        `)}
                    </tbody>
                </table>

                <table className="sc-table sc-moves">
                    <thead><tr><th colSpan="3">Latest moves (${transitions.length} held)</th></tr></thead>
                    <tbody>
                        ${transitions.slice(-RECENT).reverse().map((t) => html`
                            <tr key=${t.id}>
                                <td className="sc-dim">${clock(t.at)}</td>
                                <td>${t.from} → ${t.to}</td>
                                <td className="sc-dim">${titleOf.get(t.row_id) ?? t.entity}</td>
                            </tr>
                        `)}
                        ${!transitions.length && html`<tr><td colSpan="3" className="sc-dim">No moves in the last 24 hours</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
