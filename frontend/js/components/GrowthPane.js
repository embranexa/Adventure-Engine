import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ATTRIBUTES } from '../lifecycle.js';
import { growth } from '../lib/growth.js';

/**
 * What an artifact taught: skills practiced (its done quests) and proven (plays that came
 * off), and the attributes they feed.
 * @param {{ adventure: AdventureRecord, moves: { skills: string[], grade: string }[], sealed: boolean }} props
 */
export function GrowthPane({ adventure, moves, sealed }) {
    const adventures = useWorkspaceStore((s) => s.adventures);
    const entities = useWorkspaceStore((s) => s.entities);
    const selectEntity = useWorkspaceStore((s) => s.selectEntity);
    const showPanel = useWorkspaceStore((s) => s.showPanel);
    const g = growth(adventure, moves, adventures, entities);
    const row = (/** @type {string} */ label, /** @type {import('../lib/growth.js').Grown[]} */ list, /** @type {string} */ what) => list.length > 0 && html`
        <div className="gr-row"><small title=${what}>${label}</small>${list.map(({ skill, count }) => html`
            <button key=${skill.id} className="gr-skill" title="Open in the Codex" onClick=${() => { selectEntity(skill.id); showPanel('codex'); }}>✧ ${skill.name}${count > 1 && html` <b>×${count}</b>`}</button>`)}</div>`;
    const any = g.practiced.length + g.proven.length > 0;
    return html`
        <section className="nec-pane">
            <h4>Growth</h4>
            ${row('Practiced', g.practiced, 'By quests you did')}
            ${row('Proven', g.proven, 'By plays that came off')}
            ${g.attributes.length > 0 && html`<div className="gr-row"><small title="What those skills feed">Attributes</small>${g.attributes.map(({ id, count }) => html`
                <span key=${id} className="gr-skill" title=${ATTRIBUTES[id].hint}>❖ ${ATTRIBUTES[id].label}${count > 1 && html` <b>×${count}</b>`}</span>`)}</div>`}
            ${!any && html`<p className="nec-dim">Link skills to its quests (the Anvil) or its plays</p>`}
            ${any && !sealed && html`<p className="nec-dim">It counts once sealed.</p>`}
        </section>
    `;
}
