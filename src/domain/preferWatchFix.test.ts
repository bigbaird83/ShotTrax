import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { acceptFix } from '../sensing/gates';
import { preferWatchFix, watchFixFromPick, WATCH_FIX_MAX_AGE_SEC } from './preferWatchFix';
import type { GpsFix } from './types';

function fix(partial: Partial<GpsFix> & { lat: number; lng: number }): GpsFix {
  return {
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: 1_000_000,
    ...partial,
  };
}

test('prefers a fresh Watch fix that is at least as accurate as the phone', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 4, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 10, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_002_000 });
  assert.equal(result.usedWatch, true);
  assert.equal(result.fix, watch);
});

test('falls back to phone when Watch fix is stale', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 3, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 10, timestamp: 1_010_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_005_000 });
  assert.equal(result.usedWatch, false);
  assert.equal(result.fix, phone);
});

test('falls back to phone when Watch accuracy is worse', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 12, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 5, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, false);
  assert.equal(result.fix, phone);
});

test('rejects Watch accuracy of 0 and uses phone', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 0, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 8, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, false);
  assert.equal(result.fix, phone);
});

test('falls back to phone when phone accuracy is unknown', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 4, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: null, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, false);
  assert.equal(result.fix, phone);
});

test('uses Watch when phone fix is missing', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 6, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: null, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, true);
  assert.equal(result.fix, watch);
});

test('equal accuracy prefers Watch (accuracyM <= phone)', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 8, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 8, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: phone, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, true);
  assert.equal(result.fix, watch);
});

test('ageSec of exactly 3s still prefers Watch', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 4, timestamp: 1_000_000 });
  const phone = fix({ lat: 3, lng: 4, accuracyM: 10, timestamp: 1_000_000 });
  const result = preferWatchFix({
    watchFix: watch,
    phoneFix: phone,
    nowMs: 1_000_000 + WATCH_FIX_MAX_AGE_SEC * 1000,
  });
  assert.equal(WATCH_FIX_MAX_AGE_SEC, 3);
  assert.equal(result.usedWatch, true);
  assert.equal(result.fix, watch);
});

test('no Watch and no phone → markFix is null (never invent)', () => {
  const result = preferWatchFix({ watchFix: null, phoneFix: null, nowMs: 1_000_000 });
  assert.equal(result.usedWatch, false);
  assert.equal(result.fix, null);
});

test('preferred Watch fix still uses acceptFix bands — soft auto-accepts, poor needs force', () => {
  const softWatch = fix({ lat: 1, lng: 2, accuracyM: SOFT_GPS_MIN_M, timestamp: 1_000_000 });
  const worsePhone = fix({ lat: 3, lng: 4, accuracyM: SOFT_GPS_MAX_M, timestamp: 1_000_000 });
  const soft = preferWatchFix({ watchFix: softWatch, phoneFix: worsePhone, nowMs: 1_001_000 });
  assert.equal(soft.usedWatch, true);
  const softAccept = acceptFix(soft.fix!);
  assert.equal(softAccept.ok, true);
  if (softAccept.ok) assert.equal(softAccept.fixQuality, 'soft');

  const poorWatch = fix({ lat: 1, lng: 2, accuracyM: SOFT_GPS_MAX_M + 1, timestamp: 1_000_000 });
  const poorerPhone = fix({ lat: 3, lng: 4, accuracyM: 80, timestamp: 1_000_000 });
  const poor = preferWatchFix({ watchFix: poorWatch, phoneFix: poorerPhone, nowMs: 1_001_000 });
  assert.equal(poor.usedWatch, true);
  const poorAccept = acceptFix(poor.fix!);
  assert.equal(poorAccept.ok, false);
  if (!poorAccept.ok) assert.equal(poorAccept.reason, 'poor_gps');
});

test('watchFixFromPick requires lat/lng — never invents a coordinate', () => {
  assert.equal(watchFixFromPick({ at: '2026-09-17T18:00:00.000Z' }), null);
  const fromPick = watchFixFromPick({
    lat: 37,
    lng: -122,
    accuracyM: 5,
    at: '2026-09-17T18:00:00.000Z',
  });
  assert.equal(fromPick?.lat, 37);
  assert.equal(fromPick?.accuracyM, 5);
});
