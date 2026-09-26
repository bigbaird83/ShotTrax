import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_GROUP_GAMES, planGroupGames, type GroupHoleIn, type GroupPlayerIn } from './groupGames';
import { planGroupScorecard } from './groupScorecard';

function holes(n: number): GroupHoleIn[] {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
}

function player(id: string, scores: (number | null)[], handicap: number | null = null): GroupPlayerIn {
  return { id, name: id.toUpperCase(), handicap, scores: Object.fromEntries(scores.map((s, i) => [i + 1, s])) };
}

test('18 holes: out, in, and total add only scored holes', () => {
  const players = [player('a', [4, 5, ...Array(7).fill(4), 3]), player('b', [4, 4])];
  const card = planGroupScorecard({
    holes: holes(18),
    players,
    result: planGroupGames({ holes: holes(18), players, settings: DEFAULT_GROUP_GAMES }),
  });
  assert.equal(card.front.length, 9);
  assert.equal(card.back.length, 9);
  assert.deepEqual(
    card.totals.map((t) => [t.label, t.par, t.cells.map((c) => [c.strokes, c.scored])]),
    [
      ['Out', 36, [[37, 9], [8, 2]]],
      ['In', 36, [[3, 1], [null, 0]]],
      ['Total', 72, [[40, 10], [8, 2]]],
    ],
  );
  assert.equal(card.front[1].cells[0].toPar, 1);
  assert.equal(card.back[0].cells[1].score, null);
});

test('skins mark the winner with the carried value', () => {
  // Hole 1 ties (carry), A wins hole 2 worth 2.
  const players = [player('a', [4, 3]), player('b', [4, 4])];
  const result = planGroupGames({ holes: holes(9), players, settings: DEFAULT_GROUP_GAMES });
  const card = planGroupScorecard({ holes: holes(9), players, result });
  assert.deepEqual(card.front[0].cells.map((c) => c.skinValue), [null, null]);
  assert.deepEqual(card.front[1].cells.map((c) => c.skinValue), [2, null]);
  assert.deepEqual(card.totals.map((t) => t.label), ['Total']);
});

test('net strokes shown are off the group low, and none when net is off', () => {
  const players = [player('a', [4], 4), player('b', [5], 10)];
  const net = planGroupGames({ holes: holes(18), players, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  const card = planGroupScorecard({ holes: holes(18), players, result: net });
  assert.equal(card.net, true);
  const bStrokes = [...card.front, ...card.back].map((r) => r.cells[1].strokes);
  assert.deepEqual(bStrokes.slice(0, 7), [1, 1, 1, 1, 1, 1, 0]);
  assert.ok([...card.front, ...card.back].every((r) => r.cells[0].strokes === 0));

  const gross = planGroupGames({ holes: holes(18), players, settings: DEFAULT_GROUP_GAMES });
  const grossCard = planGroupScorecard({ holes: holes(18), players, result: gross });
  assert.ok([...grossCard.front, ...grossCard.back].every((r) => r.cells.every((c) => c.strokes === 0)));
});
