import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidLatLng } from './latLng';
import { resolveGreenPin, yardsToGreenLabel } from './yardsToGreen';

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

test('yardsToGreenLabel shows — when quality is none', () => {
  const copy = yardsToGreenLabel(
    { yards: null, quality: 'none' },
    { hasFix: true, hasGreen: false },
  );
  assert.equal(copy.value, '—');
  assert.match(copy.detail, /unavailable/i);
});

test('yardsToGreenLabel badges soft when quality is soft', () => {
  const copy = yardsToGreenLabel({ yards: 164, quality: 'soft' });
  assert.equal(copy.value, '164 yd');
  assert.match(copy.detail, /SOFT/);
});
