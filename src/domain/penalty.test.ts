import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageWithBadges } from './averages';
import {
  clampPenaltyStrokes,
  formatPenaltyRow,
  scoreAfterPenalty,
  totalPenaltyStrokes,
} from './penalty';
import { reconcileHoleScore, scoreMismatchMessage } from './scoreReconcile';

test('one penalty stroke increases hole score by 1 from current score', () => {
  assert.equal(scoreAfterPenalty(4, 4, 1), 5);
});

test('N penalty strokes increase score by N', () => {
  assert.equal(scoreAfterPenalty(4, 4, 2), 6);
  assert.equal(scoreAfterPenalty(5, 4, 3), 8);
});

test('when score and par are unset, penalty starts from 0 — never invents par', () => {
  assert.equal(scoreAfterPenalty(null, null, 1), 1);
  assert.equal(scoreAfterPenalty(null, null, 2), 2);
});

test('penalty strokes clamp to 1–5', () => {
  assert.equal(clampPenaltyStrokes(0), 1);
  assert.equal(clampPenaltyStrokes(9), 5);
  assert.equal(scoreAfterPenalty(4, 4, 0), 5);
});

test('penalty strokes sum independently of GPS shots', () => {
  assert.equal(totalPenaltyStrokes([]), 0);
  assert.equal(totalPenaltyStrokes([{ strokes: 1 }, { strokes: 2 }]), 3);
});

test('formatPenaltyRow uses reason labels and free text for other', () => {
  assert.equal(formatPenaltyRow({ strokes: 1, reason: 'water', note: null }), '+1 Water');
  assert.equal(formatPenaltyRow({ strokes: 2, reason: 'ob', note: null }), '+2 OB');
  assert.equal(
    formatPenaltyRow({ strokes: 1, reason: 'other', note: 'lost ball' }),
    '+1 lost ball',
  );
});

test('adding a penalty does not create average shots — club average is unchanged', () => {
  const gps = [{ yards: 150, fixQuality: 'good' as const }];
  const before = averageWithBadges(gps);
  // Penalty is a hole_penalties row, never an AverageShot.
  const afterPenalty = totalPenaltyStrokes([{ strokes: 1 }]);
  const after = averageWithBadges(gps);
  assert.equal(afterPenalty, 1);
  assert.deepEqual(after, before);
  assert.equal(after.avgYards, 150);
  assert.equal(after.count, 1);
});

test('score mismatch when posted score ≠ shots + penalties', () => {
  const mismatch = reconcileHoleScore({ score: 6, shotCount: 4, penaltyStrokes: 1 });
  assert.equal(mismatch.mismatch, true);
  assert.equal(mismatch.logged, 5);
  assert.match(scoreMismatchMessage(mismatch), /Score 6/);

  const ok = reconcileHoleScore({ score: 5, shotCount: 4, penaltyStrokes: 1 });
  assert.equal(ok.mismatch, false);

  const scoreOnly = reconcileHoleScore({ score: 4, shotCount: 0, penaltyStrokes: 0 });
  assert.equal(scoreOnly.mismatch, false);

  const unset = reconcileHoleScore({ score: null, shotCount: 3, penaltyStrokes: 1 });
  assert.equal(unset.mismatch, false);
});
