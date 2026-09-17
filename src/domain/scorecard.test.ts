import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planScorecard,
  scorecardClosesShot,
  scorecardMark,
  scorecardMarkGlyph,
  scorecardMarksShot,
  scorecardRunsAcceptFix,
  scorecardShowsGir,
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
});

test('scorecard rows keep stored par/score/putts and never invent par', () => {
  const rows = planScorecard([
    { number: 2, par: null, score: 4, putts: 2 },
    { number: 1, par: 4, score: 3, putts: 1 },
    { number: 3, par: 4, score: 5, putts: 2 },
  ]);
  assert.deepEqual(rows, [
    { number: 1, par: 4, score: 3, putts: 1, mark: 'birdie' },
    { number: 2, par: null, score: 4, putts: 2, mark: null },
    { number: 3, par: 4, score: 5, putts: 2, mark: 'bogey' },
  ]);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['mark', 'number', 'par', 'putts', 'score']);
  assert.equal('gir' in rows[0]!, false);
  assert.equal('strokesGained' in rows[0]!, false);
  assert.equal(rows[1]!.par, null);
});

test('scorecard is view-only and has no GIR or strokes gained', () => {
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
