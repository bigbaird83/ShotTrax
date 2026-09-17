import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addPuttLength,
  clampPutts,
  holeAfterDone,
  isNearOrOnGreen,
  NEAR_GREEN_YD,
  parsePuttLengths,
  PUTT_LENGTHS,
  PUTT_MAX,
  serializePuttLengths,
  setPuttCount,
} from './putts';

test('putts clamp to 0–5', () => {
  assert.equal(clampPutts(-1), 0);
  assert.equal(clampPutts(0), 0);
  assert.equal(clampPutts(3), 3);
  assert.equal(clampPutts(5), 5);
  assert.equal(clampPutts(9), 5);
  assert.equal(clampPutts(Number.NaN), 0);
  assert.equal(PUTT_MAX, 5);
});

test('length buckets are player-voice ≤3′ · 3–10′ · 10–20′ · 20′+', () => {
  assert.deepEqual(
    PUTT_LENGTHS.map((row) => row.label),
    ['≤3′', '3–10′', '10–20′', '20′+'],
  );
});

test('putt lengths serialize and drop unknown ids', () => {
  assert.deepEqual(parsePuttLengths(null), []);
  assert.deepEqual(parsePuttLengths('inside_3,over_20,nope'), ['inside_3', 'over_20']);
  assert.equal(serializePuttLengths(['3_to_10', '10_to_20']), '3_to_10,10_to_20');
});

test('stepper trims extra length stats; bucket tap adds one putt', () => {
  const trimmed = setPuttCount({ putts: 3, lengths: ['inside_3', '3_to_10', 'over_20'] }, 1);
  assert.deepEqual(trimmed, { putts: 1, lengths: ['inside_3'] });
  const added = addPuttLength({ putts: 1, lengths: ['inside_3'] }, '10_to_20');
  assert.deepEqual(added, { putts: 2, lengths: ['inside_3', '10_to_20'] });
  const full = addPuttLength({ putts: 5, lengths: [] }, 'inside_3');
  assert.equal(full.putts, 5);
});

test('near / on green is live yards-to-green within 40 yd — never invented', () => {
  assert.equal(NEAR_GREEN_YD, 40);
  assert.equal(isNearOrOnGreen({ yards: 28, quality: 'good' }), true);
  assert.equal(isNearOrOnGreen({ yards: 40, quality: 'soft' }), true);
  assert.equal(isNearOrOnGreen({ yards: 41, quality: 'good' }), false);
  assert.equal(isNearOrOnGreen({ yards: 12, quality: 'none' }), false);
  assert.equal(isNearOrOnGreen({ yards: null, quality: 'good' }), false);
});

test('Hole done advances to the next hole, or summary after the last', () => {
  assert.deepEqual(holeAfterDone(1, 18), { kind: 'hole', holeNumber: 2 });
  assert.deepEqual(holeAfterDone(9, 9), { kind: 'summary' });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });
});
