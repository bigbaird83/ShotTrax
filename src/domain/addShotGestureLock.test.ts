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
  addShotAfterMarksUsesLastLanding,
  addShotChainsFromLastMark,
  addShotEmptyHoleUsesFirstShotFraming,
  addShotFollowsUser,
  addShotFromKind,
  addShotFromUsesLastLanding,
  resolveAddShotFromPin,
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
  addShotDragLayerCoversMap,
  addShotDragLayerStealsTwoFinger,
  addShotMapOwnsTwoFingerWhilePinLive,
  addShotToPinDragBouncesScrollOff,
  addShotToPinDragPansMap,
  addShotToPinDragUsesMarkCoords,
  addShotToPinHitTargetCoversMap,
  addShotToPinHitTargetIsTight,
  addShotToPinHitTargetMaxPx,
  addShotToPinHitTargetSize,
  addShotToPinOneFingerMovesMarkerOnly,
  addShotToPinStopPropagation,
  addShotToPinUsesDraggableMarker,
  toPinMarkerCoordinate,
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
  assert.equal(addShotAlwaysFirstShotStyle(), false);
  assert.equal(addShotEmptyHoleUsesFirstShotFraming(), true);
  assert.equal(addShotAfterMarksUsesLastLanding(), true);
  assert.equal(addShotChainsFromLastMark(), true);
  assert.equal(addShotFromUsesLastLanding(), true);
  assert.equal(addShotFromKind(null), 'first_shot');
  assert.equal(addShotFromKind(pin), 'last_landing');
  assert.deepEqual(resolveAddShotFromPin({ tee: from, lastLanding: null, phone }), from);
  assert.deepEqual(resolveAddShotFromPin({ tee: from, lastLanding: pin, phone }), pin);
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
  assert.equal(addShotDragLayerStealsTwoFinger(), false);
  assert.equal(addShotDragLayerCoversMap(), false);
  assert.equal(addShotToPinUsesDraggableMarker(), true);
  assert.equal(dragOverlayPointerEvents(true), 'none');
  assert.equal(dragOverlayPointerEvents(false), 'none');
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

  assert.doesNotMatch(map, /testID="to-pin-drag-layer"/);
  assert.doesNotMatch(map, /styles\.dragLayer/);
  assert.doesNotMatch(map, /yieldToMapGesture|dragLayerRef/);
  assert.doesNotMatch(map, /pointerEvents=\{mapOwnsGesture \? 'none' : 'auto'\}/);
  assert.doesNotMatch(map, /onPanDrag=/);
  assert.doesNotMatch(map, /if \(!onPlaceToDrag \|\| mapOwnsGesture\) return/);
  assert.match(map, /draggable=\{Boolean\(onPlaceToDrag\)\}/);
  assert.match(map, /if \(!onPlaceToDrag\) return/);
  assert.match(map, /onPlaceToDrag\(\{ lat: latitude, lng: longitude \}\)/);
  const dragLines = map.slice(map.indexOf('const dragPoint'), map.indexOf('const lockedCameraRef'));
  assert.match(dragLines, /liveDragPointForLines\(\{ live: liveDrag, placed: placedTo/);
  assert.match(dragLines, /drag: dragPoint/);
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

test('Signal Lab: Add-shot overlay cannot steal two-finger pan/pinch on first open or after edit', () => {
  assert.equal(addShotDragLayerStealsTwoFinger(), false);
  assert.equal(addShotDragLayerCoversMap(), false);
  assert.equal(addShotToPinUsesDraggableMarker(), true);
  assert.equal(dragOverlayPointerEvents(false), 'none');
  assert.equal(dragOverlayPointerEvents(true), 'none');
  assert.equal(addShotGesturesWorkOnFirstOpen(), true);
  assert.equal(addShotGesturesWorkAfterEdit(), true);
  assert.equal(addShotGesturesRequireRemount(), false);
  assert.equal(holeMapKeepsScrollZoomOnceMounted(), true);
  assert.equal(twoFingerOwnsMap(2), true);
  assert.equal(dragOneFingerMovesToPin(), true);
  assert.equal(dragTwoFingersPanAndZoom(), true);
  assert.equal(mapPanChangesLiveYards(), false);
  assert.equal(mapPinchChangesLiveYards(), false);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(map, /testID="to-pin-drag-layer"/);
  assert.doesNotMatch(map, /styles\.dragLayer/);
  assert.doesNotMatch(map, /yieldToMapGesture|releaseMapGesture|dragLayerRef/);
  assert.doesNotMatch(map, /pointerEvents=\{mapOwnsGesture \? 'none' : 'auto'\}/);
  assert.doesNotMatch(map, /onPanDrag=/);
  assert.doesNotMatch(map, /scrollEnabled=\{mapOwnsGesture \|\| !toPinLive\}/);
  assert.match(map, /draggable=\{Boolean\(onPlaceToDrag\)\}/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.match(map, /const framedForGestures = holeMapKeepsScrollZoomOnceMounted\(\)/);
  assert.match(map, /pointerEvents="box-none"/);
});

test('Signal Lab: TF 50 Marker-only one-finger to-pin drag; MapView keeps pan/pinch', () => {
  assert.equal(addShotToPinUsesDraggableMarker(), true);
  assert.equal(addShotToPinOneFingerMovesMarkerOnly(), true);
  assert.equal(addShotToPinDragPansMap(), false);
  assert.equal(addShotToPinHitTargetIsTight(), true);
  assert.equal(addShotToPinHitTargetCoversMap(), false);
  assert.equal(addShotToPinHitTargetMaxPx(), 44);
  const hit = addShotToPinHitTargetSize();
  assert.ok(hit.width > 0 && hit.width <= 44);
  assert.ok(hit.height > 0 && hit.height <= 44);
  assert.equal(addShotToPinDragBouncesScrollOff(), false);
  assert.equal(addShotMapOwnsTwoFingerWhilePinLive(), true);
  assert.equal(addShotToPinStopPropagation(), true);
  assert.equal(addShotToPinDragUsesMarkCoords(), true);
  assert.equal(addShotDragLayerStealsTwoFinger(), false);
  assert.equal(addShotDragLayerCoversMap(), false);
  assert.equal(dragOverlayPointerEvents(false), 'none');
  assert.equal(addShotTwoFingerPanAfterFrame(), true);
  assert.equal(addShotPinchZoomAfterFrame(), true);
  assert.equal(addShotMapFrozenWhilePinLive(), false);
  assert.equal(addShotEmptyHoleUsesFirstShotFraming(), true);
  assert.equal(addShotAfterMarksUsesLastLanding(), true);
  assert.equal(addShotAlwaysFirstShotStyle(), false);

  const start = { lat: 37.001, lng: -122.0 };
  const live = { lat: 37.002, lng: -122.001 };
  assert.deepEqual(toPinMarkerCoordinate({ live: null, placedTo: start }), start);
  assert.deepEqual(toPinMarkerCoordinate({ live, placedTo: start }), live);
  assert.equal(toPinMarkerCoordinate({ live: null, placedTo: null }), null);
  const dragYards = liveShotYardsFromThisFromPin({ from, pin: live, phone });
  assert.equal(dragYards, roundYards(haversineYards(from, live)));
  assert.notEqual(dragYards, roundYards(haversineYards(from, start)));

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /testID="to-pin-hit"/);
  assert.match(map, /styles\.toPinHit/);
  assert.match(map, /ADD_SHOT_TO_PIN_HIT_W/);
  assert.match(map, /ADD_SHOT_TO_PIN_HIT_H/);
  assert.match(map, /toPinMarkerCoordinate/);
  assert.match(map, /stopPropagation/);
  assert.match(map, /onDragStart=/);
  assert.match(map, /setToPinDragOrigin\(placedTo\)/);
  assert.match(map, /setToPinDragOrigin\(null\)/);
  assert.match(map, /draggable=\{Boolean\(onPlaceToDrag\)\}/);
  assert.match(map, /onPlaceToDrag\(\{ lat: latitude, lng: longitude \}\)/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.doesNotMatch(map, /testID="to-pin-drag-layer"/);
  assert.doesNotMatch(map, /styles\.dragLayer/);
  assert.doesNotMatch(map, /yieldToMapGesture|releaseMapGesture|dragLayerRef/);
  assert.doesNotMatch(map, /pointerEvents=\{mapOwnsGesture \? 'none' : 'auto'\}/);
  assert.doesNotMatch(map, /onPanDrag=/);
  assert.doesNotMatch(map, /scrollEnabled=\{mapOwnsGesture \|\| !toPinLive\}/);
  assert.doesNotMatch(map, /scrollEnabled=\{!toPinDragging/);
  assert.doesNotMatch(map, /scrollEnabled=\{framedForGestures &&/);
  const hitStyle = map.slice(map.indexOf('toPinHit:'), map.indexOf('toPinHead:'));
  assert.match(hitStyle, /width: ADD_SHOT_TO_PIN_HIT_W/);
  assert.match(hitStyle, /height: ADD_SHOT_TO_PIN_HIT_H/);
  assert.doesNotMatch(hitStyle, /absoluteFill|\.\.\.StyleSheet\.absoluteFill|top: 0|bottom: 0|right: 0|left: 0/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const fromPin = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.match(fromPin, /tee: holeTee/);
  assert.match(fromPin, /lastLanding: lastLandingMark\(shots\)/);
  assert.doesNotMatch(fromPin, /selectedClubId|phone:/);
  assert.match(hole, /freezePan=\{placeMode === 'to' \|\| placeMode === 'edit-to'\}/);
  assert.match(hole, /setPlaceToDraft\(point\)/);
});
