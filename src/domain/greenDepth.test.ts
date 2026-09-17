import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFmbRow, hasApiFmb, yardsToGreenDepth, emptyGreenDepth } from './greenDepth';

const middle = { lat: 37.01, lng: -86.43 };
const front = { lat: 37.0104, lng: -86.43 };
const back = { lat: 37.0096, lng: -86.43 };
const fix = {
  lat: 37.0,
  lng: -86.43,
  accuracyM: 5,
  mocked: false,
  isSimulator: false,
  timestamp: 0,
};

test('F/M/B is API-depth only — a lone centroid never invents front or back', () => {
  assert.equal(hasApiFmb(emptyGreenDepth()), false);
  assert.equal(
    hasApiFmb({ front: null, middle, back: null, depthYards: 32 }),
    false,
  );
  assert.equal(hasApiFmb({ front, middle, back, depthYards: 32 }), true);
});

test('yardsToGreenDepth leaves missing pins blank', () => {
  const yards = yardsToGreenDepth(fix, { front: null, middle, back: null, depthYards: null });
  assert.equal(yards.front, null);
  assert.equal(yards.back, null);
  assert.ok(yards.middle && yards.middle.yards != null);
  assert.equal(formatFmbRow(yards), null);
});

test('F/M/B row only when all three API pins exist', () => {
  const yards = yardsToGreenDepth(fix, { front, middle, back, depthYards: 28 });
  const row = formatFmbRow(yards);
  assert.ok(row);
  assert.notEqual(row.f, undefined);
  assert.notEqual(row.m, undefined);
  assert.notEqual(row.b, undefined);
});
