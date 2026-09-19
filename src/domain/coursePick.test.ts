import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  COURSE_SEARCH_PLACEHOLDER,
  canStartRound,
  canStartWithoutCourse,
  canStartWithoutTeeWhenCourseHasTees,
  courseListPutsPlayedOnTop,
  courseNameIsOptional,
  courseSearchPlaceholder,
  courseSearchQueryParam,
  courseSearchSharesNearbyList,
  courseSearchUsesMarkGates,
  courseSearchUsesPhoneFix,
  courseSearchUsesWatchGps,
  freeTextCourseStartAllowed,
  parseCourseSearchQuery,
  planCourseList,
  planCourseSearchParams,
} from './coursePick';
import {
  nearbyCoursesHasSearchBox,
  nearbyCoursesUsesMarkGates,
  nearbyCoursesUsesPhoneFixOnly,
  nearbyCoursesUsesWatchFix,
} from './watchNearby';

test('start 9/18 needs a real course and a tee when the course has tees', () => {
  assert.equal(courseNameIsOptional(), false);
  assert.equal(canStartWithoutCourse(), false);
  assert.equal(freeTextCourseStartAllowed(), false);
  assert.equal(canStartWithoutTeeWhenCourseHasTees(), false);

  assert.equal(canStartRound({}), false);
  assert.equal(canStartRound({ picked: null, teeCount: 0, pickedTee: null }), false);
  assert.equal(canStartRound({ picked: { id: '' }, teeCount: 0, pickedTee: null }), false);
  assert.equal(canStartRound({ picked: { id: 'c1' }, teeCount: null, pickedTee: null }), false);
  assert.equal(canStartRound({ picked: { id: 'c1' }, teeCount: 2, pickedTee: null }), false);
  assert.equal(canStartRound({ picked: { id: 'c1' }, teeCount: 1, pickedTee: { name: '' } }), false);
  assert.equal(canStartRound({ picked: { id: 'c1' }, teeCount: 1, pickedTee: { name: 'Blue' } }), true);
  assert.equal(canStartRound({ picked: { id: 'c1' }, teeCount: 0, pickedTee: null }), true);
});

test('search placeholder is name/city/state/zip and never optional', () => {
  assert.equal(courseSearchPlaceholder(), 'Search by name, city, state, or zip');
  assert.equal(COPY.courseNamePlaceholder, COURSE_SEARCH_PLACEHOLDER);
  assert.equal(COPY.courseNamePlaceholder, 'Search by name, city, state, or zip');
  assert.doesNotMatch(COPY.courseNamePlaceholder, /optional/i);
  assert.doesNotMatch(COPY.nearbyUnavailable, /type a course name/i);
  assert.doesNotMatch(COPY.nearbyEmptyHint, /type a course name/i);
  assert.doesNotMatch(JSON.stringify(COPY), /Course name \(optional\)/);
  assert.doesNotMatch(JSON.stringify(COPY), /type a course name to start/i);
  assert.equal(courseSearchQueryParam(), 'q');
  assert.deepEqual(planCourseSearchParams('  pebble  '), { q: 'pebble' });
  assert.deepEqual(planCourseSearchParams('90210'), { q: '90210' });
  assert.deepEqual(planCourseSearchParams('Austin, TX'), { q: 'Austin, TX' });
  assert.equal(planCourseSearchParams('   '), null);
  assert.equal(parseCourseSearchQuery(''), null);
  assert.equal(courseSearchUsesWatchGps(), false);
  assert.equal(courseSearchUsesPhoneFix(), false);
  assert.equal(courseSearchUsesMarkGates(), false);
});

test('one course list puts played courses on top', () => {
  assert.equal(courseListPutsPlayedOnTop(), true);
  assert.equal(courseSearchSharesNearbyList(), true);
  const nearby = [
    { id: 'new', name: 'New CC' },
    { id: 'pebble', name: 'Pebble Beach' },
    { id: 'old', name: 'Old CC' },
  ];
  const listed = planCourseList({
    courses: nearby,
    lastPlayedAtByCourse: {
      pebble: '2026-09-18T16:00:00.000Z',
      old: '2026-09-10T16:00:00.000Z',
    },
  });
  assert.deepEqual(
    listed.map((row) => row.id),
    ['pebble', 'old', 'new'],
  );
});

test('home cannot start without a pick and has no free-text course start', () => {
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /canStartRound\(/);
  assert.match(home, /disabled=\{starting \|\| !canStart\}/);
  assert.doesNotMatch(home, /courseName\.trim\(\) \|\| null/);
  assert.doesNotMatch(home, /startRound\(db, holeCount, name\)/);
  assert.match(home, /COPY\.courseNamePlaceholder/);
  assert.match(home, /planCourseSearchParams|searchQuery/);
  assert.match(home, /if \(!canStart \|\| !picked\) return;/);

  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  assert.match(picker, /searchCourses/);
  assert.match(picker, /planCourseList/);
  assert.match(picker, /planCourseSearchParams/);
  assert.match(picker, /COPY\.courseNamePlaceholder/);
  const findFn = picker.slice(picker.indexOf('const onFind'), picker.indexOf('useEffect(() => {\n    onRefreshReady'));
  assert.match(findFn, /searchCourses\(params\.q\)/);
  assert.match(findFn, /nearbyCourses\(await getCurrentFix\(\)\)/);
  assert.doesNotMatch(findFn, /watchFix|Watch GPS|acceptFix/);

  const client = readFileSync(new URL('../course/client.ts', import.meta.url), 'utf8');
  assert.match(client, /searchCourses/);
  assert.match(client, /\/courses\?\$\{query\.toString\(\)\}/);
  assert.match(client, /q: params\.q/);

  const tree = [
    home,
    picker,
    readFileSync(new URL('./playerCopy.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../../README.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../../NOTES.md', import.meta.url), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(tree, /Course name \(optional\)/);
  assert.doesNotMatch(tree, /type a course name to start/i);
});

test('nearby is a phone fix; search is text/geocode and never Watch GPS or mark gates', () => {
  assert.equal(nearbyCoursesUsesPhoneFixOnly(), true);
  assert.equal(nearbyCoursesUsesWatchFix(), false);
  assert.equal(nearbyCoursesUsesMarkGates(), false);
  assert.equal(nearbyCoursesHasSearchBox(), false);
  assert.equal(courseSearchUsesWatchGps(), false);
  assert.equal(courseSearchUsesPhoneFix(), false);
  assert.equal(courseSearchUsesMarkGates(), false);

  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  const findFn = picker.slice(picker.indexOf('const onFind'), picker.indexOf('useEffect(() => {\n    onRefreshReady'));
  assert.match(findFn, /nearbyCourses\(await getCurrentFix\(\)\)/);
  assert.doesNotMatch(findFn, /watchFix|preferWatchFix|acceptFix|forceMark|classifyAccuracyM/);

  const client = readFileSync(new URL('../course/client.ts', import.meta.url), 'utf8');
  const searchFn = client.slice(client.indexOf('async searchCourses'), client.indexOf('async getCourse'));
  assert.match(searchFn, /q: params\.q/);
  assert.doesNotMatch(searchFn, /lat=|lng=|acceptFix|forceMark|watchFix/);

  const watch = readFileSync(new URL('./watchNearby.ts', import.meta.url), 'utf8');
  assert.match(watch, /phoneFixForNearbyCourses/);
  assert.match(watch, /void args\.watchFix/);
});
