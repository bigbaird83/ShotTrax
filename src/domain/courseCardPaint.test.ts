import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  compareMagnoliaCypressHole1,
  courseCardFailCount,
  courseCardMissShowsMapView,
  courseCardNullCameraMountsMapView,
  courseCardShouldMountMapView,
  courseCardZeroCoordMountsMapView,
  decideCourseCardPaint,
  dumpHole1PayloadsSideBySide,
  inventGreenFromCenterPlusYards,
  inventGreenFromCourseCenter,
  logCourseCardPaint,
  logHole1PayloadsSideBySide,
  showPlayDockForCourseCard,
} from './courseCardPaint';
import { diagnoseCourseCardFrame, planCourseCardCamera } from './holeCamera';
import { isCourseCardLatLng, isNearZeroLatLng } from './latLng';
import { signalLabCypressBlankMap } from './playLayout';
import { CAMDEN_CC, CYPRESS_CREEK_CABOT, MAGNOLIA_CC, PAINTS_REPRO_CARDS } from './reproCourseCard';
import { seedHoleFromCourse } from '../course/layout';

test('Magnolia hole 1 mounts; Cypress with known tee+green also mounts', () => {
  const split = compareMagnoliaCypressHole1();
  assert.equal(MAGNOLIA_CC.name, 'Magnolia Country Club');
  assert.equal(CYPRESS_CREEK_CABOT.city, 'Cabot');
  assert.equal(split.magnolia.mount, true);
  assert.equal(split.magnolia.reason, 'sane_region');
  assert.equal(courseCardShouldMountMapView(split.magnolia), true);
  assert.equal(split.cypressKnown.mount, true);
  assert.equal(split.cypressKnown.reason, 'sane_region');
  assert.equal(CAMDEN_CC.city, 'Camden');
  assert.equal(split.camden.mount, true);
  assert.equal(split.camden.reason, 'sane_region');
  assert.deepEqual(
    PAINTS_REPRO_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Camden Country Club'],
  );
  assert.equal(planCourseCardCamera({
    tee: MAGNOLIA_CC.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
    phone: null,
  }) != null, true);
});

test('Cypress missing or ~0,0 tee/green is a miss — never a MapView green void', () => {
  const missing = decideCourseCardPaint({ tee: null, green: null, phone: null });
  assert.equal(missing.mount, false);
  assert.equal(missing.reason, 'missing_both');
  assert.equal(courseCardShouldMountMapView(missing), false);

  const noTee = decideCourseCardPaint({
    tee: null,
    green: CYPRESS_CREEK_CABOT.hole1.green,
    phone: null,
  });
  assert.equal(noTee.mount, false);
  assert.equal(noTee.reason, 'missing_tee');

  const noGreen = decideCourseCardPaint({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: null,
    phone: { lat: 40.71, lng: -74 },
  });
  assert.equal(noGreen.mount, false);
  assert.equal(noGreen.reason, 'missing_green');
  assert.equal(planCourseCardCamera({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: null,
    phone: { lat: 40.71, lng: -74 },
  }), null);

  const zero = decideCourseCardPaint({
    tee: { lat: 0, lng: 0 },
    green: { lat: 0.0004, lng: -0.0002 },
    phone: null,
  });
  assert.equal(zero.mount, false);
  assert.equal(zero.reason, 'zero_coord');
  assert.equal(isNearZeroLatLng({ lat: 0.0004, lng: -0.0002 }), true);
  assert.equal(isCourseCardLatLng({ lat: 0.0004, lng: -0.0002 }), false);
  assert.equal(diagnoseCourseCardFrame({
    tee: { lat: 0.0004, lng: -0.0002 },
    green: CYPRESS_CREEK_CABOT.hole1.green,
    phone: null,
  }).ok, false);

  const coincident = decideCourseCardPaint({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: CYPRESS_CREEK_CABOT.hole1.tee,
    phone: null,
  });
  assert.equal(coincident.mount, false);
  assert.equal(coincident.reason, 'no_camera');

  const live = compareMagnoliaCypressHole1({
    cypressTee: null,
    cypressGreen: null,
  });
  assert.equal(live.cypressLive.mount, false);
  assert.equal(live.camden.mount, true);
  assert.equal(live.magnolia.mount, true);
  assert.equal(live.dump.thinApiPattern, true);
  assert.equal(live.dump.failCount, 1);

  assert.equal(courseCardMissShowsMapView(), false);
  assert.equal(courseCardZeroCoordMountsMapView(), false);
  assert.equal(courseCardNullCameraMountsMapView(), false);
});

test('hole start and Add shot stay up on a Cypress miss; Magnolia still waits to frame', () => {
  assert.equal(
    showPlayDockForCourseCard({ paintMounts: false, mapFramed: false }),
    true,
  );
  assert.equal(
    showPlayDockForCourseCard({ paintMounts: true, mapFramed: false }),
    false,
  );
  assert.equal(
    showPlayDockForCourseCard({ paintMounts: true, mapFramed: true }),
    true,
  );
  assert.equal(
    showPlayDockForCourseCard({
      paintMounts: true,
      mapFramed: false,
      catchUpFullScreen: true,
    }),
    true,
  );
});

test('Signal Lab logs Cypress hole 1 tee+green and does not mount MapView on miss', () => {
  const logs: unknown[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    const decision = decideCourseCardPaint({
      tee: null,
      green: CYPRESS_CREEK_CABOT.hole1.green,
      phone: null,
    });
    logCourseCardPaint({
      courseName: 'Cypress Creek Country Club',
      holeNumber: 1,
      decision,
    });
  } finally {
    console.log = original;
  }
  const line = logs.find((row) => Array.isArray(row) && row[0] === '[Signal Lab] course-card') as
    | [string, { course: string; hole: number; tee: null; green: unknown; mount: boolean }]
    | undefined;
  assert.ok(line);
  assert.equal(line[1].course, 'Cypress Creek Country Club');
  assert.equal(line[1].hole, 1);
  assert.equal(line[1].tee, null);
  assert.equal(line[1].mount, false);

  const gate = signalLabCypressBlankMap();
  assert.equal(gate.logsHole1TeeGreen, true);
  assert.equal(gate.sideBySideMagnoliaCamdenCypress, true);
  assert.equal(gate.cypressSpecific, true);
  assert.equal(gate.thinApiShowsMissAndFailCount, true);
  assert.equal(gate.missWhenTeeOrGreenMissing, true);
  assert.equal(gate.missWhenNearZero, true);
  assert.equal(gate.missWhenCameraNull, true);
  assert.equal(gate.missDoesNotMountMapView, true);
  assert.equal(gate.neverInventGreenFromCenter, true);
  assert.equal(gate.magnoliaStillPaints, true);
  assert.equal(gate.camdenStillPaints, true);
  assert.equal(gate.playDockOnMiss, true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(hole, /logCourseCardPaint\(/);
  assert.match(hole, /decideCourseCardPaint\(/);
  assert.match(hole, /showPlayDockForCourseCard\(/);
  assert.match(hole, /courseCardPaint\.mount/);
  assert.match(map, /course-card-miss/);
  assert.match(map, /styles\.missCard/);
  assert.match(map, /COPY\.courseCardMissingFrame/);
  assert.match(map, /courseCardMiss/);
  assert.doesNotMatch(map, /onFrameReady\?\.\(lockFrame \? holeCameraReady : true\)/);
});

test('Signal Lab side-by-side: Cypress-only thin API vs Magnolia + Camden paint', () => {
  const logs: unknown[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  let dump: ReturnType<typeof dumpHole1PayloadsSideBySide>;
  try {
    dump = logHole1PayloadsSideBySide(
      dumpHole1PayloadsSideBySide({
        cypress: { tee: null, green: { lat: 0, lng: 0 } },
      }),
    );
  } finally {
    console.log = original;
  }
  assert.equal(dump.rows[0].course, 'Magnolia Country Club');
  assert.equal(dump.rows[0].teeKind, 'real');
  assert.equal(dump.rows[0].greenKind, 'real');
  assert.equal(dump.rows[0].mount, true);
  assert.equal(dump.rows[1].course, 'Camden Country Club');
  assert.equal(dump.rows[1].city, 'Camden');
  assert.equal(dump.rows[1].teeKind, 'real');
  assert.equal(dump.rows[1].greenKind, 'real');
  assert.equal(dump.rows[1].mount, true);
  assert.equal(dump.rows[2].course, 'Cypress Creek');
  assert.equal(dump.rows[2].city, 'Cabot');
  assert.equal(dump.rows[2].teeKind, 'null');
  assert.equal(dump.rows[2].greenKind, 'placeholder');
  assert.equal(dump.rows[2].mount, false);
  assert.equal(dump.thinApiPattern, true);
  assert.equal(dump.failCount, 1);
  assert.equal(
    courseCardFailCount([
      MAGNOLIA_CC.hole1,
      CAMDEN_CC.hole1,
      { tee: null, green: { lat: 0, lng: 0 } },
    ]),
    1,
  );
  const line = logs.find((row) => Array.isArray(row) && row[0] === '[Signal Lab] hole-1 side-by-side') as
    | [string, { paints: string[]; blanks: string[] }]
    | undefined;
  assert.ok(line);
  assert.deepEqual(line[1].paints, ['Magnolia Country Club', 'Camden Country Club']);
  assert.deepEqual(line[1].blanks, ['Cypress Creek']);

  const known = dumpHole1PayloadsSideBySide({
    cypress: CYPRESS_CREEK_CABOT.hole1,
  });
  assert.equal(known.thinApiPattern, false);
  assert.equal(known.failCount, 0);
  assert.equal(known.rows.every((row) => row.mount), true);

  assert.equal(inventGreenFromCourseCenter(), false);
  assert.equal(inventGreenFromCenterPlusYards(), false);
  const seeded = seedHoleFromCourse({
    par: 4,
    yards: 380,
    handicap: 7,
    greenCentroid: null,
  });
  assert.equal(seeded.green, null);
  assert.equal(seeded.greenSource, null);
});
