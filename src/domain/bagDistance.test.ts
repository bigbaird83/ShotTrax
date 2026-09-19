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
  assert.match(rank, /stockAvgCarryForSuggestion/);
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
