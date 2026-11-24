import { html } from '../html.js';
import { MATTER_COLORS } from '../lifecycle.js';

/** SVG paths for panel icons (16×16, stroked). */
const ICON_PATHS = {
    eye: html`<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"></path><circle cx="8" cy="8" r="2.2"></circle>`,
    flask: html`<path d="M6 1.5h4M6.8 1.5v4.2L2.6 12.6A1.3 1.3 0 0 0 3.7 14.5h8.6a1.3 1.3 0 0 0 1.1-1.9L9.2 5.7V1.5"></path><path d="M4.4 10h7.2"></path>`,
    compass: html`<circle cx="8" cy="8" r="6.3"></circle><path d="M8 3.6l1.6 4.4L8 12.4 6.4 8z"></path>`,
    clock: html`<circle cx="8" cy="8" r="6.3"></circle><path d="M8 4.3V8l2.6 1.6"></path>`,
    ledger: html`<path d="M3 2.5h10v11H3z"></path><path d="M5.4 5.5h5.2M5.4 8h5.2M5.4 10.5h3.4"></path>`,
    alembic: html`<circle cx="5.8" cy="10" r="4.2"></circle><path d="M8.4 6.7L14.6 3.6v3.2"></path><path d="M2 10.6h7.6"></path>`,
    quill: html`<path d="M13.8 2.2C9.6 2.6 5.8 5.8 4.6 11.4l-.9 2.4"></path><path d="M13.8 2.2c-.4 4.4-3.6 7.4-8.4 8.6"></path><path d="M7.4 8.6l2.4.2"></path>`,
    codex: html`<path d="M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2z"></path><path d="M3 11.5a2 2 0 0 1 2-2h7.5"></path><path d="M7.8 4.6l1 1.9-1 1.9-1-1.9z"></path>`,
    gear: html`<circle cx="8" cy="8" r="2.3"></circle><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"></path><circle cx="8" cy="8" r="4.4"></circle>`,
    amphora: html`<path d="M6 1.500h4M6.500 1.500v3C4.500 5.600 4 7.200 4 8.800c0 2.600 2 5.200 4 5.200s4-2.600 4-5.200c0-1.600-.5-3.200-2.500-4.300v-3"></path><path d="M4.300 9h7.400M6.400 3.200C3.800 3 3.200 5 4.400 6.600M9.600 3.200c2.600-.2 3.200 1.800 2 3.400"></path>`,
    satchel: html`<path d="M2.500 6h11v7.500h-11z"></path><path d="M5.500 6V4a2.500 2.500 0 0 1 5 0v2M2.500 9h11M8 8.200v1.800"></path>`,
    swords: html`<path d="M2.500 2.500l8 8M13.500 2.500l-8 8M3 13.500l2.500-2.500M13 13.500L10.500 11M3.500 9.500l3 3M12.500 9.500l-3 3"></path>`,
    cohort: html`<circle cx="8" cy="4.500" r="2"></circle><path d="M4.800 13.500c0-3 1.200-5 3.200-5s3.200 2 3.200 5z"></path><circle cx="3" cy="6.500" r="1.300"></circle><circle cx="13" cy="6.500" r="1.300"></circle><path d="M1.500 12.500c0-1.800.5-3 1.500-3M14.500 12.500c0-1.800-.5-3-1.500-3"></path>`,
    molecule: html`<circle cx="8" cy="8" r="2.200"></circle><circle cx="2.800" cy="4" r="1.500"></circle><circle cx="13.200" cy="4" r="1.500"></circle><circle cx="8" cy="14" r="1.500"></circle><path d="M4 4.900l2.200 1.800M12 4.900L9.800 6.700M8 10.200v2.300"></path>`,
    crown: html`<path d="M2 5.500l3 2.500 3-5 3 5 3-2.500-1.500 7.500h-9z"></path>`,
    tomb: html`<path d="M4 13.5V6.4C4 4 5.8 2 8 2s4 2 4 4.400v7.100z"></path><path d="M2.300 13.500h11.400M8 5.200v4.600M6.300 7h3.400"></path>`,
    scroll: html`<path d="M4.5 2.5h8a1.6 1.6 0 0 1 0 3.2H11v7.6a1.6 1.6 0 0 1-1.6 1.6H3.2a1.6 1.6 0 0 1 0-3.2h1.3z"></path><path d="M6.6 7.2h2.8M6.6 9.8h2.8"></path>`,
};

/** @param {{ name: PanelIcon | string, size?: number }} props */
export function Icon({ name, size = 16 }) {
    return html`
        <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 16 16" fill="none" stroke="#dfe2e7" stroke-width="1.3">
            ${ICON_PATHS[/** @type {keyof typeof ICON_PATHS} */ (name)] ?? ICON_PATHS.eye}
        </svg>
    `;
}

/** The brand sigil: circle, triangle and a breathing core. */
export function Sigil() {
    return html`
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#c9cdd4" stroke-width="1.3">
            <circle cx="13" cy="13" r="11.5"></circle>
            <polygon points="13,3.5 21.2,18 4.8,18"></polygon>
            <circle cx="13" cy="13.5" r="3" fill="#1fc2c9" stroke="none" className="breathe"></circle>
        </svg>
    `;
}

/** One ornate corner bracket: steel plate, gear, brass triangle and rivets, circuit traces. */
function Corner({ pos }) {
    return html`
        <svg aria-hidden="true" className=${`corner ${pos}`} viewBox="0 0 46 46">
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#1a1c20" stroke-width="7" stroke-linejoin="bevel"></path>
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#5c626c" stroke-width="3" stroke-linejoin="bevel"></path>
            <path d="M3 44 V12 L12 3 H44" fill="none" stroke="#aab0b9" stroke-width="0.8" stroke-linejoin="bevel" opacity="0.7"></path>
            <circle className="gear" cx="15" cy="15" r="8.5" fill="#111317" stroke="#4a4f58" stroke-width="3" stroke-dasharray="2.2 1.8"></circle>
            <circle cx="15" cy="15" r="5" fill="#16181c" stroke="#7a808a" stroke-width="0.8"></circle>
            <polygon points="15,11.6 18.2,17 11.8,17" fill="none" stroke="#c8a46a" stroke-width="0.9"></polygon>
            <path className="trace" d="M25 15 H33 L36 12 H43" fill="none" stroke-width="1"></path>
            <path className="trace" d="M15 25 V33 L12 36 V43" fill="none" stroke-width="1"></path>
            <circle className="node" cx="43" cy="12" r="1.6"></circle>
            <circle className="node" cx="12" cy="43" r="1.6"></circle>
            <circle cx="7" cy="40" r="1.4" fill="#c8a46a"></circle>
            <circle cx="40" cy="7" r="1.4" fill="#c8a46a"></circle>
        </svg>
    `;
}

/** All four corners of a module housing. */
export function Corners() {
    return html`
        <${Corner} pos="tl" /><${Corner} pos="tr" /><${Corner} pos="bl" /><${Corner} pos="br" />
    `;
}

/** What each panel is for: shown when hovering its rune icon. */
const PANEL_HELP = {
    node: 'The selected adventure or event as a trading card. Triage it, move it along the chain, edit it, link it to Codex entities. Here ore becomes essence: why do I want this?',
    classifier: 'The whole pool as a constellation. Stars are facets (source, city, type, matter…); galaxies group the items that share them. Click a star: include → exclude → off. The sphere holds what passes; Pass through sends it to the Calendar and Atlas.',
    map: 'Where things happen: events as towers on the map, sites from the Codex, and the proximity ring that filters by distance.',
    calendar: 'When things happen, by week or month. Weekly events show on every day they repeat; all-day ones as banners. Drag across the day headers to filter by date.',
    alembic: 'How to do it: the adventure’s roadmap, a graph of quests, each a verb and a subject. Completing the first quest turns distillate into alloy.',
    scripter: 'The roadmap as text: one statement per line, e.g. A1[Acquire tickets] --> A2[Prototype rig].',
    codex: 'The entities adventures link to: deities (demand signals), sites (places), players (people), organizations, skills, and spells (kinds of play).',
    complex: 'Who: how players connect to the selected adventure. Its site and party stand beside it; the ministry holds it, and players gather around the party, each bond coloured by status. Resonance ranks every player by the Codex entities they share with it.',
    arena: 'Every adventure under way and who is in it. Tick objectives, ready preparations and see the skills they boost. Change a player’s status, add someone you just met as emergent, and complete it into an artifact.',
    cohort: 'Every player in a cabinet, by archetype. A sigil’s points are its archetype and its rings its warmth; it lights once you have collaborated. Idols shows the archetypes: a statue and a card each, with their skills. Open a player to edit the profile and see what you have done together.',
    quests: 'What can I do right now: the next quests of every alloy adventure, ready to tick off. Target a quest to keep it at the top; its adventure becomes alloy.',
    agora: 'What your effort earns: the ambrosia you hold, the ledger of every amount, and what locked bounties still owe. Set a bounty in the Alembic.',
    inventory: 'Every item, by the deity it serves: what it is for, what it boosts, and its model. Describe an item to the Forge and Claude models it; its parts turn solid as its quests are done.',
    treasury: 'Finished adventures as artifacts. Open one to analyse it like a chess game, then seal it: what you discovered goes to the Codex.',
    necropolis: 'Adventures that died, and why. Carve an epitaph to light a vestige’s candles; causes add up to patterns. Abandon deletes one for good.',
    signal_chain: 'The whole pipeline as a 3D twin: every machine, every move between them, lit by the lens.',
};

/**
 * Two-line panel title: [icon] NAME / QUESTION · INPUT ⟶ OUTPUT.
 * Hovering the icon shows what the panel is for (PANEL_HELP).
 * Input/output words that name a matter take its color.
 * @param {{ meta: PanelMeta, input?: string }} props  `input` overrides the meta (e.g. "prima materia" in Discovery)
 */
export function PanelTitle({ meta, input }) {
    const [inWord, outWord] = [input ?? meta.flow[0], meta.flow[1]];
    const color = (/** @type {string} */ w) => MATTER_COLORS[w] ?? '#b4b9c1';
    return html`
        <div className="vial" tabIndex="0" aria-describedby=${`help-${meta.id}`}>
            <${Icon} name=${meta.icon} />
            <div className="panel-info" role="tooltip" id=${`help-${meta.id}`}>
                <b>${meta.name}</b>
                <span className="panel-info-flow">${meta.question} · ${inWord} ⟶ ${outWord}</span>
                ${PANEL_HELP[/** @type {keyof typeof PANEL_HELP} */ (meta.id)] ?? ''}
            </div>
        </div>
        <div className="ptitle">
            <span className="ptitle-name">${meta.name}</span>
            <span className="ptitle-flow">
                ${meta.question} · <b style=${{ color: color(inWord) }}>${inWord}</b>
                ${' '}<span className="arrow" style=${{ color: '#e6e8ec' }}>⟶</span>${' '}
                <b style=${{ color: color(outWord) }}>${outWord}</b>
            </span>
        </div>
    `;
}
