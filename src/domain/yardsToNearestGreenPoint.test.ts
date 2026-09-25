import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import { haversineYards } from './haversine';
import { yardsToNearestGreenPoint, type SavedGreenPoints } from './yardsToNearestGreenPoint';

const CENTER = { lat: 33.45, lng: -111.96 };

function moveNorth(origin: { lat: number; lng: number }, yards: number) {
  const dLat = ((yards * METERS_PER_YARD) / EARTH_RADIUS_M) * (180 / Math.PI);
  return { lat: origin.lat + dLat, lng: origin.lng };
}

/** Approach is south of center. Front sits 15 yards short of center, so 25 short of front is 40 from center. */
const FRONT = moveNorth(CENTER, -15);
const BACK = moveNorth(CENTER, 20);
const SHORT_OF_FRONT = moveNorth(FRONT, -25);
const PAST_BACK = moveNorth(BACK, 20);

function close(actual: number | null, expected: number) {
  assert.ok(actual != null, 'expected a distance');
  assert.ok(Math.abs(actual - expected) < 0.05, `got ${actual}, expected ~${expected}`);
}

test('nearest green point is the front when the start is short of it', () => {
  const greens: SavedGreenPoints = { front: FRONT, center: CENTER, back: BACK };
  close(yardsToNearestGreenPoint(SHORT_OF_FRONT, greens), 25);
  close(haversineYards(SHORT_OF_FRONT, CENTER), 40);
  assert.ok(haversineYards(SHORT_OF_FRONT, CENTER) > 30);
});

test('nearest green point is the back when the start is past it', () => {
  const greens: SavedGreenPoints = { front: FRONT, center: CENTER, back: BACK };
  close(yardsToNearestGreenPoint(PAST_BACK, greens), 20);
  close(haversineYards(PAST_BACK, CENTER), 40);
});

test('a hole with only a center point measures to that center', () => {
  const onlyCenter: SavedGreenPoints = { front: null, center: CENTER, back: null };
  const start = moveNorth(CENTER, 25);
  close(yardsToNearestGreenPoint(start, onlyCenter), 25);
  close(yardsToNearestGreenPoint(moveNorth(CENTER, 40), onlyCenter), 40);
});

test('no saved green point and no start skip the distance', () => {
  assert.equal(
    yardsToNearestGreenPoint(SHORT_OF_FRONT, { front: null, center: null, back: null }),
    null,
  );
  assert.equal(
    yardsToNearestGreenPoint(null, { front: FRONT, center: CENTER, back: BACK }),
    null,
  );
  assert.equal(yardsToNearestGreenPoint(SHORT_OF_FRONT, null), null);
  // Placeholder 0,0 is not a saved green.
  assert.equal(
    yardsToNearestGreenPoint(SHORT_OF_FRONT, { front: null, center: { lat: 0, lng: 0 }, back: null }),
    null,
  );
});

test('the helper does not read an OSM green outline', () => {
  const src = readFileSync(new URL('./yardsToNearestGreenPoint.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /paintCache|osmOverlay|COURSE_PAINT|greenOutline|overlay/i);
});
