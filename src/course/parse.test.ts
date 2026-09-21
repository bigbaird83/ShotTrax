import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mergeGreenCenters,
  parseCourseDetail,
  parseCourseLocation,
  parseGreenCenters,
  parseGreenCentroid,
  parseHoleTee,
  parseHandicap,
  parseLatLng,
  parseNearbyCourses,
  parsePar,
  parseTeeSets,
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

test('parseLatLng keeps [lat,lng] and recovers GeoJSON [lng,lat] that we used to drop', () => {
  assert.deepEqual(parseLatLng({ lat: 35.0277, lng: -92.0316 }), { lat: 35.0277, lng: -92.0316 });
  assert.deepEqual(parseLatLng([35.0277, -92.0316]), { lat: 35.0277, lng: -92.0316 });
  assert.deepEqual(parseLatLng([-92.0316, 35.0277]), { lat: 35.0277, lng: -92.0316 });
  assert.equal(parseLatLng([0, 0]), null);
});

test('parseGreenCenters reads green_centers rows so Cypress coords are not dropped', () => {
  const greens = parseGreenCenters({
    data: {
      course_id: 99,
      green_centers: [{ hole: 1, lat: 35.0279, lng: -92.0288 }],
    },
  });
  assert.equal(greens.length, 1);
  assert.deepEqual(greens[0].greenCentroid, { lat: 35.0279, lng: -92.0288 });
});

test('parseHoleTee reads tee_location / teebox_center aliases', () => {
  assert.deepEqual(parseHoleTee({ tee_location: { lat: 35.0203, lng: -92.0308 } }), {
    lat: 35.0203,
    lng: -92.0308,
  });
  assert.deepEqual(parseHoleTee({ teebox_center: { latitude: 35.0203, longitude: -92.0308 } }), {
    lat: 35.0203,
    lng: -92.0308,
  });
});

test('parseHoleTee reads the tee coordinate and never the green or the phone', () => {
  assert.deepEqual(parseHoleTee({ lat: 37, lng: -122 }), { lat: 37, lng: -122 });
  assert.deepEqual(parseHoleTee({ tee_lat: 37.0, tee_lng: -122.0 }), { lat: 37.0, lng: -122.0 });
  assert.deepEqual(parseHoleTee({ tee: { latitude: 37.0, longitude: -122.0 } }), {
    lat: 37.0,
    lng: -122.0,
  });
  assert.equal(parseHoleTee({ green_lat: 34.11, green_lng: -85.64, lat: 37, lng: -122 }), null);
  assert.equal(parseHoleTee({}), null);
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
              { hole: 1, par: 4, yards: 437, handicap: 7 },
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
  assert.equal(detail?.city, 'Bowling Green');
  assert.equal(detail?.state, 'Kentucky');
  assert.deepEqual(detail?.location, { lat: 37.0132, lng: -86.43378 });
  assert.equal(detail?.holeCount, 18);
  assert.equal(detail?.greenCentersAvailable, true);
  assert.equal(detail?.holes[0].par, 4);
  assert.equal(detail?.holes[0].yards, 437);
  assert.equal(detail?.holes[0].handicap, 7);
  assert.equal(detail?.tees.length, 1);
  assert.equal(detail?.tees[0].name, 'Gold');
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
  assert.equal(greens[0].greenFront, null);
  assert.equal(greens[0].greenBack, null);
  assert.equal(greens[0].greenDepthYards, null);
});

test('parseGreenCenters copies F/M/B only when the API supplies them — never invents', () => {
  const greens = parseGreenCenters({
    data: {
      holes: [
        {
          hole: 1,
          lat: 37.01744,
          lng: -86.43135,
          front: { lat: 37.0178, lng: -86.43135 },
          back: { lat: 37.0171, lng: -86.43135 },
          depth_yards: 28,
        },
      ],
    },
  });
  assert.deepEqual(greens[0].greenFront, { lat: 37.0178, lng: -86.43135 });
  assert.deepEqual(greens[0].greenBack, { lat: 37.0171, lng: -86.43135 });
  assert.equal(greens[0].greenDepthYards, 28);
});

test('mergeGreenCenters fills blank greens and does not invent par', () => {
  const merged = mergeGreenCenters(
    [
      { holeNumber: 1, par: 4, yards: 437, handicap: 7, greenCentroid: null, greenFront: null, greenBack: null, greenDepthYards: null, teeCentroid: null },
      { holeNumber: 2, par: null, yards: null, handicap: null, greenCentroid: null, greenFront: null, greenBack: null, greenDepthYards: null, teeCentroid: null },
    ],
    [{ holeNumber: 1, greenCentroid: { lat: 37.01, lng: -86.43 }, greenFront: null, greenBack: null, greenDepthYards: null }],
  );
  assert.deepEqual(merged[0].greenCentroid, { lat: 37.01, lng: -86.43 });
  assert.equal(merged[0].par, 4);
  assert.equal(merged[0].handicap, 7);
  assert.equal(merged[1].par, null);
  assert.equal(merged[1].greenCentroid, null);
});

test('parseHandicap is SI 1–18 or blank — never invented', () => {
  assert.equal(parseHandicap({}), null);
  assert.equal(parseHandicap({ handicap: 7 }), 7);
  assert.equal(parseHandicap({ si: 18 }), 18);
  assert.equal(parseHandicap({ handicap: 0 }), null);
  assert.equal(parseHandicap({ handicap: 19 }), null);
});

test('parseTeeSets keeps rating/slope/yards when present and blank otherwise', () => {
  const tees = parseTeeSets({
    scorecard: {
      teeboxes: [
        {
          name: 'Gold',
          rating: 73.3,
          slope: 128,
          total_yards: 6800,
          holes: [{ hole: 1, par: 4, yards: 437, handicap: 7 }, { hole: 2 }],
        },
        { name: 'Red', holes: [{ hole: 1, par: 4 }] },
      ],
    },
  });
  assert.equal(tees.length, 2);
  assert.equal(tees[0].name, 'Gold');
  assert.equal(tees[0].rating, 73.3);
  assert.equal(tees[0].slope, 128);
  assert.equal(tees[0].totalYards, 6800);
  assert.equal(tees[0].holes[0].handicap, 7);
  assert.equal(tees[0].holes[1].par, null);
  assert.equal(tees[0].holes[1].handicap, null);
  assert.equal(tees[1].rating, null);
  assert.equal(tees[1].slope, null);
});

test('parseTeeSets skips unnamed teeboxes and does not invent Tee 1', () => {
  const tees = parseTeeSets({
    scorecard: {
      teeboxes: [{ holes: [{ hole: 1, par: 4, yards: 400 }] }, { name: 'White', holes: [{ hole: 1, par: 4 }] }],
    },
  });
  assert.equal(tees.length, 1);
  assert.equal(tees[0].name, 'White');
});

test('parseTeeSets does not copy women fields into men rating/slope/SI', () => {
  const tees = parseTeeSets({
    scorecard: {
      teeboxes: [
        {
          name: 'Red',
          rating_women: 71.2,
          slope_women: 120,
          holes: [{ hole: 1, par: 4, handicap_women: 9 }],
        },
      ],
    },
  });
  assert.equal(tees[0].rating, null);
  assert.equal(tees[0].slope, null);
  assert.equal(tees[0].holes[0].handicap, null);
});

test('parseTeeSets blanks non-positive rating/slope — never invents', () => {
  const tees = parseTeeSets({
    scorecard: {
      teeboxes: [{ name: 'Gold', rating: 0, slope: 0, holes: [{ hole: 1, par: 4 }] }],
    },
  });
  assert.equal(tees[0].rating, null);
  assert.equal(tees[0].slope, null);
});
