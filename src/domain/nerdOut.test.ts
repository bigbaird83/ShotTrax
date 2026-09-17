import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clubBookCarry, nerdOutShowsGir, nerdOutShowsStrokesGained, planNerdOut } from './nerdOut';
import { PUTTER_CLUB_ID } from './defaultBag';

test('nerd out uses stored score and putts only', () => {
  const out = planNerdOut({
    holeScores: [4, 5, null, 3],
    holePutts: [2, 1, 0, 2],
    clubs: [{ id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9 }],
    averages: [],
  });
  assert.equal(out.score, 12);
  assert.equal(out.putts, 5);
  assert.equal(nerdOutShowsGir(), false);
  assert.equal(nerdOutShowsStrokesGained(), false);
});

test('nerd out leaves score blank when no hole scores are stored', () => {
  const out = planNerdOut({
    holeScores: [null, null],
    holePutts: [0, 0],
    clubs: [],
    averages: [],
  });
  assert.equal(out.score, null);
  assert.equal(out.putts, 0);
});

test('club book live average comes from real / Placed shots, not a seed', () => {
  const live = clubBookCarry({
    count: 3,
    avgYards: 154.4,
    typicalCarryYards: 150,
    carrySource: 'typed',
  });
  assert.deepEqual(live, { yards: 154, kind: 'live', count: 3 });
  const seed = clubBookCarry({
    count: 0,
    avgYards: 0,
    typicalCarryYards: 150,
    carrySource: 'typed',
  });
  assert.deepEqual(seed, { yards: 150, kind: 'typed', count: 0 });
  assert.notEqual(seed.kind, 'live');
});

test('estimated seed keeps the estimated badge and is not a live average', () => {
  const estimated = clubBookCarry({
    count: 0,
    avgYards: 0,
    typicalCarryYards: 162,
    carrySource: 'estimated',
  });
  assert.deepEqual(estimated, { yards: 162, kind: 'estimated', count: 0 });
});

test('nerd out omits putter and does not invent empty carries', () => {
  const out = planNerdOut({
    holeScores: [5],
    holePutts: [2],
    clubs: [
      { id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9, typicalCarryYards: null },
      { id: PUTTER_CLUB_ID, name: 'Putter', shortName: 'Pt', loftRank: 18, typicalCarryYards: 8 },
    ],
    averages: [{ clubId: 'club_7i', count: 2, avgYards: 148 }],
  });
  assert.equal(out.clubs.some((row) => row.id === PUTTER_CLUB_ID), false);
  assert.equal(out.clubs[0]?.kind, 'live');
  assert.equal(out.clubs[0]?.yards, 148);
});
