import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preferWatchFix, watchFixFromPick } from './preferWatchFix';
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

test('uses Watch when phone fix is missing', () => {
  const watch = fix({ lat: 1, lng: 2, accuracyM: 6, timestamp: 1_000_000 });
  const result = preferWatchFix({ watchFix: watch, phoneFix: null, nowMs: 1_001_000 });
  assert.equal(result.usedWatch, true);
  assert.equal(result.fix, watch);
});

test('watchFixFromPick requires lat/lng', () => {
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
