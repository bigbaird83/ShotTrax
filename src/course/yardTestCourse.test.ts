import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { catalogCourseDetail, catalogEntryById, nearbyLocalCatalog, searchLocalCatalog } from './catalog';
import { createCourseDataClient } from './client';
import { downloadFavoriteForOffline } from './offlineFavorite';
import {
  YARD_TEST_COURSE_ID,
  YARD_TEST_COURSE_SETTING_KEY,
  YARD_TEST_UNLOCK_SETTING_KEY,
  YARD_TEST_UNLOCK_TAPS,
  YARD_TEST_UNLOCK_WINDOW_MS,
  advanceYardTestUnlockTap,
  courseAllowsFavorite,
  coursesForWatchNearby,
  hydrateYardTestCourseFromSettings,
  parseYardTestCourseGeometry,
  resetYardTestCourseForTests,
  setYardTestCourseGateForTests,
  setYardTestCourseGeometryForTests,
  setYardTestCourseSwitch,
  setYardTestCourseUnlocked,
  yardTestCourseEnabled,
  yardTestCourseSettingsRowVisible,
  type YardTestGeometry,
  type YardTestUnlockTapState,
} from './yardTestCourse';
import { planCourseList } from '../domain/coursePick';
import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { STOCK_AVG_CARRY } from '../domain/defaultBag';
import { listFavorites, setFavorite, type JsonStore } from '../domain/favorites';
import { haversineYards } from '../domain/haversine';
import { rankClosestCarryIds } from '../domain/rankClubs';

/** Obviously synthetic. Not a place, and not a stand-in for any real hole. */
const FIXTURE: YardTestGeometry = {
  center: { lat: 0, lng: 1 },
  tee: { lat: 0, lng: 1 },
  green: { lat: 0.0004, lng: 1 },
  par: 3,
};
/** Inside the 1-mile radius of the fixture center. */
const NEAR = { lat: 0.004, lng: 1 };
/** Outside that mile, still inside a normal nearby search. */
const FAR = { lat: 0.03, lng: 1 };

const DEV = { dev: true, extraFlag: false };
const PROD = { dev: false, extraFlag: false };

function turnOn(gate = DEV) {
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests(gate);
  setYardTestCourseSwitch(true);
}

afterEach(() => resetYardTestCourseForTests());

test('production build: never listed, searched, or resolved — even with the switch set', () => {
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests(PROD);
  hydrateYardTestCourseFromSettings((key) => (key === YARD_TEST_COURSE_SETTING_KEY ? '1' : null));
  setYardTestCourseSwitch(true);
  assert.equal(yardTestCourseEnabled(), false);
  assert.equal(yardTestCourseSettingsRowVisible(), false);
  assert.equal(nearbyLocalCatalog(FIXTURE.center, 64.4).some((c) => c.id === YARD_TEST_COURSE_ID), false);
  assert.equal(searchLocalCatalog('yard test').some((c) => c.id === YARD_TEST_COURSE_ID), false);
  assert.equal(catalogEntryById(YARD_TEST_COURSE_ID), null);
  assert.equal(catalogCourseDetail(YARD_TEST_COURSE_ID), null);
});

test('missing or malformed geometry leaves the course unavailable', () => {
  setYardTestCourseGateForTests(DEV);
  setYardTestCourseGeometryForTests(null);
  setYardTestCourseSwitch(true);
  assert.equal(yardTestCourseEnabled(), false);
  assert.equal(yardTestCourseSettingsRowVisible(), false);
  assert.equal(catalogCourseDetail(YARD_TEST_COURSE_ID), null);
  assert.equal(parseYardTestCourseGeometry(null), null);
  assert.equal(parseYardTestCourseGeometry('{'), null);
  assert.equal(
    parseYardTestCourseGeometry({ center: { lat: 0, lng: 0 }, tee: FIXTURE.tee, green: FIXTURE.green, par: 3 }),
    null,
  );
  assert.equal(parseYardTestCourseGeometry({ ...FIXTURE, par: 2 }), null);
  assert.equal(parseYardTestCourseGeometry({ center: FIXTURE.center, tee: FIXTURE.tee, green: FIXTURE.green }), null);
  assert.deepEqual(parseYardTestCourseGeometry(FIXTURE), FIXTURE);
});

test('dev build with the switch off (default): not in nearby or search', () => {
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests(DEV);
  hydrateYardTestCourseFromSettings(() => null);
  assert.equal(yardTestCourseEnabled(), false);
  assert.equal(yardTestCourseSettingsRowVisible(), true);
  assert.equal(nearbyLocalCatalog(NEAR, 64.4).some((c) => c.id === YARD_TEST_COURSE_ID), false);
  assert.equal(searchLocalCatalog('yard test').some((c) => c.id === YARD_TEST_COURSE_ID), false);
});

test('extra.debugYardCourse alone passes the build gate when geometry is present', () => {
  turnOn({ dev: false, extraFlag: true });
  assert.equal(yardTestCourseEnabled(), true);
});

test('the Settings row stays hidden until 7 credits-line taps, and the switch stays off', () => {
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests({ dev: false, extraFlag: true });
  assert.equal(yardTestCourseSettingsRowVisible(), false);
  assert.equal(yardTestCourseEnabled(), false);
  const start = 1_700_000_000_000;
  let state: YardTestUnlockTapState = { count: 0, firstAtMs: null };
  for (let i = 0; i < YARD_TEST_UNLOCK_TAPS - 1; i += 1) {
    const next = advanceYardTestUnlockTap(state, start + i * 100);
    assert.equal(next.unlocked, false);
    state = next;
  }
  const opened = advanceYardTestUnlockTap(state, start + (YARD_TEST_UNLOCK_TAPS - 1) * 100);
  assert.equal(opened.unlocked, true);
  const writes: [string, string][] = [];
  setYardTestCourseUnlocked((key, value) => writes.push([key, value]));
  assert.deepEqual(writes, [[YARD_TEST_UNLOCK_SETTING_KEY, '1']]);
  assert.equal(yardTestCourseSettingsRowVisible(), true);
  assert.equal(yardTestCourseEnabled(), false);
  const stale = advanceYardTestUnlockTap({ count: 6, firstAtMs: start }, start + YARD_TEST_UNLOCK_WINDOW_MS + 1);
  assert.equal(stale.unlocked, false);
  assert.equal(stale.count, 1);
});

test('switch persists as 1/0 under the settings key', () => {
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests(DEV);
  const writes: [string, string][] = [];
  setYardTestCourseSwitch(true, (k, v) => writes.push([k, v]));
  setYardTestCourseSwitch(false, (k, v) => writes.push([k, v]));
  assert.deepEqual(writes, [
    [YARD_TEST_COURSE_SETTING_KEY, '1'],
    [YARD_TEST_COURSE_SETTING_KEY, '0'],
  ]);
});

test('flag on: nearby within ~1 mile lists it; 2 miles away does not', () => {
  turnOn();
  const near = nearbyLocalCatalog(NEAR, 64.4);
  assert.equal(near[0]?.id, YARD_TEST_COURSE_ID);
  assert.equal(near[0]?.name, 'Yard Test');
  assert.equal(near[0]?.city, null);
  const far = nearbyLocalCatalog(FAR, 64.4);
  assert.equal(far.some((c) => c.id === YARD_TEST_COURSE_ID), false);
});

test('flag on: pinned at the top of nearby — above closer-looking and played courses', async () => {
  turnOn();
  const client = createCourseDataClient({
    getBaseUrl: () => 'https://share.test/gca/v1',
    fetch: async () =>
      new Response(
        JSON.stringify({
          courses: [
            {
              id: 99,
              club_name: 'Magnolia Country Club',
              course_name: 'Magnolia Country Club',
              location: { city: 'Magnolia', state: 'AR', latitude: NEAR.lat, longitude: NEAR.lng },
            },
          ],
        }),
        { status: 200 },
      ),
  });
  const rows = await client.nearbyCourses(NEAR);
  assert.equal(rows[0]?.id, YARD_TEST_COURSE_ID);
  assert.notEqual(rows[0]?.id, '99');

  const listed = planCourseList({
    courses: [...rows].reverse(),
    lastPlayedAtByCourse: { '99': '2026-09-20T12:00:00Z' },
    from: NEAR,
  });
  assert.equal(listed[0]?.id, YARD_TEST_COURSE_ID);
});

test('flag on: text search matches yard test', () => {
  turnOn();
  assert.equal(searchLocalCatalog('yard test')[0]?.id, YARD_TEST_COURSE_ID);
  assert.equal(searchLocalCatalog('yard test').some((c) => c.name === 'Yard Test'), true);
  assert.equal(searchLocalCatalog('magnolia').some((c) => c.id === YARD_TEST_COURSE_ID), false);
});

test('detail: 9 holes, hole 1 uses the fixture par and tee/green, holes 2–9 empty', async () => {
  turnOn();
  const client = createCourseDataClient({
    getBaseUrl: () => 'https://share.test/gca/v1',
    fetch: async () => {
      throw new Error('network should not run for the yard course');
    },
  });
  const detail = await client.getCourse(YARD_TEST_COURSE_ID);
  assert.ok(detail);
  assert.equal(detail.name, 'Yard Test');
  assert.equal(detail.holeCount, 9);
  assert.equal(detail.holes.length, 9);
  const h1 = detail.holes[0];
  assert.equal(h1.holeNumber, 1);
  assert.equal(h1.par, FIXTURE.par);
  assert.deepEqual(h1.teeCentroid, FIXTURE.tee);
  assert.deepEqual(h1.greenCentroid, FIXTURE.green);
  assert.equal(h1.yards, Math.round(haversineYards(FIXTURE.tee, FIXTURE.green)));
  assert.equal(h1.greenFront, null);
  assert.equal(h1.greenBack, null);
  assert.equal(h1.greenDepthYards, null);
  for (const hole of detail.holes.slice(1)) {
    assert.equal(hole.teeCentroid, null, `hole ${hole.holeNumber} tee`);
    assert.equal(hole.greenCentroid, null, `hole ${hole.holeNumber} green`);
    assert.equal(hole.par, null, `hole ${hole.holeNumber} par`);
  }
  assert.deepEqual(detail.paintResult, { ok: true, source: null, fromCache: false });
  assert.equal(catalogEntryById(YARD_TEST_COURSE_ID)?.holeCount, 9);
});

test('a started round keeps resolving after the switch goes off (dev build)', () => {
  turnOn();
  setYardTestCourseSwitch(false);
  assert.equal(catalogEntryById(YARD_TEST_COURSE_ID)?.name, 'Yard Test');
  assert.ok(catalogCourseDetail(YARD_TEST_COURSE_ID));
});

test('hole 1 yards are the fixture haversine and the card paints', () => {
  const yards = Math.round(haversineYards(FIXTURE.tee, FIXTURE.green));
  const clubs = Object.entries(STOCK_AVG_CARRY).map(([id, carry]) => ({ id, carry }));
  assert.deepEqual(rankClosestCarryIds(clubs, yards), ['club_lw', 'club_sw', 'club_gw']);
  const paint = decideCourseCardPaint({ tee: FIXTURE.tee, green: FIXTURE.green, phone: null });
  assert.equal(paint.mount, true, paint.reason);
});

test('watch nearby drops the course only while it is disabled', () => {
  const rows = [
    { id: YARD_TEST_COURSE_ID, name: 'Yard Test' },
    { id: 'other', name: 'Other' },
  ];
  setYardTestCourseGeometryForTests(FIXTURE);
  setYardTestCourseGateForTests(PROD);
  assert.deepEqual(
    coursesForWatchNearby(rows).map((row) => row.id),
    ['other'],
  );
  turnOn();
  assert.deepEqual(
    coursesForWatchNearby(rows).map((row) => row.id),
    [YARD_TEST_COURSE_ID, 'other'],
  );
});

test('the yard test course cannot be favorited or downloaded', async () => {
  assert.equal(courseAllowsFavorite(YARD_TEST_COURSE_ID), false);
  const saved = new Map<string, string>();
  const store: JsonStore = {
    get: (key) => saved.get(key) ?? null,
    set: (key, value) => {
      saved.set(key, value);
    },
  };
  setFavorite(
    store,
    { id: YARD_TEST_COURSE_ID, name: 'Yard Test', city: null, state: null, country: null, location: FIXTURE.center },
    true,
  );
  assert.equal(listFavorites(store).length, 0);
  assert.equal(saved.size, 0);
  let writes = 0;
  const status = await downloadFavoriteForOffline(
    { id: YARD_TEST_COURSE_ID, name: 'Yard Test', city: null, state: null, country: null, location: FIXTURE.center },
    {
      get: () => null,
      set: () => {
        writes += 1;
      },
    },
  );
  assert.equal(status, 'miss');
  assert.equal(writes, 0);
});

test('production sets extra.debugYardCourse only when the env line is present', () => {
  const src = readFileSync(new URL('../../app.config.js', import.meta.url), 'utf8');
  const course = readFileSync(new URL('./yardTestCourse.ts', import.meta.url), 'utf8');
  assert.match(src, /REMOVE BEFORE APP STORE SUBMISSION/);
  assert.match(course, /REMOVE BEFORE APP STORE SUBMISSION/);
  assert.doesNotMatch(src, /EAS_BUILD_PROFILE\) === 'production'\) return false/);
  assert.doesNotMatch(course, /\d+\.\d{3,}/);
  const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8')) as {
    build: { production: { env?: Record<string, string> } };
  };
  assert.equal(eas.build.production.env?.EXPO_PUBLIC_DEBUG_YARD_COURSE, '1');

  const previous = {
    profile: process.env.EAS_BUILD_PROFILE,
    flag: process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE,
    geometry: process.env.EXPO_PUBLIC_YARD_TEST_COURSE,
  };
  const makeConfig = require('../../app.config.js') as (args: { config: Record<string, unknown> }) => {
    extra: { debugYardCourse: boolean; yardTestCourse: YardTestGeometry | null };
  };
  try {
    process.env.EAS_BUILD_PROFILE = 'production';
    delete process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE;
    delete process.env.EXPO_PUBLIC_YARD_TEST_COURSE;
    const absent = makeConfig({ config: { extra: { debugYardCourse: true, yardTestCourse: FIXTURE } } }).extra;
    assert.equal(absent.debugYardCourse, false);
    assert.equal(absent.yardTestCourse, null);

    process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE = '1';
    process.env.EXPO_PUBLIC_YARD_TEST_COURSE = JSON.stringify(FIXTURE);
    const present = makeConfig({ config: { extra: {} } }).extra;
    assert.equal(present.debugYardCourse, true);
    assert.deepEqual(present.yardTestCourse, FIXTURE);

    process.env.EXPO_PUBLIC_YARD_TEST_COURSE = '{';
    assert.equal(makeConfig({ config: { extra: {} } }).extra.yardTestCourse, null);
    process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE = '0';
    assert.equal(makeConfig({ config: { extra: {} } }).extra.debugYardCourse, false);
  } finally {
    if (previous.profile == null) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = previous.profile;
    if (previous.flag == null) delete process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE;
    else process.env.EXPO_PUBLIC_DEBUG_YARD_COURSE = previous.flag;
    if (previous.geometry == null) delete process.env.EXPO_PUBLIC_YARD_TEST_COURSE;
    else process.env.EXPO_PUBLIC_YARD_TEST_COURSE = previous.geometry;
  }
});
