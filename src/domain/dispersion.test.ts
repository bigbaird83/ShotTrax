import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dispersionClubs,
  formatLateral,
  formatMissShares,
  measureShot,
  onLineBand,
  planDispersion,
  type DispersionShotIn,
} from './dispersion';
import { PUTTER_CLUB_ID } from './defaultBag';

const ORIGIN = { lat: 35.1, lng: -92.3 };
const YD = 0.9144;
const R = 6_371_000;

/** Point `east` / `north` yards from ORIGIN. */
function at(east: number, north: number) {
  const dLat = ((north * YD) / R) * (180 / Math.PI);
  const dLng = ((east * YD) / (R * Math.cos((ORIGIN.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: ORIGIN.lat + dLat, lng: ORIGIN.lng + dLng };
}

function shot(over: Partial<DispersionShotIn> & { end: DispersionShotIn['end'] }): DispersionShotIn {
  return {
    shotId: `s${Math.random()}`,
    clubId: 'club_7i',
    source: 'gps',
    fixQuality: 'good',
    distanceYards: 150,
    impossibleJump: false,
    start: at(0, 0),
    green: at(0, 160),
    playedAt: '2026-06-01T18:00:00Z',
    courseName: 'North Hills',
    holeNumber: 3,
    ...over,
  };
}

test('along and lateral are measured against the start → green line', () => {
  // Green due north. Ball 150 north, 12 east → 12 right.
  assert.deepEqual(measureShot(shot({ end: at(12, 150) })), { along: 150, lateral: 12 });
  assert.deepEqual(measureShot(shot({ end: at(-8, 140) })), { along: 140, lateral: -8 });
  // Green due east: north of the line is left.
  assert.deepEqual(measureShot(shot({ green: at(200, 0), end: at(180, 10) })), { along: 180, lateral: -10 });
});

test('no green, no end, too close to the green, or not a distance sample → skipped', () => {
  assert.equal(measureShot(shot({ end: at(0, 150), green: null })), null);
  assert.equal(measureShot(shot({ end: null })), null);
  assert.equal(measureShot(shot({ end: at(0, 10), green: at(0, 15) })), null);
  assert.equal(measureShot(shot({ end: at(0, 150), impossibleJump: true })), null);
  assert.equal(measureShot(shot({ end: at(0, 150), source: 'no_gps', fixQuality: 'none', distanceYards: null })), null);
  assert.equal(measureShot(shot({ end: at(0, 10), clubId: PUTTER_CLUB_ID, green: at(0, 30) })), null);
  // Placed (two map taps) counts like club averages do.
  assert.ok(measureShot(shot({ end: at(0, 150), source: 'placed', fixQuality: null })));
});

test('plan: averages, middle-80% ranges, and left / on line / right shares', () => {
  const ends = [at(-20, 140), at(-2, 150), at(3, 155), at(15, 148), at(25, 160), at(10, 152)];
  const plan = planDispersion(
    [
      ...ends.map((end) => shot({ end })),
      shot({ end: at(0, 230), clubId: 'club_dr', green: at(0, 400) }),
      shot({ end: at(0, 150), green: null }),
    ],
    'club_7i',
  );
  assert.equal(plan.count, 6);
  assert.equal(plan.avgAlong, 151);
  assert.equal(plan.avgLateral, 5);
  // On-line band at ~150 yd is 7.5 yd: -2 and 3 are on line.
  assert.equal(plan.left, 1);
  assert.equal(plan.onLine, 2);
  assert.equal(plan.right, 3);
  assert.deepEqual(plan.alongRange, { low: 144, high: 158 });
  assert.equal(formatMissShares(plan), '17% left · 33% on line · 50% right');
});

test('fewer than 5 shots: range is min–max', () => {
  const plan = planDispersion([shot({ end: at(-4, 140) }), shot({ end: at(6, 150) })], 'club_7i');
  assert.deepEqual(plan.alongRange, { low: 140, high: 150 });
  assert.deepEqual(plan.lateralRange, { low: -4, high: 6 });
  const none = planDispersion([], 'club_7i');
  assert.equal(none.count, 0);
  assert.equal(none.avgAlong, null);
  assert.equal(none.alongRange, null);
  assert.equal(formatMissShares(none), null);
});

test('club list: measurable shots only, bag order', () => {
  const clubs = {
    club_dr: { name: 'Driver', sortOrder: 1 },
    club_7i: { name: '7 Iron', sortOrder: 8 },
  };
  const list = dispersionClubs(
    [
      shot({ end: at(0, 150) }),
      shot({ end: at(0, 150), green: null }),
      shot({ end: at(0, 240), clubId: 'club_dr', green: at(0, 400) }),
    ],
    clubs,
  );
  assert.deepEqual(list, [
    { id: 'club_dr', name: 'Driver', count: 1 },
    { id: 'club_7i', name: '7 Iron', count: 1 },
  ]);
});

test('labels', () => {
  assert.equal(formatLateral(12), '12 R');
  assert.equal(formatLateral(-8), '8 L');
  assert.equal(formatLateral(0), 'On line');
  assert.equal(formatLateral(null), '—');
  assert.equal(onLineBand(40), 3);
  assert.equal(onLineBand(200), 10);
});

test('dispersion screen reads saved shots only — no live GPS', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/dispersion.tsx', import.meta.url), 'utf8');
  assert.match(page, /listDispersionShots/);
  assert.match(page, /planDispersion/);
  assert.doesNotMatch(page, /useLiveFix|getActiveRound|HoleMap/);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const helper = repo.slice(
    repo.indexOf('export function listDispersionShots'),
    repo.indexOf('/** Saved rounds shaped for `planHandicap`.'),
  );
  assert.match(helper, /hole\.greenLat/);
  assert.doesNotMatch(helper, /useLiveFix|getCurrentPosition|teeLat/);
});
