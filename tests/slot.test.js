import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_MODES, DEFAULT_SETTINGS, readState, MAX_RESTAURANTS, parseConfig, eligibleRestaurants } from '../src/core.js';
import { SLOT_MATCH_DENOMINATOR, nonMatchingTriple, slotWinner, slotPlan, reelProgress } from '../src/slot-core.js';

const load = settings => readState({ getItem: () => JSON.stringify({ version: 1, settings, history: [] }) });
const draw = (...values) => limit => { assert.ok(values.length); const value = values.shift(); assert.ok(value < limit); return value; };

test('registry keeps the wheel default and exposes a Swedish alternative', () => {
  assert.deepEqual(DECISION_MODES.map(m => m.id), ['wheel', 'slots']);
  assert.equal(DEFAULT_SETTINGS.mode, 'wheel');
  assert.equal(DECISION_MODES[1].label, 'Enarmad bandit');
  assert.ok(Object.isFrozen(DECISION_MODES));
});
test('legacy settings migrate to wheel without losing preferences or history', () => {
  const old = { version: 1, settings: { sound: false, removeWinners: false }, history: [{ id: '1', restaurantId: 'a', name: 'A', at: '2026-09-09T10:00:00Z' }] };
  const state = readState({ getItem: () => JSON.stringify(old) });
  assert.equal(state.settings.mode, 'wheel'); assert.equal(state.settings.sound, false);
  assert.equal(state.settings.removeWinners, false); assert.equal(state.history.length, 1);
});
test('mode preference round-trips without affecting the restaurant JSON', () => {
  assert.equal(load({ mode: 'slots' }).settings.mode, 'slots');
  assert.equal(load({ mode: 'wheel' }).settings.mode, 'wheel');
  assert.equal(parseConfig({ version: 1, restaurants: [] }).restaurants.length, 0);
});
test('unknown or malformed mode preferences safely use the wheel', () => {
  for (const mode of [null, 'future-mode', true, false, 0, {}, '__proto__']) assert.equal(load({ mode }).settings.mode, 'wheel');
});
test('only exactly three equal indices form a winning payline', () => {
  assert.equal(slotWinner([0, 0, 0]), 0); assert.equal(slotWinner([33, 33, 33]), 33);
  for (const row of [[0, 1, 0], [1, 1, 0], [0, 1, 1], [0, 1, 2]]) assert.equal(slotWinner(row), null);
});
test('malformed paylines are rejected', () => {
  for (const row of [[], [1, 1], [1, 1, 1, 1], [-1, -1, -1], [1.2, 1.2, 1.2], ['1', '1', '1'], null]) assert.throws(() => slotWinner(row));
});
test('one eligible restaurant matches immediately without a random draw', () => {
  assert.deepEqual(slotPlan(1, () => { throw Error('Must not draw'); }), { indices: [0, 0, 0], winnerIndex: 0 });
});
test('invalid pools and random sources are rejected rather than silently picking', () => {
  for (const count of [0, -1, 201, 1.5, NaN]) assert.throws(() => slotPlan(count));
  for (const value of [-1, 4, 0.5, undefined]) assert.throws(() => slotPlan(34, () => value));
});
test('every eligible restaurant can win at the same disclosed odds', () => {
  assert.equal(SLOT_MATCH_DENOMINATOR, 4);
  for (const count of [2, 3, 34, 121, 200]) {
    for (let i = 0; i < count; i++) assert.deepEqual(slotPlan(count, draw(0, i)), { indices: [i, i, i], winnerIndex: i });
  }
});
test('all three losing branches produce a genuine non-winning row', () => {
  for (let bucket = 1; bucket < 4; bucket++) {
    for (let sample = 0; sample < 24; sample++) {
      const result = slotPlan(3, draw(bucket, sample));
      assert.equal(result.winnerIndex, null); assert.equal(slotWinner(result.indices), null);
    }
  }
});
test('non-winning decoder is a bijection over every non-triple, not engineered near misses', () => {
  for (let count = 2; count <= 15; count++) {
    const seen = new Set();
    for (let i = 0; i < count ** 3 - count; i++) {
      const row = nonMatchingTriple(count, i);
      assert.ok(row.every(n => n >= 0 && n < count));
      assert.equal(slotWinner(row), null); seen.add(row.join(','));
    }
    assert.equal(seen.size, count ** 3 - count);
  }
});
test('non-winning decoder handles the ends and midpoint of all supported pool sizes', () => {
  for (let count = 2; count <= MAX_RESTAURANTS; count++) {
    for (const sample of [0, 1, Math.floor((count ** 3 - count) / 2), count ** 3 - count - 1]) {
      const row = nonMatchingTriple(count, sample);
      assert.equal(slotWinner(row), null); assert.ok(row.every(i => i < count));
    }
  }
  for (const args of [[1, 0], [2, -1], [2, 6], [201, 0], [2, 0.1]]) assert.throws(() => nonMatchingTriple(...args));
});
test('slot outcomes are memoryless: no automatic retries or forced nth winner', () => {
  const results = Array.from({ length: 20 }, () => slotPlan(34, draw(1, 0)));
  assert.ok(results.every(r => r.winnerIndex === null));
});
test('motion progress accelerates, decelerates and lands exactly without reversal', () => {
  assert.equal(reelProgress(0), 0); assert.equal(reelProgress(1), 1);
  assert.equal(reelProgress(-10), 0); assert.equal(reelProgress(10), 1);
  let previous = 0;
  for (let i = 0; i <= 1000; i++) { const p = reelProgress(i / 1000); assert.ok(p >= previous); previous = p; }
  assert.ok(reelProgress(0.1) < 0.1); assert.ok(reelProgress(0.9) > 0.9);
});
test('slot and wheel modes use identical day, feature and past-winner eligibility', () => {
  const r = { id: 'a', name: 'A', enabled: true, openDays: [3], largeGroups: true, outdoor: true };
  const config = parseConfig({ version: 1, restaurants: [r, { ...r, id: 'b', outdoor: false }, { ...r, id: 'c', openDays: [4] }] });
  const date = new Date('2026-09-09T10:00:00Z');
  for (const mode of ['wheel', 'slots']) {
    assert.deepEqual(eligibleRestaurants(config, { ...DEFAULT_SETTINGS, mode, outdoor: true }, [], date).map(r => r.id), ['a']);
    assert.deepEqual(eligibleRestaurants(config, { ...DEFAULT_SETTINGS, mode }, [{ restaurantId: 'a' }], date).map(r => r.id), ['b']);
  }
});
