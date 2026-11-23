// Bounties (pure): what an adventure is worth in ambrosia. Same sums as
// backend/services/bounty.py; the server decides what's paid (services/ledger.py).

export const BOUNTY_RANGES = /** @type {const} */ ({ effort: [1, 5], resistance: [0, 3], ratio: [0, 60] });
export const DEFAULT_BOUNTY = { effort: 3, resistance: 1, ratio: 30 };

/** Phases in which a bounty can still be set. */
export const BEFORE_CRUCIBLE = new Set(['queued', 'classifying', 'decomposing']);

/** @param {{ effort: number, resistance: number }} b */
export const bountyTotal = (b) => b.effort * b.resistance * 10;
/** @param {{ effort: number, resistance: number, ratio: number }} b */
export const actionShare = (b) => Math.floor((bountyTotal(b) * b.ratio) / 100 + 0.5);

/** What's still to be earned from a locked bounty (0 without one). @param {AdventureRecord} a */
export function remaining(a) {
    const b = a.bounty;
    if (!b?.locked_at || a.phase === 'killed' || b.paid_seal) return 0;
    return Math.max(0, b.total - b.paid_actions);
}

/** About what finishing the next action pays. @param {AdventureRecord} a */
export function nextActionPay(a) {
    const b = a.bounty, n = a.roadmap?.actions.length ?? 0, done = a.roadmap?.done?.length ?? 0;
    if (!b || !n || done >= n) return 0;
    return Math.max(0, Math.floor((b.action_share * (done + 1)) / n + 0.5) - b.paid_actions);
}
