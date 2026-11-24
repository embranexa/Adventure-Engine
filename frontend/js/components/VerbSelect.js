import { useMemo, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { allVerbs, cleanVerb, knownVerb, splitTitle } from '../lib/quests.js';

/** Entries of the menu that aren't verbs (a verb can't start with these). */
const NEW = '+new', FORGET = '-forget:';

/**
 * The verb of a quest or buff: the known ones, a box to define a new one, and a way to forget
 * one of yours that nothing uses.
 * @param {{ kind: import('../lib/quests.js').VerbKind, verb: string | null, onPick: (verb: string) => void }} props
 */
export function VerbSelect({ kind, verb, onPick }) {
    const own = useWorkspaceStore((s) => (kind === 'quest' ? s.verbs : s.buffVerbs));
    const setVerbs = useWorkspaceStore((s) => s.setVerbs);
    const adventures = useWorkspaceStore((s) => s.adventures);
    const [naming, setNaming] = useState(/** @type {string | null} */ (null));
    const unused = useMemo(() => {
        const titles = adventures.flatMap((a) => (kind === 'quest' ? a.roadmap?.actions.map((x) => x.title) ?? [] : a.preparations.map((p) => p.text)));
        const used = new Set(titles.map((t) => splitTitle(t, kind).verb));
        return own.filter((v) => !used.has(v) && v !== verb);
    }, [adventures, own, kind, verb]);

    /** @param {string} value */
    const pick = (value) => {
        if (value === NEW) setNaming('');
        else if (value.startsWith(FORGET)) setVerbs(kind, own.filter((v) => v !== value.slice(FORGET.length)));
        else onPick(value);
    };
    const name = () => {
        if (naming == null) return;
        const word = cleanVerb(naming), same = word && knownVerb(word, kind);
        setNaming(null);
        if (!word) return;
        if (!same) setVerbs(kind, [...own, word]);
        onPick(same || word);
    };

    if (naming != null) {
        return html`
            <input className="alm-verb" value=${naming} maxLength=${30} placeholder="New verb" aria-label="New verb" autoFocus=${true}
                onInput=${(/** @type {any} */ e) => setNaming(e.target.value)} onBlur=${name}
                onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
                    if (e.key === 'Enter') { e.preventDefault(); name(); }
                    if (e.key === 'Escape') setNaming(null);
                }} />`;
    }
    const label = kind === 'quest' ? 'Quest' : 'Buff';
    return html`
        <select className=${`alm-verb ${verb ? 'on' : 'missing'}`} value=${verb ?? ''} aria-label=${`${label} verb`} title=${verb ? 'What to do' : `Every ${kind} needs a verb`}
            onChange=${(/** @type {any} */ e) => pick(e.target.value)}>
            ${!verb && html`<option value="" disabled hidden>Verb…</option>`}
            ${allVerbs(kind, own).map((v) => html`<option key=${v} value=${v}>${v}</option>`)}
            <option value=${NEW}>+ New verb…</option>
            ${unused.map((v) => html`<option key=${`f-${v}`} value=${FORGET + v}>− Forget “${v}”</option>`)}
        </select>
    `;
}
