import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachHoleFromCourse,
  formatParLabel,
  roundHoleCountFromCourse,
  seedHoleFromCourse,
} from './layout';

test('seedHoleFromCourse never invents par or green', () => {
  assert.deepEqual(seedHoleFromCourse(null), {
    par: null,
    parSource: null,
    green: null,
    greenSource: null,
  });
  assert.deepEqual(seedHoleFromCourse({ par: null, greenCentroid: { lat: 0, lng: 0 } }), {
    par: null,
    parSource: null,
    green: null,
    greenSource: null,
  });
  assert.deepEqual(
    seedHoleFromCourse({ par: 4, greenCentroid: { lat: 37.01, lng: -86.43 } }),
    {
      par: 4,
      parSource: 'course',
      green: { lat: 37.01, lng: -86.43 },
      greenSource: 'course_centroid',
    },
  );
});

test('attachHoleFromCourse fills blanks only and keeps user par/green', () => {
  const filled = attachHoleFromCourse(
    {
      par: null,
      parSource: null,
      greenLat: null,
      greenLng: null,
      greenSource: null,
    },
    { par: 5, greenCentroid: { lat: 37.01, lng: -86.43 } },
  );
  assert.equal(filled.par, 5);
  assert.equal(filled.parSource, 'course');
  assert.equal(filled.greenSource, 'course_centroid');

  const kept = attachHoleFromCourse(
    {
      par: 4,
      parSource: 'user',
      greenLat: 34.1,
      greenLng: -85.6,
      greenSource: 'user_estimate',
    },
    { par: 5, greenCentroid: { lat: 37.01, lng: -86.43 } },
  );
  assert.equal(kept.par, 4);
  assert.equal(kept.parSource, 'user');
  assert.deepEqual(kept.green, { lat: 34.1, lng: -85.6 });
  assert.equal(kept.greenSource, 'user_estimate');
});

test('formatParLabel is par ? when missing', () => {
  assert.equal(formatParLabel(null), 'par ?');
  assert.equal(formatParLabel(4), 'Par 4');
});

test('roundHoleCountFromCourse only uses 9 or 18', () => {
  assert.equal(roundHoleCountFromCourse(9), 9);
  assert.equal(roundHoleCountFromCourse(18), 18);
  assert.equal(roundHoleCountFromCourse(null), 18);
  assert.equal(roundHoleCountFromCourse(27), 18);
});
