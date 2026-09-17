import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from './types';
import { planUndoLastShot, planUndoPlacePins } from './undoLastShot';
import { includeInDistanceAverages } from './shotSource';
import { averageWithBadges } from './averages';

function shot(partial: Partial<Shot> & { id: string; seq: number }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    startLat: 1,
    startLng: 2,
    startAccuracyM: 5,
    startFixQuality: 'good',
    endLat: null,
    endLng: null,
    endAccuracyM: null,
    endFixQuality: null,
    distanceYards: null,
    typedYards: null,
    fixQuality: 'good',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: null,
    source: 'gps',
    suggested: false,
    ...partial,
  };
}

test('undo of an open mark deletes it and reopens the prior closed shot', () => {
  const prior = shot({
    id: 's1',
    seq: 1,
    clubId: 'club_driver',
    endedAt: 't1',
    endLat: 1.1,
    endLng: 2.1,
    distanceYards: 180,
  });
  const open = shot({ id: 's2', seq: 2, clubId: 'club_7i' });
  const plan = planUndoLastShot([prior, open]);
  assert.deepEqual(plan, {
    deleteShotId: 's2',
    reopenShotId: 's1',
    nextLastClubId: 'club_driver',
  });
});

test('undo of a lone open mark just deletes it', () => {
  const plan = planUndoLastShot([shot({ id: 's1', seq: 1 })]);
  assert.deepEqual(plan, {
    deleteShotId: 's1',
    reopenShotId: null,
    nextLastClubId: null,
  });
});

test('undo of a no-gps shot deletes it and restores the previous club', () => {
  const gps = shot({ id: 's1', seq: 1, clubId: 'club_5i', endedAt: 't1' });
  const missed = shot({
    id: 's2',
    seq: 2,
    clubId: 'club_pw',
    source: 'no_gps',
    startLat: null,
    startLng: null,
    startFixQuality: 'none',
    fixQuality: 'none',
    endedAt: 't2',
  });
  const plan = planUndoLastShot([gps, missed]);
  assert.deepEqual(plan, {
    deleteShotId: 's2',
    reopenShotId: null,
    nextLastClubId: 'club_5i',
  });
});

test('empty hole has nothing to undo', () => {
  assert.equal(planUndoLastShot([]), null);
});

test('undo of a placed catch-up shot deletes it and recomputes the remaining average', () => {
  const live = shot({
    id: 's1',
    seq: 1,
    clubId: 'club_7i',
    endedAt: 't1',
    distanceYards: 150,
    source: 'gps',
  });
  const placed = shot({
    id: 's2',
    seq: 2,
    clubId: 'club_7i',
    source: 'placed',
    startFixQuality: null,
    endFixQuality: null,
    fixQuality: null,
    endedAt: 't2',
    distanceYards: 170,
  });
  const plan = planUndoLastShot([live, placed]);
  assert.deepEqual(plan, {
    deleteShotId: 's2',
    reopenShotId: null,
    nextLastClubId: 'club_7i',
  });
  const remaining = [live];
  const samples = remaining
    .filter((row) =>
      includeInDistanceAverages({
        source: row.source,
        distanceYards: row.distanceYards,
        fixQuality: row.fixQuality,
        clubId: row.clubId,
      }),
    )
    .map((row) => ({ yards: row.distanceYards ?? 0, fixQuality: row.fixQuality === 'none' ? null : row.fixQuality }));
  const avg = averageWithBadges(samples);
  assert.equal(avg.count, 1);
  assert.equal(avg.avgYards, 150);
});

test('undo last placed from/to pin while catch-up is open', () => {
  const from = { lat: 37, lng: -122 };
  const to = { lat: 37.001, lng: -122 };
  assert.deepEqual(planUndoPlacePins({ from, to }), { from, to: null, mode: 'to' });
  assert.deepEqual(planUndoPlacePins({ from, to: null }), { from: null, to: null, mode: 'from' });
  assert.equal(planUndoPlacePins({ from: null, to: null }), null);
});
