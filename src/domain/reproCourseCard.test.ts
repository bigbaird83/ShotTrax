import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  courseCardCameraWaitsForPhoneFix,
  courseCardMissingCameraWaitsForPhone,
  diagnoseCourseCardFrame,
  diagnoseCourseCardHole,
  holeCameraTeeBelowGreenOnScreen,
  holeFrameRegion,
  holeMapUserLocationVisible,
  openingHoleRegionContainsTeeAndGreen,
  planCourseCardCamera,
} from './holeCamera';
import {
  addShotKeepsPlayMapHeight,
  addShotOpensOnPlayFrame,
  holeMapViewUsesAbsoluteFill,
  playGlassDockZeroesMapHeight,
  playMapHostUsesAbsoluteFill,
} from './playLayout';
import {
  CYPRESS_CREEK_CABOT,
  MAGNOLIA_CC,
  REPRO_COURSE_CARDS,
  courseCardHoleHasTeeAndGreen,
  magnoliaHole1Card,
} from './reproCourseCard';

const phone = { lat: 40.7128, lng: -74.006 };

test('Magnolia CC hole 1 is the known Doc tee+green set for camera and layout', () => {
  assert.equal(MAGNOLIA_CC.name, 'Magnolia Country Club');
  assert.equal(MAGNOLIA_CC.city, 'Magnolia');
  assert.equal(MAGNOLIA_CC.state, 'AR');
  assert.equal(MAGNOLIA_CC.hole1.number, 1);
  assert.equal(courseCardHoleHasTeeAndGreen(MAGNOLIA_CC.hole1), true);
  assert.deepEqual(magnoliaHole1Card(), {
    tee: MAGNOLIA_CC.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
  });

  const card = magnoliaHole1Card();
  const diagnosis = diagnoseCourseCardFrame({ tee: card.tee, green: card.green, phone: null });
  const fromScorecard = diagnoseCourseCardHole({
    teeCentroid: card.tee,
    greenCentroid: card.green,
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(fromScorecard.ok, true);
  assert.equal(diagnosis.missing, null);
  assert.deepEqual(diagnoseCourseCardHole({ teeCentroid: null, greenCentroid: card.green }), {
    ok: false,
    tee: null,
    green: card.green,
    missing: 'tee',
  });
  assert.deepEqual(diagnoseCourseCardHole({ teeCentroid: card.tee, greenCentroid: null }), {
    ok: false,
    tee: card.tee,
    green: null,
    missing: 'green',
  });
  assert.equal(
    diagnoseCourseCardFrame({ tee: null, green: card.green, phone }).ok,
    false,
  );
  const start = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
  const addShot = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
  const fromHouse = planCourseCardCamera({ tee: card.tee, green: card.green, phone });

  assert.ok(start);
  assert.deepEqual(start, addShot);
  assert.deepEqual(start, fromHouse);
  assert.deepEqual(start.points, [card.tee, card.green]);
  assert.notDeepEqual(start.points, [phone]);
  assert.equal(holeCameraTeeBelowGreenOnScreen(card.tee, card.green, start.heading), true);
  assert.equal(
    openingHoleRegionContainsTeeAndGreen(holeFrameRegion(start.points), card.tee, card.green),
    true,
  );
  assert.equal(openingHoleRegionContainsTeeAndGreen(holeFrameRegion(start.points), phone, card.green), false);

  assert.equal(courseCardHoleHasTeeAndGreen({ tee: null, green: card.green }), false);
  assert.equal(courseCardHoleHasTeeAndGreen({ tee: card.tee, green: null }), false);
  assert.equal(planCourseCardCamera({ tee: null, green: card.green, phone }), null);
  assert.equal(planCourseCardCamera({ tee: card.tee, green: null, phone }), null);
  assert.equal(courseCardCameraWaitsForPhoneFix(), false);
  assert.equal(courseCardMissingCameraWaitsForPhone(), false);
  assert.equal(holeMapUserLocationVisible({ lockFrame: true, showPhonePin: false, allowMapsChrome: false }), false);

  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(addShotKeepsPlayMapHeight(), true);
  assert.equal(addShotOpensOnPlayFrame(), true);
});

test('repro cards are Magnolia plus Cypress Creek; missing tee or green never waits on the phone', () => {
  assert.deepEqual(
    REPRO_COURSE_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Cypress Creek'],
  );
  assert.equal(CYPRESS_CREEK_CABOT.city, 'Cabot');
  assert.equal(CYPRESS_CREEK_CABOT.state, 'AR');

  for (const course of REPRO_COURSE_CARDS) {
    assert.equal(courseCardHoleHasTeeAndGreen(course.hole1), true);
    const start = planCourseCardCamera({
      tee: course.hole1.tee,
      green: course.hole1.green,
      phone: null,
    });
    const addShot = planCourseCardCamera({
      tee: course.hole1.tee,
      green: course.hole1.green,
      phone: null,
    });
    assert.deepEqual(start, addShot);
    assert.ok(start);
    assert.equal(
      holeCameraTeeBelowGreenOnScreen(course.hole1.tee, course.hole1.green, start.heading),
      true,
    );
    assert.equal(planCourseCardCamera({ tee: null, green: course.hole1.green, phone }), null);
    assert.equal(planCourseCardCamera({ tee: course.hole1.tee, green: null, phone }), null);
  }
});
