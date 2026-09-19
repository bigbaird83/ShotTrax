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
  playBlankMapFixIsCourseAgnostic,
  playGlassDockZeroesMapHeight,
  playMapHostUsesAbsoluteFill,
} from './playLayout';
import {
  CAMDEN_CC,
  CYPRESS_CREEK_CABOT,
  CABOT_POCKET_LIVE_CARDS,
  GREYSTONE_CABOT,
  MAGNOLIA_CC,
  MYSTIC_CREEK_EL_DORADO,
  PAINTS_REPRO_CARDS,
  PLEASANT_VALLEY_LITTLE_ROCK,
  REPRO_COURSE_CARDS,
  camdenHole1Card,
  courseCardHoleHasTeeAndGreen,
  cypressCreekHole1Card,
  greystoneHole1Card,
  magnoliaHole1Card,
  mysticCreekHole1Card,
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

  assert.equal(playBlankMapFixIsCourseAgnostic(), true);
  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(addShotKeepsPlayMapHeight(), true);
  assert.equal(addShotOpensOnPlayFrame(), true);
});

test('repro cards are Magnolia plus Cypress Creek; missing tee or green never waits on the phone', () => {
  assert.deepEqual(
    REPRO_COURSE_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Cypress Creek', 'Mystic Creek'],
  );
  assert.equal(CYPRESS_CREEK_CABOT.city, 'Cabot');
  assert.equal(CYPRESS_CREEK_CABOT.state, 'AR');
  assert.equal(CAMDEN_CC.name, 'Camden Country Club');
  assert.equal(CAMDEN_CC.city, 'Camden');
  assert.deepEqual(camdenHole1Card(), {
    tee: CAMDEN_CC.hole1.tee,
    green: CAMDEN_CC.hole1.green,
  });
  assert.equal(courseCardHoleHasTeeAndGreen(CAMDEN_CC.hole1), true);
  assert.deepEqual(
    PAINTS_REPRO_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Camden Country Club'],
  );
  assert.equal(GREYSTONE_CABOT.name, 'Greystone Country Club');
  assert.equal(GREYSTONE_CABOT.city, 'Cabot');
  assert.deepEqual(
    CABOT_POCKET_LIVE_CARDS.map((course) => `${course.name}:${course.city}`),
    ['Cypress Creek:Cabot', 'Greystone Country Club:Cabot'],
  );
  assert.equal(CABOT_POCKET_LIVE_CARDS.every((course) => course.hole1.tee == null && course.hole1.green == null), true);
  assert.deepEqual(greystoneHole1Card(), {
    tee: GREYSTONE_CABOT.hole1.tee,
    green: GREYSTONE_CABOT.hole1.green,
  });
  assert.equal(courseCardHoleHasTeeAndGreen(GREYSTONE_CABOT.hole1), true);
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.name, 'Pleasant Valley Country Club');
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.city, 'Little Rock');
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.hole1.tee, null);
  assert.equal(PLEASANT_VALLEY_LITTLE_ROCK.hole1.green, null);
  assert.equal(MYSTIC_CREEK_EL_DORADO.city, 'El Dorado');
  assert.deepEqual(cypressCreekHole1Card(), {
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: CYPRESS_CREEK_CABOT.hole1.green,
  });
  assert.deepEqual(mysticCreekHole1Card(), {
    tee: MYSTIC_CREEK_EL_DORADO.hole1.tee,
    green: MYSTIC_CREEK_EL_DORADO.hole1.green,
  });
  assert.equal(playBlankMapFixIsCourseAgnostic(), true);

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
