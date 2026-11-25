// Favor with the deities (pure): supply (what sealed artifacts in the Treasury fulfil) minus
// demand (set by hand in the Pantheon).

/** @typedef {'impressed' | 'satisfied' | 'hungry' | 'starving'} FavorState */
/** A deity's states, neediest first. @type {Record<FavorState, { label: string, color: string, rings: number, range: string }>} */
export const FAVOR_STATES = {
    starving:  { label: 'Starving',  color: '#ef3e4a', rings: 0, range: 'below −3' },
    hungry:    { label: 'Hungry',    color: '#f28a2e', rings: 1, range: '−3 to −1' },
    satisfied: { label: 'Satisfied', color: '#3ccf8e', rings: 2, range: '0 to 3' },
    impressed: { label: 'Impressed', color: '#4fa8ff', rings: 3, range: 'above 3' },
};

/** What a deity can look like (backend.db.models.DEITY_FORMS), in the Pantheon's order. @type {Record<DeityForm, string>} */
export const DEITY_FORMS = { music: 'Computer music', dance: 'Dance', family: 'Family', career: 'Career', games: 'Dark games' };

/** @param {number} favor @returns {FavorState} */
export const favorState = (favor) => (favor > 3 ? 'impressed' : favor >= 0 ? 'satisfied' : favor >= -3 ? 'hungry' : 'starving');

/** How much an adventure fulfils a deity (0: not linked). @param {AdventureRecord} a @param {string} deityId */
export function factorOf(a, deityId) {
    const link = a.entities.find((e) => e.id === deityId);
    return link ? link.factor ?? 1 : 0;
}

/** Whether an adventure feeds its deities now. @param {AdventureRecord} a */
export const feeds = (a) => a.phase === 'completed' && Boolean(a.enshrining?.sealed_at);

/** @param {Entity} deity @param {AdventureRecord[]} adventures */
export function favorOf(deity, adventures) {
    const offerings = adventures.filter((a) => feeds(a) && factorOf(a, deity.id)).sort((x, y) => factorOf(y, deity.id) - factorOf(x, deity.id));
    const supply = offerings.reduce((n, a) => n + factorOf(a, deity.id), 0), demand = deity.details.demand ?? 0;
    return { offerings, supply, demand, favor: supply - demand, state: favorState(supply - demand) };
}

/** With its sign, and a true minus. @param {number} n */
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
