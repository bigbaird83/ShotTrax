import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  finishHoleCloseScoreIsPuttsOnly,
  finishHoleCloseWritesScore,
  finishHoleScoreInventGps,
  finishHoleScoreInventYards,
  finishedHoleDisplayScore,
  loggedHoleStrokes,
  orphanGhostStrokesAfterDelete,
  deletePuttRecomputesHoleScore,
  deleteShotRecomputesHoleScore,
  planFinishHoleScore,
  planRecomputeFinishedHoleScore,
  scorecardBlankWhenPuttsDone,
} from './holeScore';
import { planScorecard } from './scorecard';
import {
  AUTO_PUTTS_FROM_GPS,
  AUTO_PUTTS_FROM_LEAVE_GREEN,
  MIC_SHOT_ASSIST,
  PUTT_ASSIST,
} from '../sensing/assists';

test('Signal Lab: P0 Made it / Hole Out persist total strokes — never putts-only or blank', () => {
  assert.equal(finishHoleCloseWritesScore(), true);
  assert.equal(finishHoleCloseScoreIsPuttsOnly(), false);
  assert.equal(scorecardBlankWhenPuttsDone(), false);
  assert.equal(finishHoleScoreInventGps(), false);
  assert.equal(finishHoleScoreInventYards(), false);
  assert.equal(PUTT_ASSIST, false);
  assert.equal(AUTO_PUTTS_FROM_GPS, false);
  assert.equal(AUTO_PUTTS_FROM_LEAVE_GREEN, false);
  assert.equal(MIC_SHOT_ASSIST, false);

  // Cypress Creek H1: Driver + 56° + 2 putts → 4, not putts-only 2.
  assert.equal(loggedHoleStrokes({ shotCount: 2, putts: 2 }), 4);
  const cypress = planFinishHoleScore({ shotCount: 2, putts: 2 });
  assert.equal(cypress.ok, true);
  if (cypress.ok) assert.equal(cypress.score, 4);
  assert.notEqual(cypress.ok && cypress.score, 2);

  const holeOut = planFinishHoleScore({ shotCount: 2, putts: 0 });
  assert.equal(holeOut.ok, true);
  if (holeOut.ok) assert.equal(holeOut.score, 2);

  const withPenalty = planFinishHoleScore({ shotCount: 2, putts: 2, penaltyStrokes: 1 });
  assert.equal(withPenalty.ok, true);
  if (withPenalty.ok) assert.equal(withPenalty.score, 5);

  const empty = planFinishHoleScore({ shotCount: 0, putts: 0 });
  assert.equal(empty.ok, false);
  assert.equal(empty.score, null);

  assert.equal(deleteShotRecomputesHoleScore(), true);
  assert.equal(deletePuttRecomputesHoleScore(), true);
  assert.equal(orphanGhostStrokesAfterDelete(), false);
  // Doc H10 after deleting ghost 56°: 2 shots · 2 putts · Made it — not cached 9 · +5.
  const afterGhosts = planRecomputeFinishedHoleScore({
    puttsDone: true,
    shotCount: 2,
    putts: 2,
  });
  assert.equal(afterGhosts.write, true);
  assert.equal(afterGhosts.score, 4);
  assert.notEqual(afterGhosts.score, 9);
  assert.equal(planRecomputeFinishedHoleScore({ puttsDone: false, shotCount: 2, putts: 2 }).write, false);
  assert.equal(planRecomputeFinishedHoleScore({ puttsDone: true, shotCount: 0, putts: 0 }).score, null);
});

test('Signal Lab: scorecard / revisit reads posted or logged strokes — never blank when puttsDone', () => {
  assert.equal(finishedHoleDisplayScore({ score: null, shotCount: 2, putts: 2 }), 4);
  assert.equal(finishedHoleDisplayScore({ score: 5, shotCount: 2, putts: 2 }), 5);
  assert.equal(finishedHoleDisplayScore({ score: null, shotCount: 0, putts: 0 }), null);

  const doneBlank = planScorecard([
    { number: 1, par: 4, score: null, putts: 2, puttsDone: true, shotCount: 2, penaltyStrokes: 0 },
  ]);
  assert.equal(doneBlank[0]!.score, 4);
  assert.equal(doneBlank[0]!.putts, 2);
  assert.equal(doneBlank[0]!.mark, 'par');

  const postedWins = planScorecard([
    { number: 1, par: 4, score: 5, putts: 2, puttsDone: true, shotCount: 2 },
  ]);
  assert.equal(postedWins[0]!.score, 5);
  assert.equal(postedWins[0]!.mark, 'bogey');

  const inPlay = planScorecard([{ number: 1, par: 4, score: null, putts: 1, puttsDone: false, shotCount: 2 }]);
  assert.equal(inPlay[0]!.score, null);
});

test('Signal Lab: close writes score; scorecard/revisit read posted or logged; chip stays a chip', () => {
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const persist = repo.slice(
    repo.indexOf('function persistCloseHoleScore'),
    repo.indexOf('export function updateHolePutts'),
  );
  assert.match(persist, /planFinishHoleScore/);
  assert.match(persist, /updateHoleScore/);
  assert.match(persist, /listShotsForHole/);
  assert.match(persist, /listPenaltiesForHole/);
  assert.doesNotMatch(persist, /lat|lng|acceptFix|insertShot|invent/);

  const finishPutts = repo.slice(repo.indexOf('export function finishHolePutts'), repo.indexOf('export function finishHoleOut'));
  assert.match(finishPutts, /planMadeIt/);
  assert.match(finishPutts, /planPersistMadeIt/);
  assert.match(finishPutts, /persistCloseHoleScore/);
  assert.doesNotMatch(finishPutts, /lat|lng|acceptFix|insertShot/);

  const finishOut = repo.slice(repo.indexOf('export function finishHoleOut'), repo.indexOf('export function sealOpenShotWithoutGps'));
  assert.match(finishOut, /planFinishHoleOut/);
  assert.match(finishOut, /persistCloseHoleScore/);
  assert.match(finishOut, /hole_out/);
  assert.doesNotMatch(finishOut, /INSERT INTO shots|insertShot|lat|lng|acceptFix/);

  assert.match(repo, /persistRecomputedHoleScore/);
  const recompute = repo.slice(
    repo.indexOf('function persistRecomputedHoleScore'),
    repo.indexOf('export function updateHolePutts'),
  );
  assert.match(recompute, /planRecomputeFinishedHoleScore/);
  assert.match(recompute, /updateHoleScore/);
  assert.match(recompute, /listShotsForHole/);
  const deleteFn = repo.slice(repo.indexOf('export function deleteShotOnHole'), repo.indexOf('export function undoLastShot'));
  assert.match(deleteFn, /persistRecomputedHoleScore/);
  const undoFn = repo.slice(repo.indexOf('export function undoLastShot'), repo.indexOf('export function applyClosedShot'));
  assert.match(undoFn, /persistRecomputedHoleScore/);
  const puttsFn = repo.slice(repo.indexOf('export function updateHolePutts'), repo.indexOf('export function finishHolePutts'));
  assert.match(puttsFn, /persistRecomputedHoleScore/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const cardStart = hole.indexOf('<ScorecardBody');
  const card = hole.slice(cardStart, hole.indexOf('onBack={dismissScorecard}', cardStart));
  assert.match(card, /puttsDone: row\.puttsDone/);
  assert.match(card, /shotCount: listShotsForHole/);
  assert.match(card, /penaltyStrokes: totalPenaltyStrokes/);
  assert.match(hole, /planFinishedHoleMiniSummary/);
  assert.match(hole, /testID="finished-hole-chip"/);
  assert.match(hole, /finishHolePutts/);
  assert.match(hole, /finishHoleOut/);

  const scorecard = readFileSync(new URL('./scorecard.ts', import.meta.url), 'utf8');
  assert.match(scorecard, /puttsDone/);
  assert.match(scorecard, /finishedHoleDisplayScore/);

  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(summary, /finishedHoleDisplayScore/);
  assert.match(summary, /puttsDone/);

  const chip = readFileSync(new URL('./finishedHoleSummary.ts', import.meta.url), 'utf8');
  assert.match(chip, /finishedHoleDisplayScore/);
  assert.doesNotMatch(chip, /updateHoleScore|persistCloseHoleScore/);
});
