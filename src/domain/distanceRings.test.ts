import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { haversineYards } from './haversine';
import {
  DISTANCE_RING_ARC_HALF_DEG,
  DISTANCE_RING_ARC_STEP_DEG,
  DISTANCE_RING_YARDS,
  planDistanceRings,
  yardsToGreenIsTrusted,
} from './distanceRings';

/**
 * Synthetic grid only. Not a course, not a green, not a round GPS fix.
 * Offsets exist so the arc has a direction to test.
 */
const center = { lat: 1.5, lng: 1.5 };
const ahead = { lat: 1.52, lng: 1.5 };
const trusted = { yards: 400, quality: 'good' as const };

const pointsPerRing = (DISTANCE_RING_ARC_HALF_DEG * 2) / DISTANCE_RING_ARC_STEP_DEG + 1;

test('distance rings stay hidden without trusted yards-to-green or a real green', () => {
  assert.equal(yardsToGreenIsTrusted(null), false);
  assert.equal(yardsToGreenIsTrusted({ yards: null, quality: 'none' }), false);
  assert.equal(yardsToGreenIsTrusted({ yards: 150, quality: 'none' }), false);
  assert.equal(yardsToGreenIsTrusted({ yards: 150, quality: 'forced' }), false);
  assert.equal(yardsToGreenIsTrusted({ yards: null, quality: 'good' }), false);
  assert.equal(yardsToGreenIsTrusted({ yards: 0, quality: 'good' }), false);
  assert.equal(yardsToGreenIsTrusted({ yards: Number.NaN, quality: 'soft' }), false);
  assert.equal(yardsToGreenIsTrusted(trusted), true);
  assert.equal(yardsToGreenIsTrusted({ yards: 120, quality: 'soft' }), true);

  assert.deepEqual(planDistanceRings({ center, green: ahead, yardsToGreen: { yards: null, quality: 'none' } }), []);
  assert.deepEqual(planDistanceRings({ center, green: ahead, yardsToGreen: { yards: 180, quality: 'none' } }), []);
  assert.deepEqual(planDistanceRings({ center, green: ahead, yardsToGreen: { yards: 180, quality: 'forced' } }), []);
  assert.deepEqual(planDistanceRings({ center, green: ahead, yardsToGreen: null }), []);
  assert.deepEqual(planDistanceRings({ center, green: null, yardsToGreen: trusted }), []);
  assert.deepEqual(planDistanceRings({ center, green: { lat: 0, lng: 0 }, yardsToGreen: trusted }), []);
  assert.deepEqual(planDistanceRings({ center: null, green: ahead, yardsToGreen: trusted }), []);
  assert.deepEqual(
    planDistanceRings({ center: { lat: Number.NaN, lng: 1.5 }, green: ahead, yardsToGreen: trusted }),
    [],
  );
  assert.deepEqual(planDistanceRings({ center, green: center, yardsToGreen: trusted }), []);
});

test('distance rings are 100 / 150 / 200 arcs from the given fix toward the given point', () => {
  const rings = planDistanceRings({ center, green: ahead, yardsToGreen: trusted });
  assert.deepEqual(
    rings.map((ring) => ring.yards),
    [...DISTANCE_RING_YARDS],
  );
  const centerToAhead = haversineYards(center, ahead);
  for (const ring of rings) {
    assert.equal(ring.points.length, pointsPerRing);
    assert.deepEqual(ring.labelAt, ring.points[(pointsPerRing - 1) / 2]);
    assert.notDeepEqual(ring.labelAt, ahead);
    assert.ok(haversineYards(ring.labelAt, ahead) < centerToAhead);
    assert.ok(haversineYards(ring.labelAt, ahead) < haversineYards(ring.points[0], ahead));
    for (const point of ring.points) {
      const yards = haversineYards(center, point);
      assert.ok(Math.abs(yards - ring.yards) < 1, `${ring.yards} ring point was ${yards} yd`);
    }
  }

  const soft = planDistanceRings({
    center,
    green: ahead,
    yardsToGreen: { yards: 220, quality: 'soft' },
  });
  assert.deepEqual(
    soft.map((ring) => ring.yards),
    [...DISTANCE_RING_YARDS],
  );
});

test('phone hole map draws rings on the existing MapView from the fix it already has', () => {
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const mapView = map.slice(map.indexOf('<MapView'), map.indexOf('</MapView>'));

  assert.match(map, /planDistanceRings/);
  assert.match(mapView, /distance-ring-/);
  assert.match(map, /center: userFix \? \{ lat: userFix\.lat, lng: userFix\.lng \} : null/);
  assert.doesNotMatch(map, /expo-location|watchFixes|getCurrentPositionAsync|watchPositionAsync/);
  assert.equal(hole.match(/useLiveFix\(/g)?.length, 1);
});
