import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD, SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import { isValidLatLng } from './latLng';
import { lastClosedShotYards, resolveDistanceTarget } from './rankClubs';
import {
  measureYardsToGreen,
  resolveGreenPin,
  yardsToGreenLabel,
} from './yardsToGreen';

const from = { lat: 37.0, lng: -122.0 };
const green = { lat: 37.0 + 150 / 111_320, lng: -122.0 };

test('isValidLatLng rejects missing, 0,0, and out-of-range — never invent a pin', () => {
  assert.equal(isValidLatLng(null), false);
  assert.equal(isValidLatLng(undefined), false);
  assert.equal(isValidLatLng({ lat: 0, lng: 0 }), false);
  assert.equal(isValidLatLng({ lat: 91, lng: 0.1 }), false);
  assert.equal(isValidLatLng({ lat: 37, lng: -122 }), true);
});

test('resolveGreenPin prefers user estimate, then course centroid, else null', () => {
  assert.equal(resolveGreenPin({ user: null, course: null }), null);
  assert.deepEqual(resolveGreenPin({ user: null, course: green }), {
    ...green,
    source: 'course_centroid',
  });
  assert.deepEqual(resolveGreenPin({ user: from, course: green }), {
    ...from,
    source: 'user_estimate',
  });
  assert.equal(resolveGreenPin({ user: { lat: 0, lng: 0 }, course: null }), null);
});

test('no green pin → yards to green unavailable; does not invent coordinates', () => {
  const result = measureYardsToGreen({ from, green: null, accuracyM: 8 });
  assert.equal(result.available, false);
  assert.equal(result.yards, null);
  assert.equal(result.reason, 'no_green');
  const copy = yardsToGreenLabel(result);
  assert.equal(copy.value, '—');
  assert.match(copy.detail, /unavailable/i);
});

test('green pin but no GPS → unavailable, still no invented phone coordinate', () => {
  const result = measureYardsToGreen({ from: null, green, accuracyM: null });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'no_gps');
  assert.equal(yardsToGreenLabel(result).value, '—');
});

test('haversine GPS → green pin; soft accuracy 15–25 m is classified soft', () => {
  const expected = roundYards(haversineYards(from, green));
  const good = measureYardsToGreen({ from, green, accuracyM: SOFT_GPS_MIN_M - 1 });
  const softLo = measureYardsToGreen({ from, green, accuracyM: SOFT_GPS_MIN_M });
  const softHi = measureYardsToGreen({ from, green, accuracyM: SOFT_GPS_MAX_M });
  const poor = measureYardsToGreen({ from, green, accuracyM: SOFT_GPS_MAX_M + 1 });
  assert.equal(good.available, true);
  assert.equal(good.yards, expected);
  assert.equal(good.accuracyClass, 'good');
  assert.equal(softLo.available, true);
  assert.equal(softLo.accuracyClass, 'soft');
  assert.equal(softHi.accuracyClass, 'soft');
  assert.equal(poor.available, true);
  assert.equal(poor.accuracyClass, 'poor');
  assert.equal(yardsToGreenLabel(softLo).detail.includes('SOFT'), true);
});

test('yards to green is not gated by MAX_SHOT_YD (remaining distance is not a shot)', () => {
  const far = { lat: from.lat + ((MAX_SHOT_YD + 80) * 0.9144) / 111_320, lng: from.lng };
  const result = measureYardsToGreen({ from, green: far, accuracyM: 6 });
  assert.equal(result.available, true);
  assert.ok((result.yards ?? 0) > MAX_SHOT_YD);
});

test('available yards-to-green is D for top-3 ranking', () => {
  const toGreen = measureYardsToGreen({ from, green, accuracyM: 18 });
  const target = resolveDistanceTarget({
    from,
    green,
    lastClosedYards: 260,
  });
  assert.equal(toGreen.available, true);
  assert.equal(target?.source, 'yards_to_green');
  assert.equal(target?.dYards, toGreen.yards);
});

test('without a green pin, ranking D falls back to last closed GPS shot — not an invented green', () => {
  const target = resolveDistanceTarget({
    from,
    green: null,
    lastClosedYards: lastClosedShotYards([{ endedAt: 'a', distanceYards: 148, source: 'gps' }]),
  });
  assert.deepEqual(target, { source: 'last_closed_shot', dYards: 148 });
});
