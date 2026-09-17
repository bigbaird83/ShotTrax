import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD, SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { haversineYards, roundYards } from '../domain/haversine';
import type { GpsFix } from '../domain/types';
import { lastClosedShotYards, resolveDistanceTarget } from '../domain/rankClubs';
import { yardsToGreen } from './yardsToGreen';
import { acceptFix } from './gates';

function fixAt(lat: number, lng: number, accuracyM: number | null): GpsFix {
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
const green = { lat: 37 + 150 / 111_320, lng: -122 };

test('yardsToGreen: no fix → no number, quality none (does not fake range)', () => {
  assert.deepEqual(yardsToGreen(null, green), { yards: null, quality: 'none' });
});

test('yardsToGreen: no green centroid → no number, quality none (does not fake green)', () => {
  assert.deepEqual(yardsToGreen(fixAt(origin.lat, origin.lng, 8), null), {
    yards: null,
    quality: 'none',
  });
  assert.deepEqual(yardsToGreen(fixAt(origin.lat, origin.lng, 8), { lat: 0, lng: 0 }), {
    yards: null,
    quality: 'none',
  });
});

test('yardsToGreen: same good/soft bands as acceptFix / shot marks', () => {
  const expected = roundYards(haversineYards(origin, green));
  const goodFix = fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M - 0.1);
  const softLo = fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M);
  const softHi = fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M);
  const poorFix = fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M + 0.1);

  const goodMark = acceptFix(goodFix);
  const softMark = acceptFix(softLo);
  const poorMark = acceptFix(poorFix);
  assert.equal(goodMark.ok, true);
  assert.equal(softMark.ok, true);
  assert.equal(poorMark.ok, false);

  assert.deepEqual(yardsToGreen(goodFix, green), { yards: expected, quality: 'good' });
  assert.deepEqual(yardsToGreen(softLo, green), { yards: expected, quality: 'soft' });
  assert.deepEqual(yardsToGreen(softHi, green), { yards: expected, quality: 'soft' });
  assert.deepEqual(yardsToGreen(poorFix, green), { yards: null, quality: 'none' });
  assert.deepEqual(yardsToGreen(fixAt(origin.lat, origin.lng, null), green), {
    yards: null,
    quality: 'none',
  });
});

test('yardsToGreen remaining distance is not gated by MAX_SHOT_YD', () => {
  const far = { lat: origin.lat + ((MAX_SHOT_YD + 80) * 0.9144) / 111_320, lng: origin.lng };
  const result = yardsToGreen(fixAt(origin.lat, origin.lng, 6), far);
  assert.equal(result.quality, 'good');
  assert.ok((result.yards ?? 0) > MAX_SHOT_YD);
});

test('top-3 D uses yardsToGreen only when quality !== none', () => {
  const good = yardsToGreen(fixAt(origin.lat, origin.lng, 8), green);
  assert.equal(good.quality, 'good');
  assert.deepEqual(resolveDistanceTarget({ toGreen: good, lastClosedYards: 260 }), {
    source: 'yards_to_green',
    dYards: good.yards,
  });

  const poor = yardsToGreen(fixAt(origin.lat, origin.lng, 40), green);
  assert.equal(poor.quality, 'none');
  assert.deepEqual(resolveDistanceTarget({ toGreen: poor, lastClosedYards: 260 }), {
    source: 'last_closed_shot',
    dYards: 260,
  });

  const missing = yardsToGreen(null, green);
  assert.deepEqual(
    resolveDistanceTarget({
      toGreen: missing,
      lastClosedYards: lastClosedShotYards([{ endedAt: 'a', distanceYards: 148, source: 'gps' }]),
    }),
    { source: 'last_closed_shot', dYards: 148 },
  );
});
