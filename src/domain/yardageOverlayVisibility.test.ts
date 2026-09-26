import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import type { GpsFix } from './types';
import { planLiveGpsToPin } from './yardsToGreen';
import {
  phoneHoleMapYardageOverlaysHidden,
  YARDAGE_OVERLAY_HIDE_BELOW_YD,
  YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS,
  YARDAGE_OVERLAY_SHOW_AT_YD,
} from './yardageOverlayVisibility';

const nowMs = 1_700_000_000_000;
const green = { lat: 37, lng: -122 };

/**
 * Due north of `green` by `yards`. Same earth radius as haversine, so the
 * yards card's rounded number is `yards` for these short offsets.
 */
function fixYardsNorth(yards: number, accuracyM: number | null, timestamp: number): GpsFix {
  const angular = (yards * METERS_PER_YARD) / EARTH_RADIUS_M;
  return {
    lat: green.lat + (angular * 180) / Math.PI,
    lng: green.lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp,
  };
}

function hiddenAt(
  yards: number,
  hidden: boolean,
  opts: { accuracyM?: number | null; ageMs?: number; timestamp?: number } = {},
): boolean {
  const timestamp = opts.timestamp ?? nowMs - (opts.ageMs ?? 1_000);
  const fix = fixYardsNorth(yards, opts.accuracyM === undefined ? 8 : opts.accuracyM, timestamp);
  assert.equal(roundYards(haversineYards(fix, green)), yards);
  return phoneHoleMapYardageOverlaysHidden({ fix, green, nowMs, hidden });
}

test('yardage overlay thresholds are named and leave a band around 100', () => {
  assert.equal(YARDAGE_OVERLAY_HIDE_BELOW_YD, 100);
  assert.equal(YARDAGE_OVERLAY_SHOW_AT_YD, 105);
  assert.ok(YARDAGE_OVERLAY_SHOW_AT_YD > YARDAGE_OVERLAY_HIDE_BELOW_YD);
  assert.equal(YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS, 30_000);
});

test('rings and lines hide at 99 yards with a trusted fix and show at 150', () => {
  assert.equal(planLiveGpsToPin({ fix: fixYardsNorth(99, 8, nowMs), green }).yards, 99);
  assert.equal(planLiveGpsToPin({ fix: fixYardsNorth(99, 8, nowMs), green }).quality, 'good');
  assert.equal(hiddenAt(99, false), true);
  assert.equal(hiddenAt(150, false), false);
  assert.equal(hiddenAt(150, true), false);
  // Soft GPS is the same trusted band the yards card shows.
  assert.equal(hiddenAt(99, false, { accuracyM: 20 }), true);
  assert.equal(planLiveGpsToPin({ fix: fixYardsNorth(99, 20, nowMs), green }).quality, 'soft');
  assert.equal(hiddenAt(150, false, { accuracyM: 20 }), false);
});

test('hysteresis keeps the previous choice between 100 and 105', () => {
  let hidden = false;
  hidden = hiddenAt(150, hidden);
  assert.equal(hidden, false);
  hidden = hiddenAt(104, hidden);
  assert.equal(hidden, false);
  hidden = hiddenAt(100, hidden);
  assert.equal(hidden, false);
  hidden = hiddenAt(99, hidden);
  assert.equal(hidden, true);
  hidden = hiddenAt(100, hidden);
  assert.equal(hidden, true);
  hidden = hiddenAt(104, hidden);
  assert.equal(hidden, true);
  hidden = hiddenAt(105, hidden);
  assert.equal(hidden, false);
  hidden = hiddenAt(99, hidden);
  assert.equal(hidden, true);
  hidden = hiddenAt(105, hidden);
  assert.equal(hidden, false);
});

test('no fix, a stale fix, or untrusted quality leaves overlays shown', () => {
  const close = fixYardsNorth(99, 8, nowMs - 1_000);
  assert.equal(
    phoneHoleMapYardageOverlaysHidden({ fix: null, green, nowMs, hidden: true }),
    false,
  );
  assert.equal(
    phoneHoleMapYardageOverlaysHidden({ fix: undefined, green, nowMs, hidden: true }),
    false,
  );
  assert.equal(
    phoneHoleMapYardageOverlaysHidden({ fix: close, green: null, nowMs, hidden: true }),
    false,
  );
  assert.equal(
    phoneHoleMapYardageOverlaysHidden({
      fix: close,
      green: { lat: 0, lng: 0 },
      nowMs,
      hidden: true,
    }),
    false,
  );

  assert.equal(hiddenAt(99, true, { ageMs: YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS + 1 }), false);
  assert.equal(hiddenAt(50, true, { timestamp: 0 }), false);
  assert.equal(hiddenAt(50, true, { timestamp: nowMs + 5_000 }), false);
  assert.equal(hiddenAt(99, false, { ageMs: YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS }), true);

  // Poor, missing accuracy, and past the card's 600-yard cap: the card shows no number.
  assert.equal(hiddenAt(99, true, { accuracyM: 40 }), false);
  assert.equal(hiddenAt(99, true, { accuracyM: null }), false);
  assert.equal(planLiveGpsToPin({ fix: fixYardsNorth(99, 40, nowMs), green }).quality, 'none');
  assert.equal(hiddenAt(700, true), false);
  assert.equal(planLiveGpsToPin({ fix: fixYardsNorth(700, 8, nowMs), green }).unavailable, true);
});

test('phone hole map gates rings and yardage lines with the live GPS rule', () => {
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const callStart = map.indexOf('phoneHoleMapYardageOverlaysHidden({');
  assert.ok(callStart > 0);
  const call = map.slice(callStart, map.indexOf('});', callStart));
  assert.match(call, /fix: overlayFix/);
  assert.match(call, /green,/);
  assert.doesNotMatch(call, /yardsToGreen|playHeaderYards|courseYards|lastLanding|liveYards:/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /liveFix=\{fix\}/);
  assert.match(playMap, /green=\{green\}/);
  assert.match(hole, /const liveGpsToPin = planLiveGpsToPin\(\{ fix, green \}\)/);
  assert.match(playMap, /userFix=\{catchUpFullScreen \? null : fix\}/);

  assert.equal(map.match(/hideYardageOverlays \? null : distanceRings\.map/g)?.length, 2);
  const drag = map.slice(map.indexOf('function LiveDragGeometry'), map.indexOf('function NativeHoleMap'));
  assert.equal(drag.match(/!hideYardageOverlays && dragLines\.shot/g)?.length, 2);
  assert.equal(drag.match(/!hideYardageOverlays && dragLines\.toGreen/g)?.length, 2);
  const pathDotLine = drag.split('\n').find((line) => line.includes('addShotShowsPathDot'));
  assert.ok(pathDotLine);
  assert.doesNotMatch(pathDotLine, /hideYardageOverlays/);

  const onMapBadge = map.slice(map.lastIndexOf('<YardsToGreenBadge'), map.lastIndexOf('<YardsToGreenBadge') + 280);
  assert.doesNotMatch(onMapBadge, /hideYardageOverlays/);
  const fmb = map.slice(map.indexOf('<FmbRow'), map.indexOf('<FmbRow') + 80);
  assert.doesNotMatch(fmb, /hideYardageOverlays/);
  const playerDot = map.slice(map.indexOf('styles.userDot') - 320, map.indexOf('styles.userDot'));
  assert.doesNotMatch(playerDot, /hideYardageOverlays/);
  assert.match(map, /pinColor="green"/);

  assert.doesNotMatch(map, /targets\/watch|watch-widget/);
});
