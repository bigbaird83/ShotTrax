import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachHoleFromCourse,
  formatParLabel,
  formatSiLabel,
  formatTeeHoleYards,
  formatTeeMeta,
  hole1TeeGreenFromCourse,
  roundHoleCountFromCourse,
  seedHoleFromCourse,
} from './layout';

test('hole1TeeGreenFromCourse copies card coords and never invents', () => {
  assert.deepEqual(
    hole1TeeGreenFromCourse({
      holes: [
        {
          holeNumber: 1,
          par: 4,
          yards: 380,
          handicap: 7,
          greenCentroid: { lat: 33.27, lng: -93.24 },
          greenFront: null,
          greenBack: null,
          greenDepthYards: null,
          teeCentroid: { lat: 33.27, lng: -93.241 },
        },
      ],
      tees: [],
    }),
    { tee: { lat: 33.27, lng: -93.241 }, green: { lat: 33.27, lng: -93.24 } },
  );
  assert.deepEqual(
    hole1TeeGreenFromCourse({
      holes: [{
        holeNumber: 1,
        par: 4,
        yards: null,
        handicap: null,
        greenCentroid: null,
        greenFront: null,
        greenBack: null,
        greenDepthYards: null,
        teeCentroid: null,
      }],
      tees: [],
    }),
    { tee: null, green: null },
  );
});

test('seedHoleFromCourse never invents par or green', () => {
  const blank = {
    par: null,
    parSource: null,
    yards: null,
    handicap: null,
    green: null,
    greenSource: null,
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
  };
  assert.deepEqual(seedHoleFromCourse(null), blank);
  assert.deepEqual(seedHoleFromCourse({ par: null, greenCentroid: { lat: 0, lng: 0 } }), blank);
  assert.deepEqual(
    seedHoleFromCourse({ par: 4, yards: 390, handicap: 1, greenCentroid: null }),
    { ...blank, par: 4, parSource: 'course', yards: 390, handicap: 1 },
  );
  assert.deepEqual(
    seedHoleFromCourse({ par: 4, greenCentroid: { lat: 37.01, lng: -86.43 } }),
    {
      par: 4,
      parSource: 'course',
      yards: null,
      handicap: null,
      green: { lat: 37.01, lng: -86.43 },
      greenSource: 'course_centroid',
      greenFront: null,
      greenBack: null,
      greenDepthYards: null,
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

test('formatParLabel is Par unknown when missing — never ?', () => {
  assert.equal(formatParLabel(null), 'Par unknown');
  assert.equal(formatParLabel(4), 'Par 4');
});

test('formatSiLabel is SI unknown when missing — never SI ?', () => {
  assert.equal(formatSiLabel(null), 'SI unknown');
  assert.equal(formatSiLabel(7), 'SI 7');
});

test('formatTeeMeta shows rating and slope in player voice', () => {
  assert.equal(formatTeeMeta({ name: 'Gold', rating: null, slope: null, totalYards: null }), 'Gold');
  assert.equal(
    formatTeeMeta({ name: 'Gold', rating: 73.3, slope: 128, totalYards: 6800 }),
    'Gold · Rating 73.3 · Slope 128 · 6800 yd',
  );
});

test('formatTeeHoleYards shows per-hole yards and blanks missing — never invents a total', () => {
  assert.equal(formatTeeHoleYards([]), null);
  assert.equal(
    formatTeeHoleYards([
      { holeNumber: 1, yards: null },
      { holeNumber: 2, yards: null },
    ]),
    null,
  );
  assert.equal(
    formatTeeHoleYards([
      { holeNumber: 1, yards: 437 },
      { holeNumber: 2, yards: null },
      { holeNumber: 3, yards: 185 },
    ]),
    '1 437 · 2 — · 3 185',
  );
});

test('roundHoleCountFromCourse only uses 9 or 18', () => {
  assert.equal(roundHoleCountFromCourse(9), 9);
  assert.equal(roundHoleCountFromCourse(18), 18);
  assert.equal(roundHoleCountFromCourse(null), 18);
  assert.equal(roundHoleCountFromCourse(27), 18);
});
