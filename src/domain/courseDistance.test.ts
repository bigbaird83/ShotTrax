import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_COURSE_DISTANCE_UNIT,
  formatCourseDistance,
  parseCourseDistanceUnit,
} from './courseDistance';

test('nearby course distance defaults to miles', () => {
  assert.equal(DEFAULT_COURSE_DISTANCE_UNIT, 'mi');
  assert.equal(parseCourseDistanceUnit(null), 'mi');
  assert.equal(parseCourseDistanceUnit('km'), 'km');
  assert.equal(parseCourseDistanceUnit('nope'), 'mi');
});

test('13.0 km nearby distance shows as 8.1 mi by default', () => {
  assert.equal(formatCourseDistance(13_000), '8.1 mi');
  assert.equal(formatCourseDistance(13_000, 'mi'), '8.1 mi');
  assert.equal(formatCourseDistance(13_000, 'km'), '13.0 km');
});

test('missing nearby distance stays blank — never invented from GPS', () => {
  assert.equal(formatCourseDistance(null), null);
  assert.equal(formatCourseDistance(Number.NaN, 'km'), null);
  assert.equal(formatCourseDistance(-1, 'mi'), null);
});

test('short nearby distances are under 1 mi or under 1 km', () => {
  assert.equal(formatCourseDistance(400, 'mi'), '< 1 mi');
  assert.equal(formatCourseDistance(400, 'km'), '< 1 km');
});
