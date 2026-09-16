import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageWithBadges } from './averages';
import {
  hasClosedGpsTrail,
  includeInDistanceAverages,
  isNoGpsShot,
  parseTypedYards,
  planNoGpsShot,
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

test('planNoGpsShot never fills coordinates or fix quality (blank yards stay null)', () => {
  const plan = planNoGpsShot();
  assert.equal(plan.source, 'no_gps');
  assert.equal(plan.startLat, null);
  assert.equal(plan.startLng, null);
  assert.equal(plan.endLat, null);
  assert.equal(plan.endLng, null);
  assert.equal(plan.distanceYards, null);
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.startFixQuality, null);
  assert.equal(plan.endFixQuality, null);
});

test('planNoGpsShot stores typed yards but still invents no lat/lng', () => {
  const plan = planNoGpsShot(155);
  assert.equal(plan.distanceYards, 155);
  assert.equal(plan.startLat, null);
  assert.equal(plan.startLng, null);
  assert.equal(plan.endLat, null);
  assert.equal(plan.endLng, null);
  assert.equal(includeInDistanceAverages(plan), false);
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

test('no_gps shots are excluded from distance averages (preferred: not 0 yd)', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 150, fixQuality: 'good' as const },
    { source: 'no_gps' as const, distanceYards: null, fixQuality: null },
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

test('no_gps is excluded even if yards were wrongly present (never treat as 0 yd average)', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 200 },
    { source: 'no_gps' as const, distanceYards: 0 },
    { source: 'no_gps' as const, distanceYards: 999 },
  ];
  const kept = mixed.filter(includeInDistanceAverages);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.distanceYards, 200);
  const a = averageWithBadges(kept.map((s) => ({ yards: s.distanceYards as number, fixQuality: 'good' as const })));
  assert.equal(a.avgYards, 200);
  assert.equal(a.count, 1);
});

test('typed yards on no_gps still never enter distance averages or top-3 samples', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 140, fixQuality: 'good' as const },
    { source: 'no_gps' as const, distanceYards: 155, fixQuality: null },
  ];
  const kept = mixed.filter(includeInDistanceAverages);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.source, 'gps');
  const a = averageWithBadges(
    kept.map((s) => ({ yards: s.distanceYards as number, fixQuality: 'good' as const })),
  );
  assert.equal(a.avgYards, 140);
  assert.equal(a.count, 1);
});

test('honest GPS 0 yd still counts; no_gps still does not', () => {
  const mixed = [
    { source: 'gps' as const, distanceYards: 0 },
    { source: 'no_gps' as const, distanceYards: null },
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
  // A hole penalty is a separate table — adding one does not change this set.
  assert.equal(includeInDistanceAverages({ source: 'gps', distanceYards: 140 }), true);
});
