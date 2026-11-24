// Quest titles (pure): a verb and a subject ("Acquire" + "battery pack"). The title is stored
// whole, as roadmap actions always were: a first word that's a known verb is its verb, so
// titles typed in the Scripter work too. Verbs are these and your own (app state "verbs").

export const VERBS = ['Acquire', 'Deploy', 'Design', 'Prototype', 'Publish', 'Research', 'Resolve', 'Upgrade'];
/** A new quest's, until you pick one. */
export const FIRST_VERB = 'Research';

/** Every verb, yours included, alphabetically. @param {string[]} own */
export const allVerbs = (own) => [...VERBS, ...own].sort((a, b) => a.localeCompare(b));

/** lower case -> the verb as written */
const known = new Map();
/** Kept current by the store. @param {string[]} own */
export function setOwnVerbs(own) {
    known.clear();
    for (const v of [...VERBS, ...own]) known.set(v.toLowerCase(), v);
}
setOwnVerbs([]);

/** A typed verb, tidied: one word, capitalised. Null if it can't be one. @param {string} text */
export function cleanVerb(text) {
    const word = text.trim().replace(/[[\]]/g, '').replace(/^[+-]+/, '').slice(0, 30);
    return word && !/\s/.test(word) ? word[0].toUpperCase() + word.slice(1) : null;
}

/** The known verb it names, if any. @param {string} word @returns {string | null} */
export const knownVerb = (word) => known.get(word.toLowerCase()) ?? null;

/** @param {string} title @returns {{ verb: string | null, subject: string }} */
export function splitTitle(title) {
    const [first, ...rest] = title.trim().split(/\s+/);
    const verb = knownVerb(first ?? '');
    return verb ? { verb, subject: rest.join(' ') } : { verb: null, subject: title.trim() };
}

/** @param {string | null} verb @param {string} subject */
export const joinTitle = (verb, subject) => [verb, subject.trim()].filter(Boolean).join(' ');
