import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { haversineYards, roundYards } from './haversine';
import {
  addShotChangesFrameEpoch,
  addShotReframesAfterOpen,
  addShotRemountsCamera,
  holeCameraLeavesAloneAfterOpen,
  holeCameraReframesOnPinch,
  holeCameraReframesOnPinDrag,
  holeCameraReframesOnTwoFingerPan,
  holeMapHostPointerEventsAfterFrame,
  holeMapScrollZoomAfterFrame,
  holeMapUserLocationVisible,
  playAndAddShotShareFrameEpoch,
  playMapFrameEpoch,
  planCourseCardCamera,
} from './holeCamera';
import {
  addShotAlwaysFirstShotStyle,
  addShotChainsFromLastMark,
  addShotFollowsUser,
  addShotFromUsesLastLanding,
  addShotGestureYardsUseFingerPixel,
  addShotGestureYardsUsePinHaversine,
  addShotGestureYardsUseReframe,
  addShotGesturesLeaveCameraAloneAfterFrame,
  addShotGesturesRequireRemount,
  addShotGesturesRerunCourseCardCamera,
  addShotGesturesShowUserLocation,
  addShotGesturesWorkAfterEdit,
  addShotGesturesWorkOnFirstOpen,
  holeMapKeepsScrollZoomOnceMounted,
  addShotMapFrozenWhilePinLive,
  addShotMapScrollEnabledAfterFrame,
  addShotMapZoomEnabledAfterFrame,
  addShotPinchZoomAfterFrame,
  addShotShowsUserLocation,
  addShotTwoFingerPanAfterFrame,
  dragOneFingerMovesToPin,
  dragOverlayPointerEvents,
  dragTwoFingersPanAndZoom,
  liveShotYardsFromThisFromPin,
  liveYardsAfterMapPan,
  liveYardsUsePinMapCoordinate,
  liveYardsUseScreenPixel,
  mapPanChangesLiveYards,
  mapPinchChangesLiveYards,
  twoFingerOwnsMap,
} from './placeToDrag';
import {
  addShotFollowsUserLocation,
  addShotHidesUserLocation,
  addShotKeepsPlayMapHeight,
  addShotOpensOnPlayFrame,
  holeMapViewUsesAbsoluteFill,
  playDockFrostPointerEvents,
  playGlassDockZeroesMapHeight,
  playMapHostUsesAbsoluteFill,
  playDockGlassIgnoresTouches,
  playDockPassesTwoFingerPan,
  signalLabAddShotGestureLock,
} from './playLayout';
import {
  formatShotLockChip,
  shotLockChipUsesCarryAverage,
  shotLockChipUsesHoleCardYards,
} from './shotLock';

const from = { lat: 37.0, lng: -122.0 };
const pin = { lat: 37.001, lng: -122.0 };
const green = { lat: 37.003, lng: -122.0 };
const phone = { lat: 40.7128, lng: -74.006 };

test('Signal Lab: Add shot two-finger pan/pinch after frame leave the camera and user puck alone', () => {
  assert.equal(addShotAlwaysFirstShotStyle(), true);
  assert.equal(addShotChainsFromLastMark(), false);
  assert.equal(addShotFromUsesLastLanding(), false);
  assert.equal(addShotGesturesWorkOnFirstOpen(), true);
  assert.equal(addShotGesturesWorkAfterEdit(), true);
  assert.equal(addShotGesturesRequireRemount(), false);
  assert.equal(holeMapKeepsScrollZoomOnceMounted(), true);
  assert.equal(holeMapHostPointerEventsAfterFrame(), 'box-none');
  assert.equal(addShotTwoFingerPanAfterFrame(), true);
  assert.equal(addShotPinchZoomAfterFrame(), true);
  assert.equal(addShotMapScrollEnabledAfterFrame(), true);
  assert.equal(addShotMapZoomEnabledAfterFrame(), true);
  assert.equal(addShotMapFrozenWhilePinLive(), false);
  assert.equal(dragTwoFingersPanAndZoom(), true);
  assert.equal(dragOneFingerMovesToPin(), true);

  assert.equal(addShotGesturesShowUserLocation(), false);
  assert.equal(addShotShowsUserLocation(), false);
  assert.equal(addShotHidesUserLocation(), true);
  assert.equal(addShotFollowsUser(), false);
  assert.equal(addShotFollowsUserLocation(), false);
  assert.equal(
    holeMapUserLocationVisible({ lockFrame: true, showPhonePin: false, allowMapsChrome: false }),
    false,
  );
  assert.equal(
    holeMapUserLocationVisible({ lockFrame: true, showPhonePin: true, allowMapsChrome: true }),
    false,
  );

  assert.equal(addShotGesturesRerunCourseCardCamera(), false);
  assert.equal(addShotGesturesLeaveCameraAloneAfterFrame(), true);
  assert.equal(holeCameraLeavesAloneAfterOpen(), true);
  assert.equal(addShotRemountsCamera(), false);
  assert.equal(addShotChangesFrameEpoch(), false);
  assert.equal(addShotReframesAfterOpen(), false);
  assert.equal(playAndAddShotShareFrameEpoch(), true);
  assert.equal(addShotOpensOnPlayFrame(), true);
  assert.equal(addShotKeepsPlayMapHeight(), true);
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(playMapFrameEpoch({ holeNumber: 1, nonce: 0 }), 'play-1-0');
  assert.equal(playMapFrameEpoch({ holeNumber: 1, nonce: 0 }), playMapFrameEpoch({ holeNumber: 1, nonce: 0 }));
  assert.notEqual(playMapFrameEpoch({ holeNumber: 1, nonce: 0 }), 'catchup');
  assert.deepEqual(planCourseCardCamera({ tee: from, green, phone }), {
    points: [from, green],
    heading: 0,
  });
  assert.equal(holeMapScrollZoomAfterFrame({ lockFrame: true, holeCameraReady: true }), true);
  assert.equal(holeMapScrollZoomAfterFrame({ lockFrame: true, holeCameraReady: false }), true);
  assert.equal(twoFingerOwnsMap(2), true);
  assert.equal(twoFingerOwnsMap(1), false);
  assert.equal(dragOverlayPointerEvents(true), 'none');
  assert.equal(dragOverlayPointerEvents(false), 'auto');
  assert.equal(playDockFrostPointerEvents(), 'none');
  assert.equal(playDockGlassIgnoresTouches(), true);
  assert.equal(playDockPassesTwoFingerPan(), true);
  assert.equal(holeCameraReframesOnPinDrag(), false);
  assert.equal(holeCameraReframesOnTwoFingerPan(), false);
  assert.equal(holeCameraReframesOnPinch(), false);

  assert.equal(formatShotLockChip({ shortName: '7i', distanceYards: 162 }), '7i · 162');
  assert.notEqual(formatShotLockChip({ shortName: '7i', distanceYards: 162 }), '7i · 371');
  assert.equal(shotLockChipUsesHoleCardYards(), false);
  assert.equal(shotLockChipUsesCarryAverage(), false);

  assert.equal(addShotGestureYardsUsePinHaversine(), true);
  assert.equal(addShotGestureYardsUseFingerPixel(), false);
  assert.equal(addShotGestureYardsUseReframe(), false);
  assert.equal(liveYardsUsePinMapCoordinate(), true);
  assert.equal(liveYardsUseScreenPixel(), false);
  assert.equal(mapPanChangesLiveYards(), false);
  assert.equal(mapPinchChangesLiveYards(), false);

  const cameraAfter = { lat: 37.02, lng: -122.03 };
  const screenAfter = { x: 310, y: 480 };
  const yards = liveShotYardsFromThisFromPin({
    from,
    pin,
    phone,
    screen: screenAfter,
    camera: cameraAfter,
  });
  assert.equal(yards, roundYards(haversineYards(from, pin)));
  assert.notEqual(yards, roundYards(haversineYards(from, cameraAfter)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  const panned = liveYardsAfterMapPan({
    from,
    pin,
    green,
    cameraBefore: from,
    cameraAfter,
    screenBefore: { x: 10, y: 10 },
    screenAfter,
  });
  assert.ok(panned);
  assert.equal(panned.changed, false);
  assert.equal(panned.shotYards, yards);
  assert.equal(panned.toGreenYards, roundYards(haversineYards(pin, green)));

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /const framedForGestures = holeMapKeepsScrollZoomOnceMounted\(\)/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.doesNotMatch(map, /scrollEnabled=\{mapOwnsGesture \|\| !toPinLive\}/);
  assert.match(map, /pointerEvents="box-none"/);
  const lockFx = map.slice(
    map.indexOf('}, [lockFrame, lockKey, heading, frameEpoch]);') - 280,
    map.indexOf('}, [lockFrame, lockKey, heading, frameEpoch]);') + 10,
  );
  assert.doesNotMatch(lockFx, /setHoleCameraReady\(false\)/);
  assert.match(map, /setHoleCameraReady\(true\)/);
  assert.match(map, /Never flip holeCameraReady false/);

  const userLoc = map.slice(map.indexOf('showsUserLocation='), map.indexOf('showsMyLocationButton'));
  assert.match(userLoc, /holeMapUserLocationVisible\(\{/);
  assert.doesNotMatch(userLoc, /framedForGestures|mapOwnsGesture|toPinLive/);
  assert.doesNotMatch(userLoc, /true/);
  assert.match(map, /followsUserLocation=\{false\}/);
  assert.doesNotMatch(map, /showsUserLocation=\{true\}/);
  assert.doesNotMatch(map, /followsUserLocation=\{true\}/);

  const settled = map.slice(map.indexOf('const onRegionSettled'), map.indexOf('if (!lockedRegion)'));
  const afterFrame = settled.slice(
    settled.indexOf('if (framedOnce.current)'),
    settled.indexOf('if (regionIsHoleFrame'),
  );
  assert.match(afterFrame, /return;/);
  assert.doesNotMatch(afterFrame, /applyLockedCamera|frameLockedMap|planCourseCardCamera/);
  assert.doesNotMatch(afterFrame, /setHoleCameraReady|showsUserLocation/);
  assert.doesNotMatch(settled, /framedOnce\.current = false/);

  const applyFx = map.slice(
    map.indexOf('useEffect(() => {\n    if (lockFrame)'),
    map.indexOf('const onMapLayout'),
  );
  assert.match(applyFx, /if \(framedOnce\.current\) return;/);
  assert.match(applyFx, /markFramedIfLive\(frameLockedMap\(\)\)/);

  const ready = map.slice(map.indexOf('onMapReady'), map.indexOf('onRegionChangeComplete'));
  assert.match(ready, /if \(framedOnce\.current\) return;/);
  assert.doesNotMatch(ready, /applyLockedCamera/);

  assert.match(map, /to-pin-drag-layer/);
  assert.match(map, /touches\.length >= 2/);
  const dragStart = map.slice(
    map.indexOf('onStartShouldSetResponder={(event) => {'),
    map.indexOf('onMoveShouldSetResponder'),
  );
  assert.match(dragStart, /return false;/);
  assert.doesNotMatch(dragStart, /return true;/);
  assert.match(map, /pointerEvents=\{mapOwnsGesture \? 'none' : 'auto'\}/);
  assert.match(map, /if \(!onPlaceToDrag \|\| mapOwnsGesture\) return/);
  const dragLines = map.slice(map.indexOf('const dragLines = useMemo'), map.indexOf('const lockedCameraRef'));
  assert.match(dragLines, /drag: placedTo/);
  assert.doesNotMatch(dragLines, /locationX|locationY|pageX|pageY|screen:|camera:/);

  const yardsSrc = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  const live = yardsSrc.slice(
    yardsSrc.indexOf('export function liveShotYardsFromThisFromPin'),
    yardsSrc.indexOf('export type ConfirmPlaceToDraft'),
  );
  assert.match(live, /haversineYards\(args\.from, pin\)/);
  assert.match(live, /void args\.screen/);
  assert.match(live, /void args\.camera/);
  assert.doesNotMatch(live, /locationX|locationY|pageX|pageY/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.match(playMap, /allowMapsChrome=\{!catchUpFullScreen\}/);
  assert.match(playMap, /lockFrame/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.match(playMap, /setPlaceToDraft\(point\)/);
  assert.match(hole, /style=\{styles\.mapFill\}/);
  assert.match(
    playMap,
    /frameEpoch=\{playMapFrameEpoch\(\{ holeNumber: hole\.number, nonce: playFrameNonce \}\)\}/,
  );
  assert.doesNotMatch(playMap, /showsUserLocation=\{true\}/);
  assert.doesNotMatch(playMap, /catchUpFullScreen \? 'catchup'/);
  assert.doesNotMatch(playMap, /frameEpoch=\{catchUpFullScreen/);
  assert.doesNotMatch(hole, /catchUpFullScreen \? styles\.mapWrapFull/);
  assert.equal((hole.match(/planCourseCardCamera\(/g) ?? []).length, 1);
  assert.match(hole, /pointerEvents="none" style=\{styles\.dockGlass\}/);
  assert.match(hole, /dockPassMap \? 'none' : 'box-none'/);
  assert.match(hole, /formatShotLockChip/);
  assert.match(hole, /closePrior\.distanceYards/);
  assert.match(hole, /placed\.ok \? placed\.distanceYards/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf('const chip = formatShotLockChip'), hole.indexOf('const chip = formatShotLockChip') + 220),
    /hole\.yards|playHeaderYards|typicalCarry/,
  );

  const camera = readFileSync(new URL('./holeCamera.ts', import.meta.url), 'utf8');
  const epochFn = camera.slice(
    camera.indexOf('export function playMapFrameEpoch'),
    camera.indexOf('export function holeMapScrollZoomAfterFrame'),
  );
  assert.match(epochFn, /return `play-\$\{args\.holeNumber\}-\$\{args\.nonce\}`/);
  assert.doesNotMatch(epochFn, /catchup/);
});

test('Signal Lab: course-card first frame, then leave camera alone; scroll/zoom stay on; dock frost is none', () => {
  const lock = signalLabAddShotGestureLock();
  assert.equal(lock.firstFrameUsesCourseCard, true);
  assert.equal(lock.reframesAfterInitialFrame, false);
  assert.equal(lock.scrollZoomAfterFrame, true);
  assert.equal(lock.dockFrostPointerEvents, 'none');
  assert.equal(playDockFrostPointerEvents(), 'none');

  const house = { lat: 40.7128, lng: -74.006 };
  const first = planCourseCardCamera({ tee: from, green, phone: null });
  const fromHouse = planCourseCardCamera({ tee: from, green, phone: house });
  assert.deepEqual(first?.points, [from, green]);
  assert.deepEqual(fromHouse, first);
  assert.notDeepEqual(first?.points, [house]);
  assert.equal(addShotReframesAfterOpen(), false);
  assert.equal(addShotGesturesRerunCourseCardCamera(), false);
  assert.equal(holeCameraLeavesAloneAfterOpen(), true);
  assert.equal(holeMapScrollZoomAfterFrame({ lockFrame: true, holeCameraReady: true }), true);
  assert.equal(addShotMapScrollEnabledAfterFrame(), true);
  assert.equal(addShotMapZoomEnabledAfterFrame(), true);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.match(map, /\.\.\.StyleSheet\.absoluteFill/);
  assert.match(map, /style=\{\[styles\.map, mapBox,/);
  assert.match(map, /key=\{mapPaintKey\}/);
  assert.doesNotMatch(map, /opacity: 0/);
  assert.doesNotMatch(map, /styles\.mapHidden/);
  const settled = map.slice(map.indexOf('const onRegionSettled'), map.indexOf('if (!lockedRegion)'));
  const afterFrame = settled.slice(
    settled.indexOf('if (framedOnce.current)'),
    settled.indexOf('if (regionIsHoleFrame'),
  );
  assert.match(afterFrame, /return;/);
  assert.doesNotMatch(afterFrame, /applyLockedCamera|frameLockedMap|planCourseCardCamera/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const mapFill = hole.slice(hole.indexOf('mapFill:'), hole.indexOf('catchUpBar:'));
  assert.match(mapFill, /StyleSheet\.absoluteFill/);
  assert.match(mapFill, /minHeight: 0/);
  assert.match(hole, /const courseCamera = planCourseCardCamera\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);
  assert.match(hole, /pointerEvents="none" style=\{styles\.dockGlass\}/);
  assert.doesNotMatch(hole, /pointerEvents=\{[^}]*styles\.dockGlass/);
  const frost = hole.slice(hole.indexOf('dockGlass:'), hole.indexOf('dockRow:'));
  assert.doesNotMatch(frost, /pointerEvents/);
});
