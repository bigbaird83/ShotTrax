import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OsmFeature } from '../course/types';
import {
  formatHazardCarry,
  hazardCarryAccessibilityLabel,
  planHazardCarries,
} from './hazardCarry';

const ORIGIN = { lat: 35.1, lng: -92.3 };
const YD = 0.9144;
const R = 6_371_000;

/** Point `east` / `north` yards from ORIGIN. Green is due north. */
function at(east: number, north: number) {
  const dLat = ((north * YD) / R) * (180 / Math.PI);
  const dLng = ((east * YD) / (R * Math.cos((ORIGIN.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: ORIGIN.lat + dLat, lng: ORIGIN.lng + dLng };
}

/** Closed box from (e1,n1) to (e2,n2). */
function box(kind: OsmFeature['kind'], e1: number, n1: number, e2: number, n2: number): OsmFeature {
  return {
    kind,
    holeNumber: null,
    coordinates: [at(e1, n1), at(e2, n1), at(e2, n2), at(e1, n2), at(e1, n1)],
  };
}

const fix = at(0, 0);
const green = at(0, 300);

test('reach and carry along the line to the green, nearest first', () => {
  const rows = planHazardCarries({
    fix,
    green,
    features: [
      box('bunker', 15, 230, 30, 250), // right
      box('water_hazard', -40, 180, 40, 205), // crosses the line
      box('bunker', -30, 270, -12, 285), // left, greenside
    ],
  });
  assert.deepEqual(rows, [
    { kind: 'water', side: 'center', reach: 180, carry: 205 },
    { kind: 'bunker', side: 'right', reach: 230, carry: 250 },
    { kind: 'bunker', side: 'left', reach: 270, carry: 285 },
  ]);
});

test('long edges are sampled — a hazard whose corners are out of the corridor still counts', () => {
  // Wide pond: all four corners are 60 yd off line, but the edges cross it.
  const rows = planHazardCarries({ fix, green, features: [box('lateral_water_hazard', -60, 120, 60, 140)] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.reach, 120);
  assert.equal(rows[0]?.carry, 140);
  assert.equal(rows[0]?.side, 'center');
});

test('out of play: far off line, behind the player, well past the green, or not a hazard', () => {
  const rows = planHazardCarries({
    fix,
    green,
    features: [
      box('bunker', 50, 200, 70, 220), // 50+ yd right
      box('bunker', -10, -40, 10, -20), // behind
      box('bunker', -10, 340, 10, 360), // 40+ past the green
      box('fairway', -20, 100, 20, 250),
      box('cartpath', -2, 0, 2, 300),
    ],
  });
  assert.deepEqual(rows, []);
});

test('no fix, no green, or no features → nothing (never a guessed hazard)', () => {
  const pond = [box('water_hazard', -10, 100, 10, 120)];
  assert.deepEqual(planHazardCarries({ fix: null, green, features: pond }), []);
  assert.deepEqual(planHazardCarries({ fix, green: null, features: pond }), []);
  assert.deepEqual(planHazardCarries({ fix, green, features: [] }), []);
});

test('at most three hazards', () => {
  const rows = planHazardCarries({
    fix,
    green,
    features: [50, 100, 150, 200].map((n) => box('bunker', -5, n, 5, n + 10)),
  });
  assert.deepEqual(
    rows.map((r) => r.reach),
    [50, 100, 150],
  );
});

test('labels', () => {
  assert.equal(formatHazardCarry({ kind: 'bunker', side: 'right', reach: 212, carry: 231 }), 'Bunker R · 212 / 231');
  assert.equal(formatHazardCarry({ kind: 'water', side: 'center', reach: 180, carry: 205 }), 'Water · 180 / 205');
  assert.equal(formatHazardCarry({ kind: 'water', side: 'left', reach: 150, carry: 150 }), 'Water L · 150');
  assert.equal(
    hazardCarryAccessibilityLabel({ kind: 'bunker', side: 'left', reach: 212, carry: 231 }),
    'Bunker on the left: 212 yards to reach, 231 to carry',
  );
});

test('play screen shows hazard carries from live GPS and OSM hazards only', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(page, /planHazardCarries\(\{\s*fix: \{ lat: fix\.lat, lng: fix\.lng \},\s*green,\s*features: featuresForHole\(overlay, holeNumber\)/);
  assert.match(page, /liveGpsToPin\.quality === 'none'/);
  assert.match(page, /testID="hazard-carries"/);
});
