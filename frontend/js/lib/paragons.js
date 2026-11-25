// Variants: kindred classes. Characters: people of history and fiction who embody it.
// The twelve archetypes' paragons (pure): what the Cohort's paragon gallery says about each, beside
// lifecycle.js ARCHETYPES. Descriptions can be rewritten in the app; `skills` are suggestions,
// made into Codex skills only when picked.

import { ARCHETYPES } from '../lifecycle.js';

/** @type {Record<Archetype, { color: string, numeral: string, emblem: string, variants: string, characters: string, description: string, skills: string[] }>} */
export const PARAGONS = {
    paladin: { color: '#ef4e4e', numeral: 'I', emblem: 'The spear and shield', variants: 'Guardian, bulwark, shieldbearer', characters: 'Captain America, Brienne of Tarth',
        description: 'Stands between the party and harm. The Paladin meets force with force and takes the blow meant for someone else: whoever is behind them is safe.',
        skills: ['Combat', 'Athletics', 'Security', 'First aid'] },
    artificer: { color: '#ff8a4c', numeral: 'II', emblem: 'The hammer and anvil', variants: 'Technomancer, alchemist, animist, smith, metallurgist', characters: 'Leonardo da Vinci, Tony Stark',
        description: 'Makes the thing that makes it possible. The Artificer understands matter and machines, turns a sketch into something that holds weight, and keeps it working.',
        skills: ['Coding', 'Soldering', 'Carpentry', 'Sewing', 'Repair'] },
    mariner: { color: '#4fa8e0', numeral: 'III', emblem: 'The trident and wave', variants: 'Caravaneer, ferryman, voyager, geomancer, terraformer', characters: 'Harriet Tubman, Han Solo',
        description: 'Moves the world to where it’s needed. The Mariner hauls, drives, rigs and raises, like the rivers that carry goods through a body: an empty lot in the morning is a stage by night.',
        skills: ['Driving', 'Rigging', 'Set building', 'Logistics'] },
    wizard: { color: '#8f8cff', numeral: 'IV', emblem: 'The owl', variants: 'Sage, oracle, sorcerer, arcanist', characters: 'Hershel, Gandalf',
        description: 'Holds every thread at once. The Wizard reads, remembers and weaves what the party knows into a plan: the one who sees three moves ahead, and where each thread must cross.',
        skills: ['Strategy', 'Research', 'Navigation', 'Writing'] },
    ranger: { color: '#b7c4e8', numeral: 'V', emblem: 'The bow and crescent', variants: 'Scout, archer, hunter', characters: 'Daryl Dixon, Sherlock Holmes',
        description: 'Finds what is hidden and goes first where no one has been. The Ranger watches, tracks and reports: whatever the party knows that others don’t, it learned from them.',
        skills: ['Scouting', 'Stealth', 'Hacking', 'Investigation'] },
    merchant: { color: '#5fd0b0', numeral: 'VI', emblem: 'The caduceus', variants: 'Quartermaster', characters: 'Oskar Schindler, Marco Polo',
        description: 'Keeps things changing hands. The Merchant knows who has it, who needs it and what it’s worth, and makes the deal both sides are glad of.',
        skills: ['Negotiation', 'Trading', 'Sourcing', 'Appraisal'] },
    enchanter: { color: '#ff7aa8', numeral: 'VII', emblem: 'The scallop', variants: 'Hypnotist, mesmer', characters: 'Cleopatra, Don Juan',
        description: 'Works in desire. The Enchanter sees what people want before they say it, and draws them closer: to an idea, to a place, to each other.',
        skills: ['Persuasion', 'Seduction', 'Marketing', 'Styling'] },
    druid: { color: '#8fce8a', numeral: 'VIII', emblem: 'The hearth', variants: 'Priest, healer', characters: 'Samwise Gamgee, Florence Nightingale',
        description: 'Keeps the fire. The Druid makes a place safe to be in, feeds and tends those who are worn down, and sees that everyone comes home.',
        skills: ['Healing', 'Hospitality', 'Cooking', 'Homemaking'] },
    bard: { color: '#ffb347', numeral: 'IX', emblem: 'The lyre', variants: 'Skald, minstrel, magician, thaumaturge', characters: 'Robin Williams, Orpheus',
        description: 'Gathers attention and spends it well. The Bard turns a room into an audience, a story into a spell, and an ordinary night into one worth recording.',
        skills: ['Music', 'Dance', 'Storytelling', 'Comedy', 'Videography'] },
    vanguard: { color: '#f2c14e', numeral: 'X', emblem: 'The thunderbolt', variants: 'Commander', characters: 'Rick Grimes, Joan of Arc',
        description: 'Stands at the front and makes others willing to follow. The Vanguard decides when no one else will, holds the line when it wavers, and gives the party its momentum.',
        skills: ['Leadership', 'Oratory', 'Politics', 'Organizing'] },
    templar: { color: '#a98bd6', numeral: 'XI', emblem: 'The scales and bident', variants: 'Oathkeeper, magistrate, pactmaker', characters: 'Atticus Finch, King Solomon',
        description: 'Makes it hold. The Templar draws the pact, reads the fine print and keeps the accounts, so what the party agrees to, and is owed, survives the morning after.',
        skills: ['Law', 'Accounting', 'Permitting', 'Grant writing'] },
    cleric: { color: '#e96fd0', numeral: 'XII', emblem: 'The peacock', variants: 'Peacemaker, guildmaster, envoy', characters: 'Nelson Mandela, Fred Rogers',
        description: 'Brings people together and keeps them so. The Cleric builds rapport, settles quarrels and speaks for one side to the other, and makes a crowd into a community that outlives the evening.',
        skills: ['Diplomacy', 'Mediation', 'Facilitation', 'Networking'] },
};

/**
 * An archetype's exploitative aspect: the same medium, worked at others' expense. Lore, and
 * what an exploitative player is called.
 * @type {Record<Archetype, { label: string, verb: string, operator: string, variants: string, characters: string, description: string }>}
 */
export const SHADOWS = {
    paladin: { label: 'Berserker', verb: 'breaks', operator: 'Bully, rager', variants: 'Juggernaut, barbarian, blood knight, brute', characters: 'Hulk, Terminator',
        description: 'Hits because it can. The Berserker turns force on whoever is nearest and weakest, breaks what won’t bend, and calls what’s left standing respect.' },
    artificer: { label: 'Golemancer', verb: 'warps', operator: 'Mad scientist, technocrat, robophile', variants: 'Warper, bone cobbler, reanimator', characters: 'Oppenheimer, Dr. Frankenstein, Dr. Robert Ford',
        description: 'Makes things that act like people, to use people like things. The Golemancer warps matter to serve itself, and never asks who must live with what it made.' },
    mariner: { label: 'Pirate', verb: 'traffics', operator: 'Smuggler, trafficker, resource exploiter', variants: 'Corsair, raider, viking, leviathan', characters: 'Blackbeard, King Leopold II',
        description: 'Carries what should never be carried. The Pirate strips a place and moves on, trades in whatever and whoever will sell, and leaves the distance to hide it.' },
    wizard: { label: 'Warlock', verb: 'conspires', operator: 'Conspirator, puppeteer, criminal mastermind, cynic', variants: 'Maleficar, nihilist', characters: 'Littlefinger',
        description: 'Holds every thread, and pulls them. The Warlock tells each person only what will move them, and lets no one else see the whole.' },
    ranger: { label: 'Rogue', verb: 'stalks', operator: 'Thief, blackmailer, stalker', variants: 'Assassin, cloak, wraith', characters: 'The Predator, Boba Fett, Mr. Robot',
        description: 'Finds what is hidden, to hold it over someone. The Rogue follows the unwary, learns what they guard, and names a price for silence.' },
    merchant: { label: 'Trickster', verb: 'swindles', operator: 'Conman, swindler, fraudster, traitor', variants: 'Charlatan', characters: 'Elizabeth Holmes, Tom Ripley',
        description: 'Sells what isn’t there. The Trickster knows what it’s worth to you and that it’s worth nothing, and is gone before you weigh it.' },
    enchanter: { label: 'Siren', verb: 'lures', operator: 'Social engineer, seducer', variants: 'Hexer, succubus', characters: 'The Governor, Circe',
        description: 'Makes people want what harms them. The Siren finds the wish you never said aloud, and sings it back to you from the rocks.' },
    druid: { label: 'Blighter', verb: 'poisons', operator: 'Predatory caregiver, poisoner', variants: 'Blight druid, wither', characters: 'Annie Wilkes, Nurse Ratched',
        description: 'Keeps others ill so as to be needed. The Blighter poisons what it tends, a little at a time, and makes shelter into something no one can leave.' },
    bard: { label: 'Demagogue', verb: 'inflames', operator: 'Fearmongerer, propagandist, clout chaser, narcissist', variants: 'Doomsayer, zealot, proselytizer, illusionist, shapeshifter', characters: 'Homelander, Narcissus, Chicken Little',
        description: 'Will have every eye, whatever it costs. The Demagogue feeds a crowd on fear and anger because they hold a room, and cannot bear to be unheard.' },
    vanguard: { label: 'Tyrant', verb: 'dominates', operator: 'Dictator, warlord, corrupt politician', variants: 'Warlord', characters: 'Big Brother, Commodus',
        description: 'Leads for the sake of being followed. The Tyrant turns the party’s momentum into a weight on its back, and takes every question for treason.' },
    templar: { label: 'Inquisitor', verb: 'chains', operator: 'Loan shark, debt collector, usurer', variants: 'Usurer', characters: 'Torquemada, Javert',
        description: 'Makes everyone owe. The Inquisitor writes the pact so that it can’t be kept, remembers every debt, and chains you to it in the name of the law.' },
    cleric: { label: 'Necromancer', verb: 'possesses', operator: 'Cult leader, ostracizer', variants: 'Cultist, occultist', characters: 'Mrs. Carmody, Jim Jones',
        description: 'Makes people act like things. The Necromancer draws a circle and empties those inside it, until their will is its own and they dread nothing but the edge.' },
};

/**
 * The two aspects of an archetype, and the Cohort's two views: virtue and vice.
 * @type {Record<Aspect, { label: string, hint: string, color: string }>}
 */
export const ASPECTS = {
    constructive: { label: 'Virtue', hint: 'Excellence: works its medium for others', color: '#f0d490' },
    exploitative: { label: 'Vice', hint: 'Excess: works its medium at others’ expense', color: '#e0524a' },
};

/** What an archetype is called and does, in an aspect (unset: virtue).
 *  @param {Archetype} id @param {Aspect} [aspect] */
export const facing = (id, aspect) => (aspect === 'exploitative' ? SHADOWS[id] : ARCHETYPES[id]);

/** An archetype's colour in an aspect: vice steeps it in blood. @param {Archetype} id @param {Aspect} [aspect] */
export function paragonColor(id, aspect) {
    const c = PARAGONS[id].color;
    if (aspect !== 'exploitative') return c;
    const part = (/** @type {string} */ h, /** @type {number} */ i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return `#${[0, 1, 2].map((i) => Math.round(part(c, i) * 0.35 + part('#d01f2a', i) * 0.65).toString(16).padStart(2, '0')).join('')}`;
}
