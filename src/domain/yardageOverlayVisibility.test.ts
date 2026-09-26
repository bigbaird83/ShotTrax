import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import { yardsToGreenPlayerLabel } from './playerCopy';
import type { GpsFix } from './types';
import { planLiveGpsToPin, type LiveGpsToPin } from './yardsToGreen';
import {
  phoneHoleMapYardageOverlaysHidden,
  YARDAGE_OVERLAY_HIDE_BELOW_YD,
  YARDAGE_OVERLAY_SHOW_AT_YD,
  type YardsCardLive,
} from './yardageOverlayVisibility';

const green = { lat: 37, lng: -122 };

function fixYardsNorth(yards: number, accuracyM: number | null): GpsFix {
  const angular = (yards * METERS_PER_YARD) / EARTH_RADIUS_M;
  return {
    lat: green.lat + (angular * 180) / Math.PI,
    lng: green.lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp: 1_700_000_000_000,
  };
}

/** Digits on the yards card. Null when the card shows a dash. */
function cardReads(live: YardsCardLive): number | null {
  const label = yardsToGreenPlayerLabel(live, {
    hasFix: live.quality !== 'none',
    hasGreen: true,
  });
  if (label.value === '—') return null;
  return Number(label.value);
}

function hiddenFor(live: YardsCardLive | null | undefined, hidden: boolean): boolean {
  return phoneHoleMapYardageOverlaysHidden({ live, hidden });
}

test('yardage overlay thresholds are named and leave a band around 100', () => {
  assert.equal(YARDAGE_OVERLAY_HIDE_BELOW_YD, 100);
  assert.equal(YARDAGE_OVERLAY_SHOW_AT_YD, 105);
  assert.ok(YARDAGE_OVERLAY_SHOW_AT_YD > YARDAGE_OVERLAY_HIDE_BELOW_YD);
});

test('the rule uses the same yards the card displays', () => {
  const close = planLiveGpsToPin({ fix: fixYardsNorth(99, 8), green });
  const far = planLiveGpsToPin({ fix: fixYardsNorth(150, 8), green });
  assert.equal(roundYards(haversineYards(fixYardsNorth(99, 8), green)), close.yards);
  assert.equal(cardReads(close), 99);
  assert.equal(cardReads(far), 150);
  assert.equal(cardReads(close), close.yards);
  assert.equal(cardReads(far), far.yards);
  assert.equal(hiddenFor(close, false), true);
  assert.equal(hiddenFor(far, false), false);
  assert.equal(hiddenFor(far, true), false);

  const soft = planLiveGpsToPin({ fix: fixYardsNorth(99, 20), green });
  assert.equal(soft.quality, 'soft');
  assert.equal(cardReads(soft), 99);
  assert.equal(hiddenFor(soft, false), true);

  const rule = readFileSync(new URL('./yardageOverlayVisibility.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(rule, /planLiveGpsToPin\(|haversineYards\(|yardsToGreen\(/);
});

test('rings and lines hide when the card reads under 100 and show at 150', () => {
  assert.equal(hiddenFor({ yards: 99, quality: 'good' }, false), true);
  assert.equal(hiddenFor({ yards: 150, quality: 'good' }, false), false);
  assert.equal(hiddenFor({ yards: 150, quality: 'soft' }, true), false);
});

test('hysteresis keeps the previous choice between 100 and 105', () => {
  const read = (yards: number, hidden: boolean) =>
    hiddenFor({ yards, quality: 'good' }, hidden);
  let hidden = false;
  hidden = read(150, hidden);
  assert.equal(hidden, false);
  hidden = read(104, hidden);
  assert.equal(hidden, false);
  hidden = read(100, hidden);
  assert.equal(hidden, false);
  hidden = read(99, hidden);
  assert.equal(hidden, true);
  hidden = read(100, hidden);
  assert.equal(hidden, true);
  hidden = read(104, hidden);
  assert.equal(hidden, true);
  hidden = read(105, hidden);
  assert.equal(hidden, false);
  hidden = read(99, hidden);
  assert.equal(hidden, true);
  hidden = read(105, hidden);
  assert.equal(hidden, false);
});

test('a card dash leaves overlays shown', () => {
  const cases: LiveGpsToPin[] = [
    planLiveGpsToPin({ fix: null, green }),
    planLiveGpsToPin({ fix: fixYardsNorth(99, 40), green }),
    planLiveGpsToPin({ fix: fixYardsNorth(99, null), green }),
    planLiveGpsToPin({ fix: fixYardsNorth(99, 8), green: null }),
    planLiveGpsToPin({ fix: fixYardsNorth(99, 8), green: { lat: 0, lng: 0 } }),
    planLiveGpsToPin({ fix: fixYardsNorth(700, 8), green }),
  ];
  for (const live of cases) {
    assert.equal(cardReads(live), null);
    assert.equal(hiddenFor(live, true), false);
  }
  assert.equal(hiddenFor(null, true), false);
  assert.equal(hiddenFor(undefined, true), false);
  assert.equal(hiddenFor({ yards: 99, quality: 'none' }, true), false);
  assert.equal(hiddenFor({ yards: 99, quality: 'forced' }, true), false);
  assert.equal(hiddenFor({ yards: 50, quality: 'good', unavailable: true }, true), false);
});

test('phone hole map gates rings and lines from the yards card value', () => {
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const callStart = map.indexOf('phoneHoleMapYardageOverlaysHidden({');
  assert.ok(callStart > 0);
  const call = map.slice(callStart, map.indexOf('});', callStart));
  assert.match(call, /live: liveGpsToPin/);
  assert.doesNotMatch(call, /yardsToGreen|playHeaderYards|haversine|planLiveGpsToPin|userFix|green,/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /liveGpsToPin=\{liveGpsToPin\}/);
  assert.match(hole, /const liveGpsToPin = planLiveGpsToPin\(\{ fix, green \}\)/);
  const badge = hole.slice(hole.indexOf('testID="live-gps-to-pin"'), hole.indexOf('testID="live-gps-to-pin"') + 500);
  assert.match(badge, /result=\{liveGpsToPin\}/);
  assert.doesNotMatch(playMap, /liveFix=/);

  const rings = map.slice(map.indexOf('planDistanceRings({'), map.indexOf('phoneHoleMapYardageOverlaysHidden({'));
  assert.match(rings, /yardsToGreen/);
  assert.match(rings, /center: userFix \? \{ lat: userFix\.lat, lng: userFix\.lng \} : null/);
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
