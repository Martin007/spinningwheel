import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_TIMING, MAX_RESTAURANTS, spinPlan, selectedIndex } from '../src/core.js';
import { WheelAudio } from '../src/audio.js';

test('full-motion wheel lasts five times longer without changing fast-path timings', () => {
  assert.equal(ANIMATION_TIMING.wheelDuration, 8.4 * 5);
  assert.equal(ANIMATION_TIMING.wheelTurnsMultiplier, 5);
  assert.ok(Object.isFrozen(ANIMATION_TIMING));
});

test('longer rotation budgets still land every possible winner under the pointer', () => {
  for (let count = 1; count <= MAX_RESTAURANTS; count++) {
    for (let winner = 0; winner < count; winner++) {
      for (const baseTurns of [5, 6, 7]) {
        for (const jitter of [0, 0.5, 1]) {
          const turns = baseTurns * ANIMATION_TIMING.wheelTurnsMultiplier;
          const plan = spinPlan(17.5, count, winner, jitter, turns);
          assert.equal(selectedIndex(plan.end, count), winner);
          assert.ok(plan.end >= 17.5 + turns * 360);
          assert.ok(plan.end < 17.5 + (turns + 1) * 360);
          assert.equal(plan.zoomAt, 360 / count * 2.75);
        }
      }
    }
  }
});

test('the longer wheel keeps launch speed close while lowering deceleration', () => {
  for (const baseTurns of [5, 6, 7]) {
    const oldPlan = spinPlan(0, 34, 12, 0.5, baseTurns);
    const next = spinPlan(0, 34, 12, 0.5, baseTurns * ANIMATION_TIMING.wheelTurnsMultiplier);
    // Derivatives of rotation = distance * (1 - (1 - t / duration)^4).
    const oldSpeed = 4 * oldPlan.end / 8.4;
    const newSpeed = 4 * next.end / ANIMATION_TIMING.wheelDuration;
    assert.ok(newSpeed / oldSpeed > 0.85 && newSpeed / oldSpeed <= 1);
    const oldDeceleration = 12 * oldPlan.end / 8.4 ** 2;
    const newDeceleration = 12 * next.end / ANIMATION_TIMING.wheelDuration ** 2;
    assert.ok(newDeceleration <= oldDeceleration / 5);
  }
});

test('reels stop at 2.9, 6.9 and 10.9 seconds with fivefold stagger', () => {
  assert.equal(ANIMATION_TIMING.reelStagger, 0.8 * 5);
  const stops = [0, 1, 2].map(i => ANIMATION_TIMING.reelFirstStop + i * ANIMATION_TIMING.reelStagger);
  stops.forEach((stop, i) => assert.ok(Math.abs(stop - [2.9, 6.9, 10.9][i]) < 1e-10));
  assert.equal(ANIMATION_TIMING.reelSettle, 0.18);
  assert.ok(ANIMATION_TIMING.reelMotorTimeout > stops[2] + ANIMATION_TIMING.reelSettle + 2);
});

test('motor safety timeout covers the new reel sequence and manual cleanup still works', () => {
  const stops = [];
  let started = false;
  let disconnected = 0;
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} };
  const oscillator = { frequency: parameter, connect() {}, disconnect() { disconnected++; },
    start() { started = true; }, stop(at) { stops.push(at); } };
  const gain = { gain: parameter, connect() {}, disconnect() { disconnected++; } };
  const audio = new WheelAudio();
  audio.master = {};
  audio.context = { state: 'running', currentTime: 10, createOscillator: () => oscillator, createGain: () => gain };
  audio.startReels();
  assert.ok(started);
  assert.equal(stops[0], 10 + ANIMATION_TIMING.reelMotorTimeout);
  audio.context.currentTime = 21.08;
  audio.stopReels();
  assert.equal(audio.motor, null);
  assert.equal(stops[1], 21.08 + 0.15);
  oscillator.onended();
  assert.equal(disconnected, 2);
  audio.stopReels();
  assert.equal(stops.length, 2);
});
