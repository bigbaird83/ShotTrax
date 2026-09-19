import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  compareMagnoliaCypressHole1,
  courseCardAbsurdSpanMountsMapView,
  courseCardFailCount,
  courseCardFailWhy,
  courseCardMissShowsMapView,
  courseCardNullCameraMountsMapView,
  courseCardPaintOnlyWhenNormalHole,
  courseCardSamePointMountsMapView,
  courseCardShouldMountMapView,
  courseCardZeroCoordMountsMapView,
  formatCourseCardFailList,
  scanCourseCardDetails,
  scanKnownArCourseCards,
  tallyCourseCardPaint,
  decideCourseCardPaint,
  dumpHole1PayloadsSideBySide,
  inventGreenFromCenterPlusYards,
  inventGreenFromCourseCenter,
  logCourseCardPaint,
  logHole1PayloadsSideBySide,
  showPlayDockForCourseCard,
} from './courseCardPaint';
import {
  COURSE_CARD_MAX_HOLE_SPAN_YARDS,
  diagnoseCourseCardFrame,
  planCourseCardCamera,
} from './holeCamera';
import { isCourseCardLatLng, isNearZeroLatLng } from './latLng';
import { signalLabCypressBlankMap } from './playLayout';
import {
  BLANKS_LIVE_CARDS,
  CAMDEN_CC,
  CYPRESS_CREEK_CABOT,
  DOC_BLANK_COURSE_NAMES,
  DOC_PAINT_COURSE_NAMES,
  GREYSTONE_CABOT,
  MAGNOLIA_CC,
  PAINTS_REPRO_CARDS,
  PLEASANT_VALLEY_LITTLE_ROCK,
} from './reproCourseCard';
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
  assert.equal(coincident.reason, 'same_point');
  assert.equal(planCourseCardCamera({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: CYPRESS_CREEK_CABOT.hole1.tee,
    phone: null,
  }), null);

  const absurd = decideCourseCardPaint({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
    phone: null,
  });
  assert.equal(absurd.mount, false);
  assert.equal(absurd.reason, 'absurd_span');
  assert.ok((absurd.spanYards ?? 0) > COURSE_CARD_MAX_HOLE_SPAN_YARDS);
  assert.equal(planCourseCardCamera({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
    phone: null,
  }), null);

  const live = compareMagnoliaCypressHole1({
    cypressTee: null,
    cypressGreen: null,
  });
  assert.equal(live.cypressLive.mount, false);
  assert.equal(live.camden.mount, true);
  assert.equal(live.magnolia.mount, true);
  assert.equal(live.dump.thinApiPattern, true);
  assert.equal(live.dump.failCount, 3);
  assert.deepEqual(formatCourseCardFailList(live.dump.failList), [
    'Cypress Creek (Cabot) — null tee+green',
    'Greystone Country Club (Cabot) — null tee+green',
    'Pleasant Valley Country Club (Little Rock) — null tee+green',
  ]);

  assert.equal(courseCardMissShowsMapView(), false);
  assert.equal(courseCardZeroCoordMountsMapView(), false);
  assert.equal(courseCardNullCameraMountsMapView(), false);
  assert.equal(courseCardSamePointMountsMapView(), false);
  assert.equal(courseCardAbsurdSpanMountsMapView(), false);
  assert.equal(courseCardPaintOnlyWhenNormalHole(), true);
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
  assert.equal(gate.cypressSpecific, false);
  assert.equal(gate.thinApiShowsMissAndFailCount, true);
  assert.equal(gate.blanksCypressGreystonePleasantValley, true);
  assert.equal(gate.logsFailList, true);
  assert.equal(gate.doesNotAskDocToSmoke, true);
  assert.equal(gate.osmNeverSeedsCourseCardGreen, true);
  assert.equal(gate.missWhenTeeOrGreenMissing, true);
  assert.equal(gate.missWhenNearZero, true);
  assert.equal(gate.missWhenSamePoint, true);
  assert.equal(gate.missWhenAbsurdSpan, true);
  assert.equal(gate.paintOnlyWhenNormalHole, true);
  assert.equal(gate.missWhenCameraNull, true);
  assert.equal(gate.logsFailVsPaintCount, true);
  assert.equal(gate.missDoesNotMountMapView, true);
  assert.equal(gate.neverInventGreenFromCenter, true);
  assert.equal(gate.magnoliaStillPaints, true);
  assert.equal(gate.camdenStillPaints, true);
  assert.equal(gate.playDockOnMiss, true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(hole, /logCourseCardPaint\(/);
  assert.match(hole, /logHole1PayloadsSideBySide\(/);
  assert.match(hole, /dumpHole1PayloadsSideBySide\(/);
  assert.match(hole, /decideCourseCardPaint\(/);
  assert.match(hole, /showPlayDockForCourseCard\(/);
  assert.match(hole, /courseCardPaint\.mount/);
  assert.match(map, /course-card-miss/);
  assert.match(map, /styles\.missCard/);
  assert.match(map, /COPY\.courseCardMissingFrame/);
  assert.match(map, /courseCardMiss/);
  assert.doesNotMatch(map, /onFrameReady\?\.\(lockFrame \? holeCameraReady : true\)/);
});

test('Signal Lab side-by-side: thin API vs Magnolia + Camden paint', () => {
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
        greystone: { tee: null, green: null },
        pleasantValley: { tee: null, green: null },
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
  assert.equal(dump.rows[3].course, 'Greystone Country Club');
  assert.equal(dump.rows[3].city, 'Cabot');
  assert.equal(dump.rows[3].mount, false);
  assert.equal(dump.rows[4].course, 'Pleasant Valley Country Club');
  assert.equal(dump.rows[4].city, 'Little Rock');
  assert.equal(dump.rows[4].mount, false);
  assert.equal(dump.thinApiPattern, true);
  assert.equal(dump.failCount, 3);
  assert.equal(dump.paintCount, 2);
  assert.equal(dump.tally.paint, 2);
  assert.equal(dump.tally.fail, 3);
  assert.equal(dump.tally.oneOff, false);
  assert.equal(dump.tally.thinTier, true);
  assert.equal(dump.tally.reasons.zero_coord, 1);
  assert.equal(dump.tally.reasons.missing_both, 2);
  assert.deepEqual(formatCourseCardFailList(dump.failList), [
    'Cypress Creek (Cabot) — ~0,0 placeholder',
    'Greystone Country Club (Cabot) — null tee+green',
    'Pleasant Valley Country Club (Little Rock) — null tee+green',
  ]);
  assert.equal(
    courseCardFailCount([
      MAGNOLIA_CC.hole1,
      CAMDEN_CC.hole1,
      { tee: null, green: { lat: 0, lng: 0 } },
      { tee: null, green: null },
      { tee: null, green: null },
    ]),
    3,
  );
  const line = logs.find((row) => Array.isArray(row) && row[0] === '[Signal Lab] hole-1 side-by-side') as
    | [string, { paints: string[]; blanks: string[] }]
    | undefined;
  assert.ok(line);
  assert.deepEqual(line[1].paints, [...DOC_PAINT_COURSE_NAMES]);
  assert.deepEqual(line[1].blanks, [...DOC_BLANK_COURSE_NAMES]);

  const known = dumpHole1PayloadsSideBySide({
    cypress: CYPRESS_CREEK_CABOT.hole1,
    greystone: GREYSTONE_CABOT.hole1,
    pleasantValley: PLEASANT_VALLEY_LITTLE_ROCK.hole1,
  });
  assert.equal(known.thinApiPattern, true);
  assert.equal(known.failCount, 1);
  assert.equal(known.paintCount, 4);
  assert.equal(known.tally.oneOff, true);
  assert.equal(known.tally.thinTier, false);
  assert.equal(known.rows.filter((row) => row.mount).length, 4);
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.hole1.tee, null);
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.hole1.green, null);
  assert.deepEqual(
    BLANKS_LIVE_CARDS.map((course) => course.name),
    [...DOC_BLANK_COURSE_NAMES],
  );

  const thinTier = tallyCourseCardPaint([
    { tee: null, green: null },
    { tee: MAGNOLIA_CC.hole1.tee, green: MAGNOLIA_CC.hole1.tee },
    { tee: CYPRESS_CREEK_CABOT.hole1.tee, green: MAGNOLIA_CC.hole1.green },
  ]);
  assert.equal(thinTier.paint, 0);
  assert.equal(thinTier.fail, 3);
  assert.equal(thinTier.oneOff, false);
  assert.equal(thinTier.thinTier, true);
  assert.equal(thinTier.reasons.missing_both, 1);
  assert.equal(thinTier.reasons.same_point, 1);
  assert.equal(thinTier.reasons.absurd_span, 1);

  const research = logs.find((row) => Array.isArray(row) && row[0] === '[Signal Lab] fairway-research') as
    | [string, { paint: number; fail: number; oneOff: boolean; thinTier: boolean; failList: string[] }]
    | undefined;
  assert.ok(research);
  assert.equal(research[1].paint, 2);
  assert.equal(research[1].fail, 3);
  assert.equal(research[1].oneOff, false);
  assert.equal(research[1].thinTier, true);
  assert.deepEqual(research[1].failList, [
    'Cypress Creek (Cabot) — ~0,0 placeholder',
    'Greystone Country Club (Cabot) — null tee+green',
    'Pleasant Valley Country Club (Little Rock) — null tee+green',
  ]);

  const scanned = scanKnownArCourseCards();
  assert.equal(scanned.failCount, 3);
  assert.equal(scanned.paintCount, 2);
  assert.equal(scanned.tally.thinTier, true);
  assert.equal(courseCardFailWhy('missing_both'), 'null tee+green');
  assert.equal(courseCardFailWhy('zero_coord'), '~0,0 placeholder');
  assert.equal(courseCardFailWhy('same_point'), 'tee and green are the same point');
  assert.equal(courseCardFailWhy('absurd_span'), 'tee–green farther than a real hole');
  const pulled = scanCourseCardDetails([
    {
      name: MAGNOLIA_CC.name,
      city: MAGNOLIA_CC.city,
      holes: [{
        holeNumber: 1,
        par: 4,
        yards: 380,
        handicap: 7,
        teeCentroid: MAGNOLIA_CC.hole1.tee,
        greenCentroid: MAGNOLIA_CC.hole1.green,
        greenFront: null,
        greenBack: null,
        greenDepthYards: null,
      }],
    },
    {
      name: CYPRESS_CREEK_CABOT.name,
      city: CYPRESS_CREEK_CABOT.city,
      holes: [{
        holeNumber: 1,
        par: 4,
        yards: null,
        handicap: null,
        teeCentroid: null,
        greenCentroid: null,
        greenFront: null,
        greenBack: null,
        greenDepthYards: null,
      }],
    },
  ]);
  assert.equal(pulled.tally.paint, 1);
  assert.equal(pulled.tally.fail, 1);
  assert.deepEqual(formatCourseCardFailList(pulled.failList), [
    'Cypress Creek (Cabot) — null tee+green',
  ]);

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
