import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseCourseDetail,
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

test('parseNearbyCourses maps list payload and skips nameless rows', () => {
  const courses = parseNearbyCourses({
    data: [
      { id: 4, name: 'Bowling Green Country Club', city: 'Bowling Green', latitude: 37.01, longitude: -86.43 },
      { id: 9 },
    ],
  });
  assert.equal(courses.length, 1);
  assert.equal(courses[0].id, '4');
  assert.equal(courses[0].name, 'Bowling Green Country Club');
  assert.deepEqual(courses[0].location, { lat: 37.01, lng: -86.43 });
});

test('parseCourseDetail keeps missing par/green blank', () => {
  const detail = parseCourseDetail({
    id: 'c1',
    name: 'Test Course',
    holes: [
      { hole: 1, par: 4, green: { lat: 34.1, lng: -85.6 } },
      { hole: 2 },
    ],
  });
  assert.ok(detail);
  assert.equal(detail?.holes[0].par, 4);
  assert.deepEqual(detail?.holes[0].greenCentroid, { lat: 34.1, lng: -85.6 });
  assert.equal(detail?.holes[1].par, null);
  assert.equal(detail?.holes[1].greenCentroid, null);
});
