import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AVERAGE_OUTLIER_RATIO } from './averages';
import {
  bagSetupBlocksStart,
  bagSetupIsFirstRunOnly,
  canFinishBagCarrySetup,
  countTypedCarries,
} from './bagCustomize';
import { fillEstimatedCarries, MIN_TYPED_CLUBS_FOR_FILL } from './carryFill';
import { PUTTER_CLUB_ID, STOCK_AVG_CARRY, stockAvgCarryForSuggestion } from './defaultBag';
import { MIN_CLOSED_SHOTS_FOR_RANK, rankDistanceYards } from './rankClubs';

test('bag distances: first-run 3-typed or skip-to-play; Start stays course-gated', () => {
  assert.equal(MIN_TYPED_CLUBS_FOR_FILL, 3);
  assert.equal(bagSetupIsFirstRunOnly(), true);
  assert.equal(bagSetupBlocksStart(), false);
  assert.equal(canFinishBagCarrySetup(2), false);
  assert.equal(canFinishBagCarrySetup(3), true);
  assert.equal(
    countTypedCarries([
      { id: 'club_7i', typicalCarryYards: 150 },
      { id: PUTTER_CLUB_ID, typicalCarryYards: 8 },
    ]),
    1,
  );
});

test('fill estimates after 3 typed, never overrides typed, never fills the putter', () => {
  const filled = fillEstimatedCarries([
    { id: 'club_5i', loftRank: 7, typicalCarryYards: 170 },
    { id: 'club_6i', loftRank: 8, typicalCarryYards: 162 },
    { id: 'club_7i', loftRank: 9, typicalCarryYards: 140 },
    { id: 'club_8i', loftRank: 10, typicalCarryYards: null },
    { id: PUTTER_CLUB_ID, loftRank: 18, typicalCarryYards: 8 },
  ]);
  assert.equal(filled.get('club_6i')?.source, 'typed');
  assert.equal(filled.get('club_6i')?.yards, 162);
  assert.equal(filled.get('club_8i')?.source, null);
  assert.equal(filled.get(PUTTER_CLUB_ID)?.yards ?? null, null);
});

test('Suggested seed is STOCK_AVG until typed or 5 live (20% outliers); putter out', () => {
  assert.equal(MIN_CLOSED_SHOTS_FOR_RANK, 5);
  assert.equal(AVERAGE_OUTLIER_RATIO, 0.2);
  assert.equal(STOCK_AVG_CARRY.club_7i, 150);
  assert.equal(stockAvgCarryForSuggestion('club_7i'), 150);
  assert.equal(stockAvgCarryForSuggestion(PUTTER_CLUB_ID), null);
  assert.equal(
    rankDistanceYards({
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      loftRank: 9,
      avgYards: 0,
      count: 0,
    }),
    150,
  );
  assert.equal(
    rankDistanceYards({
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      loftRank: 9,
      avgYards: 0,
      count: 0,
      typicalCarryYards: 145,
    }),
    145,
  );
  assert.equal(
    rankDistanceYards({
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      loftRank: 9,
      avgYards: 162,
      count: 5,
      typicalCarryYards: 145,
    }),
    162,
  );
  assert.equal(
    rankDistanceYards({
      id: PUTTER_CLUB_ID,
      name: 'Putter',
      shortName: 'Pt',
      loftRank: 18,
      avgYards: 8,
      count: 20,
    }),
    null,
  );
});

test('Watch top-3 reads the same rankDistanceYards table as the phone', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const watch = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(watch, /rankDistanceYards\(club\)/);
  assert.match(watch, /top3: ranked\.map/);
  const rank = readFileSync(new URL('./rankClubs.ts', import.meta.url), 'utf8');
  assert.match(rank, /stockAvgCarryForSuggestion/);
  assert.match(rank, /MIN_CLOSED_SHOTS_FOR_RANK/);
});
