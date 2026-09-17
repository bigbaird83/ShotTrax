import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from './types';
import { planUndoLastShot } from './undoLastShot';

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
