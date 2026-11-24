// Titles made of a verb and a subject (pure): quests ("Acquire battery pack") and buffs
// ("Consume coffee"). A title is stored whole; a first word that's a known verb of its kind is
// its verb, so titles typed in the Scripter work too. Verbs are these and your own (app state).

/** @typedef {'quest' | 'buff'} VerbKind */

/** @type {Record<VerbKind, string[]>} */
export const VERBS = {
    quest: ['Acquire', 'Deploy', 'Design', 'Prototype', 'Publish', 'Research', 'Resolve', 'Upgrade'],
    buff: ['Apply', 'Consume', 'Equip', 'Review'],
};
/** A new quest's, until you pick one. */
export const FIRST_VERB = 'Research';

/** Every verb of a kind, yours included, alphabetically. @param {VerbKind} kind @param {string[]} own */
export const allVerbs = (kind, own) => [...VERBS[kind], ...own].sort((a, b) => a.localeCompare(b));

/** kind -> lower case -> the verb as written @type {Record<VerbKind, Map<string, string>>} */
const known = { quest: new Map(), buff: new Map() };
/** Kept current by the store. @param {VerbKind} kind @param {string[]} own */
export function setOwnVerbs(kind, own) {
    known[kind] = new Map([...VERBS[kind], ...own].map((v) => [v.toLowerCase(), v]));
}
setOwnVerbs('quest', []);
setOwnVerbs('buff', []);

/** A typed verb, tidied: one word, capitalised. Null if it can't be one. @param {string} text */
export function cleanVerb(text) {
    const word = text.trim().replace(/[[\]]/g, '').replace(/^[+-]+/, '').slice(0, 30);
    return word && !/\s/.test(word) ? word[0].toUpperCase() + word.slice(1) : null;
}

/** The known verb it names, if any. @param {string} word @param {VerbKind} [kind] @returns {string | null} */
export const knownVerb = (word, kind = 'quest') => known[kind].get(word.toLowerCase()) ?? null;

/** @param {string} title @param {VerbKind} [kind] @returns {{ verb: string | null, subject: string }} */
export function splitTitle(title, kind = 'quest') {
    const [first, ...rest] = title.trim().split(/\s+/);
    const verb = knownVerb(first ?? '', kind);
    return verb ? { verb, subject: rest.join(' ') } : { verb: null, subject: title.trim() };
}

/** @param {string | null} verb @param {string} subject */
export const joinTitle = (verb, subject) => [verb, subject.trim()].filter(Boolean).join(' ');
