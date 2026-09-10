import { randomIndex, MAX_RESTAURANTS } from './core.js';

/** Lunch-friendly, disclosed odds, not three independent draws from the full list.
 * A match is 1/4 per pull (one choice always matches). Every restaurant has the
 * same conditional winning probability. Losses are uniform over all non-triples:
 * no forced near misses, hidden retries, escalating odds or guaranteed nth win.
 */
export const SLOT_MATCH_DENOMINATOR = 4;

export function slotWinner(indices) {
  if (!Array.isArray(indices) || indices.length !== 3 || !indices.every(i => Number.isInteger(i) && i >= 0)) {
    throw new Error('En vinstrad måste ha tre giltiga symboler.');
  }
  return indices.every(i => i === indices[0]) ? indices[0] : null;
}

/** Decode a uniformly sampled non-winning triple without rejection loops. */
export function nonMatchingTriple(count, sample) {
  if (!Number.isInteger(count) || count < 2 || count > MAX_RESTAURANTS
    || !Number.isInteger(sample) || sample < 0 || sample >= count ** 3 - count) {
    throw new Error('Ogiltig symbolkombination.');
  }
  // Diagonal triples occur every count² + count + 1 positions. Skip them.
  const value = sample + 1 + Math.floor(sample / (count * count + count));
  return [Math.floor(value / count ** 2), Math.floor(value / count) % count, value % count];
}

export function slotPlan(count, draw = randomIndex) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_RESTAURANTS) throw new Error('Inga giltiga lunchalternativ.');
  const pick = limit => {
    const n = draw(limit);
    if (!Number.isInteger(n) || n < 0 || n >= limit) throw new Error('Ogiltigt slumptal.');
    return n;
  };
  if (count === 1) return { indices: [0, 0, 0], winnerIndex: 0 };
  const indices = pick(SLOT_MATCH_DENOMINATOR) === 0
    ? Array(3).fill(pick(count))
    : nonMatchingTriple(count, pick(count ** 3 - count));
  return { indices, winnerIndex: slotWinner(indices) };
}

/** Smooth acceleration, a cruising middle, and a long mechanical slowdown. */
export function reelProgress(t) {
  t = Math.min(1, Math.max(0, t));
  // Integral of a smooth, nonnegative speed curve; starts and ends at rest.
  return 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
}
