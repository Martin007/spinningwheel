import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, MAX_RESTAURANTS, STORAGE_KEY, dayInfo, parseConfig, isOpen, eligibleRestaurants, randomIndex, selectedIndex, spinPlan, readState } from '../src/core.js';

const source = JSON.parse(readFileSync(new URL('../data/restaurants.json', import.meta.url), 'utf8'));
const fixture = () => parseConfig({ version: 1, restaurants: [
  { id: 'a', name: 'A', largeGroups: true, outdoor: true, openDays: [1, 2, 3, 4, 5] },
  { id: 'b', name: 'B', largeGroups: false, outdoor: true, openDays: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'c', name: 'C', largeGroups: true, outdoor: false, openDays: [1, 2, 3, 4, 5] },
] });
const wednesday = new Date('2026-09-09T10:00:00Z');

// This is user-maintained configuration, not the frozen Tripadvisor import.
test('published restaurant JSON is valid without fixing its size or metadata', () => {
  const config = parseConfig(source);
  assert.equal(config.restaurants.length, source.restaurants.length);
  assert.ok(config.restaurants.length <= MAX_RESTAURANTS);
  assert.deepEqual(parseConfig(JSON.stringify(config)), config);
});
test('Stockholm summer midnight is independent of device timezone', () => {
  assert.deepEqual(dayInfo(new Date('2026-09-08T22:05:00Z')), { iso: '2026-09-09', weekday: 3 });
});
test('Stockholm winter midnight uses CET', () => {
  assert.deepEqual(dayInfo(new Date('2026-12-06T23:05:00Z')), { iso: '2026-12-07', weekday: 1 });
});
test('DST transition stays on the correct date', () => {
  assert.deepEqual(dayInfo(new Date('2026-03-29T01:30:00Z')), { iso: '2026-03-29', weekday: 7 });
  assert.deepEqual(dayInfo(new Date('2026-10-25T01:30:00Z')), { iso: '2026-10-25', weekday: 7 });
});
test('Monday and Sunday use ISO weekday numbers', () => {
  assert.equal(dayInfo(new Date('2026-09-07T10:00:00Z')).weekday, 1);
  assert.equal(dayInfo(new Date('2026-09-13T10:00:00Z')).weekday, 7);
});
test('all default weekday choices are included', () => {
  assert.equal(eligibleRestaurants(fixture(), DEFAULT_SETTINGS, [], wednesday).length, 3);
});
test('both feature filters intersect, rather than union', () => {
  const filtered = eligibleRestaurants(fixture(), { ...DEFAULT_SETTINGS, largeGroups: true, outdoor: true }, [], wednesday);
  assert.deepEqual(filtered.map(r => r.id), ['a']);
});
test('weekend opening days are respected', () => {
  assert.deepEqual(eligibleRestaurants(fixture(), DEFAULT_SETTINGS, [], new Date('2026-09-13T10:00:00Z')).map(r => r.id), ['b']);
});
test('a closure beats a weekday and an extra opening', () => {
  const r = fixture().restaurants[0]; r.closedDates = ['2026-09-09']; r.extraOpenDates = ['2026-09-09'];
  assert.equal(isOpen(r, wednesday), false);
});
test('an extra opening beats a closed weekday', () => {
  const r = fixture().restaurants[0]; r.extraOpenDates = ['2026-09-13'];
  assert.equal(isOpen(r, new Date('2026-09-13T10:00:00Z')), true);
});
test('disabled restaurants never become eligible through extra dates', () => {
  const r = fixture().restaurants[0]; r.enabled = false; r.extraOpenDates = ['2026-09-09'];
  assert.equal(isOpen(r, wednesday), false);
});
test('past winners are excluded by stable ID, even after a rename', () => {
  const filtered = eligibleRestaurants(fixture(), DEFAULT_SETTINGS, [{ restaurantId: 'a', name: 'Old name' }], wednesday);
  assert.deepEqual(filtered.map(r => r.id), ['b', 'c']);
});
test('turning off exclusion preserves history while including winners', () => {
  const history = [{ restaurantId: 'a' }];
  assert.equal(eligibleRestaurants(fixture(), { ...DEFAULT_SETTINGS, removeWinners: false }, history, wednesday).length, 3);
  assert.equal(history.length, 1);
});
test('an exhausted pool is empty, not silently recycled', () => {
  assert.equal(eligibleRestaurants(fixture(), DEFAULT_SETTINGS, ['a', 'b', 'c'].map(restaurantId => ({ restaurantId })), wednesday).length, 0);
});
test('empty JSON list is allowed', () => assert.equal(parseConfig({ version: 1, restaurants: [] }).restaurants.length, 0));
test('reject malformed JSON and wrong schema versions', () => {
  assert.throws(() => parseConfig('{broken'));
  assert.throws(() => parseConfig({ version: 2, restaurants: [] }));
});
test('reject duplicate IDs', () => {
  const config = fixture(); config.restaurants[1].id = 'a';
  assert.throws(() => parseConfig(config), /id/);
});
test('validate flags rather than treating the string false as true', () => {
  const config = fixture(); config.restaurants[0].outdoor = 'false';
  assert.throws(() => parseConfig(config), /outdoor/);
});
test('reject invalid weekday numbers', () => {
  const config = fixture(); config.restaurants[0].openDays = [0, 8];
  assert.throws(() => parseConfig(config), /openDays/);
});
test('deduplicate weekdays and dates', () => {
  const config = fixture(); config.restaurants[0].openDays = [3, 1, 3]; config.restaurants[0].closedDates = ['2026-09-10', '2026-09-10'];
  assert.deepEqual(parseConfig(config).restaurants[0].openDays, [1, 3]);
  assert.equal(parseConfig(config).restaurants[0].closedDates.length, 1);
});
test('reject impossible dates, but accept leap days', () => {
  const config = fixture(); config.restaurants[0].closedDates = ['2026-02-29'];
  assert.throws(() => parseConfig(config), /datum/);
  config.restaurants[0].closedDates = ['2028-02-29'];
  assert.doesNotThrow(() => parseConfig(config));
});
test('reject script URLs and relative URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relative']) {
    const config = fixture(); config.restaurants[0].url = url;
    assert.throws(() => parseConfig(config));
  }
});
test('accept an HTTPS restaurant URL', () => {
  const config = fixture(); config.restaurants[0].url = 'https://example.com/menu';
  assert.equal(parseConfig(config).restaurants[0].url, 'https://example.com/menu');
});
test('reject oversized lists and whitespace-only names', () => {
  const config = fixture(); config.restaurants[0].name = '   ';
  assert.throws(() => parseConfig(config));
  assert.throws(() => parseConfig({ version: 1, restaurants: Array(MAX_RESTAURANTS + 1).fill({}) }));
});
test('random selection rejects the modulo-biased tail', () => {
  let count = 0;
  const value = randomIndex(3, array => { array[0] = count++ === 0 ? 0xffffffff : 4; });
  assert.equal(value, 1); assert.equal(count, 2);
});
test('single-item random choice is safe and empty choice throws', () => {
  assert.equal(randomIndex(1), 0); assert.throws(() => randomIndex(0));
});
test('every possible winner lands under the pointer, with safe jitter margins', () => {
  for (let count = 1; count <= MAX_RESTAURANTS; count++) {
    for (let winner = 0; winner < count; winner++) {
      for (const start of [0, 17.5, 359.9, 4321.12]) {
        for (const jitter of [0, 0.5, 1]) {
          const plan = spinPlan(start, count, winner, jitter, 6);
          assert.equal(selectedIndex(plan.end, count), winner, `count=${count} winner=${winner}`);
          assert.ok(plan.end > start + 5 * 360);
          assert.equal(plan.zoomAt, (360 / count) * 2.75);
        }
      }
    }
  }
});
test('storage round-trips overrides, settings and history', () => {
  const saved = { version: 1, settings: { ...DEFAULT_SETTINGS, sound: false }, override: fixture(), history: [{ id: 'win1', restaurantId: 'a', name: 'A', at: '2026-09-09T10:00:00Z' }] };
  const state = readState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(saved) : null });
  assert.equal(state.history.length, 1); assert.equal(state.settings.sound, false); assert.equal(state.override.restaurants.length, 3);
});
test('missing storage has defaults; corrupt/unavailable storage is detectable', () => {
  assert.equal(readState({ getItem: () => null }).history.length, 0);
  assert.throws(() => readState({ getItem: () => '{' }));
  assert.throws(() => readState({ getItem: () => { throw new Error('blocked'); } }));
});
test('malformed history rows and duplicate entries are ignored', () => {
  const entry = { id: 'w', restaurantId: 'a', name: 'A', at: '2026-09-09T10:00:00Z' };
  const state = readState({ getItem: () => JSON.stringify({ version: 1, history: [null, {}, entry, entry], settings: {} }) });
  assert.equal(state.history.length, 1);
});
