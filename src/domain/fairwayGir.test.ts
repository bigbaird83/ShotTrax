import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fairwayGlyph,
  formatFairwayMisses,
  formatHitRate,
  girGlyph,
  holeGir,
  holeHasFairway,
  nextFairwayValue,
  parseFairwayResult,
  planFairwayGir,
  showFairwayPrompt,
  sumFairwayGir,
} from './fairwayGir';
import { planScorecard } from './scorecard';

test('fairway only counts on par 4+ with a real par', () => {
  assert.equal(holeHasFairway(3), false);
  assert.equal(holeHasFairway(4), true);
  assert.equal(holeHasFairway(5), true);
  assert.equal(holeHasFairway(null), false);
  assert.equal(holeHasFairway(9), false);
});

test('fairway prompt shows after the tee shot until answered', () => {
  const base = { par: 4, fairway: null, shotCount: 0, firstShotClosed: false, puttsDone: false, readOnly: false };
  assert.equal(showFairwayPrompt(base), false);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 1 }), false);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 1, firstShotClosed: true }), true);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 2 }), true);
  assert.equal(showFairwayPrompt({ ...base, puttsDone: true }), true);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 2, fairway: 'hit' }), false);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 2, par: 3 }), false);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 2, par: null }), false);
  assert.equal(showFairwayPrompt({ ...base, shotCount: 2, readOnly: true }), false);
});

test('tapping the same fairway result clears it', () => {
  assert.equal(nextFairwayValue(null, 'hit'), 'hit');
  assert.equal(nextFairwayValue('hit', 'left'), 'left');
  assert.equal(nextFairwayValue('left', 'left'), null);
});

test('parse keeps only known fairway values', () => {
  assert.equal(parseFairwayResult('hit'), 'hit');
  assert.equal(parseFairwayResult('short'), 'short');
  assert.equal(parseFairwayResult('HIT'), null);
  assert.equal(parseFairwayResult(null), null);
  assert.equal(parseFairwayResult(3), null);
});

test('GIR is strokes before putting ≤ par − 2 on a closed hole only', () => {
  assert.equal(holeGir({ par: 4, score: 4, putts: 2, puttsDone: true }), true);
  assert.equal(holeGir({ par: 4, score: 5, putts: 2, puttsDone: true }), false);
  assert.equal(holeGir({ par: 3, score: 3, putts: 2, puttsDone: true }), true);
  assert.equal(holeGir({ par: 5, score: 5, putts: 2, puttsDone: true }), true);
  assert.equal(holeGir({ par: 5, score: 6, putts: 2, puttsDone: true }), false);
  // Chip-in par from off the green is not GIR; holed approach for eagle is.
  assert.equal(holeGir({ par: 4, score: 4, putts: 0, puttsDone: true }), false);
  assert.equal(holeGir({ par: 4, score: 2, putts: 0, puttsDone: true }), true);
  // Open hole, missing par, or putts > score → unknown.
  assert.equal(holeGir({ par: 4, score: 4, putts: 2, puttsDone: false }), null);
  assert.equal(holeGir({ par: null, score: 4, putts: 2, puttsDone: true }), null);
  assert.equal(holeGir({ par: 4, score: 1, putts: 2, puttsDone: true }), null);
});

test('GIR falls back to logged strokes when no score is posted', () => {
  assert.equal(holeGir({ par: 4, score: null, putts: 2, puttsDone: true, shotCount: 2 }), true);
  assert.equal(
    holeGir({ par: 4, score: null, putts: 2, puttsDone: true, shotCount: 2, penaltyStrokes: 1 }),
    false,
  );
  assert.equal(holeGir({ par: 4, score: null, putts: 0, puttsDone: true, shotCount: 0 }), null);
});

test('totals, sums, and labels', () => {
  const a = planFairwayGir([
    { par: 4, score: 4, putts: 2, puttsDone: true, fairway: 'hit' },
    { par: 5, score: 6, putts: 2, puttsDone: true, fairway: 'left' },
    { par: 4, score: 5, putts: 1, puttsDone: true, fairway: 'short' },
    { par: 3, score: 3, putts: 2, puttsDone: true, fairway: null },
  ]);
  assert.deepEqual(a, {
    fairwaysHit: 1,
    fairwayHoles: 3,
    missLeft: 1,
    missRight: 0,
    missShort: 1,
    greensHit: 2,
    greenHoles: 4,
  });
  const b = planFairwayGir([{ par: 4, score: 4, putts: 2, puttsDone: true, fairway: 'right' }]);
  const sum = sumFairwayGir([a, b]);
  assert.equal(sum.fairwayHoles, 4);
  assert.equal(sum.missRight, 1);
  assert.equal(sum.greensHit, 3);
  assert.equal(formatHitRate(1, 3), '1/3 · 33%');
  assert.equal(formatHitRate(0, 0), '—');
  assert.equal(formatFairwayMisses(a), '1 L · 1 short');
  assert.equal(formatFairwayMisses(planFairwayGir([])), '');
});

test('scorecard glyphs stay blank when unknown', () => {
  assert.equal(fairwayGlyph(4, 'hit'), '✓');
  assert.equal(fairwayGlyph(4, 'left'), '←');
  assert.equal(fairwayGlyph(4, 'right'), '→');
  assert.equal(fairwayGlyph(5, 'short'), '↓');
  assert.equal(fairwayGlyph(3, 'hit'), '');
  assert.equal(fairwayGlyph(4, null), '');
  assert.equal(girGlyph(true), '●');
  assert.equal(girGlyph(false), '○');
  assert.equal(girGlyph(null), '');
});

test('scorecard rows carry fairway and GIR', () => {
  const rows = planScorecard([
    { number: 1, par: 4, score: 4, putts: 2, puttsDone: true, fairway: 'hit' },
    { number: 2, par: 3, score: 4, putts: 2, puttsDone: true },
    { number: 3, par: 4, score: null, putts: 0, puttsDone: false },
  ]);
  assert.equal(rows[0]?.fairway, 'hit');
  assert.equal(rows[0]?.gir, true);
  assert.equal(rows[1]?.fairway, null);
  assert.equal(rows[1]?.gir, false);
  assert.equal(rows[2]?.gir, null);
});

test('round history export / restore keeps the fairway tap', async () => {
  const { buildRoundHistoryExport, planRoundHistoryImport, serializeRoundHistory } = await import('./roundTransfer');
  const hole = (number: number, fairway: 'hit' | 'left' | null) => ({
    number,
    par: 4,
    parSource: 'course' as const,
    score: 4,
    yards: null,
    handicap: null,
    teeLat: null,
    teeLng: null,
    greenLat: null,
    greenLng: null,
    greenSource: null,
    greenFrontLat: null,
    greenFrontLng: null,
    greenBackLat: null,
    greenBackLng: null,
    greenDepthYards: null,
    putts: 2,
    puttLengths: [],
    puttsDone: true,
    fairway,
    shots: [],
  });
  const doc = buildRoundHistoryExport({
    exportedAt: '2026-06-01T18:00:00.000Z',
    rounds: [
      {
        startedAt: '2026-06-01T14:00:00.000Z',
        finishedAt: '2026-06-01T18:00:00.000Z',
        courseName: 'Magnolia',
        holeCount: 9,
        courseApiId: null,
        courseLat: null,
        courseLng: null,
        teeName: null,
        teeRating: null,
        teeSlope: null,
        teeTotalYards: null,
        holes: [hole(1, 'hit'), hole(2, 'left'), hole(3, null)],
      },
    ],
  });
  assert.deepEqual(
    doc.rounds[0]?.holes.map((row) => row.fairway),
    ['hit', 'left', null],
  );
  const back = planRoundHistoryImport(serializeRoundHistory(doc));
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.deepEqual(
    back.rounds[0]?.holes.map((row) => row.fairway),
    ['hit', 'left', null],
  );
  // Older files (no fairway) and junk values import as null.
  const legacy = JSON.parse(serializeRoundHistory(doc));
  delete legacy.rounds[0].holes[0].fairway;
  legacy.rounds[0].holes[1].fairway = 'bunker';
  const old = planRoundHistoryImport(legacy);
  assert.equal(old.ok, true);
  if (!old.ok) return;
  assert.deepEqual(
    old.rounds[0]?.holes.map((row) => row.fairway),
    [null, null, null],
  );
});
