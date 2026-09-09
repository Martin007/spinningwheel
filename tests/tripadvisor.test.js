import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, MAX_RESTAURANTS, parseConfig, isOpen, eligibleRestaurants, lunchDaysLabel, readState } from '../src/core.js';

// Import-specific counts and metadata belong to an immutable fixture, not the editable live list.
const data = parseConfig(readFileSync(new URL('./fixtures/tripadvisor-restaurants.json', import.meta.url), 'utf8'));
const provenance = JSON.parse(readFileSync(new URL('../data/tripadvisor-source.json', import.meta.url), 'utf8'));
const wednesday = new Date('2026-09-09T10:00:00Z');
const eligible = settings => eligibleRestaurants(data, { ...DEFAULT_SETTINGS, ...settings }, [], wednesday);
const unknown = () => ({ id: 'unknown', name: 'Okänt', enabled: true, largeGroups: null, outdoor: null, openDays: null, closedDates: [], extraOpenDates: [], url: '' });
const one = restaurant => ({ version: 1, restaurants: [restaurant] });

test('121 unique IDs and display names, with source records in listing order', () => {
  assert.equal(data.restaurants.length, 121);
  assert.equal(new Set(data.restaurants.map(r => r.id)).size, 121);
  assert.equal(new Set(data.restaurants.map(r => r.name)).size, 121);
  assert.equal(provenance.entries.length, 121);
  assert.deepEqual(provenance.entries.map(r => r.position), Array.from({ length: 121 }, (_, i) => i + 1));
  assert.deepEqual(provenance.entries.map(r => r.restaurantId), data.restaurants.map(r => r.id));
  assert.equal(data.restaurants[120].name, 'Gotthards Kök & Matsalar');
});
test('all five paginated lunch sources are represented, including the last singleton', () => {
  const counts = provenance.lunchListingPages.map(url => provenance.entries.filter(r => r.listingUrl === url).length);
  assert.deepEqual(counts, [30, 30, 30, 30, 1]);
});
test('no lunch schedule has been guessed from a listing or open-now snapshot', () => {
  assert.ok(data.restaurants.every(r => r.openDays === null));
  assert.equal(eligible({}).length, 121);
  assert.equal(eligibleRestaurants(data, DEFAULT_SETTINGS, [], new Date('2026-09-13T10:00:00Z')).length, 121);
});
test('only category matches qualify: 24 group, 30 outdoor, 14 both', () => {
  assert.equal(eligible({ largeGroups: true }).length, 24);
  assert.equal(eligible({ outdoor: true }).length, 30);
  assert.equal(eligible({ largeGroups: true, outdoor: true }).length, 14);
  assert.ok(data.restaurants.every(r => [true, null].includes(r.largeGroups) && [true, null].includes(r.outdoor)));
});
test('unknown metadata survives parse, JSON export and saved browser state', () => {
  const config = parseConfig(one(unknown()));
  assert.deepEqual(parseConfig(JSON.stringify(config)), config);
  const state = readState({ getItem: () => JSON.stringify({ version: 1, settings: {}, history: [], override: config }) });
  assert.equal(state.override.restaurants[0].openDays, null);
  assert.equal(state.override.restaurants[0].outdoor, null);
  assert.equal(state.override.restaurants[0].largeGroups, null);
});
test('null schedules and deliberately empty schedules are different', () => {
  assert.equal(isOpen(unknown(), wednesday), true);
  assert.equal(isOpen({ ...unknown(), openDays: [] }, wednesday), false);
  assert.equal(isOpen({ ...unknown(), openDays: [1, 2] }, wednesday), false);
  assert.equal(isOpen({ ...unknown(), openDays: [3] }, wednesday), true);
});
test('unknown days do not override an explicit closure or a disabled restaurant', () => {
  assert.equal(isOpen({ ...unknown(), closedDates: ['2026-09-09'] }, wednesday), false);
  assert.equal(isOpen({ ...unknown(), enabled: false }, wednesday), false);
  assert.equal(isOpen({ ...unknown(), closedDates: ['2026-09-09'], extraOpenDates: ['2026-09-09'] }, wednesday), false);
});
test('explicit extra days still work with a manually empty schedule', () => {
  assert.equal(isOpen({ ...unknown(), openDays: [], extraOpenDates: ['2026-09-09'] }, wednesday), true);
});
test('null and false never pass an enabled feature filter', () => {
  for (const flag of ['largeGroups', 'outdoor']) {
    for (const value of [null, false]) {
      const config = parseConfig(one({ ...unknown(), [flag]: value }));
      assert.equal(eligibleRestaurants(config, { ...DEFAULT_SETTINGS, [flag]: true }, [], wednesday).length, 0);
    }
    const config = parseConfig(one({ ...unknown(), [flag]: true }));
    assert.equal(eligibleRestaurants(config, { ...DEFAULT_SETTINGS, [flag]: true }, [], wednesday).length, 1);
  }
});
test('unknown is explicit: missing fields, strings and numbers are rejected', () => {
  for (const field of ['largeGroups', 'outdoor', 'openDays']) {
    for (const value of [undefined, 'unknown', 'null', 0, 1, {}]) {
      assert.throws(() => parseConfig(one({ ...unknown(), [field]: value })), new RegExp(field));
    }
  }
});
test('200 valid choices are supported; 201 valid choices are rejected for size', () => {
  const restaurants = Array.from({ length: MAX_RESTAURANTS }, (_, i) => ({ ...unknown(), id: `restaurant-${i}` }));
  assert.equal(parseConfig({ version: 1, restaurants }).restaurants.length, 200);
  restaurants.push({ ...unknown(), id: 'restaurant-extra' });
  assert.throws(() => parseConfig({ version: 1, restaurants }), /200/);
});
test('matching original IDs retain winner exclusions after the import', () => {
  const ids = ['storan', 'von-dufva', 'yogi', 'overste-morner'];
  assert.ok(ids.every(id => data.restaurants.some(r => r.id === id)));
  const history = ids.map(restaurantId => ({ restaurantId, name: 'Tidigare namn' }));
  const filtered = eligibleRestaurants(data, DEFAULT_SETTINGS, history, wednesday);
  assert.equal(filtered.length, 117);
  assert.ok(filtered.every(r => !ids.includes(r.id)));
});
test('separate chain addresses remain separate choices and history keys', () => {
  for (const name of ['Max Burgers', 'Burger King', 'Subway']) {
    const branches = data.restaurants.filter(r => r.name.startsWith(`${name} · `));
    assert.equal(branches.length, 2);
    assert.notEqual(branches[0].id, branches[1].id);
    assert.notEqual(branches[0].url, branches[1].url);
    const filtered = eligibleRestaurants(data, DEFAULT_SETTINGS, [{ restaurantId: branches[0].id }], wednesday);
    assert.ok(filtered.some(r => r.id === branches[1].id));
  }
});
test('Swedish schedule labels distinguish unknown, empty and selected weekdays', () => {
  assert.equal(lunchDaysLabel(null), 'Lunchdagar okända');
  assert.equal(lunchDaysLabel([]), 'Inga veckodagar');
  assert.equal(lunchDaysLabel([1, 3, 5]), 'Mån · Ons · Fre');
});

test('a curated copy may remove entries, add its own IDs and edit imported metadata', () => {
  const edited = structuredClone(data);
  edited.restaurants = edited.restaurants.slice(0, 33);
  edited.restaurants.push({ ...unknown(), id: 'own-lunch-place', name: 'Eget matställe' });
  edited.restaurants[0].name = 'Nytt namn';
  edited.restaurants[0].largeGroups = false;
  edited.restaurants[0].outdoor = false;
  edited.restaurants[0].openDays = [3];
  const parsed = parseConfig(JSON.stringify(edited));
  assert.equal(parsed.restaurants.length, 34);
  assert.equal(parsed.restaurants.at(-1).id, 'own-lunch-place');
  assert.equal(isOpen(parsed.restaurants[0], wednesday), true);
  assert.equal(isOpen(parsed.restaurants[0], new Date('2026-09-13T10:00:00Z')), false);
  assert.deepEqual(parseConfig(JSON.stringify(parsed)), parsed);
  assert.equal(data.restaurants.length, 121);
  assert.equal(data.restaurants[0].openDays, null);
});
