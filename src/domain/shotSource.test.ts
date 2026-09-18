import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { averageWithBadges } from './averages';
import {
  confirmPlacedShot,
  hasClosedGpsTrail,
  includeInDistanceAverages,
  includeInTop3Samples,
  isNoGpsShot,
  parseTypedYards,
  placedPinUsesJumpGate,
  placedShotAsksPast400,
  planNoGpsShot,
  planPlacedShot,
} from './shotSource';
import type { Shot } from './types';

function gpsClosed(yards: number, fixQuality: Shot['fixQuality'] = 'good'): Pick<
  Shot,
  'source' | 'distanceYards' | 'fixQuality' | 'startLat' | 'startLng' | 'endLat' | 'endLng' | 'endedAt'
> {
  return {
    source: 'gps',
    distanceYards: yards,
    fixQuality,
    startLat: 37,
    startLng: -122,
    endLat: 37.001,
    endLng: -122,
    endedAt: 't',
  };
}

test('planNoGpsShot uses fixQuality none and never fills coordinates or GPS yards', () => {
  const plan = planNoGpsShot();
  assert.equal(plan.source, 'no_gps');
  assert.equal(plan.fixQuality, 'none');
  assert.equal(plan.startFixQuality, 'none');
  assert.equal(plan.endFixQuality, 'none');
  assert.equal(plan.startLat, null);
  assert.equal(plan.startLng, null);
  assert.equal(plan.endLat, null);
  assert.equal(plan.endLng, null);
  assert.equal(plan.distanceYards, null);
  assert.equal(plan.typedYards, null);
  assert.equal(includeInDistanceAverages(plan), false);
  assert.equal(includeInTop3Samples(plan), false);
});

test('typed yards are UI-only — not GPS distanceYards and not average/top-3 samples', () => {
  const plan = planNoGpsShot(155);
  assert.equal(plan.typedYards, 155);
  assert.equal(plan.distanceYards, null);
  assert.equal(plan.fixQuality, 'none');
  assert.equal(plan.startLat, null);
  assert.equal(plan.startLng, null);
  assert.equal(plan.endLat, null);
  assert.equal(plan.endLng, null);
  assert.equal(includeInDistanceAverages(plan), false);
  assert.equal(includeInTop3Samples(plan), false);
  assert.equal(hasClosedGpsTrail({ ...plan, endedAt: 't' }), false);
});

test('parseTypedYards accepts blank, integer yards, and rejects junk', () => {
  assert.deepEqual(parseTypedYards(''), { ok: true, yards: null });
  assert.deepEqual(parseTypedYards('  '), { ok: true, yards: null });
  assert.deepEqual(parseTypedYards('150'), { ok: true, yards: 150 });
  assert.deepEqual(parseTypedYards('0'), { ok: true, yards: 0 });
  assert.equal(parseTypedYards('12.5').ok, false);
  assert.equal(parseTypedYards('-10').ok, false);
  assert.equal(parseTypedYards('abc').ok, false);
  assert.equal(parseTypedYards('1000').ok, false);
});

test('no_gps / none shots are excluded from distance averages; soft GPS stays in', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 150, fixQuality: 'good' as const },
    { source: 'no_gps' as const, distanceYards: null, fixQuality: 'none' as const },
    { source: 'gps' as const, distanceYards: 170, fixQuality: 'soft' as const },
  ];
  const forAvg = mixed.filter(includeInDistanceAverages).map((s) => ({
    yards: s.distanceYards as number,
    fixQuality: s.fixQuality as 'good' | 'soft' | 'forced',
  }));
  const a = averageWithBadges(forAvg);
  assert.equal(a.count, 2);
  assert.equal(a.avgYards, 160);
  assert.equal(a.includesSoft, true);
  assert.ok(mixed.some(isNoGpsShot));
});

test('fixQuality none is excluded even if distanceYards were wrongly present', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 200, fixQuality: 'good' as const },
    { source: 'gps' as const, distanceYards: 155, fixQuality: 'none' as const },
    { source: 'no_gps' as const, distanceYards: 999, fixQuality: 'none' as const },
  ];
  const kept = mixed.filter(includeInDistanceAverages);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.distanceYards, 200);
});

test('typed yards on no_gps still never enter distance averages or top-3 samples', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 140, fixQuality: 'forced' as const },
    { source: 'no_gps' as const, distanceYards: null, fixQuality: 'none' as const },
  ];
  const kept = mixed.filter(includeInTop3Samples);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.source, 'gps');
  const a = averageWithBadges(
    kept.map((s) => ({ yards: s.distanceYards as number, fixQuality: 'forced' as const })),
  );
  assert.equal(a.avgYards, 140);
  assert.equal(a.includesForced, true);
});

test('honest GPS 0 yd still counts; no_gps still does not', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 0, fixQuality: 'good' as const },
    { source: 'no_gps' as const, distanceYards: null, fixQuality: 'none' as const },
  ];
  const kept = mixed.filter(includeInDistanceAverages);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.source, 'gps');
});

test('no_gps shots are never GPS polylines', () => {
  const plan = planNoGpsShot();
  assert.equal(hasClosedGpsTrail({ ...plan, endedAt: 't' }), false);
  assert.equal(hasClosedGpsTrail(gpsClosed(140)), true);
});

test('penalties are not shots and cannot enter distance averages', () => {
  const gpsOnly = [gpsClosed(140), gpsClosed(160, 'forced')];
  const forAvg = gpsOnly.filter(includeInDistanceAverages).map((s) => ({
    yards: s.distanceYards as number,
    fixQuality: s.fixQuality as 'good' | 'soft' | 'forced',
  }));
  const a = averageWithBadges(forAvg);
  assert.equal(a.count, 2);
  assert.equal(a.avgYards, 150);
  assert.equal(a.includesForced, true);
  assert.equal(includeInDistanceAverages({ source: 'gps', distanceYards: 140, fixQuality: 'good' }), true);
});

test('putter GPS shots never count toward any club sample', () => {
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: 'club_putter',
    }),
    false,
  );
  assert.equal(
    includeInTop3Samples({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: 'club_putter',
    }),
    false,
  );
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 150,
      fixQuality: 'good',
      clubId: 'club_7i',
    }),
    true,
  );
});

test('P1 sensing lock: MAX_SHOT_YD is 400; good/soft/forced still average', () => {
  assert.equal(MAX_SHOT_YD, 400);
  const a = averageWithBadges([
    { yards: 100, fixQuality: 'good' },
    { yards: 120, fixQuality: 'soft' },
    { yards: 140, fixQuality: 'forced' },
  ]);
  assert.equal(a.count, 3);
  assert.equal(a.avgYards, 120);
  assert.equal(a.includesSoft, true);
  assert.equal(a.includesForced, true);
});

test('catch-up placed shot is two map points, haversine yards immediately, counts in averages', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.0 + 150 / 111_320, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.source, 'placed');
  assert.equal(plan.typedYards, null);
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.startFixQuality, null);
  assert.equal(plan.endFixQuality, null);
  assert.equal(plan.startAccuracyM, null);
  assert.equal(plan.endAccuracyM, null);
  assert.ok(plan.distanceYards != null && plan.distanceYards > 0);
  assert.equal(plan.impossibleJump, false);
  assert.equal(plan.startLat, from.lat);
  assert.equal(plan.endLat, to.lat);
  assert.equal(includeInDistanceAverages(plan), true);
  assert.equal(includeInTop3Samples(plan), true);
  assert.equal(includeInDistanceAverages({ ...plan, clubId: 'club_putter' }), false);
  assert.equal(isNoGpsShot(plan), false);
  assert.equal(hasClosedGpsTrail({ ...plan, endedAt: 't' }), true);
  assert.equal(planPlacedShot({ lat: 0, lng: 0 }, to).ok, false);
  assert.deepEqual(confirmPlacedShot(plan, false), { status: 'commit' });
});

test('Signal Lab: placed shots never produce acceptFix quality and still count', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.002, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.source, 'placed');
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.startFixQuality, null);
  assert.equal(plan.endFixQuality, null);
  assert.equal(plan.typedYards, null);
  assert.notEqual(plan.fixQuality, 'good');
  assert.notEqual(plan.fixQuality, 'soft');
  assert.notEqual(plan.fixQuality, 'forced');
  assert.notEqual(plan.fixQuality, 'none');
  assert.equal(includeInDistanceAverages(plan), true);
  assert.equal(includeInDistanceAverages({ ...plan, clubId: 'club_putter' }), false);
});

test('placed shots have no soft/good quality and never go through acceptFix', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.002, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.notEqual(plan.fixQuality, 'good');
  assert.notEqual(plan.fixQuality, 'soft');
  assert.notEqual(plan.fixQuality, 'forced');
  assert.notEqual(plan.fixQuality, 'none');
  const a = averageWithBadges([{ yards: plan.distanceYards, fixQuality: plan.fixQuality }]);
  assert.equal(a.count, 1);
  assert.equal(a.includesSoft, false);
  assert.equal(a.includesForced, false);
});

test('a placed pin over 400 saves without the ask; still no GPS quality', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.01, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.ok(plan.distanceYards > MAX_SHOT_YD);
  assert.equal(plan.impossibleJump, false);
  assert.equal(placedPinUsesJumpGate(), false);
  assert.equal(placedShotAsksPast400(), false);
  assert.deepEqual(confirmPlacedShot(plan, false), { status: 'commit' });
  assert.deepEqual(confirmPlacedShot(plan, true), { status: 'commit' });
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.source, 'placed');
});
