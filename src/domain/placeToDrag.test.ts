import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import {
  cancelPlaceToDraft,
  confirmPlaceToDraft,
  dragPreviewRunsAcceptFix,
  dragPreviewUsesFixQuality,
  dragRecentersOnPhone,
  formatDragPreviewYards,
  liveShotYardsFromThisFromPin,
  liveToGreenYardsFromFinger,
  liveYardsFromPinToDrag,
  liveYardsUsesPhone,
  placeToAskOn,
  placeToFilterOn,
  placeToStoresBeforeConfirm,
  planPlaceToDragPreview,
} from './placeToDrag';
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
  const yards = liveYardsFromPinToDrag({ from, drag, phone });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  assert.notEqual(yards, roundYards(haversineYards(house, drag)));
  assert.equal(liveYardsUsesPhone(), false);
  assert.equal(placeToStoresBeforeConfirm(), false);
  assert.deepEqual(cancelPlaceToDraft(), { to: null, stored: false });
  assert.equal(confirmPlaceToDraft({ from, draft: null }).status, 'empty');
  assert.equal(dragRecentersOnPhone(), false);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(PLAY_MAP_MIN_RATIO, 0.6);
});

test('preview shot yards are this shot from pin to the finger, not the prior shot', () => {
  const yards = liveShotYardsFromThisFromPin({ from, drag, phone, previousFrom });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(previousFrom, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  assert.notEqual(yards, roundYards(haversineYards(house, drag)));
  assert.equal(liveYardsFromPinToDrag({ from, drag, phone, previousFrom }), yards);
  assert.equal(liveYardsUsesPhone(), false);
  assert.equal(dragRecentersOnPhone(), false);
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

test('both preview numbers move with the finger and ignore the phone', () => {
  const preview = planPlaceToDragPreview({ from, drag, green, phone, previousFrom });
  assert.ok(preview);
  assert.equal(preview.shotYards, roundYards(haversineYards(from, drag)));
  assert.equal(preview.toGreenYards, roundYards(haversineYards(drag, green)));
  assert.equal(preview.shotLabel, `${preview.shotYards} yd`);
  assert.equal(preview.toGreenLabel, `${preview.toGreenYards} yd`);
  assert.ok(Math.abs(preview.shotAt.lat - (from.lat + drag.lat) / 2) < 1e-12);
  assert.ok(preview.toGreenAt);
  assert.notEqual(preview.shotAt.lat, phone.lat);
  assert.notEqual(preview.toGreenAt?.lat, phone.lat);

  const noGreen = planPlaceToDragPreview({ from, drag, green: null, phone });
  assert.ok(noGreen);
  assert.equal(noGreen.toGreenYards, null);
  assert.equal(noGreen.toGreenLabel, '—');
  assert.equal(noGreen.toGreenAt, null);
});

test('finger preview has no GPS quality and does not run acceptFix', () => {
  assert.equal(dragPreviewUsesFixQuality(), false);
  assert.equal(dragPreviewRunsAcceptFix(), false);
  assert.equal(placeToAskOn(), 'confirm');
  assert.equal(placeToFilterOn(), 'confirm');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dragBlock = hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')"));
  assert.doesNotMatch(dragBlock, /acceptFix|getFix|good|soft|forceMark/);
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

test('400-yard ask happens on Confirm, not mid-drag', () => {
  assert.equal(placeToAskOn(), 'confirm');
  const far = { lat: from.lat + 0.01, lng: from.lng };
  const live = liveShotYardsFromThisFromPin({ from, drag: far, phone });
  assert.ok(live != null && live > MAX_SHOT_YD);
  assert.deepEqual(confirmPlaceToDraft({ from, draft: far, force: false }), {
    status: 'needs_confirm',
    yards: live,
  });
  const forced = confirmPlaceToDraft({ from, draft: far, force: true });
  assert.equal(forced.status, 'commit');
  if (forced.status !== 'commit') return;
  assert.equal(forced.plan.impossibleJump, true);
  assert.equal(forced.plan.source, 'placed');
});

test('Add shot to-pin is a draft until Confirm; edit still does not read the phone', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /confirmPlaceToDraft/);
  assert.match(hole, /liveShotYardsFromThisFromPin|planPlaceToDragPreview/);
  assert.match(hole, /setPlaceToDraft/);
  assert.match(hole, /COPY\.confirmPlace/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')")),
    /addPlacedShot|setPlaceClubOpen/,
  );
});
