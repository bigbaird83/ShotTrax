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
  editToFreezesPan,
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
  planPlaceToDragPreview,
  toGreenYardsSitOnGreen,
  toPinFollowsFinger,
} from './placeToDrag';
import { placedPinUsesJumpGate, placedShotAsksPast400 } from './shotSource';
import { COPY } from './playerCopy';
import { PLAY_MAP_MIN_RATIO, playMapMinRatio } from './playLayout';
import { includeInDistanceAverages, placedShotRunsAcceptFix } from './shotSource';
import { TO_GREEN_LIVE_MAX_YD } from './yardsToGreen';

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
  const preview = hole.slice(hole.indexOf('const dragPreview'), hole.indexOf('const holeCamera'));
  assert.match(preview, /from: placeFrom/);
  assert.doesNotMatch(preview, /previousFrom|lastClosed/);
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

test('shot yards sit above the finger; to-green stays on the green', () => {
  const preview = planPlaceToDragPreview({ from, drag, green, phone, previousFrom });
  assert.ok(preview);
  assert.equal(preview.shotYards, roundYards(haversineYards(from, drag)));
  assert.notEqual(preview.shotYards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(preview.shotYards, roundYards(haversineYards(from, phone)));
  assert.equal(preview.toGreenYards, roundYards(haversineYards(drag, green)));
  assert.notEqual(preview.toGreenYards, roundYards(haversineYards(phone, green)));
  assert.equal(preview.shotLabel, `${preview.shotYards} yd`);
  assert.equal(preview.toGreenLabel, `${preview.toGreenYards} yd`);
  assert.equal(liveYardsSitAboveFinger(), true);
  assert.equal(toGreenYardsSitOnGreen(), true);
  assert.equal(preview.fingerAt.lat, drag.lat);
  assert.equal(preview.fingerAt.lng, drag.lng);
  assert.equal(preview.shotAt.lat, drag.lat);
  assert.ok(preview.toGreenAt);
  assert.equal(preview.toGreenAt.lat, green.lat);
  assert.equal(preview.toGreenAt.lng, green.lng);
  assert.notEqual(preview.toGreenAt.lat, drag.lat);
  assert.notEqual(preview.shotAt.lat, phone.lat);
  assert.notEqual(preview.toGreenAt.lat, phone.lat);
  assert.equal(dragPreviewInventsGreen(), false);
  assert.equal(placeToAskOn(), 'never');
  assert.equal(placeToFilterOn(), 'confirm');

  const noGreen = planPlaceToDragPreview({ from, drag, green: null, phone });
  assert.ok(noGreen);
  assert.equal(noGreen.toGreenYards, null);
  assert.equal(noGreen.toGreenLabel, '—');
  assert.equal(noGreen.toGreenAt, null);

  const farGreen = { lat: drag.lat + 0.02, lng: drag.lng };
  assert.ok(roundYards(haversineYards(drag, farGreen)) > TO_GREEN_LIVE_MAX_YD);
  const over = planPlaceToDragPreview({ from, drag, green: farGreen, phone });
  assert.ok(over);
  assert.equal(over.toGreenYards, null);
  assert.equal(over.toGreenLabel, '—');
  assert.ok(over.toGreenAt);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /COPY\.shot/);
  assert.match(hole, /dragPreview\.shotLabel/);
  assert.match(hole, /COPY\.toGreen/);
  assert.match(hole, /dragPreview\.toGreenLabel/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /COPY\.shot/);
  assert.match(map, /COPY\.toGreen/);
  assert.match(map, /dragPreview\.fingerAt/);
  assert.match(map, /dragPreview\.toGreenAt/);
  assert.match(map, /anchor=\{\{ x: 0\.5, y: 1 \}\}/);
  const fingerChip = map.slice(map.indexOf('dragPreview.fingerAt'), map.indexOf('dragPreview?.toGreenAt'));
  assert.match(fingerChip, /dragPreview\.shotLabel/);
  assert.doesNotMatch(fingerChip, /dragPreview\.toGreenLabel/);
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
  assert.match(live, /haversineYards\(args\.from, args\.drag\)/);
  assert.match(live, /haversineYards\(args\.drag, args\.green\)/);
  assert.doesNotMatch(live, /acceptFix\(|getFix\(|forceMark\(|\bliveToGreenYards\(/);
  assert.doesNotMatch(live, /fixQuality|quality === |'good'|'soft'|'none'/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dragBlock = hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')"));
  assert.doesNotMatch(dragBlock, /acceptFix|getFix|good|soft|forceMark/);
  const call = hole.slice(hole.indexOf('const dragPreview'), hole.indexOf('const holeCamera'));
  assert.doesNotMatch(call, /phone:|fixQuality|acceptFix/);
  assert.match(hole, /planPlaceToDragPreview/);
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

test('Add shot to-pin is a draft until Confirm shot; edit still does not read the phone', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /confirmPlaceToDraft/);
  assert.match(hole, /liveShotYardsFromThisFromPin|planPlaceToDragPreview/);
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
  assert.equal(dragFreezesPan(), true);
  assert.equal(dragKeepsPinchZoom(), true);
  assert.equal(editToFreezesPan(), true);
  assert.equal(confirmPlaceIsInTopBar(), false);
  assert.match(map, /scrollEnabled=\{!panFrozen\}/);
  assert.match(map, /zoomEnabled/);
  assert.match(map, /to-pin-drag-layer/);
  assert.match(map, /onPlaceToDrag\(\{ lat: latitude, lng: longitude \}\)/);
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
  const dragCall = hole.slice(hole.indexOf('const dragPreview'), hole.indexOf('const holeCamera'));
  assert.match(dragCall, /from: placeFrom/);
  assert.doesNotMatch(dragCall, /previousFrom|lastClosed|phone:/);
});
