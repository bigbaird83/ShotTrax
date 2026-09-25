import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  clubBookCarry,
  nerdOutShowsClubTable,
  nerdOutShowsGir,
  nerdOutShowsStrokesGained,
  nerdOutShowsTrail,
  nerdOutTrailUsesHoleCamera,
  planClubData,
  planNerdOut,
} from './nerdOut';
import { PUTTER_CLUB_ID } from './defaultBag';

test('nerd out uses stored score and putts only', () => {
  const out = planNerdOut({
    holeScores: [4, 5, null, 3],
    holePutts: [2, 1, 0, 2],
  });
  assert.equal(out.score, 12);
  assert.equal(out.putts, 5);
  assert.equal(nerdOutShowsGir(), true);
  assert.equal(nerdOutShowsStrokesGained(), false);
  assert.deepEqual(Object.keys(out).sort(), [
    'holesScored',
    'marks',
    'putts',
    'puttsPerHole',
    'score',
    'toPar',
  ]);
  assert.equal(out.toPar, null);
  assert.equal(out.holesScored, 3);
  assert.equal(out.puttsPerHole, 1.7);
  assert.equal('gir' in out, false);
  assert.equal('strokesGained' in out, false);
});

test('nerd out leaves score blank when no hole scores are stored', () => {
  const out = planNerdOut({
    holeScores: [null, null],
    holePutts: [0, 0],
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
  const placed = clubBookCarry({
    count: 2,
    avgYards: 148,
    typicalCarryYards: 150,
    carrySource: 'typed',
  });
  assert.deepEqual(placed, { yards: 148, kind: 'live', count: 2 });
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
    avgYards: 162,
    typicalCarryYards: 162,
    carrySource: 'estimated',
  });
  assert.deepEqual(estimated, { yards: 162, kind: 'estimated', count: 0 });
  assert.notEqual(estimated.kind, 'live');
});

test('club data carries are the same club-book numbers', () => {
  const bookRows = [
    {
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      count: 2,
      avgYards: 148,
      typicalCarryYards: 155,
      carrySource: 'typed' as const,
    },
    {
      id: 'club_5i',
      name: '5 Iron',
      shortName: '5i',
      count: 0,
      avgYards: 0,
      typicalCarryYards: 175,
      carrySource: 'estimated' as const,
    },
    {
      id: PUTTER_CLUB_ID,
      name: 'Putter',
      shortName: 'Pt',
      count: 4,
      avgYards: 8,
      typicalCarryYards: 8,
      carrySource: 'typed' as const,
    },
  ];
  const out = { clubs: planClubData(bookRows) };
  assert.equal(out.clubs.some((row) => row.id === PUTTER_CLUB_ID), false);
  assert.deepEqual(
    out.clubs.map((row) => ({ id: row.id, yards: row.yards, kind: row.kind, count: row.count })),
    bookRows
      .filter((row) => row.id !== PUTTER_CLUB_ID)
      .map((row) => ({ id: row.id, ...clubBookCarry(row) })),
  );
  assert.equal(out.clubs[0]?.kind, 'live');
  assert.equal(out.clubs[0]?.yards, 148);
  assert.equal(out.clubs[1]?.kind, 'estimated');
  assert.equal(out.clubs[1]?.yards, 175);
});

test('nerd out root is numbers only: no hole maps, no club table', () => {
  assert.equal(nerdOutShowsTrail(), false);
  assert.equal(nerdOutShowsClubTable(), false);
  const page = readFileSync(new URL('../../app/nerd-out.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /HoleMap/);
  assert.doesNotMatch(page, /lockHoleCamera|fetchOsmOverlay|listShotsForHole/);
  assert.doesNotMatch(page, /useLiveFix/);
  assert.doesNotMatch(page, /listClubAverages|planClubData|clubBookCarry/);
  assert.doesNotMatch(page, /\.clubs\b/);
  assert.match(page, /COPY\.reviewRounds/);
  assert.match(page, /COPY\.clubData/);
  assert.match(page, /'\/review-rounds'/);
  assert.match(page, /'\/club-data'/);
  assert.equal('clubs' in planNerdOut({ holeScores: [4], holePutts: [2] }), false);
});

test('club data screen carries the club table that left Nerd out', () => {
  const page = readFileSync(new URL('../../app/club-data.tsx', import.meta.url), 'utf8');
  assert.match(page, /listClubAverages/);
  assert.match(page, /planClubData/);
  assert.match(page, /COPY\.estimated/);
  assert.match(page, /COPY\.typicalCarry/);
  assert.doesNotMatch(page, /HoleMap/);
});

test('shot review uses the tee-to-green lock without live GPS', () => {
  assert.equal(nerdOutTrailUsesHoleCamera(), true);
  const page = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  // Box-fitted tee → shots → green camera. It takes no phone input.
  assert.match(page, /shotReviewCamera\(/);
  assert.match(page, /lockFrame/);
  assert.match(page, /shotPinsForHoleCamera/);
  assert.match(page, /resolveHoleTee/);
  assert.doesNotMatch(page, /phone:/);
  assert.match(page, /userFix=\{null\}/);
  assert.doesNotMatch(page, /useLiveFix/);
  assert.doesNotMatch(page, /lockFrame=\{false\}/);
});
