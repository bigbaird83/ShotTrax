import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  planScorecard,
  planScorecardDismiss,
  scorecardClosesShot,
  scorecardDiff,
  scorecardDiffLabel,
  scorecardDiffTone,
  scorecardHoleIncomplete,
  scorecardIncompleteInventGps,
  scorecardIncompleteInventYards,
  scorecardIncompleteMark,
  scorecardIncompleteUsesCloseStateOnly,
  scorecardIsRoundedCard,
  scorecardMark,
  scorecardMarkGlyph,
  scorecardMarksShot,
  scorecardParIsMuted,
  scorecardRowOpensHole,
  scorecardRunsAcceptFix,
  scorecardScoreIsBold,
  scorecardShowsGir,
  scorecardShowsIncompleteCue,
  scorecardShowsStrokesGained,
} from './scorecard';

test('scorecard marks only when both score and par exist', () => {
  assert.equal(scorecardMark(3, 5), 'eagle');
  assert.equal(scorecardMark(2, 4), 'eagle');
  assert.equal(scorecardMark(3, 4), 'birdie');
  assert.equal(scorecardMark(4, 4), 'par');
  assert.equal(scorecardMark(5, 4), 'bogey');
  assert.equal(scorecardMark(6, 4), 'double');
  assert.equal(scorecardMark(8, 4), 'double');
  assert.equal(scorecardMark(4, null), null);
  assert.equal(scorecardMark(null, 4), null);
  assert.equal(scorecardMark(null, null), null);
  assert.equal(scorecardMark(4, 0), null);
  assert.equal(scorecardMark(4, 2), null);
  assert.equal(scorecardMark(4, 7), null);
});

test('scorecard rows keep stored par/score/putts and never invent par', () => {
  const rows = planScorecard([
    { number: 2, par: null, score: 4, putts: 2 },
    { number: 1, par: 4, score: 3, putts: 1 },
    { number: 3, par: 4, score: 5, putts: 2 },
    { number: 4, par: 5, score: 3, putts: 1 },
    { number: 5, par: 3, score: 3, putts: 2 },
    { number: 6, par: 4, score: 6, putts: 2 },
    { number: 7, par: 4, score: null, putts: 0 },
  ]);
  assert.deepEqual(rows, [
    { number: 1, par: 4, score: 3, putts: 1, mark: 'birdie', incomplete: false },
    { number: 2, par: null, score: 4, putts: 2, mark: null, incomplete: false },
    { number: 3, par: 4, score: 5, putts: 2, mark: 'bogey', incomplete: false },
    { number: 4, par: 5, score: 3, putts: 1, mark: 'eagle', incomplete: false },
    { number: 5, par: 3, score: 3, putts: 2, mark: 'par', incomplete: false },
    { number: 6, par: 4, score: 6, putts: 2, mark: 'double', incomplete: false },
    { number: 7, par: 4, score: null, putts: 0, mark: null, incomplete: false },
  ]);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['incomplete', 'mark', 'number', 'par', 'putts', 'score']);
  assert.equal('gir' in rows[0]!, false);
  assert.equal('strokesGained' in rows[0]!, false);
  assert.equal(rows[1]!.par, null);
  assert.equal(scorecardMarkGlyph(rows[4]!.mark), '');
});

test('scorecard never blanks a finished hole — posted or logged strokes', () => {
  const rows = planScorecard(
    [
      { number: 1, par: 4, score: null, putts: 2, puttsDone: true, shotCount: 2 },
      { number: 2, par: 4, score: null, putts: 0, puttsDone: false, shotCount: 2 },
    ],
    { currentHoleNumber: 2 },
  );
  assert.equal(rows[0]!.score, 4);
  assert.equal(rows[0]!.putts, 2);
  assert.equal(rows[0]!.mark, 'par');
  assert.equal(rows[0]!.incomplete, false);
  assert.equal(rows[1]!.score, null);
  assert.equal(rows[1]!.mark, null);
  assert.equal(rows[1]!.incomplete, false);
});

test('Signal Lab: incomplete scorecard cue is close-state only — red outline + !', () => {
  assert.equal(scorecardIncompleteUsesCloseStateOnly(), true);
  assert.equal(scorecardIncompleteInventGps(), false);
  assert.equal(scorecardIncompleteInventYards(), false);
  assert.equal(scorecardRowOpensHole(), true);
  assert.equal(scorecardIncompleteMark(), '!');
  assert.equal(scorecardHoleIncomplete(false), true);
  assert.equal(scorecardHoleIncomplete(true), false);
  assert.equal(scorecardHoleIncomplete(undefined), false);

  assert.equal(scorecardShowsIncompleteCue({ puttsDone: false, number: 1, currentHoleNumber: 2 }), true);
  assert.equal(scorecardShowsIncompleteCue({ puttsDone: true, number: 1, currentHoleNumber: 2 }), false);
  assert.equal(scorecardShowsIncompleteCue({ puttsDone: false, number: 2, currentHoleNumber: 2 }), false);
  assert.equal(scorecardShowsIncompleteCue({ puttsDone: false, number: 3, currentHoleNumber: 2 }), false);

  const rows = planScorecard(
    [
      { number: 1, par: 4, score: null, putts: 0, puttsDone: false, shotCount: 2 },
      { number: 2, par: 4, score: 4, putts: 2, puttsDone: true, shotCount: 2 },
      { number: 3, par: 4, score: null, putts: 0, puttsDone: false, shotCount: 0 },
    ],
    { currentHoleNumber: 3 },
  );
  assert.equal(rows[0]!.incomplete, true);
  assert.equal(rows[0]!.score, null);
  assert.equal(rows[1]!.incomplete, false);
  assert.equal(rows[1]!.score, 4);
  assert.equal(rows[2]!.incomplete, false);

  const domain = readFileSync(new URL('./scorecard.ts', import.meta.url), 'utf8');
  const incompleteFn = domain.slice(
    domain.indexOf('export function scorecardHoleIncomplete'),
    domain.indexOf('export function scorecardIncompleteMark'),
  );
  assert.match(incompleteFn, /puttsDone === false/);
  assert.doesNotMatch(incompleteFn, /lat|lng|gps|yards|shotCount|acceptFix/i);

  const body = readFileSync(new URL('../ui/ScorecardBody.tsx', import.meta.url), 'utf8');
  assert.match(body, /scorecardIncompleteMark/);
  assert.match(body, /styles\.rowIncomplete/);
  assert.match(body, /colors\.red/);
  assert.match(body, /onSelectHole/);
  assert.match(body, /Pressable/);
  assert.doesNotMatch(body, /pointerEvents="none"/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const cardStart = hole.indexOf('<ScorecardBody');
  const card = hole.slice(cardStart, hole.indexOf('onBack={dismissScorecard}', cardStart));
  assert.match(card, /currentHoleNumber=\{holeNumber\}/);
  assert.match(card, /onSelectHole/);
  assert.match(card, /goToHole\(nextNumber\)/);
  assert.match(card, /puttsDone: row\.puttsDone/);
  assert.doesNotMatch(card, /lat|lng|acceptFix|inventGps|greenEdge/i);
});

test('opening scorecard and Back never mark or close a shot', () => {
  const back = planScorecardDismiss();
  assert.deepEqual(back, {
    markShot: false,
    closeShot: false,
    leaveHole: false,
    finishRound: false,
  });
  assert.equal(scorecardRunsAcceptFix(), false);
  assert.equal(scorecardMarksShot(), false);
  assert.equal(scorecardClosesShot(), false);
  assert.equal(scorecardShowsGir(), false);
  assert.equal(scorecardShowsStrokesGained(), false);
});

test('scorecard glyphs: eagle filled, birdie circle, par blank, bogey square, double two squares', () => {
  assert.equal(scorecardMarkGlyph('eagle'), '●');
  assert.equal(scorecardMarkGlyph('birdie'), '○');
  assert.equal(scorecardMarkGlyph('par'), '');
  assert.equal(scorecardMarkGlyph('bogey'), '□');
  assert.equal(scorecardMarkGlyph('double'), '□□');
  assert.equal(scorecardMarkGlyph(null), '');
});

test('scorecard is a rounded card with muted par, bold score, and +/- tone', () => {
  assert.equal(scorecardIsRoundedCard(), true);
  assert.equal(scorecardParIsMuted(), true);
  assert.equal(scorecardScoreIsBold(), true);
  assert.equal(scorecardDiff(3, 4), -1);
  assert.equal(scorecardDiffLabel(-1), '-1');
  assert.equal(scorecardDiffLabel(0), 'E');
  assert.equal(scorecardDiffLabel(2), '+2');
  assert.equal(scorecardDiffTone(-1), 'good');
  assert.equal(scorecardDiffTone(1), 'bad');
  assert.equal(scorecardDiffTone(0), 'even');
  assert.equal(scorecardDiff(4, null), null);

  const body = readFileSync(new URL('../ui/ScorecardBody.tsx', import.meta.url), 'utf8');
  assert.match(body, /styles\.card/);
  assert.match(body, /styles\.par/);
  assert.match(body, /styles\.score/);
  assert.match(body, /scorecardDiffLabel/);
  assert.match(body, /diffGood/);
  assert.match(body, /colors\.good/);
  assert.match(body, /colors\.red/);
  assert.match(body, /styles\.rowIncomplete/);
});
