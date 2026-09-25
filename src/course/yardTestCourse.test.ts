import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { catalogCourseDetail, catalogEntryById, nearbyLocalCatalog, searchLocalCatalog } from './catalog';
import { createCourseDataClient } from './client';
import {
  YARD_TEST_COURSE_ANCHOR,
  YARD_TEST_COURSE_ID,
  YARD_TEST_COURSE_SETTING_KEY,
  YARD_TEST_HOLE1_GREEN,
  YARD_TEST_HOLE1_TEE,
  YARD_TEST_HOLE1_YARDS,
  hydrateYardTestCourseFromSettings,
  resetYardTestCourseForTests,
  setYardTestCourseGateForTests,
  setYardTestCourseSwitch,
  yardTestCourseEnabled,
} from './yardTestCourse';
import { planCourseList } from '../domain/coursePick';
import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { STOCK_AVG_CARRY } from '../domain/defaultBag';
import { rankClosestCarryIds } from '../domain/rankClubs';
import { haversineYards } from '../domain/haversine';

const DEV = { dev: true, extraFlag: false };
const PROD = { dev: false, extraFlag: false };
/** ~0.3 mi from the anchor. */
const BACKYARD = { lat: 33.316, lng: -93.2268 };
/** ~2 mi from the anchor — still inside the 40 mi nearby radius. */
const TWO_MILES = { lat: 33.341, lng: -93.2268 };

function turnOn(gate = DEV) {
  setYardTestCourseGateForTests(gate);
  setYardTestCourseSwitch(true);
}

afterEach(() => resetYardTestCourseForTests());

test('production build: never listed, searched, or resolved — even with the switch set', () => {
  setYardTestCourseGateForTests(PROD);
  hydrateYardTestCourseFromSettings((key) => (key === YARD_TEST_COURSE_SETTING_KEY ? '1' : null));
  setYardTestCourseSwitch(true);
  assert.equal(yardTestCourseEnabled(), false);
  assert.equal(nearbyLocalCatalog(YARD_TEST_COURSE_ANCHOR, 64.4).some((c) => c.id === YARD_TEST_COURSE_ID), false);
  assert.equal(searchLocalCatalog('goode circle').length, 0);
  assert.equal(catalogEntryById(YARD_TEST_COURSE_ID), null);
  assert.equal(catalogCourseDetail(YARD_TEST_COURSE_ID), null);
});

test('dev build with the switch off (default): not in nearby or search', () => {
  setYardTestCourseGateForTests(DEV);
  hydrateYardTestCourseFromSettings(() => null);
  assert.equal(yardTestCourseEnabled(), false);
  assert.equal(nearbyLocalCatalog(BACKYARD, 64.4).some((c) => c.id === YARD_TEST_COURSE_ID), false);
  assert.equal(searchLocalCatalog('goode circle').length, 0);
});

test('extra.debugYardCourse alone passes the build gate', () => {
  turnOn({ dev: false, extraFlag: true });
  assert.equal(yardTestCourseEnabled(), true);
});

test('switch persists as 1/0 under the settings key', () => {
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
  const near = nearbyLocalCatalog(BACKYARD, 64.4);
  assert.equal(near[0]?.id, YARD_TEST_COURSE_ID);
  assert.equal(near[0]?.name, 'Goode Circle Test');
  assert.equal(near[0]?.city, 'Magnolia');
  const far = nearbyLocalCatalog(TWO_MILES, 64.4);
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
              location: { city: 'Magnolia', state: 'AR', latitude: 33.3160, longitude: -93.2268 },
            },
          ],
        }),
        { status: 200 },
      ),
  });
  const rows = await client.nearbyCourses(BACKYARD);
  assert.equal(rows[0]?.id, YARD_TEST_COURSE_ID);

  const listed = planCourseList({
    courses: [...rows].reverse(),
    lastPlayedAtByCourse: { '99': '2026-09-20T12:00:00Z' },
    from: BACKYARD,
  });
  assert.equal(listed[0]?.id, YARD_TEST_COURSE_ID);
});

test('flag on: text search finds it', () => {
  turnOn();
  assert.equal(searchLocalCatalog('goode circle')[0]?.id, YARD_TEST_COURSE_ID);
  assert.equal(searchLocalCatalog('magnolia')[0]?.id, YARD_TEST_COURSE_ID);
});

test('detail: 9 holes, hole 1 par 3 with real tee/green, holes 2–9 empty (no invented pins, no GIR data)', async () => {
  turnOn();
  const client = createCourseDataClient({
    getBaseUrl: () => 'https://share.test/gca/v1',
    fetch: async () => {
      throw new Error('network should not run for the yard course');
    },
  });
  const detail = await client.getCourse(YARD_TEST_COURSE_ID);
  assert.ok(detail);
  assert.equal(detail.holeCount, 9);
  assert.equal(detail.holes.length, 9);
  const h1 = detail.holes[0];
  assert.equal(h1.holeNumber, 1);
  assert.equal(h1.par, 3);
  assert.deepEqual(h1.teeCentroid, YARD_TEST_HOLE1_TEE);
  assert.deepEqual(h1.greenCentroid, YARD_TEST_HOLE1_GREEN);
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
  assert.equal(catalogEntryById(YARD_TEST_COURSE_ID)?.name, 'Goode Circle Test');
  assert.ok(catalogCourseDetail(YARD_TEST_COURSE_ID));
});

test('hole 1 yards are haversine tee → green (~46 yd) and the card paints', () => {
  const yards = haversineYards(YARD_TEST_HOLE1_TEE, YARD_TEST_HOLE1_GREEN);
  assert.equal(YARD_TEST_HOLE1_YARDS, Math.round(yards));
  assert.ok(YARD_TEST_HOLE1_YARDS >= 44 && YARD_TEST_HOLE1_YARDS <= 48, String(YARD_TEST_HOLE1_YARDS));
  const paint = decideCourseCardPaint({ tee: YARD_TEST_HOLE1_TEE, green: YARD_TEST_HOLE1_GREEN, phone: null });
  assert.equal(paint.mount, true, paint.reason);
});

test('suggested clubs at hole 1 yards are the short wedges (putter stays in the wheel, never ranked)', () => {
  const clubs = Object.entries(STOCK_AVG_CARRY).map(([id, carry]) => ({ id, carry }));
  const top = rankClosestCarryIds(clubs, YARD_TEST_HOLE1_YARDS);
  assert.deepEqual(top, ['club_lw', 'club_sw', 'club_gw']);
});

test('production EAS profile never sets extra.debugYardCourse', () => {
  const src = readFileSync(new URL('../../app.config.js', import.meta.url), 'utf8');
  assert.match(src, /EAS_BUILD_PROFILE\) === 'production'\) return false/);
  const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'));
  assert.equal(JSON.stringify(eas.build.production).includes('DEBUG_YARD_COURSE'), false);
});
