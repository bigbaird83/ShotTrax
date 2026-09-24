import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  NEARBY_RADIUS_KM,
  NEARBY_RADIUS_M,
  NEARBY_RADIUS_MILES,
  milesToKm,
  withinNearbyRadius,
} from './nearbyRadius';

test('phone and Watch Search nearby use a 40 mile radius (≈ 64.4 km)', () => {
  assert.equal(NEARBY_RADIUS_MILES, 40);
  assert.equal(NEARBY_RADIUS_KM, 64.4);
  assert.equal(NEARBY_RADIUS_M, 64_400);
  assert.ok(Math.abs(milesToKm(40) - 64.37376) < 1e-9);
});

test('local filter keeps rows inside 40 mi, drops rows past it, keeps unknown distance', () => {
  const rows = [
    { id: 'a', distanceMeters: 1_000 },
    { id: 'b', distanceMeters: 64_000 },
    { id: 'c', distanceMeters: 64_401 },
    { id: 'd', distanceMeters: null },
  ];
  assert.deepEqual(withinNearbyRadius(rows).map((r) => r.id), ['a', 'b', 'd']);
  // 25 km (the old default) would have dropped a course 30 mi out.
  const thirtyMiles = { id: 'e', distanceMeters: 30 * 1609.344 };
  assert.deepEqual(withinNearbyRadius([thirtyMiles]).map((r) => r.id), ['e']);
});

test('no nearby caller hard-codes a smaller radius', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const client = read('../course/client.ts');
  assert.match(client, /DEFAULT_RADIUS_KM = NEARBY_RADIUS_KM/);
  assert.doesNotMatch(client, /DEFAULT_RADIUS_KM = 25/);
  for (const path of ['../services/watchHome.ts', '../services/watchNearby.ts', '../ui/CoursePicker.tsx']) {
    assert.doesNotMatch(read(path), /nearbyCourses\([^)]*,\s*\d/);
  }
});
