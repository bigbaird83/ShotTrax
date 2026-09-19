import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  courseCardCameraRegion,
  courseCardCameraRegionUsesHouse,
  courseCardCameraRegionUsesPhone,
  holeFrameRegion,
  holeMapShowsUserLocation,
  holeMapUserLocationVisible,
  openingHoleRegionContainsPoint,
  openingHoleRegionContainsTeeAndGreen,
  planCourseCardCamera,
  diagnoseCourseCardFrame,
  diagnoseCourseCardHole,
} from './holeCamera';
import {
  COURSE_CARD_CAMERA_SURFACES,
  addShotFollowsUserLocation,
  addShotShowsUserLocation,
  courseCardCameraSurfacesShareHelper,
  editShowsUserLocation,
  playAndAddShotShareCourseCardCamera,
  playEditUsesCourseCardCamera,
  playUsesCourseCardCamera,
  roundStartShowsUserLocation,
} from './playLayout';
import { MAGNOLIA_CC, courseCardHoleHasTeeAndGreen, magnoliaHole1Card } from './reproCourseCard';

const tee = MAGNOLIA_CC.hole1.tee;
const green = MAGNOLIA_CC.hole1.green;
const house = { lat: 40.7128, lng: -74.006 };

test('shared camera region is course tee + green only, never the phone or the house', () => {
  assert.equal(MAGNOLIA_CC.name, 'Magnolia Country Club');
  assert.equal(courseCardHoleHasTeeAndGreen(magnoliaHole1Card()), true);
  assert.equal(
    diagnoseCourseCardHole({
      teeCentroid: MAGNOLIA_CC.hole1.tee,
      greenCentroid: MAGNOLIA_CC.hole1.green,
    }).ok,
    true,
  );
  assert.equal(diagnoseCourseCardFrame({ tee: null, green, phone: house }).ok, false);
  assert.equal(courseCardCameraRegionUsesPhone(), false);
  assert.equal(courseCardCameraRegionUsesHouse(), false);

  const noFix = courseCardCameraRegion({ tee, green, phone: null });
  const fromHouse = courseCardCameraRegion({ tee, green, phone: house });
  const teeGreenOnly = holeFrameRegion([tee, green]);
  const withHouse = holeFrameRegion([tee, green, house]);
  const houseOnly = holeFrameRegion([house]);

  assert.ok(noFix);
  assert.deepEqual(noFix, teeGreenOnly);
  assert.deepEqual(fromHouse, teeGreenOnly);
  assert.deepEqual(fromHouse, noFix);
  assert.notDeepEqual(noFix, withHouse);
  assert.notDeepEqual(noFix, houseOnly);
  assert.equal(openingHoleRegionContainsTeeAndGreen(noFix, tee, green), true);
  assert.equal(openingHoleRegionContainsTeeAndGreen(fromHouse, tee, green), true);
  assert.equal(openingHoleRegionContainsPoint(noFix, house), false);
  assert.equal(openingHoleRegionContainsPoint(fromHouse, house), false);
  assert.equal(courseCardCameraRegion({ tee: null, green, phone: house }), null);
  assert.equal(courseCardCameraRegion({ tee, green: null, phone: house }), null);
  assert.equal(courseCardCameraRegion({ tee: null, green: null, phone: house }), null);

  const helper = planCourseCardCamera({ tee, green, phone: house });
  assert.deepEqual(helper?.points, [tee, green]);
  assert.deepEqual(holeFrameRegion(helper?.points ?? []), teeGreenOnly);
  assert.notDeepEqual(helper?.points, [tee, green, house]);
  assert.notDeepEqual(helper?.points, [house]);

  const src = readFileSync(new URL('./holeCamera.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function planCourseCardCamera'), src.indexOf('export function addShotFramePoints'));
  assert.match(body, /void args\.phone/);
  assert.match(body, /diagnoseCourseCardFrame\(args\)/);
  assert.match(body, /if \(!card\.ok\) return null/);
  assert.match(body, /return \{ points: \[card\.tee, card\.green\], heading \}/);
  assert.doesNotMatch(body, /points: \[[^\]]*phone/);

  const regionFn = src.slice(src.indexOf('export function courseCardCameraRegion'), src.indexOf('export function courseCardCameraRegionUsesPhone'));
  assert.match(regionFn, /planCourseCardCamera\(args\)/);
  assert.match(regionFn, /holeFrameRegion\(camera\.points\)/);
});

test('showsUserLocation is false on round start, Add shot, and edit', () => {
  assert.equal(roundStartShowsUserLocation(), false);
  assert.equal(addShotShowsUserLocation(), false);
  assert.equal(editShowsUserLocation(), false);
  assert.equal(addShotFollowsUserLocation(), false);
  assert.equal(holeMapShowsUserLocation(true), false);
  assert.equal(
    holeMapUserLocationVisible({ lockFrame: true, showPhonePin: true, allowMapsChrome: true }),
    false,
  );
  assert.equal(
    holeMapUserLocationVisible({ lockFrame: true, showPhonePin: false, allowMapsChrome: false }),
    false,
  );
  assert.equal(
    holeMapUserLocationVisible({ lockFrame: true, showPhonePin: false, allowMapsChrome: true }),
    false,
  );

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /lockFrame/);
  assert.doesNotMatch(playMap, /lockFrame=\{/);
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.match(playMap, /allowMapsChrome=\{!catchUpFullScreen\}/);
  assert.doesNotMatch(playMap, /showsUserLocation=\{true\}/);

  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /<HoleMap/);
  assert.match(editMap, /lockFrame/);
  assert.doesNotMatch(editMap, /lockFrame=\{/);
  assert.match(editMap, /showPhonePin=\{false\}/);
  assert.doesNotMatch(editMap, /showsUserLocation=\{true\}/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const userLoc = map.slice(map.indexOf('showsUserLocation='), map.indexOf('showsMyLocationButton'));
  assert.match(userLoc, /holeMapUserLocationVisible\(\{/);
  assert.match(userLoc, /lockFrame,/);
  assert.match(userLoc, /showPhonePin,/);
  assert.match(userLoc, /allowMapsChrome,/);
  assert.doesNotMatch(map, /showsUserLocation=\{true\}/);
  assert.match(map, /followsUserLocation=\{false\}/);
  assert.doesNotMatch(map, /followsUserLocation=\{true\}/);
});

test('round start, Add shot, and edit all call the same course-card helper', () => {
  assert.deepEqual([...COURSE_CARD_CAMERA_SURFACES], ['round_start', 'add_shot', 'edit']);
  assert.equal(courseCardCameraSurfacesShareHelper(), true);
  assert.equal(playUsesCourseCardCamera(), true);
  assert.equal(playEditUsesCourseCardCamera(), true);
  assert.equal(playAndAddShotShareCourseCardCamera(), true);

  const roundStart = planCourseCardCamera({ tee, green, phone: null });
  const addShot = planCourseCardCamera({ tee, green, phone: null });
  const edit = planCourseCardCamera({ tee, green, phone: null });
  assert.deepEqual(roundStart, addShot);
  assert.deepEqual(addShot, edit);
  assert.deepEqual(roundStart?.points, [tee, green]);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.equal((hole.match(/planCourseCardCamera\(/g) ?? []).length, 1);
  assert.match(hole, /const courseCamera = planCourseCardCamera\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);
  assert.doesNotMatch(hole, /lockHoleCamera/);
  assert.doesNotMatch(hole, /planHoleCamera/);
  assert.doesNotMatch(hole, /addShotFramePoints/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.match(playMap, /playMapFrameEpoch\(\{ holeNumber: hole\.number, nonce: playFrameNonce \}\)/);
  assert.doesNotMatch(playMap, /catchUpFullScreen \? 'catchup'/);
  assert.doesNotMatch(playMap, /frameEpoch=\{catchUpFullScreen/);

  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.match(editMap, /courseCamera\?\.points/);
});
