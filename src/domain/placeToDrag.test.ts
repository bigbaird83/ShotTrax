import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import {
  cancelPlaceToDraft,
  confirmPlaceToDraft,
  dragRecentersOnPhone,
  liveYardsFromPinToDrag,
  liveYardsUsesPhone,
  placeToAskOn,
  placeToStoresBeforeConfirm,
} from './placeToDrag';
import { includeInDistanceAverages, placedShotRunsAcceptFix } from './shotSource';

const from = { lat: 37.0, lng: -122.0 };
const drag = { lat: 37.001, lng: -122.0 };
const phone = { lat: 40.7128, lng: -74.006 };
const house = { lat: 40.7, lng: -74.0 };

test('live yards are from the from pin to the drag point, not the phone', () => {
  const yards = liveYardsFromPinToDrag({ from, drag, phone });
  assert.equal(yards, roundYards(haversineYards(from, drag)));
  assert.notEqual(yards, roundYards(haversineYards(from, phone)));
  assert.notEqual(yards, roundYards(haversineYards(house, drag)));
  assert.equal(liveYardsUsesPhone(), false);
  assert.equal(dragRecentersOnPhone(), false);
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
  const live = liveYardsFromPinToDrag({ from, drag: far, phone });
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
  assert.match(hole, /liveYardsFromPinToDrag/);
  assert.match(hole, /setPlaceToDraft/);
  assert.match(hole, /COPY\.confirmPlace/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf("if (placeMode === 'to')"), hole.indexOf("if (placeMode === 'edit-from')")),
    /addPlacedShot|setPlaceClubOpen/,
  );
});
