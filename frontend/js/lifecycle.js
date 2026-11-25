// The refinery: display names and colors for raw event review states and adventure
// phases. The database stores the plain values (keys below); see resources/classifier.md.
//
// Matter colors run cold -> warm along the lifecycle (slate, blue, cyan, amber, orange,
// red in the Arena, violet once it's an artifact); side paths are desaturated.

/**
 * @typedef {{ module: string, matter: string, color: string, deep: string, light: string, hint: string }} Stage
 */

/**
 * What a raw event is, by what it lacks (backend/services/grade.py): the matter of both the
 * Harvesters and the Centrifuge. @type {Record<Grade, Stage>}
 */
export const GRADE_STAGES = {
    specimen: { module: 'Centrifuge', matter: 'specimen', color: '#3a4a5e', deep: '#171e27', light: '#9fb0c4', hint: 'Incomplete' },
    ore:      { module: 'Centrifuge', matter: 'ore',      color: '#4b5a86', deep: '#1f2640', light: '#b6c1e2', hint: 'Complete enough to judge' },
};

/**
 * Raw event review states. Harvested events wait in their source's Harvester; fed ones
 * spin in the Centrifuge, which is what Discovery mode shows. @type {Record<ReviewState, Stage>}
 */
export const REVIEW_STAGES = {
    harvested: { module: 'Harvester',  matter: 'specimen & ore', color: '#3a4a5e', deep: '#171e27', light: '#9fb0c4', hint: 'Harvested; feed it to the Centrifuge to review' },
    new:       { module: 'Centrifuge', matter: 'specimen & ore', color: '#4b5a86', deep: '#1f2640', light: '#b6c1e2', hint: 'In the Centrifuge: not reviewed yet' },
    passed:    { module: 'Hopper',     matter: 'concentrate',    color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Became an adventure' },
    ignored:   { module: 'Sump',       matter: 'tailings',       color: '#5d6070', deep: '#25262d', light: '#8a8d9a', hint: 'Rejected; can be revived' },
};

/** Entity types that are never linked to anything. @type {EntityType[]} */
export const UNLINKABLE = ['spell'];

/** Adventure phases, in lifecycle order. @type {Record<Phase, Stage>} */
export const PHASE_STAGES = {
    queued:         { module: 'Hopper',     matter: 'concentrate', color: '#3d7bf0', deep: '#1b3a7a', light: '#a8c6ff', hint: 'Waiting for the Athanor' },
    classifying:    { module: 'Athanor',    matter: 'essence',    color: '#1fc2c9', deep: '#0c5c60', light: '#a9f3f6', hint: 'Why do I want this?' },
    decomposing:    { module: 'Anvil',    matter: 'armature', color: '#e9c43b', deep: '#6e5a12', light: '#f8e7a6', hint: 'How do I do this?' },
    constructing:   { module: 'Crucible',   matter: 'alloy',      color: '#f28a2e', deep: '#7a3a0c', light: '#ffd3a3', hint: 'What can I do right now?' },
    consuming:      { module: 'Arena',      matter: 'animus',     color: '#ef3e4a', deep: '#7a1a20', light: '#ffb0b6', hint: 'Doing it' },
    completed:      { module: 'Treasury',   matter: 'artifact',   color: '#a855f7', deep: '#4c1d80', light: '#dcb8ff', hint: 'Done' },
    killed:         { module: 'Necropolis', matter: 'vestige',    color: '#6e4a4a', deep: '#2e1e1e', light: '#9a7a7a', hint: 'Killed or missed; can be revived' },
    decommissioned: { module: 'Archive',    matter: 'relic',      color: '#7a6a55', deep: '#2f281f', light: '#a89a85', hint: 'Old and out of sight' },
};

/**
 * Adventure types. Items have no when/where; a performance or battle may, and without one is exempt from the
 * calendar, map, date/proximity filters and the missed-adventure sweeper (the server
 * sends their when/where as null). Same list in backend/db/models.py.
 * @type {Record<AdventureType, { label: string, glyph: string, hint: string }>}
 */
export const ADVENTURE_TYPES = {
    event: { label: 'Event', glyph: '◷', hint: 'Happens at a time and place' },
    item: { label: 'Item', glyph: '◆', hint: 'A thing to make or get: no when/where' },
    performance: { label: 'Performance', glyph: '♪', hint: 'A piece to learn and perform; a when and where if it’s a gig' },
    battle: { label: 'Battle', glyph: '⚔', hint: 'A contest against adversaries; a when and where if it has one' },
};

/** Flags an adventure can carry, any number, set by hand (backend.db.models.ADVENTURE_FLAGS). @type {Record<AdventureFlag, { label: string, glyph: string, color: string }>} */
export const ADVENTURE_FLAGS = {
    important: { label: 'Important', glyph: '★', color: '#f2b134' },
    urgent: { label: 'Urgent', glyph: '⚡', color: '#f0643c' },
    favorite: { label: 'Favorite', glyph: '♥', color: '#ff7aa8' },
    maybe: { label: 'Maybe', glyph: '?', color: '#8f8cff' },
    waiting: { label: 'Waiting', glyph: '⧗', color: '#2fd2c9' },
};

/** Why an adventure died, in the order offered (backend.db.models.EPITAPH_CAUSES). @type {Record<EpitaphCause, string>} */
export const EPITAPH_CAUSES = {
    lost_interest: 'Lost interest',
    no_time: 'No time',
    too_costly: 'Too costly',
    blocked: 'Blocked',
    superseded: 'Superseded',
    outside_control: 'Outside my control',
    missed: 'Missed',
};

/**
 * Virtual entity types (the Codex). Only sites have a location. Same list in
 * backend/db/models.py.
 * @type {Record<EntityType, { label: string, plural: string, glyph: string, hint: string }>}
 */
export const ENTITY_TYPES = {
    deity: { label: 'Deity', plural: 'Deities', glyph: '⟁', hint: 'A demand signal that adventures fulfil' },
    site: { label: 'Site', plural: 'Sites', glyph: '⌖', hint: 'A place: shows on the Atlas, anchors the proximity ring' },
    player: { label: 'Player', plural: 'Players', glyph: '☉', hint: 'A person who can join an adventure’s party' },
    organization: { label: 'Organization', plural: 'Organizations', glyph: '⎔', hint: 'An organization or a network' },
    skill: { label: 'Skill', plural: 'Skills', glyph: '✧', hint: 'A craft you learn, like soldering or coding' },
    spell: { label: 'Spell', plural: 'Spells', glyph: '✴', hint: 'A kind of play; its skills come from the Treasury' },
};

/**
 * What a person is, fixed (backend.db.models.ATTRIBUTES). Skills are what they can do: an
 * attribute is passive, a skill is used on purpose, and the first feeds the second.
 * @type {Record<Attribute, { label: string, hint: string }>}
 */
export const ATTRIBUTES = {
    strength:   { label: 'Strength',   hint: 'Force: lifting, pushing, striking' },
    endurance:  { label: 'Endurance',  hint: 'Stamina and toughness: lasting' },
    dexterity:  { label: 'Dexterity',  hint: 'Agility, speed and precision' },
    perception: { label: 'Perception', hint: 'Noticing: senses and intuition' },
    intellect:  { label: 'Intellect',  hint: 'Reason, knowledge and wisdom' },
    charisma:   { label: 'Charisma',   hint: 'Charm and presence' },
    empathy:    { label: 'Empathy',    hint: 'Feeling what others feel' },
    resolve:    { label: 'Resolve',    hint: 'Courage, discipline and will' },
};

/**
 * The four orders: the groups of archetypes.
 * @type {Record<Order, { label: string, is: string, color: string }>}
 */
export const ORDERS = {
    kratos: { label: 'Kratos', is: 'power', color: '#ff9a7a' },
    logos:  { label: 'Logos',  is: 'reason', color: '#a9c8ee' },
    pathos: { label: 'Pathos', is: 'feeling', color: '#f2a0cc' },
    ethos:  { label: 'Ethos',  is: 'character', color: '#f0d490' },
};

/**
 * What a player can be: one archetype, or none. `verb`: what they do ("leads"); `organ`: their
 * part of the one body a party makes; `medium`: what they work on, outside themselves. The
 * paragon is only a label, not a Codex deity. Same ids in backend/db/models.py.
 * @type {Record<Archetype, { label: string, order: Order, paragon: string, glyph: string, verb: string, organ: string, operator: string, medium: string, attributes: [Attribute, Attribute] }>}
 */
export const ARCHETYPES = {
    paladin: { label: 'Paladin', order: 'kratos', paragon: 'Mars', glyph: '♂', verb: 'protects', organ: 'Muscle', operator: 'Athlete, fighter, security', medium: 'Impact', attributes: ['strength', 'resolve'] },
    artificer: { label: 'Artificer', order: 'kratos', paragon: 'Vulcan', glyph: '⚒', verb: 'builds', organ: 'Hands', operator: 'Engineer, designer, maker, repair tech', medium: 'Matter', attributes: ['intellect', 'dexterity'] },
    mariner: { label: 'Mariner', order: 'kratos', paragon: 'Neptune', glyph: '♆', verb: 'transports', organ: 'Blood', operator: 'Driver, set builder, stagehand', medium: 'Space', attributes: ['strength', 'endurance'] },
    wizard: { label: 'Wizard', order: 'logos', paragon: 'Minerva', glyph: '⚴', verb: 'weaves', organ: 'Brain', operator: 'Strategist, tactician, researcher, planner', medium: 'Information', attributes: ['intellect', 'resolve'] },
    ranger: { label: 'Ranger', order: 'logos', paragon: 'Diana', glyph: '☽', verb: 'discovers', organ: 'Eyes', operator: 'Scout, detective, spy, investigator, hacker', medium: 'Secrets', attributes: ['dexterity', 'perception'] },
    merchant: { label: 'Merchant', order: 'logos', paragon: 'Mercury', glyph: '☿', verb: 'exchanges', organ: 'Glands', operator: 'Broker, producer, sourcer, logistician', medium: 'Value', attributes: ['charisma', 'intellect'] },
    enchanter: { label: 'Enchanter', order: 'pathos', paragon: 'Venus', glyph: '♀', verb: 'attracts', organ: 'Loins', operator: 'Marketer, salesperson, promoter', medium: 'Desire', attributes: ['charisma', 'empathy'] },
    druid: { label: 'Druid', order: 'pathos', paragon: 'Vesta', glyph: '⚶', verb: 'restores', organ: 'Heart', operator: 'Host, caretaker, medic, site keeper', medium: 'Morale', attributes: ['empathy', 'endurance'] },
    bard: { label: 'Bard', order: 'pathos', paragon: 'Apollo', glyph: '☀', verb: 'captivates', organ: 'Voice', operator: 'Performer, artist, musician, comedian, dancer, videographer', medium: 'Attention', attributes: ['charisma', 'dexterity'] },
    vanguard: { label: 'Vanguard', order: 'ethos', paragon: 'Jupiter', glyph: '♃', verb: 'leads', organ: 'Spine', operator: 'Leader, captain, manager, director, organizer', medium: 'Momentum', attributes: ['resolve', 'charisma'] },
    templar: { label: 'Templar', order: 'ethos', paragon: 'Pluto', glyph: '♇', verb: 'binds', organ: 'Ligament', operator: 'Lawyer, judge, accountant, permit runner, grant writer', medium: 'Obligation', attributes: ['perception', 'resolve'] },
    cleric: { label: 'Cleric', order: 'ethos', paragon: 'Juno', glyph: '⚵', verb: 'reconciles', organ: 'Fascia', operator: 'Diplomat, mediator, community builder, facilitator', medium: 'Rapport', attributes: ['empathy', 'perception'] },
};

/**
 * A player's status in a party, in order. `next`: the natural steps from it, offered first
 * (any change is allowed). Aftermath needs a completed adventure. Same ids in backend/db/models.py.
 * @type {Record<PartyStatus, { label: string, stage: 'recruitment' | 'active' | 'aftermath', color: string, next: PartyStatus[], hint: string }>}
 */
export const PARTY_STATUSES = {
    resonant:    { label: 'Resonant',    stage: 'recruitment', color: '#fef08a', next: ['charging'], hint: 'Resonates with the adventure; considering recruitment' },
    charging:    { label: 'Charging',    stage: 'recruitment', color: '#f97316', next: ['attuning', 'bonded', 'resisted'], hint: 'Proposal sent; awaiting a response' },
    attuning:    { label: 'Attuning',    stage: 'recruitment', color: '#10b981', next: ['bonded', 'resisted'], hint: 'Interested; negotiating' },
    resisted:    { label: 'Resisted',    stage: 'recruitment', color: '#f43f5e', next: ['resonant', 'charging'], hint: 'Proposal rejected' },
    bonded:      { label: 'Bonded',      stage: 'active',      color: '#2563eb', next: ['annealed', 'neutralized', 'repelled'], hint: 'Proposal accepted: in the party' },
    emergent:    { label: 'Emergent',    stage: 'active',      color: '#c084fc', next: ['annealed', 'neutralized', 'repelled'], hint: 'Discovered during the adventure' },
    annealed:    { label: 'Annealed',    stage: 'aftermath',   color: '#8b5cf6', next: ['neutralized', 'repelled'], hint: 'Completed together; the relationship is stronger (warmth +1)' },
    neutralized: { label: 'Neutralized', stage: 'aftermath',   color: '#94a3b8', next: ['annealed', 'repelled'], hint: 'Completed together; the relationship is unchanged' },
    repelled:    { label: 'Repelled',    stage: 'aftermath',   color: '#ef4444', next: ['annealed', 'neutralized'], hint: 'Completed together; the relationship is weaker (warmth −1)' },
};

/** Who holds an adventure. Wardens belong to its site. The archon leads it, and is the only one always in
 *  its party; without one, you lead.
 *  @type {Record<StewardRole, { label: string, color: string, hint: string }>} */
export const STEWARD_ROLES = {
    archon:       { label: 'Archon',       color: '#fff1c9', hint: 'Leads the adventure, bonded to its party' },
    herald:       { label: 'Herald',       color: '#facc15', hint: 'Brought or referred the adventure' },
    commissioner: { label: 'Commissioner', color: '#fb923c', hint: 'Issued the adventure' },
    warden:       { label: 'Warden',       color: '#38bdf8', hint: 'Keeps the site (on every adventure there)' },
};

/**
 * True if this item happens somewhere or sometime: a raw event, an event, or a performance or
 * battle that was given a time or place.
 * @param {PoolItem} item
 */
export function hasWhenWhere(item) {
    if (item.kind !== 'adventure' || item.type === 'event') return true;
    return item.type !== 'item' && Boolean(item.start || item.venue || item.address || item.city || item.lat != null);
}

/** Matter name -> color, for titles that name a matter (e.g. "concentrate ⟶ essence"). */
export const MATTER_COLORS = Object.fromEntries(
    [...Object.values(GRADE_STAGES), ...Object.values(REVIEW_STAGES), ...Object.values(PHASE_STAGES)].map((s) => [s.matter, s.light]),
);

/**
 * Signal chain node of each phase (the twin; same map as PHASE_NODES in
 * backend/db/models.py). Other nodes: "harvester:<source>", centrifuge, sump, assayer, lode, codex.
 * @type {Record<Phase, string>}
 */
export const PHASE_NODES = {
    queued: 'hopper', classifying: 'athanor', decomposing: 'anvil', constructing: 'crucible',
    consuming: 'arena', completed: 'treasury', killed: 'necropolis', decommissioned: 'archive',
};

/** Phases of an adventure still to be completed. @type {Phase[]} */
export const SEEKING_PHASES = ['queued', 'classifying', 'decomposing', 'constructing', 'consuming'];

/** The main route, set by hand from the node card. @type {Phase[]} */
export const MAIN_ROUTE = ['queued', 'classifying', 'decomposing', 'constructing', 'consuming', 'completed'];

/** A raw event's matter: its grade until it's reviewed. @param {EventRecord} e @returns {Grade | ReviewState} */
export const rawMatter = (e) => (e.review === 'harvested' || e.review === 'new' ? (e.missing?.length ? 'specimen' : 'ore') : e.review);

/**
 * Stage of a pool record: its phase if it's an adventure, else its review state.
 * @param {PoolRecord} item
 * @returns {Stage | null}
 */
export function stageOf(item) {
    if (item.kind === 'adventure') return item.phase ? PHASE_STAGES[item.phase] : null;
    const key = rawMatter(item);
    if (key === 'specimen') return { ...GRADE_STAGES.specimen, hint: `Lacks ${item.missing.join(', ')}` };
    return key === 'ore' ? GRADE_STAGES.ore : key ? REVIEW_STAGES[key] : null;
}

/** The display color of a pool record: its stage's color. @param {PoolRecord} item */
export function stageColor(item) {
    return stageOf(item)?.color ?? '#7d838d';
}
