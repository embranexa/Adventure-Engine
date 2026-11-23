import { useEffect, useMemo, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import { accuracy, verdictName, verdictRings } from '../../lib/analysis.js';
import { adventureColor, modelSpec, sigilPoints } from '../../lib/items.js';
import { Cabinet } from '../Cabinet.js';
import { Ceremony } from '../Ceremony.js';
import { AnalysisView } from './AnalysisView.js';

const VIOLET = '#a855f7';

/** @type {import('../Cabinet.js').CabinetStyle} */
const LOOK = { shape: 'arch', sealColor: '#b76bff', seed: 'treasury', points: 8 };

/** Its deity's colour, else the artifact's own. @param {AdventureRecord} a */
const colorOf = (a) => adventureColor(a, VIOLET);

/**
 * The Treasury: every completed adventure as an artifact, unsealed ones first. Opening one
 * shows its analysis; sealing it is a ceremony.
 */
export function TreasuryPanel() {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const selectItem = useWorkspaceStore((s) => s.selectItem);
    const mode = useWorkspaceStore((s) => s.mode);
    const entities = useWorkspaceStore((s) => s.entities); // deity colours
    const [openId, setOpenId] = useState(/** @type {string | null} */ (null));
    const [ceremony, setCeremony] = useState(/** @type {any} */ (null));

    const artifacts = useMemo(
        () => adventures.filter((a) => a.phase === 'completed').sort((a, b) =>
            Number(!!a.enshrining?.sealed_at) - Number(!!b.enshrining?.sealed_at)
            || (b.phase_changed_at ?? '').localeCompare(a.phase_changed_at ?? '')),
        [adventures],
    );
    const open = artifacts.find((a) => a.id === openId) ?? null;
    useEffect(() => { if (openId && !open) setOpenId(null); }, [openId, open]);

    const groups = useMemo(() => [{
        items: artifacts.map((a) => {
            const sealed = !!a.enshrining?.sealed_at, spec = modelSpec(a, { fallback: VIOLET });
            return {
                id: a.id, label: a.title ?? 'Untitled', sub: sealed ? verdictName(a.enshrining?.verdict) : a.enshrining ? 'Draft' : 'Unsealed',
                model: { ...spec, type: spec.parts ? 'recipe' : 'vessel', on: sealed },
            };
        }),
    }], [artifacts, entities]);

    const pick = (/** @type {string} */ id) => {
        setOpenId(id);
        if (mode === 'adventures') selectItem(id, 'treasury');
    };

    /** @param {AdventureRecord} a @param {Analysis} rec @param {string[]} discovered @param {boolean} amended */
    const sealed = (a, rec, discovered, amended) => {
        if (amended) return;
        const acc = accuracy(rec.moves);
        /** @type {[string, string][]} */
        const lines = [['Verdict', verdictName(rec.verdict)]];
        if (acc != null) lines.push(['Accuracy', acc.toFixed(1)]);
        for (const name of discovered) lines.push(['New in the Codex', name]);
        setCeremony({ title: 'Enshrined', subtitle: a.title ?? 'Untitled', color: colorOf(a), seed: a.id, points: sigilPoints(a), rings: verdictRings(rec.verdict), lines });
    };

    return html`
        <div className="panel-body treasury">
            ${open
                ? html`<${AnalysisView} key=${open.id} adventure=${open} onBack=${() => setOpenId(null)}
                    onSealed=${(/** @type {Analysis} */ rec, /** @type {string[]} */ found, /** @type {boolean} */ amended) => sealed(open, rec, found, amended)} />`
                : artifacts.length
                    ? html`<${Cabinet} groups=${groups} look=${LOOK} selectedId=${null} onSelect=${pick} label="Artifacts" />`
                    : html`<div className="nc-empty">Nothing here yet<small>Adventures you complete arrive as artifacts</small></div>`}
            ${ceremony && html`<${Ceremony} ...${ceremony} onDone=${() => { setCeremony(null); setOpenId(null); }} />`}
        </div>
    `;
}
