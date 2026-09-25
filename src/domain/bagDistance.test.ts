import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD, SOFT_GPS_MAX_M } from '../config/sensing';
import { acceptFix, forceMark } from '../sensing/gates';
import { AVERAGE_OUTLIER_RATIO, clubAverageFromShots } from './averages';
import {
  bagSetupAcceptsAnyThreeClubs,
  bagSetupBlocksStart,
  bagSetupIsFirstRunOnly,
  canFinishBagCarrySetup,
  countTypedCarries,
} from './bagCustomize';
import { fillEstimatedCarries, MIN_TYPED_CLUBS_FOR_FILL } from './carryFill';
import { PUTTER_CLUB_ID, STOCK_AVG_CARRY, stockAvgCarryForSuggestion } from './defaultBag';
import { MIN_CLOSED_SHOTS_FOR_RANK, rankDistanceYards } from './rankClubs';
import { includeInDistanceAverages } from './shotSource';
import type { GpsFix } from './types';

test('bag distances: first-run 3-typed or skip-to-play; Start stays course-gated', () => {
  assert.equal(MIN_TYPED_CLUBS_FOR_FILL, 3);
  assert.equal(bagSetupIsFirstRunOnly(), true);
  assert.equal(bagSetupAcceptsAnyThreeClubs(), true);
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
  assert.equal(filled.get('club_8i')?.source, 'estimated');
  assert.ok((filled.get('club_8i')?.yards ?? 0) > 0);
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
      count: 4,
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
  const fourKept = clubAverageFromShots(
    [
      { yards: 150, fixQuality: 'good' },
      { yards: 150, fixQuality: 'good' },
      { yards: 150, fixQuality: 'good' },
      { yards: 150, fixQuality: 'good' },
      { yards: 200, fixQuality: 'good' },
    ],
    { typedCarryYards: 145, estimatedCarryYards: null },
  );
  assert.equal(fourKept.count, 4);
  assert.ok(fourKept.count < MIN_CLOSED_SHOTS_FOR_RANK);
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 8,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
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
  const clubPick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.match(
    clubPick.slice(clubPick.indexOf('useWatchClubList'), clubPick.indexOf('const markClub')),
    /rankDistanceYards\(club\)/,
  );
  const rank = readFileSync(new URL('./rankClubs.ts', import.meta.url), 'utf8');
  assert.match(rank, /resolveBagCarry\(/);
  assert.match(rank, /MIN_CLOSED_SHOTS_FOR_RANK/);
});

test('Signal Lab: live replace at ≥5 kept closed shots; typed/stock until then', () => {
  const origin = { lat: 37, lng: -122 };
  const fixAt = (lat: number, lng: number, accuracyM: number): GpsFix => ({
    lat,
    lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp: 0,
  });
  const poor = acceptFix(fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M + 1));
  assert.equal(poor.ok, false);
  if (!poor.ok) assert.equal(poor.reason, 'poor_gps');
  assert.equal(
    includeInDistanceAverages({ source: 'gps', distanceYards: 150, fixQuality: 'none' }),
    false,
  );

  const far = {
    lat: origin.lat + ((MAX_SHOT_YD + 30) * 0.9144) / 111_320,
    lng: origin.lng,
  };
  const jump = acceptFix(fixAt(far.lat, far.lng, 8), origin);
  assert.equal(jump.ok, false);
  if (!jump.ok) assert.equal(jump.reason, 'impossible_jump');
  const forcedJump = forceMark(fixAt(far.lat, far.lng, 8), origin);
  assert.equal(forcedJump.fixQuality, 'forced');
  assert.ok((forcedJump.yards ?? 0) > MAX_SHOT_YD);
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: forcedJump.yards,
      fixQuality: 'forced',
    }),
    true,
  );

  const fourKept = clubAverageFromShots(
    [
      { yards: 148, fixQuality: 'soft' },
      { yards: 150, fixQuality: 'soft' },
      { yards: 152, fixQuality: 'good' },
      { yards: 149, fixQuality: 'forced' },
      { yards: 200, fixQuality: 'forced' },
    ],
    { typedCarryYards: 150, estimatedCarryYards: null },
  );
  assert.equal(AVERAGE_OUTLIER_RATIO, 0.2);
  assert.equal(fourKept.count, 4);
  assert.equal(fourKept.includesSoft, true);
  assert.equal(fourKept.includesForced, true);
  assert.ok(fourKept.count < MIN_CLOSED_SHOTS_FOR_RANK);
  assert.equal(
    rankDistanceYards({
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      loftRank: 9,
      avgYards: fourKept.avgYards,
      count: fourKept.count,
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
      avgYards: fourKept.avgYards,
      count: fourKept.count,
    }),
    STOCK_AVG_CARRY.club_7i,
  );

  const five = clubAverageFromShots(
    [
      { yards: 148, fixQuality: 'soft' },
      { yards: 150, fixQuality: 'soft' },
      { yards: 152, fixQuality: 'good' },
      { yards: 149, fixQuality: 'forced' },
      { yards: 151, fixQuality: 'good' },
    ],
    { typedCarryYards: 150, estimatedCarryYards: null },
  );
  assert.equal(five.count, 5);
  assert.equal(five.includesSoft, true);
  assert.equal(five.includesForced, true);
  assert.equal(
    rankDistanceYards({
      id: 'club_7i',
      name: '7 Iron',
      shortName: '7i',
      loftRank: 9,
      avgYards: five.avgYards,
      count: five.count,
      typicalCarryYards: 145,
    }),
    five.avgYards,
  );
  assert.notEqual(five.avgYards, 145);

  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 8,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
});

// Unified bag number: bag row, Club data and Suggested all read `resolveBagCarry`.
import { clubCarryMeta, resolveBagCarries, resolveBagCarry } from './bagDistance';
import { clubBookCarry, planClubData } from './nerdOut';
import { rankTopClubs } from './rankClubs';
import { planClubStrip, toWheelFillClub } from './clubStrip';

const IRONS = [
  { id: 'club_4i', name: '4 Iron', shortName: '4i', loftRank: 6 },
  { id: 'club_5i', name: '5 Iron', shortName: '5i', loftRank: 7 },
  { id: 'club_6i', name: '6 Iron', shortName: '6i', loftRank: 8 },
  { id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9 },
  { id: 'club_8i', name: '8 Iron', shortName: '8i', loftRank: 10 },
  { id: 'club_9i', name: '9 Iron', shortName: '9i', loftRank: 11 },
];

function unified(args: {
  typed: Record<string, number>;
  live?: Record<string, { count: number; avgYards: number }>;
}) {
  const clubs = IRONS.map((club) => ({ ...club, typicalCarryYards: args.typed[club.id] ?? null }));
  const bag = resolveBagCarries(clubs, args.live ?? {});
  const book = planClubData(
    clubs.map((club) => {
      const row = bag.get(club.id)!;
      const live = args.live?.[club.id];
      return {
        id: club.id,
        name: club.name,
        shortName: club.shortName,
        count: live?.count ?? 0,
        avgYards: live?.avgYards ?? 0,
        typicalCarryYards: row.typedYards ?? row.estimatedYards,
        carrySource: row.typedYards != null ? ('typed' as const) : row.estimatedYards != null ? ('estimated' as const) : null,
      };
    }),
  );
  const rankInputs = clubs.map((club) => ({
    ...club,
    avgYards: args.live?.[club.id]?.avgYards ?? 0,
    count: args.live?.[club.id]?.count ?? 0,
    typicalCarryYards: bag.get(club.id)!.typedYards,
    estimatedCarryYards: bag.get(club.id)!.estimatedYards,
  }));
  return { bag, book, rankInputs };
}

test('typed 7i 165, no shots → bag 165, club data 165, Suggested ranks 165', () => {
  const { bag, book, rankInputs } = unified({ typed: { club_7i: 165 } });
  assert.equal(bag.get('club_7i')?.yards, 165);
  assert.equal(bag.get('club_7i')?.kind, 'typed');
  assert.equal(book.find((row) => row.id === 'club_7i')?.yards, 165);
  const seven = rankInputs.find((club) => club.id === 'club_7i')!;
  assert.equal(rankDistanceYards(seven), 165);
  const top = rankTopClubs(rankInputs, { source: 'yards_to_green', dYards: 165 });
  assert.equal(top[0]?.id, 'club_7i');
  assert.equal(top[0]?.deltaYards, 0);
});

test('5 closed 7i samples avg 158 → bag, club data and Suggested all 158; Estimated gone', () => {
  const live = { club_7i: { count: 5, avgYards: 158 } };
  const { bag, book, rankInputs } = unified({
    typed: { club_5i: 180, club_6i: 170, club_9i: 140 },
    live,
  });
  assert.equal(bag.get('club_7i')?.yards, 158);
  assert.equal(bag.get('club_7i')?.kind, 'live');
  assert.equal(bag.get('club_7i')?.editable, false);
  assert.equal(bag.get('club_7i')?.estimatedYards, null);
  const row = book.find((r) => r.id === 'club_7i')!;
  assert.equal(row.yards, 158);
  assert.equal(row.kind, 'live');
  assert.equal(clubCarryMeta(row), '5 shots');
  assert.equal(rankDistanceYards(rankInputs.find((club) => club.id === 'club_7i')!), 158);
  const top = rankTopClubs(rankInputs, { source: 'yards_to_green', dYards: 158 });
  assert.equal(top[0]?.id, 'club_7i');
});

test('4 samples → still typed / estimate, never the 4-shot mean', () => {
  const typed = unified({ typed: { club_7i: 165 }, live: { club_7i: { count: 4, avgYards: 150 } } });
  assert.equal(typed.bag.get('club_7i')?.yards, 165);
  assert.equal(typed.bag.get('club_7i')?.kind, 'typed');
  assert.equal(typed.bag.get('club_7i')?.editable, true);
  assert.equal(typed.book.find((r) => r.id === 'club_7i')?.yards, 165);
  assert.equal(rankDistanceYards(typed.rankInputs.find((c) => c.id === 'club_7i')!), 165);

  const est = unified({
    typed: { club_5i: 180, club_6i: 170, club_9i: 140 },
    live: { club_7i: { count: 4, avgYards: 120 } },
  });
  const seven = est.bag.get('club_7i')!;
  assert.equal(seven.kind, 'estimated');
  assert.notEqual(seven.yards, 120);
  assert.equal(est.book.find((r) => r.id === 'club_7i')?.yards, seven.yards);
  assert.equal(rankDistanceYards(est.rankInputs.find((c) => c.id === 'club_7i')!), seven.yards);
  assert.equal(clubCarryMeta(seven), 'Estimated · 4 shots');
});

test('estimated fill enters Suggested — bag and ranking agree on the same yards', () => {
  const { bag, rankInputs } = unified({ typed: { club_5i: 180, club_6i: 170, club_9i: 140 } });
  const eight = bag.get('club_8i')!;
  assert.equal(eight.kind, 'estimated');
  for (const club of rankInputs) {
    assert.equal(rankDistanceYards(club), bag.get(club.id)?.yards);
  }
  const wheel = planClubStrip({
    clubs: IRONS.map((club) =>
      toWheelFillClub(
        { ...club, typicalCarryYards: bag.get(club.id)!.typedYards },
        { count: 0, avgYards: 0, bag: bag.get(club.id) },
      ),
    ),
    yardsLeft: eight.yards,
  });
  for (const club of IRONS) assert.equal(wheel.carries[club.id], bag.get(club.id)?.yards);
});

test('seed until typed / live; putter never has a yards average', () => {
  const { bag } = unified({ typed: {} });
  assert.equal(bag.get('club_7i')?.kind, 'seed');
  assert.equal(bag.get('club_7i')?.yards, STOCK_AVG_CARRY.club_7i);
  const putter = resolveBagCarry({
    id: PUTTER_CLUB_ID,
    liveCount: 20,
    liveAvgYards: 8,
    typedYards: 8,
    estimatedYards: 8,
  });
  assert.deepEqual(putter, { yards: null, kind: null, count: 0, editable: false });
  assert.equal(
    clubBookCarry({ id: PUTTER_CLUB_ID, count: 20, avgYards: 8, typicalCarryYards: 8, carrySource: 'typed' }).yards,
    null,
  );
  const putterBag = resolveBagCarries(
    [{ id: PUTTER_CLUB_ID, loftRank: 18, typicalCarryYards: 8 }],
    { [PUTTER_CLUB_ID]: { count: 20, avgYards: 8 } },
  );
  assert.equal(putterBag.get(PUTTER_CLUB_ID)?.yards, null);
  assert.equal(
    rankTopClubs(
      [{ id: PUTTER_CLUB_ID, name: 'Putter', shortName: 'Pt', loftRank: 18, avgYards: 8, count: 20 }],
      { source: 'yards_to_green', dYards: 8 },
    ).length,
    0,
  );
});

test('neighbor fill fills empty long irons until those clubs have 5 samples', () => {
  const typed = { club_7i: 150, club_8i: 140, club_9i: 130 };
  const before = unified({ typed, live: { club_4i: { count: 4, avgYards: 205 } } });
  assert.equal(before.bag.get('club_4i')?.kind, 'estimated');
  assert.equal(before.bag.get('club_5i')?.kind, 'estimated');
  const after = unified({ typed, live: { club_4i: { count: 5, avgYards: 205 } } });
  assert.equal(after.bag.get('club_4i')?.kind, 'live');
  assert.equal(after.bag.get('club_4i')?.yards, 205);
  assert.equal(after.bag.get('club_4i')?.estimatedYards, null);
  // Other empty long irons keep their neighbor estimate.
  assert.equal(after.bag.get('club_5i')?.kind, 'estimated');
  assert.equal(after.bag.get('club_5i')?.yards, before.bag.get('club_5i')?.yards);
});
