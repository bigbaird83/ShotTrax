import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mergeGreenCenters,
  parseCourseDetail,
  parseCourseLocation,
  parseGreenCenters,
  parseGreenCentroid,
  parseNearbyCourses,
  parsePar,
} from './parse';

test('parsePar is blank when missing — never invents a par', () => {
  assert.equal(parsePar({}), null);
  assert.equal(parsePar({ par: null }), null);
  assert.equal(parsePar({ par: 4 }), 4);
  assert.equal(parsePar({ par: 2 }), null);
});

test('parseGreenCentroid ignores tee lat/lng and 0,0 — never invents a green', () => {
  assert.equal(parseGreenCentroid({ lat: 37, lng: -122 }), null);
  assert.equal(parseGreenCentroid({ green_lat: 0, green_lng: 0 }), null);
  assert.deepEqual(parseGreenCentroid({ green_lat: 34.11, green_lng: -85.64 }), {
    lat: 34.11,
    lng: -85.64,
  });
  assert.deepEqual(parseGreenCentroid({ green: { latitude: 34.11, longitude: -85.64 } }), {
    lat: 34.11,
    lng: -85.64,
  });
});

test('parseNearbyCourses maps list payload, distance_km, and skips nameless rows', () => {
  const courses = parseNearbyCourses({
    data: [
      {
        id: 4,
        name: 'Bowling Green Country Club',
        city: 'Bowling Green',
        latitude: 37.01,
        longitude: -86.43,
        distance_km: 0.09,
      },
      { id: 9 },
    ],
  });
  assert.equal(courses.length, 1);
  assert.equal(courses[0].id, '4');
  assert.equal(courses[0].name, 'Bowling Green Country Club');
  assert.deepEqual(courses[0].location, { lat: 37.01, lng: -86.43 });
  assert.equal(courses[0].distanceMeters, 90);
});

test('parseCourseDetail reads teeboxes scorecard and keeps missing par/green blank', () => {
  const detail = parseCourseDetail({
    data: {
      id: 4,
      name: 'Bowling Green Country Club',
      coordinates: { latitude: 37.0132, longitude: -86.43378 },
      location: { city: 'Bowling Green', state: 'Kentucky', country: { name: 'United States', iso2: 'US' } },
      scorecard: {
        hole_count: 18,
        teeboxes: [
          {
            name: 'Gold',
            holes: [
              { hole: 1, par: 4, yards: 437 },
              { hole: 2 },
            ],
          },
        ],
      },
      green_centers_available: true,
    },
  });
  assert.ok(detail);
  assert.equal(detail?.id, '4');
  assert.deepEqual(detail?.location, { lat: 37.0132, lng: -86.43378 });
  assert.equal(detail?.holeCount, 18);
  assert.equal(detail?.greenCentersAvailable, true);
  assert.equal(detail?.holes[0].par, 4);
  assert.equal(detail?.holes[0].greenCentroid, null);
  assert.equal(detail?.holes[1].par, null);
  assert.equal(detail?.holes[1].greenCentroid, null);
});

test('parseCourseLocation ignores address location objects', () => {
  assert.equal(
    parseCourseLocation({
      location: { city: 'Bowling Green', state: 'Kentucky' },
    }),
    null,
  );
});

test('parseGreenCenters maps Pro {hole,lat,lng} and skips invalid pins', () => {
  const greens = parseGreenCenters({
    data: {
      course_id: 4,
      holes: [
        { hole: 1, lat: 37.01744, lng: -86.43135 },
        { hole: 2, lat: 0, lng: 0 },
        { hole: 99, lat: 37.01, lng: -86.43 },
      ],
    },
  });
  assert.equal(greens.length, 1);
  assert.equal(greens[0].holeNumber, 1);
  assert.deepEqual(greens[0].greenCentroid, { lat: 37.01744, lng: -86.43135 });
});

test('mergeGreenCenters fills blank greens and does not invent par', () => {
  const merged = mergeGreenCenters(
    [
      { holeNumber: 1, par: 4, greenCentroid: null },
      { holeNumber: 2, par: null, greenCentroid: null },
    ],
    [{ holeNumber: 1, greenCentroid: { lat: 37.01, lng: -86.43 } }],
  );
  assert.deepEqual(merged[0].greenCentroid, { lat: 37.01, lng: -86.43 });
  assert.equal(merged[0].par, 4);
  assert.equal(merged[1].par, null);
  assert.equal(merged[1].greenCentroid, null);
});
