import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import {
  cancelPlaceToDraft,
  confirmPlaceIsFatButton,
  confirmPlaceIsInTopBar,
  confirmPlaceLabel,
  confirmPlaceToDraft,
  dragFreezesPan,
  dragKeepsPinchZoom,
  addShotMapScrollEnabledAfterFrame,
  addShotMapZoomEnabledAfterFrame,
  addShotMapFrozenWhilePinLive,
  addShotTwoFingerPanAfterFrame,
  addShotPinchZoomAfterFrame,
  addShotGesturesShowUserLocation,
  addShotGesturesRerunCourseCardCamera,
  addShotGesturesLeaveCameraAloneAfterFrame,
  addShotGestureYardsUsePinHaversine,
  addShotGestureYardsUseFingerPixel,
  addShotGestureYardsUseReframe,
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
  editToFreezesPan,
  editToOneFingerMovesToPin,
  editToTwoFingersPanAndZoom,
  dragPreviewInventsGreen,
  dragPreviewRunsAcceptFix,
  dragPreviewUsesFixQuality,
  dragPreviewUsesPhoneFixGate,
  dragRecentersOnPhone,
  formatDragPreviewYards,
  liveShotYardsFromThisFromPin,
  liveToGreenYardsFromFinger,
  liveYardsFromPinToDrag,
  liveYardsUsesPhone,
  liveYardsUsesPreviousShot,
  placedToPinAsksPast400,
  placeToAskOn,
  placeToFilterOn,
  placeToStoresBeforeConfirm,
  liveYardsSitAboveFinger,
  liveYardsAfterMapPan,
  liveYardsUsePinMapCoordinate,
  liveYardsUseScreenPixel,
  mapPanChangesLiveYards,
  mapPinchChangesLiveYards,
  planDragShotLines,
  planPlaceToDragPreview,
  resolveAddShotFromPin,
  courseGreenCenterForLine,
  dragLineEndsAtTreePin,
  dragLineReusesVisiblePinSpan,
  dragLineStartsAtHousePin,
  addShotFollowsUser,
  addShotAlwaysFirstShotStyle,
  addShotAfterMarksUsesLastLanding,
  addShotChainsFromLastMark,
  addShotClubSelectChainsPins,
  addShotEmptyHoleUsesFirstShotFraming,
  addShotFromKind,
  addShotFromUsesHousePin,
  addShotFromUsesLastLanding,
  addShotFromUsesPhone,
  addShotShowsMapsCompass,
  addShotShowsMapsLegal,
  addShotShowsUserLocation,
  addShotShowsUserPin,
  dragYardsSitInHeader,
  dragYardsSitOnLines,
  dragYardsSitOnPins,
  dragYardsSitUnderConfirm,
  toGreenYardsSitOnGreen,
  toPinFollowsFinger,
} from './placeToDrag';
import { placedPinUsesJumpGate, placedShotAsksPast400 } from './shotSource';
import { COPY } from './playerCopy';
import { PLAY_MAP_MIN_RATIO, playMapMinRatio } from './playLayout';
import { includeInDistanceAverages, placedShotRunsAcceptFix } from './shotSource';
import { lastLandingMark, TO_GREEN_LIVE_MAX_YD } from './yardsToGreen';

const from = { lat: 37.0, lng: -122.0 };
const drag = { lat: 37.001, lng: -122.0 };
const previousFrom = { lat: 36.998, lng: -122.002 };
const green = { lat: 37.003, lng: -122.0 };
const phone = { lat: 40.7128, lng: -74.006 };
const house = { lat: 40.7, lng: -74.0 };

test('live yards are from the from pin to the drag point, not the phone, and nothing is stored before Confirm', () => {
  const yards = liveYardsFromPinToDrag({ from, drag, phone, previousFrom });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  assert.notEqual(yards, roundYards(haversineYards(house, drag)));
  assert.equal(liveYardsUsesPhone(), false);
  assert.equal(liveYardsUsesPreviousShot(), false);
  assert.equal(placeToStoresBeforeConfirm(), false);
  assert.deepEqual(cancelPlaceToDraft(), { to: null, stored: false });
  assert.equal(confirmPlaceToDraft({ from, draft: null }).status, 'empty');
  assert.equal(dragRecentersOnPhone(), false);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(PLAY_MAP_MIN_RATIO, 0.6);
});

test('preview is this shot from pin to the finger, not the prior shot', () => {
  const yards = liveShotYardsFromThisFromPin({ from, drag, phone, previousFrom });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  assert.notEqual(yards, roundYards(haversineYards(house, drag)));
  assert.equal(liveYardsFromPinToDrag({ from, drag, phone, previousFrom }), yards);
  assert.equal(liveYardsUsesPreviousShot(), false);
  assert.equal(placeToAskOn(), 'never');
  assert.equal(placeToFilterOn(), 'confirm');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const fromPin = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.match(fromPin, /tee: holeTee/);
  assert.match(fromPin, /lastLanding: lastLandingMark\(shots\)/);
  assert.doesNotMatch(fromPin, /selectedClubId|phone:/);
});

test('preview to-green is fingertip to green center; over 600 or no green is a dash', () => {
  const toGreen = liveToGreenYardsFromFinger({ drag, green, phone });
  assert.equal(toGreen, roundYards(haversineYards(drag, green)));
  assert.notEqual(toGreen, roundYards(haversineYards(phone, green)));
  assert.notEqual(toGreen, roundYards(haversineYards(from, green)));
  assert.equal(liveToGreenYardsFromFinger({ drag, green: null, phone }), null);
  assert.equal(formatDragPreviewYards(null), '—');

  const farGreen = { lat: drag.lat + 0.02, lng: drag.lng };
  const farYards = roundYards(haversineYards(drag, farGreen));
  assert.ok(farYards > TO_GREEN_LIVE_MAX_YD);
  assert.equal(liveToGreenYardsFromFinger({ drag, green: farGreen, phone }), null);
  assert.equal(formatDragPreviewYards(null), '—');
});

test('shot and to-green yards sit on the two dotted lines, not the header or pins', () => {
  const lines = planDragShotLines({ from, drag, green, phone });
  assert.ok(lines.shot);
  assert.ok(lines.toGreen);
  assert.equal(lines.shot.yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(lines.shot.yards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(lines.shot.yards, roundYards(haversineYards(from, phone)));
  assert.equal(lines.toGreen.yards, roundYards(haversineYards(drag, green)));
  assert.notEqual(lines.toGreen.yards, roundYards(haversineYards(phone, green)));
  assert.deepEqual(lines.shot.from, from);
  assert.deepEqual(lines.shot.to, drag);
  assert.deepEqual(lines.toGreen.from, drag);
  assert.deepEqual(lines.toGreen.to, green);
  assert.equal(lines.shot.label, `${lines.shot.yards} yd`);
  assert.equal(lines.toGreen.label, `${lines.toGreen.yards} yd`);
  assert.equal(dragYardsSitOnLines(), true);
  assert.equal(dragYardsSitInHeader(), false);
  assert.equal(dragYardsSitUnderConfirm(), false);
  assert.equal(dragYardsSitOnPins(), false);
  assert.equal(liveYardsSitAboveFinger(), false);
  assert.equal(toGreenYardsSitOnGreen(), false);
  assert.equal(dragPreviewInventsGreen(), false);

  const noGreen = planDragShotLines({ from, drag, green: null, phone });
  assert.ok(noGreen.shot);
  assert.equal(noGreen.toGreen, null);

  const farGreen = { lat: drag.lat + 0.02, lng: drag.lng };
  assert.ok(roundYards(haversineYards(drag, farGreen)) > TO_GREEN_LIVE_MAX_YD);
  const over = planDragShotLines({ from, drag, green: farGreen, phone });
  assert.ok(over.shot);
  assert.equal(over.toGreen, null);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(hole, /dragPreview\.shotLabel/);
  assert.doesNotMatch(hole, /Shot \$\{dragPreview/);
  assert.doesNotMatch(hole, /COPY\.shot\} \$\{dragPreview|COPY\.toGreen\} \$\{dragPreview/);
  const header = hole.slice(hole.indexOf('styles.catchUpBar'), hole.indexOf('placeHint ?'));
  assert.doesNotMatch(header, /COPY\.shot|COPY\.toGreen|107 yd|162 yd/);
  const confirm = hole.slice(hole.indexOf('label={COPY.confirmPlace}'), hole.indexOf('{!hideHoleButtons'));
  assert.match(confirm, /COPY\.confirmPlace/);
  assert.doesNotMatch(confirm, /shotLabel|toGreenLabel|107 yd|placeHint|COPY\.shot|COPY\.toGreen/);
  assert.match(hole, /lineFrom=\{placeMode === 'edit-from'/);
  assert.match(hole, /lineGreen=\{courseGreen\}/);
  assert.doesNotMatch(hole, /addShotFrom \?\? placeFrom/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /planDragShotLines/);
  assert.match(map, /lineDashPattern/);
  assert.match(map, /dragLines\.shot\.label/);
  assert.match(map, /dragLines\.toGreen\.label/);
  assert.match(map, /dragLines\.shot\.mid/);
  assert.match(map, /dragLines\.toGreen\.mid/);
  assert.doesNotMatch(map, /dragPreview\.pinAt|dragChip|COPY\.shot/);
  assert.doesNotMatch(map, /title="Green"|title="From"|title="Landed"/);
});

test('finger preview has no GPS quality and does not run acceptFix', () => {
  assert.equal(dragPreviewUsesFixQuality(), false);
  assert.equal(dragPreviewRunsAcceptFix(), false);
  assert.equal(dragPreviewUsesPhoneFixGate(), false);
  assert.equal(placeToAskOn(), 'never');
  assert.equal(placeToFilterOn(), 'confirm');
  const preview = planPlaceToDragPreview({ from, drag, green, phone });
  assert.ok(preview);
  assert.equal(Object.hasOwn(preview, 'quality'), false);
  assert.equal(Object.hasOwn(preview, 'fixQuality'), false);
  assert.equal(liveYardsUsesPhone(), false);

  const src = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  const live = src.slice(
    src.indexOf('export function liveShotYardsFromThisFromPin'),
    src.indexOf('export type ConfirmPlaceToDraft'),
  );
  assert.match(live, /haversineYards\(args\.from, pin\)/);
  assert.match(live, /haversineYards\(pin, args\.green\)/);
  assert.doesNotMatch(live, /locationX|locationY|pageX|pageY/);
  assert.doesNotMatch(live, /acceptFix\(|getFix\(|forceMark\(|\bliveToGreenYards\(/);
  assert.doesNotMatch(live, /fixQuality|quality === |'good'|'soft'|'none'/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dragBlock = hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')"));
  assert.doesNotMatch(dragBlock, /acceptFix|getFix|good|soft|forceMark/);
  const call = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.doesNotMatch(call, /phone:|fixQuality|acceptFix|screen:|camera:/);
  assert.match(call, /tee: holeTee/);
  assert.match(hole, /resolveAddShotFromPin/);
});

test('nothing is stored before Confirm; cancel leaves no to pin', () => {
  assert.equal(placeToStoresBeforeConfirm(), false);
  assert.deepEqual(cancelPlaceToDraft(), { to: null, stored: false });
  assert.equal(confirmPlaceToDraft({ from, draft: null }).status, 'empty');
  const confirmed = confirmPlaceToDraft({ from, draft: drag });
  assert.equal(confirmed.status, 'commit');
  if (confirmed.status !== 'commit') return;
  assert.equal(confirmed.to.lat, drag.lat);
  assert.equal(confirmed.to.lng, drag.lng);
  assert.equal(confirmed.plan.source, 'placed');
  assert.equal(placedShotRunsAcceptFix(), false);
  assert.equal(
    includeInDistanceAverages({
      source: confirmed.plan.source,
      distanceYards: confirmed.plan.distanceYards,
      fixQuality: confirmed.plan.fixQuality,
    }),
    true,
  );
});

test('a placed pin over 400 saves without the 400-yard ask', () => {
  assert.equal(placeToAskOn(), 'never');
  assert.equal(placedToPinAsksPast400(), false);
  assert.equal(placedPinUsesJumpGate(), false);
  assert.equal(placedShotAsksPast400(), false);
  const far = { lat: from.lat + 0.01, lng: from.lng };
  const live = liveShotYardsFromThisFromPin({ from, drag: far, phone });
  assert.ok(live != null && live > MAX_SHOT_YD);
  const saved = confirmPlaceToDraft({ from, draft: far, force: false });
  assert.equal(saved.status, 'commit');
  if (saved.status !== 'commit') return;
  assert.equal(saved.plan.source, 'placed');
  assert.equal(saved.plan.impossibleJump, false);
  assert.ok(saved.plan.distanceYards > MAX_SHOT_YD);
  assert.equal(saved.to.lat, far.lat);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const confirm = hole.slice(hole.indexOf('const confirmToPin'), hole.indexOf('const commitPlaced'));
  const placed = hole.slice(hole.indexOf('const commitPlaced'), hole.indexOf('const onConfirmUndo'));
  const move = hole.slice(hole.indexOf('const commitMovePin'), hole.indexOf('const onUndoEdit'));
  assert.doesNotMatch(confirm, /COPY\.tooFar|Alert\.alert/);
  assert.doesNotMatch(placed, /COPY\.tooFar|Alert\.alert|force:\s*true/);
  assert.doesNotMatch(move, /COPY\.tooFar|Alert\.alert/);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const prompt = actions.slice(actions.indexOf('export function promptForPlan'), actions.indexOf('function priorOf'));
  assert.match(prompt, /needs_force_impossible_jump/);
  assert.match(prompt, /COPY\.tooFar/);
});

test('panning the map leaves shot and to-green unchanged unless the landing pin moved', () => {
  assert.equal(liveYardsUsePinMapCoordinate(), true);
  assert.equal(liveYardsUseScreenPixel(), false);
  assert.equal(mapPanChangesLiveYards(), false);
  assert.equal(mapPinchChangesLiveYards(), false);

  const pin = drag;
  const cameraBefore = { lat: 37.0, lng: -122.0 };
  const cameraAfter = { lat: 37.02, lng: -122.03 };
  const screenBefore = { x: 40, y: 90 };
  const screenAfter = { x: 310, y: 480 };

  const before = planPlaceToDragPreview({
    from,
    pin,
    green,
    camera: cameraBefore,
    screen: screenBefore,
  });
  const afterPan = planPlaceToDragPreview({
    from,
    pin,
    green,
    camera: cameraAfter,
    screen: screenAfter,
  });
  assert.ok(before);
  assert.ok(afterPan);
  assert.equal(afterPan.shotYards, before.shotYards);
  assert.equal(afterPan.toGreenYards, before.toGreenYards);
  assert.equal(afterPan.shotYards, roundYards(haversineYards(from, pin)));
  assert.equal(afterPan.toGreenYards, roundYards(haversineYards(pin, green)));
  assert.notEqual(afterPan.shotYards, roundYards(haversineYards(from, cameraAfter)));
  assert.notEqual(afterPan.toGreenYards, roundYards(haversineYards(cameraAfter, green)));

  const panned = liveYardsAfterMapPan({
    from,
    pin,
    green,
    cameraBefore,
    cameraAfter,
    screenBefore,
    screenAfter,
  });
  assert.ok(panned);
  assert.equal(panned.changed, false);
  assert.equal(panned.shotYards, before.shotYards);
  assert.equal(panned.toGreenYards, before.toGreenYards);

  const movedPin = { lat: pin.lat + 0.002, lng: pin.lng };
  const afterMove = planPlaceToDragPreview({
    from,
    pin: movedPin,
    green,
    camera: cameraAfter,
    screen: screenAfter,
  });
  assert.ok(afterMove);
  assert.notEqual(afterMove.shotYards, before.shotYards);
  assert.notEqual(afterMove.toGreenYards, before.toGreenYards);
  assert.equal(afterMove.shotYards, roundYards(haversineYards(from, movedPin)));
  assert.equal(afterMove.toGreenYards, roundYards(haversineYards(movedPin, green)));

  const src = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  const live = src.slice(
    src.indexOf('export function liveShotYardsFromThisFromPin'),
    src.indexOf('export type ConfirmPlaceToDraft'),
  );
  assert.match(live, /void args\.screen/);
  assert.match(live, /void args\.camera/);
  assert.match(live, /haversineYards\(args\.from, pin\)/);
  assert.match(live, /haversineYards\(pin, args\.green\)/);
  assert.doesNotMatch(live, /locationX|locationY|pageX|pageY/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const preview = map.slice(map.indexOf('const dragPoint'), map.indexOf('const lockedCameraRef'));
  assert.match(preview, /liveDragPointForLines\(\{ live: liveDrag, placed: placedTo/);
  assert.match(preview, /drag: dragPoint/);
  assert.doesNotMatch(preview, /locationX|locationY|screen:|camera:/);
  assert.match(map, /if \(!onPlaceToDrag\) return/);
  assert.doesNotMatch(map, /if \(!onPlaceToDrag \|\| mapOwnsGesture\) return/);
  assert.doesNotMatch(map, /onPanDrag=/);
  assert.match(map, /planDragShotLines/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const call = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.match(call, /tee: holeTee/);
  assert.doesNotMatch(call, /screen:|camera:|locationX|pageX/);
});

test('Add shot to-pin is a draft until Confirm shot; edit still does not read the phone', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /confirmPlaceToDraft/);
  assert.match(hole, /resolveAddShotFromPin|planDragShotLines/);
  assert.match(hole, /setPlaceToDraft/);
  assert.match(hole, /COPY\.confirmPlace/);
  assert.match(hole, /label=\{COPY\.confirmPlace\}/);
  assert.match(hole, /styles\.confirmDock/);
  assert.equal(COPY.confirmPlace, 'Confirm shot');
  assert.equal(confirmPlaceLabel(), 'Confirm shot');
  assert.equal(confirmPlaceIsFatButton(), true);
  const header = hole.slice(hole.indexOf('styles.catchUpBar'), hole.indexOf('placeHint ?'));
  assert.doesNotMatch(header, /COPY\.confirmPlace/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')")),
    /addPlacedShot|setPlaceClubOpen/,
  );
});

test('to pin follows the finger; live yards are this shot only; nothing stores before Confirm shot', () => {
  assert.equal(toPinFollowsFinger(), true);
  assert.equal(placeToStoresBeforeConfirm(), false);
  assert.equal(placeToAskOn(), 'never');
  assert.equal(placeToFilterOn(), 'confirm');
  const yards = liveShotYardsFromThisFromPin({ from, drag, phone, previousFrom });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  const previewSrc = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  const live = previewSrc.slice(
    previewSrc.indexOf('export function liveShotYardsFromThisFromPin'),
    previewSrc.indexOf('export type ConfirmPlaceToDraft'),
  );
  assert.doesNotMatch(live, /shotMovesClubAverage|AVERAGE_OUTLIER_RATIO/);
  assert.doesNotMatch(live, /acceptFix\(|forceMark\(/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.equal(dragFreezesPan(), false);
  assert.equal(dragOneFingerMovesToPin(), true);
  assert.equal(dragTwoFingersPanAndZoom(), true);
  assert.equal(addShotDragLayerStealsTwoFinger(), false);
  assert.equal(addShotDragLayerCoversMap(), false);
  assert.equal(addShotToPinUsesDraggableMarker(), true);
  assert.equal(dragOverlayPointerEvents(false), 'none');
  assert.equal(dragOverlayPointerEvents(true), 'none');
  assert.equal(dragKeepsPinchZoom(), true);
  assert.equal(addShotMapScrollEnabledAfterFrame(), true);
  assert.equal(addShotMapZoomEnabledAfterFrame(), true);
  assert.equal(addShotMapFrozenWhilePinLive(), false);
  assert.equal(addShotTwoFingerPanAfterFrame(), true);
  assert.equal(addShotPinchZoomAfterFrame(), true);
  assert.equal(addShotGesturesShowUserLocation(), false);
  assert.equal(addShotGesturesRerunCourseCardCamera(), false);
  assert.equal(addShotGesturesLeaveCameraAloneAfterFrame(), true);
  assert.equal(addShotGestureYardsUsePinHaversine(), true);
  assert.equal(addShotGestureYardsUseFingerPixel(), false);
  assert.equal(addShotGestureYardsUseReframe(), false);
  assert.equal(editToFreezesPan(), false);
  assert.equal(editToOneFingerMovesToPin(), true);
  assert.equal(editToTwoFingersPanAndZoom(), true);
  assert.equal(confirmPlaceIsInTopBar(), false);
  assert.match(map, /const framedForGestures = holeMapKeepsScrollZoomOnceMounted\(\)/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.doesNotMatch(map, /scrollEnabled=\{mapOwnsGesture \|\| !toPinLive\}/);
  assert.doesNotMatch(map, /testID="to-pin-drag-layer"/);
  assert.doesNotMatch(map, /styles\.dragLayer/);
  assert.doesNotMatch(map, /yieldToMapGesture|dragLayerRef/);
  assert.doesNotMatch(map, /pointerEvents=\{mapOwnsGesture \? 'none' : 'auto'\}/);
  assert.doesNotMatch(map, /if \(!onPlaceToDrag \|\| mapOwnsGesture\) return/);
  assert.doesNotMatch(map, /onPanDrag=/);
  assert.match(map, /draggable=\{Boolean\(onPlaceToDrag\)\}/);
  assert.match(map, /if \(!onPlaceToDrag\) return/);
  assert.match(map, /onPlaceToDrag\(\{ lat: latitude, lng: longitude \}\)/);
  assert.match(map, /testID="to-pin-hit"/);
  assert.match(map, /stopPropagation/);
  assert.match(map, /toPinMarkerCoordinate/);
  assert.equal(addShotToPinOneFingerMovesMarkerOnly(), true);
  assert.equal(addShotToPinDragPansMap(), false);
  assert.equal(addShotToPinHitTargetIsTight(), true);
  assert.equal(addShotToPinHitTargetCoversMap(), false);
  assert.ok(addShotToPinHitTargetSize().width <= addShotToPinHitTargetMaxPx());
  assert.ok(addShotToPinHitTargetSize().height <= addShotToPinHitTargetMaxPx());
  assert.equal(addShotToPinDragBouncesScrollOff(), false);
  assert.equal(addShotMapOwnsTwoFingerWhilePinLive(), true);
  assert.equal(addShotToPinStopPropagation(), true);
  assert.equal(addShotToPinDragUsesMarkCoords(), true);
  assert.deepEqual(toPinMarkerCoordinate({ placedTo: drag, dragOrigin: from }), from);
  assert.doesNotMatch(map, /scrollEnabled=\{!panFrozen\}/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /freezePan=\{placeMode === 'to' \|\| placeMode === 'edit-to'\}/);
  assert.match(hole, /placeMode === 'to' \|\| placeMode === 'edit-to'/);
  assert.match(hole, /setPlaceToDraft\(point\)/);
  assert.match(hole, /styles\.confirmDock/);
  assert.match(hole, /COPY\.prevHole/);
  assert.match(hole, /COPY\.nextHole/);
  assert.equal(COPY.prevHole, 'Prev hole');
  assert.equal(COPY.nextHole, 'Next hole');
  assert.doesNotMatch(
    hole.slice(hole.indexOf('styles.catchUpBar'), hole.indexOf('placeHint ?')),
    /COPY\.confirmPlace/,
  );
  const editToTap = hole.slice(
    hole.indexOf("if (placeMode === 'edit-to')"),
    hole.indexOf('onDropGreenEstimate'),
  );
  assert.match(editToTap, /setPlaceToDraft\(tap\)/);
  assert.doesNotMatch(editToTap, /commitMovePin|addPlacedShot/);
  const dragCall = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.match(dragCall, /tee: holeTee/);
  assert.doesNotMatch(dragCall, /previousFrom|phone:/);
});

test('Add shot from-pin is tee when empty, last landing after marks — never house, phone, or puck', () => {
  assert.deepEqual(resolveAddShotFromPin({ tee: from, lastLanding: null, phone }), from);
  assert.deepEqual(resolveAddShotFromPin({ tee: from, lastLanding: drag, phone }), drag);
  assert.deepEqual(
    resolveAddShotFromPin({ tee: from, lastLanding: drag, selectedClubId: 'club_driver' }),
    drag,
  );
  assert.equal(addShotFromKind(null), 'first_shot');
  assert.equal(addShotFromKind(drag), 'last_landing');
  assert.equal(addShotAlwaysFirstShotStyle(), false);
  assert.equal(addShotEmptyHoleUsesFirstShotFraming(), true);
  assert.equal(addShotAfterMarksUsesLastLanding(), true);
  assert.equal(addShotChainsFromLastMark(), true);
  assert.equal(addShotFromUsesLastLanding(), true);
  assert.equal(addShotClubSelectChainsPins(), false);
  assert.equal(resolveAddShotFromPin({ tee: null, lastLanding: null, phone }), null);
  assert.notEqual(resolveAddShotFromPin({ tee: from, lastLanding: null, phone })?.lat, phone.lat);
  assert.notEqual(resolveAddShotFromPin({ tee: from, lastLanding: null, phone })?.lat, house.lat);
  assert.notEqual(resolveAddShotFromPin({ tee: from, lastLanding: drag, phone })?.lat, from.lat);
  assert.equal(addShotFromUsesPhone(), false);
  assert.equal(addShotFromUsesHousePin(), false);
  assert.equal(addShotShowsUserLocation(), false);
  assert.equal(addShotShowsUserPin(), false);
  assert.equal(addShotFollowsUser(), false);
  assert.equal(addShotShowsMapsLegal(), false);
  assert.equal(addShotShowsMapsCompass(), false);

  const houseFrom = planDragShotLines({ from: house, drag, green, phone });
  const teeFrom = planDragShotLines({ from, drag, green, phone });
  assert.notEqual(houseFrom.shot?.yards, teeFrom.shot?.yards);
  assert.deepEqual(teeFrom.shot?.from, from);
  assert.notDeepEqual(teeFrom.shot?.from, house);
  assert.notDeepEqual(teeFrom.shot?.from, phone);
  assert.deepEqual(teeFrom.toGreen?.to, green);
  assert.notDeepEqual(teeFrom.toGreen?.to, phone);
  assert.notEqual(teeFrom.toGreen?.yards, houseFrom.shot?.yards);
  assert.equal(dragLineStartsAtHousePin(), false);
  assert.equal(dragLineEndsAtTreePin(), false);
  assert.equal(dragLineReusesVisiblePinSpan(), false);
  assert.equal(courseGreenCenterForLine({ green, source: 'course_centroid' })?.lat, green.lat);
  assert.equal(courseGreenCenterForLine({ green, source: 'user_estimate' }), null);
  assert.deepEqual(courseGreenCenterForLine({ green, source: null }), green);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const startCatchUp = hole.slice(hole.indexOf('const startCatchUp'), hole.indexOf('const closeEdit'));
  assert.match(startCatchUp, /addShotFromRef\.current/);
  assert.doesNotMatch(startCatchUp, /selectedClubId|selectedClub/);
  const addShotCall = hole.slice(hole.indexOf('const addShotFrom = resolveAddShotFromPin'), hole.indexOf('const insertSlots'));
  assert.match(addShotCall, /tee: holeTee/);
  assert.match(addShotCall, /lastLanding: lastLandingMark\(shots\)/);
  assert.doesNotMatch(addShotCall, /selectedClubId|phone:/);
  const src = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  const resolveFn = src.slice(
    src.indexOf('export function resolveAddShotFromPin'),
    src.indexOf('export function midpointLatLng'),
  );
  assert.match(resolveFn, /addShotFromKind\(args\.lastLanding\)/);
  assert.match(resolveFn, /return args\.lastLanding/);
  assert.match(resolveFn, /void args\.selectedClubId/);
  assert.doesNotMatch(resolveFn, /void args\.lastLanding/);
  assert.match(hole, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.match(hole, /allowMapsChrome=\{!catchUpFullScreen\}/);
  assert.match(hole, /addShotFromRef\.current/);
  assert.match(hole, /courseGreenCenterForLine/);
  assert.match(hole, /lineFrom=/);
  assert.match(hole, /lineGreen=\{courseGreen\}/);
  assert.doesNotMatch(hole, /addShotFrom \?\? placeFrom/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /followsUserLocation=\{false\}/);
  assert.match(map, /showPhonePin && userDot/);
  assert.match(map, /styles\.legalCover/);
  assert.match(map, /from: lineFrom/);
  assert.match(map, /green: lineGreen/);
  assert.doesNotMatch(map, /from: placedFrom/);
  assert.doesNotMatch(map, /showsUserLocation=\{true\}/);
});

test('TF 50: hold-drag freezes Marker coordinate; yards follow the real mark', () => {
  const origin = drag;
  const next = { lat: drag.lat + 0.002, lng: drag.lng };
  assert.deepEqual(toPinMarkerCoordinate({ placedTo: origin, dragOrigin: null }), origin);
  assert.deepEqual(toPinMarkerCoordinate({ placedTo: next, dragOrigin: origin }), origin);
  assert.equal(toPinMarkerCoordinate({ placedTo: null, dragOrigin: null }), null);
  assert.deepEqual(toPinMarkerCoordinate({ placedTo: origin, dragOrigin: { lat: 0, lng: 0 } }), origin);

  const live = liveShotYardsFromThisFromPin({ from, pin: next, phone });
  assert.equal(live, roundYards(haversineYards(from, next)));
  assert.notEqual(live, roundYards(haversineYards(from, origin)));
  assert.equal(addShotToPinDragUsesMarkCoords(), true);
  assert.equal(addShotToPinDragPansMap(), false);
  assert.equal(addShotToPinHitTargetIsTight(), true);
  assert.equal(addShotToPinHitTargetCoversMap(), false);
  assert.equal(addShotToPinOneFingerMovesMarkerOnly(), true);
  assert.equal(addShotMapOwnsTwoFingerWhilePinLive(), true);
  assert.equal(addShotToPinDragBouncesScrollOff(), false);
  assert.equal(addShotEmptyHoleUsesFirstShotFraming(), true);
  assert.equal(addShotAfterMarksUsesLastLanding(), true);
});

test('empty hole frames first-shot tee; after a closed drive Add shot starts at last landing', () => {
  const landing = drag;
  assert.equal(lastLandingMark([]), null);
  assert.equal(addShotFromKind(lastLandingMark([])), 'first_shot');
  assert.deepEqual(
    resolveAddShotFromPin({ tee: from, lastLanding: lastLandingMark([]), phone }),
    from,
  );

  const afterDrive = lastLandingMark([
    {
      seq: 1,
      endLat: landing.lat,
      endLng: landing.lng,
      endedAt: '2026-09-20T12:00:00.000Z',
      source: 'placed',
      fixQuality: 'good',
    },
  ]);
  assert.deepEqual(afterDrive, landing);
  assert.equal(addShotFromKind(afterDrive), 'last_landing');
  assert.deepEqual(resolveAddShotFromPin({ tee: from, lastLanding: afterDrive, phone }), landing);
  assert.notDeepEqual(resolveAddShotFromPin({ tee: from, lastLanding: afterDrive, phone }), from);
  assert.equal(addShotEmptyHoleUsesFirstShotFraming(), true);
  assert.equal(addShotAfterMarksUsesLastLanding(), true);
  assert.equal(addShotAlwaysFirstShotStyle(), false);
});
