// The Treasury's analysis (pure): how moves are graded, and what they add up to. Grades are
// chess.com's classes (same list in backend/db/models.py MOVE_GRADES). `delta` is how far a
// move shifts the winning chances: the slips are midpoints of chess.com's ranges, the rest
// are ours. `accuracy` null: the move isn't counted (you had no real choice).

/**
 * @typedef {object} Grade
 * @property {string} label
 * @property {number} delta
 * @property {number | null} accuracy
 * @property {string} color
 * @property {string} hint
 */
/** @type {Record<MoveGrade, Grade>} */
export const GRADES = {
    brilliant: { label: 'Brilliant', delta: 0.15, accuracy: 100, color: '#26c2a3', hint: 'A sound sacrifice: you gave something up and it was still one of the best moves' },
    great: { label: 'Great', delta: 0.1, accuracy: 100, color: '#749bbf', hint: 'Critical to the outcome: the only good move, or one that turned it around' },
    best: { label: 'Best', delta: 0.06, accuracy: 100, color: '#81b64c', hint: 'The strongest move available' },
    excellent: { label: 'Excellent', delta: 0.04, accuracy: 92, color: '#81b64c', hint: 'Very close to the best move' },
    good: { label: 'Good', delta: 0.02, accuracy: 80, color: '#95b776', hint: 'Decent, though better moves existed' },
    book: { label: 'Book', delta: 0, accuracy: null, color: '#d5a47d', hint: 'By the book: a known, standard move' },
    forced: { label: 'Forced', delta: 0, accuracy: null, color: '#96af8b', hint: 'The only move you had' },
    inaccuracy: { label: 'Inaccuracy', delta: -0.075, accuracy: 50, color: '#f7c631', hint: 'A small slip that worsened the position slightly' },
    mistake: { label: 'Mistake', delta: -0.15, accuracy: 25, color: '#ffa459', hint: 'A bad move that clearly worsened the position' },
    miss: { label: 'Miss', delta: -0.1, accuracy: 25, color: '#ff7769', hint: 'You failed to capitalize on an opportunity' },
    blunder: { label: 'Blunder', delta: -0.35, accuracy: 0, color: '#fa412d', hint: 'A serious error that cost a great deal' },
};
export const GRADE_KEYS = /** @type {MoveGrade[]} */ (Object.keys(GRADES));

/** The verdict matrix: rows boring -> exciting, columns defeat -> success. */
const VERDICTS = [
    ['Slog', 'Stalemate', 'Formality'],
    ['Defeat', 'Draw', 'Victory'],
    ['Glorious defeat', 'Thriller', 'Triumph'],
];
/** @param {[number, number] | null | undefined} v  [outcome, thrill] */
export const verdictName = (v) => (v ? VERDICTS[v[1]][v[0]] : '');
/** 1 (a slog) .. 5 (a triumph): how many rings its sigil wears. @param {[number, number] | null | undefined} v */
export const verdictRings = (v) => (v ? 1 + v[0] + v[1] : 0);

/** The moves that say something. @template {{ text: string, spell?: string | null }} M @param {M[]} moves @returns {M[]} */
export const played = (moves) => moves.filter((m) => m.text.trim() || m.spell);

/** Mean accuracy of the moves that count, or null. @param {AnalysisMove[]} moves @returns {number | null} */
export function accuracy(moves) {
    const scores = played(moves).map((m) => GRADES[m.grade].accuracy).filter((s) => s != null);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/** Winning chances before the first move and after each one, 0.02 to 0.98. @param {AnalysisMove[]} moves */
export function winLine(moves) {
    let v = 0.5;
    return [v, ...played(moves).map((m) => (v = Math.max(0.02, Math.min(0.98, v + GRADES[m.grade].delta))))];
}

/** The 1-based move that shifted the chances most (the first, if several), or null. @param {AnalysisMove[]} moves */
export function turningPoint(moves) {
    const line = winLine(moves);
    let best = 0, at = null;
    for (let i = 1; i < line.length; i++) {
        const d = Math.abs(line[i] - line[i - 1]);
        if (d > best + 1e-9) { best = d; at = i; }
    }
    return at;
}

/** How many moves of each grade, in grade order. @param {AnalysisMove[]} moves @returns {[MoveGrade, number][]} */
export function gradeCounts(moves) {
    const list = played(moves);
    return /** @type {[MoveGrade, number][]} */ (GRADE_KEYS.map((g) => [g, list.filter((m) => m.grade === g).length]).filter(([, n]) => n));
}

/** An empty analysis. @returns {Analysis} */
export const blankAnalysis = () => ({ verdict: null, link: '', notes: '', gains: [], losses: [], discoveries: [], moves: [], feedback: [] });
