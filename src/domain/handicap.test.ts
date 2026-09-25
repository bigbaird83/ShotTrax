import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adjustedGrossScore,
  courseHandicap,
  differentialsToUse,
  formatDifferential,
  formatHandicapIndex,
  handicapSkipReason,
  handicapSummaryLine,
  indexFromDifferentials,
  planHandicap,
  ratingForRound,
  roundDifferential,
  scoreDifferential,
  strokesReceived,
  type HandicapHoleIn,
  type HandicapRoundIn,
} from './handicap';

/** Par 72: 4 par 3s, 10 par 4s, 4 par 5s. SI 1..18 in hole order. */
const PARS_18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

function holes(scores: number[], pars = PARS_18): HandicapHoleIn[] {
  return scores.map((score, i) => ({ number: i + 1, par: pars[i] ?? 4, score, strokeIndex: i + 1 }));
}

/** Every hole `over` par (bogey golf by default). */
function evenRound(over: number, pars = PARS_18): number[] {
  return pars.map((par) => par + over);
}

function round(
  id: string,
  day: number,
  scores: number[],
  over: Partial<HandicapRoundIn> = {},
): HandicapRoundIn {
  const at = new Date(Date.UTC(2026, 3, day, 18)).toISOString();
  return {
    id,
    courseName: 'North Hills',
    startedAt: at,
    finishedAt: at,
    holeCount: scores.length,
    teeRating: 71.2,
    teeSlope: 125,
    holes: holes(scores, over.holeCount === 9 || scores.length === 9 ? PARS_18.slice(0, 9) : PARS_18),
    ...over,
  };
}

test('WHS table: lowest N of the last 20 with small-sample adjustments', () => {
  assert.deepEqual(differentialsToUse(2), { use: 0, adjust: 0 });
  assert.deepEqual(differentialsToUse(3), { use: 1, adjust: -2 });
  assert.deepEqual(differentialsToUse(4), { use: 1, adjust: -1 });
  assert.deepEqual(differentialsToUse(5), { use: 1, adjust: 0 });
  assert.deepEqual(differentialsToUse(6), { use: 2, adjust: -1 });
  assert.deepEqual(differentialsToUse(8), { use: 2, adjust: 0 });
  assert.deepEqual(differentialsToUse(11), { use: 3, adjust: 0 });
  assert.deepEqual(differentialsToUse(14), { use: 4, adjust: 0 });
  assert.deepEqual(differentialsToUse(16), { use: 5, adjust: 0 });
  assert.deepEqual(differentialsToUse(18), { use: 6, adjust: 0 });
  assert.deepEqual(differentialsToUse(19), { use: 7, adjust: 0 });
  assert.deepEqual(differentialsToUse(20), { use: 8, adjust: 0 });
});

test('score differential = 113 / slope × (AGS − rating), to the tenth', () => {
  assert.equal(scoreDifferential(90, 71.2, 125), 17);
  assert.equal(scoreDifferential(85, 70.1, 131), 12.9);
  assert.equal(scoreDifferential(69, 71.2, 125), -2);
});

test('index averages the lowest differentials in the last 20 only', () => {
  assert.equal(indexFromDifferentials([20, 18]).index, null);
  assert.equal(indexFromDifferentials([20, 18, 15]).index, 13);
  assert.equal(indexFromDifferentials([20, 18, 15, 16, 17, 19]).index, 14.5);
  // 25 scores: the 5 oldest (all 0.0) fall out of the window.
  const old = Array.from({ length: 5 }, () => 0);
  const recent = Array.from({ length: 20 }, (_, i) => 10 + i);
  const out = indexFromDifferentials([...old, ...recent]);
  assert.equal(out.index, 13.5); // avg of 10..17
  assert.equal(out.usedPositions.size, 8);
  assert.ok([...out.usedPositions].every((pos) => pos >= 5));
  assert.equal(indexFromDifferentials(Array.from({ length: 20 }, () => 80)).index, 54);
});

test('course handicap and stroke allocation by stroke index', () => {
  assert.equal(courseHandicap({ index: 12.4, slope: 125, rating: 71.2, par: 72, holeCount: 18 }), 13);
  assert.equal(courseHandicap({ index: null, slope: 125, rating: 71.2, par: 72, holeCount: 18 }), null);
  assert.equal(courseHandicap({ index: 12.4, slope: 125, rating: 35.6, par: 36, holeCount: 9 }), 6);

  const h = holes(evenRound(1));
  const strokes = strokesReceived(h, 20);
  assert.equal(strokes.get(1), 2); // SI 1 and 2 get a second stroke
  assert.equal(strokes.get(2), 2);
  assert.equal(strokes.get(3), 1);
  assert.equal(strokesReceived(h, -2).get(1), 0);

  // Missing SI takes strokes after holes that have one.
  const partial: HandicapHoleIn[] = [
    { number: 1, par: 4, score: 5, strokeIndex: null },
    { number: 2, par: 4, score: 5, strokeIndex: 7 },
  ];
  const two = strokesReceived(partial, 1);
  assert.equal(two.get(2), 1);
  assert.equal(two.get(1), 0);
});

test('adjusted gross score caps at net double bogey, or par + 5 with no index', () => {
  const scores = evenRound(0);
  scores[0] = 11; // par 4 blow-up
  const h = holes(scores);
  // No index: cap par + 5 = 9 → 72 − 4 + 9 = 77.
  assert.equal(adjustedGrossScore(h, null), 77);
  // Course handicap 0: cap par + 2 = 6 → 74.
  assert.equal(adjustedGrossScore(h, 0), 74);
  // Course handicap 18: SI 1 gets a stroke, cap 7 → 75.
  assert.equal(adjustedGrossScore(h, 18), 75);
});

test('9-hole rating: half of an 18-hole tee rating, a real 9-hole rating as-is', () => {
  assert.equal(ratingForRound(9, 71.2), 35.6);
  assert.equal(ratingForRound(9, 35.4), 35.4);
  assert.equal(ratingForRound(18, 71.2), 71.2);
});

test('rounds missing rating, slope, par, or a score never count', () => {
  const ok = round('a', 1, evenRound(1));
  assert.equal(handicapSkipReason(ok), null);
  assert.equal(handicapSkipReason({ ...ok, finishedAt: null }), 'unfinished');
  assert.equal(handicapSkipReason({ ...ok, teeRating: null }), 'no_rating');
  assert.equal(handicapSkipReason({ ...ok, teeSlope: null }), 'no_slope');
  assert.equal(handicapSkipReason({ ...ok, teeSlope: 200 }), 'no_slope');
  const noPar = { ...ok, holes: ok.holes.map((h, i) => (i === 3 ? { ...h, par: null } : h)) };
  assert.equal(handicapSkipReason(noPar), 'missing_par');
  const noScore = { ...ok, holes: ok.holes.map((h, i) => (i === 3 ? { ...h, score: null } : h)) };
  assert.equal(handicapSkipReason(noScore), 'missing_score');
  assert.equal(handicapSkipReason({ ...ok, holes: ok.holes.slice(0, 17) }), 'missing_score');

  const plan = planHandicap([
    { ...ok, id: 'x1', teeRating: null },
    { ...ok, id: 'x2', finishedAt: null },
    noScore,
  ]);
  assert.equal(plan.entries.length, 0);
  assert.equal(plan.index, null);
  assert.equal(plan.scoresToIndex, 3);
});

test('three bogey rounds make an index; newest first; used flags', () => {
  // Bogey golf on 71.2 / 125 → AGS 90 (no cap hit) → differential 17.0.
  const plan = planHandicap([
    round('r1', 1, evenRound(1)),
    round('r2', 2, evenRound(1)),
    round('r3', 3, evenRound(1)),
  ]);
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(
    plan.entries.map((row) => row.roundIds[0]),
    ['r3', 'r2', 'r1'],
  );
  assert.ok(plan.entries.every((row) => row.differential === 17 && row.adjustedScore === 90));
  // 3 scores: lowest 1 − 2.0.
  assert.equal(plan.index, 15);
  assert.equal(plan.usedCount, 1);
  assert.equal(plan.entries.filter((row) => row.used).length, 1);
  assert.equal(plan.scoresToIndex, 0);
  assert.equal(handicapSummaryLine(plan), 'Best 1 of your last 3 scores.');
  assert.equal(roundDifferential(plan, 'r2')?.differential, 17);
  assert.equal(roundDifferential(plan, 'nope'), null);
});

test('later rounds cap at net double bogey using the index from earlier rounds', () => {
  const blowUp = evenRound(1);
  blowUp[0] = 12; // SI 1 par 4
  const plan = planHandicap([
    round('r1', 1, evenRound(1)),
    round('r2', 2, evenRound(1)),
    round('r3', 3, evenRound(1)),
    round('r4', 4, blowUp),
  ]);
  // Index before r4 is 15.0 → course handicap round(15 × 125/113 − 0.8) = 16.
  // SI 1 cap = 4 + 2 + 1 = 7 → AGS 90 − 5 + 7 = 92.
  const r4 = roundDifferential(plan, 'r4');
  assert.equal(r4?.adjustedScore, 92);
  // First round with no index would have capped at par + 5 = 9 instead.
  const first = planHandicap([round('only', 1, blowUp)]);
  assert.equal(first.entries[0]?.adjustedScore, 94);
});

test('two 9-hole rounds combine into one 18-hole score', () => {
  const nine = PARS_18.slice(0, 9).map((par) => par + 1);
  const plan = planHandicap([
    round('f1', 1, nine, { holeCount: 9 }),
    round('f2', 2, nine, { holeCount: 9 }),
    round('f3', 3, nine, { holeCount: 9 }),
  ]);
  assert.equal(plan.entries.length, 1);
  const combo = plan.entries[0]!;
  assert.deepEqual(combo.roundIds, ['f1', 'f2']);
  assert.equal(combo.nine, true);
  assert.equal(combo.rating, 71.2);
  assert.equal(combo.slope, 125);
  assert.equal(combo.adjustedScore, 90);
  assert.equal(combo.courseName, 'North Hills · 9 + 9');
  assert.equal(plan.pendingNine, true);
  assert.equal(plan.scoresToIndex, 2);
  assert.equal(handicapSummaryLine(plan), 'Play 2 more scored rounds with a rated tee to get an index.');
});

test('index formatting: plus handicaps show a +', () => {
  assert.equal(formatHandicapIndex(null), '—');
  assert.equal(formatHandicapIndex(12), '12.0');
  assert.equal(formatHandicapIndex(-1.2), '+1.2');
  assert.equal(formatHandicapIndex(0), '0.0');
  assert.equal(formatDifferential(-2), '+2.0');
  assert.equal(formatDifferential(17.04), '17.0');
});

test('handicap screens read saved holes and tee only — no shots, no live GPS', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/handicap.tsx', import.meta.url), 'utf8');
  assert.match(page, /listHandicapRounds/);
  assert.match(page, /planHandicap/);
  assert.doesNotMatch(page, /useLiveFix|listShotsForHole|HoleMap/);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const helper = repo.slice(
    repo.indexOf('export function listHandicapRounds'),
    repo.indexOf('export function listHoles'),
  );
  assert.match(helper, /strokeIndex: hole\.handicap/);
  assert.doesNotMatch(helper, /listShotsForHole|listPenaltiesForHole/);
  const nerd = readFileSync(new URL('../../app/nerd-out.tsx', import.meta.url), 'utf8');
  assert.match(nerd, /'\/handicap'/);
});
