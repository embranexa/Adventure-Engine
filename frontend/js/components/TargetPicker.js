import { html } from '../html.js';
import { ATTRIBUTES } from '../lifecycle.js';
import { SKILL_NAMES } from '../lib/targets.js';
import { EntityPicker } from './EntityPicker.js';

const SKILL = /** @type {EntityType[]} */ (['skill']);
const FIXED = Object.entries(ATTRIBUTES).map(([id, a]) => ({ id, label: a.label, hint: a.hint }));

/** What a buff or effect amplifies: an attribute, or a skill (made on the spot if need be).
 *  @param {{ ids?: string[], placeholder: string, onPick: (id: string) => void }} props */
export function TargetPicker({ ids = [], placeholder, onPick }) {
    return html`<${EntityPicker} ids=${ids} chips=${false} types=${SKILL} suggest=${SKILL_NAMES} fixed=${FIXED} fixedTitle="Attributes" placeholder=${placeholder} onAdd=${onPick} />`;
}
