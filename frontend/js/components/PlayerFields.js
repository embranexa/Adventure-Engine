import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { ARCHETYPES, ATTRIBUTES, ORDERS } from '../lifecycle.js';
import { EntityPicker } from './EntityPicker.js';
import { Field } from './panels/AdventureEditor.js';

const GROUPS = /** @type {Order[]} */ (Object.keys(ORDERS));

/** Warmth, 0 to 5: click a pip to set it, the last lit one to lower it. Never set reads as none.
 *  @param {{ value: number | undefined, onChange?: (v: number) => void }} props */
export function Warmth({ value, onChange }) {
    const v = value ?? 0;
    return html`
        <span className="pl-warmth" title=${value == null ? 'Warmth not set' : `Warmth ${value} of 5`}>
            ${[1, 2, 3, 4, 5].map((n) => (!onChange ? html`<i key=${n} className=${n <= v ? 'on' : ''}></i>` : html`<button key=${n} type="button" className=${n <= v ? 'on' : ''}
                aria-label=${`Warmth ${n}`} onClick=${() => onChange(n === v ? n - 1 : n)}></button>`))}
        </span>
    `;
}

/** An archetype in words, as a badge. @param {{ id: Archetype | undefined }} props */
export function ArchetypeBadge({ id }) {
    if (!id) return html`<span className="pl-arch none">No archetype</span>`;
    const a = ARCHETYPES[id];
    return html`<span className="pl-arch" style=${{ '--g': ORDERS[a.order].color }} title=${`${ORDERS[a.order].label} · ${a.idol} · ${a.operator}`}>${a.glyph} ${a.label} <small>${a.verb}</small></span>`;
}

/**
 * A player's archetype, warmth, tags and affinities (the Codex).
 * @param {{ player: Entity, save: (changes: EntityChanges) => Promise<string | null>, onError: (e: string | null) => void }} props
 */
export function PlayerFields({ player, save, onError }) {
    const setAffinity = useWorkspaceStore((s) => s.setAffinity);
    const d = player.details, arch = d.archetype ? ARCHETYPES[d.archetype] : null;
    return html`
        <div className="ae-pair">
            <label className="ae-field">
                <span className="ae-label">Archetype</span>
                <select className="pl-select" value=${d.archetype ?? ''} onChange=${(/** @type {any} */ e) => save({ details: { archetype: e.target.value || null } })}>
                    <option value="">None</option>
                    ${GROUPS.map((g) => html`
                        <optgroup key=${g} label=${`${ORDERS[g].label} (${ORDERS[g].is})`}>
                            ${Object.entries(ARCHETYPES).filter(([, a]) => a.order === g).map(([id, a]) => html`<option key=${id} value=${id}>${a.glyph} ${a.label}: ${a.verb}</option>`)}
                        </optgroup>`)}
                </select>
            </label>
            <div className="ae-field">
                <span className="ae-label">Warmth</span>
                <${Warmth} value=${d.warmth} onChange=${(/** @type {number} */ warmth) => save({ details: { warmth } })} />
            </div>
        </div>
        ${arch && html`<span className="ae-hint">${arch.glyph} ${arch.idol} · works ${arch.medium.toLowerCase()} · ${arch.attributes.map((x) => ATTRIBUTES[x].label).join(', ')}</span>`}
        <${Field} label="Tags" placeholder="comma, separated" value=${(d.tags ?? []).join(', ')}
            onCommit=${(/** @type {string} */ v) => save({ details: { tags: v.split(',').map((t) => t.trim()).filter(Boolean) } })} />
        <div className="ol">
            <div className="ol-head">Resonates with</div>
            <${EntityPicker} ids=${player.affinities} types=${['deity', 'site', 'organization', 'skill']} placeholder="+ A deity, site, organization or skill…"
                onAdd=${async (/** @type {string} */ id) => onError(await setAffinity(player.id, id, true))}
                onRemove=${async (/** @type {string} */ id) => onError(await setAffinity(player.id, id, false))} />
        </div>
    `;
}
