import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holeFrameRegion, holeNativeCamera, planCourseCardCamera } from './holeCamera';
import {
  holeMapAlwaysPassesInitialRegion,
  holeMapBoxIsPaintable,
  holeMapCoverReplacesMapView,
  holeMapCoverStaysAfterSized,
  holeMapGatesOnLocationPermission,
  holeMapHidesWithOpacity,
  holeMapInitialRegionUsesPhone,
  holeMapMountsAtZeroHeight,
  holeMapPaintKey,
  holeMapRegionIsPaintable,
  holeMapRemountsWhenSized,
  holeMapShouldMount,
  holeMapShowsCover,
  holeMapThemeBackgroundIsMapView,
  holeMapWaitsForLocationPermission,
  holeMapWaitsForPhoneFixToMount,
  holeNativeCameraIsPaintable,
  missingCourseCardShowsGreenCover,
} from './mapPaint';
import {
  holeMapCoverLiftsWhenSized,
  holeMapMountsBeforeMeasured,
  holeMapRemountsWhenMapBoxSized,
  holeMapRequiresLocationPermission,
  holeMapViewUsesAbsoluteFill,
  playMapHostUsesAbsoluteFill,
} from './playLayout';
import {
  COPY,
  lockFrameEmptyStateWaitsForPhone,
} from './playerCopy';
import {
  CYPRESS_CREEK_CABOT,
  MAGNOLIA_CC,
  MYSTIC_CREEK_EL_DORADO,
  REPRO_COURSE_CARDS,
  courseCardHoleHasTeeAndGreen,
  mysticCreekHole1Card,
} from './reproCourseCard';

const tee = { lat: 33.2708, lng: -93.2412 };
const green = { lat: 33.2741, lng: -93.2396 };

test('MapView remounts once mapBox is real; zero-height first mount never paints', () => {
  assert.equal(holeMapBoxIsPaintable(null), false);
  assert.equal(holeMapBoxIsPaintable({ width: 0, height: 0 }), false);
  assert.equal(holeMapBoxIsPaintable({ width: 390, height: 0 }), false);
  assert.equal(holeMapBoxIsPaintable({ width: Number.NaN, height: 700 }), false);
  assert.equal(holeMapBoxIsPaintable({ width: 40, height: 40 }), false);
  assert.equal(holeMapBoxIsPaintable({ width: 390, height: 700 }), true);
  assert.equal(holeMapShouldMount(null), false);
  assert.equal(holeMapShouldMount({ width: 0, height: 812 }), false);
  assert.equal(holeMapShouldMount({ width: 390, height: 700 }), true);
  assert.equal(holeMapPaintKey(null), 'unmeasured');
  assert.equal(holeMapPaintKey({ width: 0, height: 0 }), 'unmeasured');
  assert.equal(holeMapPaintKey({ width: 390, height: 700 }), 'sized');
  assert.notEqual(holeMapPaintKey(null), holeMapPaintKey({ width: 390, height: 700 }));
  assert.equal(holeMapMountsAtZeroHeight(), false);
  assert.equal(holeMapRemountsWhenSized(), true);
  assert.equal(holeMapRemountsWhenMapBoxSized(), true);
  assert.equal(holeMapMountsBeforeMeasured(), false);
});

test('green cover lifts when sized; missing tee+green is the miss card, not a veil', () => {
  assert.equal(holeMapShowsCover({ mapBox: null, hasFrame: true }), true);
  assert.equal(holeMapShowsCover({ mapBox: { width: 0, height: 0 }, hasFrame: true }), true);
  assert.equal(holeMapShowsCover({ mapBox: { width: 390, height: 700 }, hasFrame: true }), false);
  assert.equal(holeMapShowsCover({ mapBox: null, hasFrame: false }), false);
  assert.equal(holeMapShowsCover({ mapBox: { width: 390, height: 700 }, hasFrame: false }), false);
  assert.equal(holeMapCoverStaysAfterSized(), false);
  assert.equal(holeMapCoverReplacesMapView(), false);
  assert.equal(missingCourseCardShowsGreenCover(), false);
  assert.equal(holeMapCoverLiftsWhenSized(), true);
  assert.equal(holeMapHidesWithOpacity(), false);
  assert.equal(holeMapThemeBackgroundIsMapView(), false);
  assert.equal(planCourseCardCamera({ tee: null, green, phone: null }), null);
  assert.equal(COPY.courseCardMissingFrame, 'Need the course tee and green for this hole.');
  assert.equal(lockFrameEmptyStateWaitsForPhone(), false);
});

test('invalid camera region never seeds tiles; phone is ignored', () => {
  const camera = planCourseCardCamera({ tee, green, phone: null });
  assert.ok(camera);
  const region = holeFrameRegion(camera.points);
  assert.equal(holeMapRegionIsPaintable(region), true);
  assert.equal(holeMapRegionIsPaintable(null), false);
  assert.equal(
    holeMapRegionIsPaintable({
      latitude: Number.NaN,
      longitude: -93.24,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
    false,
  );
  assert.equal(
    holeMapRegionIsPaintable({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
    false,
  );
  assert.equal(
    holeMapRegionIsPaintable({
      latitude: 33.27,
      longitude: -93.24,
      latitudeDelta: 0,
      longitudeDelta: 0.01,
    }),
    false,
  );
  const native = holeNativeCamera(camera.points, camera.heading);
  assert.equal(holeNativeCameraIsPaintable(native), true);
  assert.equal(holeNativeCameraIsPaintable(null), false);
  assert.equal(holeMapInitialRegionUsesPhone(), false);
  assert.equal(holeMapAlwaysPassesInitialRegion(), true);
});

test('MapView is not gated on location permission or a phone fix', () => {
  assert.equal(holeMapGatesOnLocationPermission(), false);
  assert.equal(holeMapWaitsForLocationPermission(), false);
  assert.equal(holeMapWaitsForPhoneFixToMount(), false);
  assert.equal(holeMapRequiresLocationPermission(), false);
});

test('Doc repro cards including Mystic Creek frame tee+green with no phone wait', () => {
  assert.deepEqual(
    REPRO_COURSE_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Cypress Creek', 'Mystic Creek'],
  );
  assert.equal(MYSTIC_CREEK_EL_DORADO.city, 'El Dorado');
  assert.equal(MYSTIC_CREEK_EL_DORADO.state, 'AR');
  assert.deepEqual(mysticCreekHole1Card(), {
    tee: MYSTIC_CREEK_EL_DORADO.hole1.tee,
    green: MYSTIC_CREEK_EL_DORADO.hole1.green,
  });

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
      phone: { lat: 40.71, lng: -74.0 },
    });
    assert.ok(start);
    assert.deepEqual(start, addShot);
    assert.equal(planCourseCardCamera({ tee: null, green: course.hole1.green, phone: null }), null);
    assert.equal(holeMapRegionIsPaintable(holeFrameRegion(start.points)), true);
  }
  assert.equal(MAGNOLIA_CC.name, 'Magnolia Country Club');
  assert.equal(CYPRESS_CREEK_CABOT.city, 'Cabot');
});

test('P0 second pass: HoleMap remounts on sized mapBox, lifts cover, keeps absoluteFill', () => {
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(holeMapRemountsWhenMapBoxSized(), true);
  assert.equal(holeMapCoverLiftsWhenSized(), true);
  assert.equal(holeMapRequiresLocationPermission(), false);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');

  assert.match(map, /key=\{mapPaintKey\}/);
  assert.match(map, /mapCanPaint \? \(/);
  assert.match(map, /holeMapPaintKey\(mapBox\)/);
  assert.match(map, /holeMapShouldMount\(mapBox\)/);
  assert.match(map, /style=\{\[styles\.map, mapBox,/);
  assert.match(map, /bleed: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.match(map, /map: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.doesNotMatch(map, /styles\.mapHidden/);
  assert.doesNotMatch(map, /opacity: 0/);
  assert.match(map, /showMapCover \? \(/);
  assert.match(map, /styles\.mapCover/);
  assert.doesNotMatch(map, /lockFrame && !holeCameraReady \? \(\s*\n\s*<View pointerEvents="none" style=\{styles\.mapCover\}/);
  assert.match(map, /initialRegion: lockedRegion/);
  assert.match(map, /COPY\.courseCardMissingFrame/);
  assert.doesNotMatch(map, /requestForegroundPermissions|getForegroundPermissionsAsync/);
  assert.doesNotMatch(map, /showsUserLocation=\{true\}/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /lockFrame/);
  assert.match(hole, /const courseCamera = planCourseCardCamera\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);
  assert.match(hole, /StyleSheet\.absoluteFill/);
  assert.doesNotMatch(playMap, /showsUserLocation=\{true\}/);
  assert.doesNotMatch(playMap, /permission/);
});
