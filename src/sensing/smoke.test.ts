import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD, SOFT_GPS_MAX_M, SOFT_GPS_MIN_M, WALK_BLOCK } from '../config/sensing';
import { haversineYards } from '../domain/haversine';
import type { GpsFix } from '../domain/types';
import { acceptFix, forceMark } from './gates';

function fixAt(lat: number, lng: number, accuracyM: number): GpsFix {
  return {
    lat,
    lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp: 0,
  };
}

const origin = { lat: 37, lng: -122 };

function north(meters: number) {
  return { lat: origin.lat + meters / 111_320, lng: origin.lng };
}

test('smoke 1: acceptFix good GPS (<15 m) → good', () => {
  const result = acceptFix(fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M - 0.1));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.fixQuality, 'good');
});

test('smoke 2: acceptFix soft GPS (15–25 m) → soft, kept', () => {
  const lo = acceptFix(fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M));
  const hi = acceptFix(fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M));
  assert.equal(lo.ok, true);
  assert.equal(hi.ok, true);
  if (lo.ok) assert.equal(lo.fixQuality, 'soft');
  if (hi.ok) assert.equal(hi.fixQuality, 'soft');
});

test('smoke 3: acceptFix poor GPS (>25 m) needs forceMark', () => {
  const result = acceptFix(fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M + 0.1));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'poor_gps');
});

test('smoke 4: forceMark on poor GPS → forced (still counted)', () => {
  const result = forceMark(fixAt(origin.lat, origin.lng, 40));
  assert.equal(result.ok, true);
  assert.equal(result.fixQuality, 'forced');
});

test('smoke 5: acceptFix distance > MAX_SHOT_YD needs forceMark', () => {
  const far = north((MAX_SHOT_YD + 30) * 0.9144);
  const result = acceptFix(fixAt(far.lat, far.lng, 5), origin);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'impossible_jump');
    assert.ok(result.yards > MAX_SHOT_YD);
  }
});

test('smoke 6: forceMark on jump logs yards as forced', () => {
  const far = north((MAX_SHOT_YD + 30) * 0.9144);
  const result = forceMark(fixAt(far.lat, far.lng, 5), origin);
  assert.equal(result.fixQuality, 'forced');
  assert.equal(result.impossibleJump, true);
  assert.ok((result.yards ?? 0) > MAX_SHOT_YD);
});

test('smoke 7: WALK_BLOCK is false — walking-length yards are accepted', () => {
  assert.equal(WALK_BLOCK, false);
  const walk = north(15); // ~16 yd
  const yards = haversineYards(origin, walk);
  assert.ok(yards > 0 && yards < 30);
  const result = acceptFix(fixAt(walk.lat, walk.lng, 6), origin);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.impossibleJump, false);
    assert.ok((result.yards ?? 0) > 0);
  }
});

test('smoke 8: confirm mark → next mark logs haversine yards', () => {
  const end = north(150);
  const result = acceptFix(fixAt(end.lat, end.lng, 8), origin);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.yards, Math.round(haversineYards(origin, end)));
    assert.equal(result.fixQuality, 'good');
  }
});
