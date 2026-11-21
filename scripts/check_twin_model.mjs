// Check the Signal Chain model against a running server (read-only).
//
//     node --experimental-default-type=module scripts/check_twin_model.mjs [http://127.0.0.1:8000]
//
// Runs frontend/js/lib/twinModel.js on the server's live rows under every lens, with and
// without the saved filter, and checks: both counting rules hold, the lens bands of every
// machine add up to its lit count, lit never exceeds held, and every flow has a pipe.

import { fileURLToPath } from 'node:url';

const base = (process.argv[2] ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const fe = fileURLToPath(new URL('../frontend/js/', import.meta.url));
const { twinModel, pipeFlows } = await import(`${fe}lib/twinModel.js`);
const { twinPipes } = await import(`${fe}lib/twinTopology.js`);
const { LENSES } = await import(`${fe}lib/lens.js`);
const { DEFAULT_FILTERS, setObjectNames } = await import(`${fe}filters.js`);

const get = async (path) => {
    const res = await fetch(`${base}/api/${path}`);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
};
const [rawEvents, adventures, objects, sources, flows, saved] = await Promise.all(
    ['events', 'adventures', 'objects', 'sources', 'transitions/flows', 'state/filters'].map(get));
setObjectNames(objects);

let failures = 0;
const fail = (msg) => { failures++; console.log(`FAIL ${msg}`); };

for (const [name, filters] of [['no filter', { ...DEFAULT_FILTERS, seal: false }], ['saved filter', saved]]) {
    for (const { key: lens } of LENSES) {
        const m = twinModel({ rawEvents, adventures, objects, filters, lens, now: Date.now() });
        if (!m.check.ok) fail(`${name} / ${lens}: ${m.check.problems.join('; ')}`);
        for (const [id, level] of Object.entries(m.levels)) {
            const sum = level.bands.reduce((n, b) => n + b.count, 0);
            if (Math.abs(sum - level.lit) > 1e-9) fail(`${name} / ${lens}: ${id} bands ${sum} != lit ${level.lit}`);
            if (level.lit > level.total) fail(`${name} / ${lens}: ${id} lit ${level.lit} > held ${level.total}`);
        }
    }
    const m = twinModel({ rawEvents, adventures, objects, filters, lens: 'stage', now: Date.now() });
    console.log(`${name}:`, Object.entries(m.levels).map(([id, l]) => `${id} ${l.lit}/${l.total}`).join(' · '));
}

const { unrouted } = pipeFlows(flows, twinPipes(sources.map((s) => s.name)));
for (const f of unrouted) fail(`no pipe for ${f.from} -> ${f.to} (${f.count})`);

console.log(failures ? `${failures} failure(s)` : `all checks passed (${rawEvents.length} events, ${adventures.length} adventures, ${LENSES.length} lenses)`);
process.exit(failures ? 1 : 0);
