import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import { isValidLatLng } from './latLng';
import {
  lastClubMark,
  lastLandingMark,
  markToGreen,
  planPlayHeaderYards,
  planToGreenDisplay,
  toGreenSixHundredCapsTheNumber,
  toGreenSixHundredIsPhoneFixCutoff,
  resolveGreenPin,
  toGreenDisplayFromHole,
  yardsToGreenLabel,
} from './yardsToGreen';

const from = { lat: 37.0, lng: -122.0 };
const green = { lat: 37.0 + 150 / 111_320, lng: -122.0 };

function northOf(origin: { lat: number; lng: number }, yards: number) {
  return { lat: origin.lat + (yards * 0.9144) / 111_320, lng: origin.lng };
}

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
  assert.equal(copy.detail, 'Waiting on green location.');
});

test('yardsToGreenLabel shows yards without GPS preaching', () => {
  const copy = yardsToGreenLabel({ yards: 164, quality: 'soft' });
  assert.equal(copy.value, '164 yd');
});

test('before a mark, To green is the course tee yardage, never the phone', () => {
  const home = planToGreenDisplay({
    courseYards: 282,
    liveYards: 14167,
    liveQuality: 'good',
    shotCount: 0,
    hasGreen: true,
  });
  assert.deepEqual(home, { yards: 282, source: 'course', quality: 'good' });

  const fromHole = toGreenDisplayFromHole({
    courseYards: 282,
    green,
    shots: [],
  });
  assert.equal(fromHole.yards, 282);
  assert.equal(fromHole.source, 'course');

  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 148,
      liveQuality: 'good',
      shotCount: 0,
      hasGreen: true,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
});

test('after a mark, comparison is shot start to green, not the phone', () => {
  const start = northOf(from, 80);
  const holeGreen = northOf(from, 280);
  const startToGreen = roundYards(haversineYards(start, holeGreen));
  assert.ok(Math.abs(startToGreen - 282) > 50);
  assert.ok(startToGreen <= 600);

  const display = toGreenDisplayFromHole({
    courseYards: 282,
    green: holeGreen,
    shots: [{ seq: 1, startLat: start.lat, startLng: start.lng, fixQuality: 'good' }],
  });
  assert.equal(display.source, 'live');
  assert.equal(display.yards, startToGreen);
  assert.equal(display.yards, markToGreen(start, holeGreen).yards);

  const keepCard = toGreenDisplayFromHole({
    courseYards: 282,
    green: northOf(from, 282),
    shots: [{ seq: 1, startLat: from.lat, startLng: from.lng, fixQuality: 'good' }],
  });
  assert.equal(keepCard.source, 'course');
  assert.equal(keepCard.yards, 282);
});

test('quality none after a mark keeps the course number', () => {
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 200,
      liveQuality: 'none',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 282, source: 'course', quality: 'good' },
  );

  const start = northOf(from, 80);
  const holeGreen = northOf(from, 280);
  const none = toGreenDisplayFromHole({
    courseYards: 282,
    green: holeGreen,
    shots: [{ seq: 1, startLat: start.lat, startLng: start.lng, fixQuality: 'none' }],
  });
  assert.equal(none.source, 'course');
  assert.equal(none.yards, 282);
  assert.notEqual(none.yards, markToGreen(start, holeGreen).yards);
});

test('over 600 does not replace the course number', () => {
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 14167,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 282, source: 'course', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 520,
      liveYards: 601,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 520, source: 'course', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 520,
      liveYards: 600,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 600, source: 'live', quality: 'good' },
  );

  const farStart = northOf(from, 0);
  const farGreen = northOf(from, 750);
  const far = toGreenDisplayFromHole({
    courseYards: 282,
    green: farGreen,
    shots: [{ seq: 1, startLat: farStart.lat, startLng: farStart.lng, fixQuality: 'good' }],
  });
  assert.ok((markToGreen(farStart, farGreen).yards ?? 0) > 600);
  assert.equal(far.source, 'course');
  assert.equal(far.yards, 282);
});

test('no course yardage uses start-to-green at 600 or under; no green is —', () => {
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 148,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 148, source: 'live', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 700,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 200,
      liveQuality: 'good',
      shotCount: 0,
      hasGreen: false,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
});

test('400-yard shot-save confirm stays a separate gate from to-green display', () => {
  assert.equal(MAX_SHOT_YD, 400);
  const at401 = planToGreenDisplay({
    courseYards: 282,
    liveYards: 401,
    liveQuality: 'good',
    shotCount: 1,
    hasGreen: true,
  });
  assert.equal(at401.yards, 401);
  assert.equal(at401.source, 'live');
});

test('lastClubMark is the latest shot start, never invented', () => {
  assert.equal(lastClubMark([]), null);
  assert.equal(lastClubMark([{ seq: 1, startLat: null, startLng: null }]), null);
  assert.deepEqual(
    lastClubMark([
      { seq: 1, startLat: 37, startLng: -122 },
      { seq: 2, startLat: 37.1, startLng: -122.1 },
    ]),
    { lat: 37.1, lng: -122.1 },
  );
});

test('play header yards use the 600-yard check: couch is course, never 14,000', () => {
  assert.equal(toGreenSixHundredCapsTheNumber(), false);
  assert.equal(toGreenSixHundredIsPhoneFixCutoff(), true);
  const tee = from;
  const holeGreen = northOf(from, 371);
  const couch = northOf(from, 14_000);
  const landing = northOf(from, 180);
  assert.ok(haversineYards(couch, holeGreen) > 600);
  assert.ok(haversineYards(couch, tee) > 600);

  const home = planPlayHeaderYards({
    phone: couch,
    green: holeGreen,
    tee,
    courseYards: 371,
  });
  assert.deepEqual(home, { yards: 371, source: 'course', quality: 'good' });
  assert.notEqual(home.yards, Math.round(haversineYards(couch, holeGreen)));

  const onTee = planPlayHeaderYards({
    phone: tee,
    green: holeGreen,
    tee,
    courseYards: 371,
  });
  assert.equal(onTee.source, 'course');
  assert.equal(onTee.yards, 371);
  assert.notEqual(onTee.yards, 0);

  const card620 = planPlayHeaderYards({
    phone: couch,
    green: holeGreen,
    tee,
    courseYards: 620,
  });
  assert.equal(card620.yards, 620);
  assert.equal(card620.source, 'course');

  const longHoleGreen = northOf(from, 800);
  const longLanding = northOf(from, 100);
  const liveOver600 = markToGreen(longLanding, longHoleGreen);
  assert.ok((liveOver600.yards ?? 0) > 600);
  const afterShotLongCard = planPlayHeaderYards({
    phone: tee,
    green: longHoleGreen,
    tee,
    courseYards: 800,
    shots: [
      {
        seq: 1,
        endLat: longLanding.lat,
        endLng: longLanding.lng,
        endedAt: '2026-09-18T11:00:00.000Z',
        source: 'gps',
        fixQuality: 'good',
      },
    ],
  });
  assert.equal(afterShotLongCard.source, 'live');
  assert.equal(afterShotLongCard.yards, liveOver600.yards);
  assert.notEqual(afterShotLongCard.yards, 0);

  const afterShotOnCourse = planPlayHeaderYards({
    phone: landing,
    green: holeGreen,
    tee,
    courseYards: 371,
    shots: [
      {
        seq: 1,
        endLat: landing.lat,
        endLng: landing.lng,
        endedAt: '2026-09-18T11:00:00.000Z',
        source: 'gps',
        fixQuality: 'good',
      },
    ],
  });
  assert.equal(afterShotOnCourse.source, 'live');
  assert.equal(afterShotOnCourse.yards, markToGreen(landing, holeGreen).yards);
  assert.notEqual(afterShotOnCourse.yards, 371);

  const afterShotAtHouse = planPlayHeaderYards({
    phone: couch,
    green: holeGreen,
    tee,
    courseYards: 371,
    shots: [
      {
        seq: 1,
        endLat: landing.lat,
        endLng: landing.lng,
        endedAt: '2026-09-18T11:00:00.000Z',
        source: 'gps',
        fixQuality: 'good',
      },
    ],
  });
  assert.equal(afterShotAtHouse.source, 'course');
  assert.equal(afterShotAtHouse.yards, 371);
  assert.notEqual(afterShotAtHouse.yards, Math.round(haversineYards(couch, holeGreen)));
  assert.notEqual(afterShotAtHouse.yards, 0);

  const farLanding = northOf(from, 14_000);
  const houseFixKeepsCard = planPlayHeaderYards({
    phone: farLanding,
    green: holeGreen,
    tee,
    courseYards: 371,
    shots: [
      {
        seq: 1,
        endLat: farLanding.lat,
        endLng: farLanding.lng,
        endedAt: '2026-09-18T11:00:00.000Z',
        source: 'gps',
        fixQuality: 'good',
      },
    ],
  });
  assert.equal(houseFixKeepsCard.source, 'course');
  assert.equal(houseFixKeepsCard.yards, 371);
  assert.notEqual(houseFixKeepsCard.yards, Math.round(haversineYards(farLanding, holeGreen)));

  assert.deepEqual(
    planPlayHeaderYards({
      phone: couch,
      green: holeGreen,
      tee,
      courseYards: null,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
  assert.deepEqual(
    planPlayHeaderYards({
      phone: tee,
      green: null,
      tee,
      courseYards: 371,
    }),
    { yards: 371, source: 'course', quality: 'good' },
  );
});

test('lastLandingMark is the latest closed end pin, never the tee or phone', () => {
  const landing = { lat: 37.002, lng: -122.0 };
  assert.equal(lastLandingMark([]), null);
  assert.equal(
    lastLandingMark([{ seq: 1, endLat: landing.lat, endLng: landing.lng, endedAt: null }]),
    null,
  );
  assert.equal(
    lastLandingMark([
      { seq: 1, endLat: landing.lat, endLng: landing.lng, endedAt: 'a', source: 'no_gps' },
    ]),
    null,
  );
  assert.deepEqual(
    lastLandingMark([
      { seq: 1, endLat: 37.001, endLng: -122.0, endedAt: 'a', source: 'gps', fixQuality: 'good' },
      { seq: 2, endLat: landing.lat, endLng: landing.lng, endedAt: 'b', source: 'placed', fixQuality: null },
    ]),
    landing,
  );
});
