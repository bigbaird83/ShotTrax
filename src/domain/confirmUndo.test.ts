import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CONFIRM_UNDO_MS,
  confirmUndoAverageEligibleAt,
  confirmUndoCountsTowardSeedFive,
  confirmUndoEntersAverage,
  confirmUndoIsDockRow,
  confirmUndoIsLive,
  confirmUndoShotEntersAverage,
  confirmUndoShowsChipYards,
  confirmUndoUsesDeleteConfirm,
  confirmUndoWindowMs,
  planConfirmUndo,
} from './confirmUndo';
import { clubAverageFromShots } from './averages';
import { MIN_CLOSED_SHOTS_FOR_RANK } from './rankClubs';

test('Confirm Undo is up for 5 seconds, then the shot sticks', () => {
  assert.equal(confirmUndoWindowMs(), 5000);
  assert.equal(CONFIRM_UNDO_MS, 5000);
  const window = planConfirmUndo('shot-1', 1_000);
  assert.equal(window.shotId, 'shot-1');
  assert.equal(window.expiresAt, 6_000);
  assert.equal(confirmUndoIsLive(window, 5_999), true);
  assert.equal(confirmUndoIsLive(window, 6_000), false);
  assert.equal(confirmUndoIsLive(null, 1_000), false);
});

test('Confirm Undo is not a dock row; it removes the just-confirmed shot', () => {
  assert.equal(confirmUndoIsDockRow(), false);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planConfirmUndo/);
  assert.match(hole, /confirmUndoIsLive/);
  assert.match(hole, /deleteHoleShot/);
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.doesNotMatch(dock, /confirmUndo|COPY\.undoLast/);
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  const overlay = hole.slice(hole.indexOf('playLayout.shotLine'), hole.indexOf('!hideHoleButtons'));
  assert.match(overlay, /COPY\.undoLast/);
  assert.match(overlay, /onConfirmUndo/);
});

test('Confirm Undo never enters the average or the five that replace the seed', () => {
  assert.equal(confirmUndoEntersAverage(), false);
  assert.equal(confirmUndoCountsTowardSeedFive(), false);
  assert.equal(confirmUndoShowsChipYards(), false);
  const now = 1_000;
  const window = planConfirmUndo('pending', now);
  const eligibleAt = confirmUndoAverageEligibleAt(now);
  assert.equal(confirmUndoShotEntersAverage(eligibleAt, now + 4_999), false);
  assert.equal(confirmUndoShotEntersAverage(eligibleAt, now + 5_000), true);
  assert.equal(confirmUndoShotEntersAverage(null, now), true);
  assert.equal(confirmUndoUsesDeleteConfirm(window, now + 4_999), false);
  assert.equal(confirmUndoUsesDeleteConfirm(window, now + 5_000), true);

  const seed = { typedCarryYards: 150, estimatedCarryYards: null };
  const prior = [
    { yards: 150, fixQuality: 'good' as const },
    { yards: 152, fixQuality: 'good' as const },
    { yards: 148, fixQuality: 'good' as const },
    { yards: 151, fixQuality: 'good' as const },
  ];
  const during = clubAverageFromShots(prior, seed);
  assert.equal(during.count, 4);
  assert.ok(during.count < MIN_CLOSED_SHOTS_FOR_RANK);
  const after = clubAverageFromShots([...prior, { yards: 149, fixQuality: null }], seed);
  assert.equal(after.count, 5);
  assert.ok(after.count >= MIN_CLOSED_SHOTS_FOR_RANK);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /deleteHoleShot/);
  assert.match(hole, /deleteShotPrompt/);
  assert.doesNotMatch(hole, /chipYardsDuringUndo|chip-yards-during-Undo|chip yards during Undo/i);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  assert.match(repo, /confirmUndoAverageEligibleAt/);
  assert.match(repo, /confirmUndoShotEntersAverage/);
  assert.match(repo, /average_eligible_at/);
});
