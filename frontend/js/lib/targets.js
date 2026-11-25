// What effects amplify (pure): an attribute (fixed) or a skill (a Codex entity, by id).

import { ATTRIBUTES } from '../lifecycle.js';
import { PARAGONS } from './paragons.js';

/** @param {string} id @returns {id is Attribute} */
export const isAttribute = (id) => id in ATTRIBUTES;

/** @param {string} id @param {Entity[]} entities */
export function targetLabel(id, entities) {
    if (isAttribute(id)) return `❖ ${ATTRIBUTES[id].label}`;
    const skill = entities.find((e) => e.id === id);
    return skill ? `✧ ${skill.name}` : '✧ Deleted skill';
}

/** The skills an attribute feeds. @param {Attribute} id @param {Entity[]} entities */
export const fedBy = (id, entities) => entities.filter((e) => e.type === 'skill' && e.details.attributes?.includes(id));

/** Skill names the archetypes suggest, for the pickers. */
export const SKILL_NAMES = [...new Set(Object.values(PARAGONS).flatMap((i) => i.skills))].sort();
