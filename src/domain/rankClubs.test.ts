import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_BAG, PUTTER_CLUB_ID } from './defaultBag';
import { addShotSheetOpeningClubIds, clubStripOpeningIds, planClubStrip } from './clubStrip';
import { haversineYards, roundYards } from './haversine';
import type { Club } from './types';
import {
  addShotAfterMarksSuggestsFromLastLanding,
  addShotEmptyHoleSuggestsFromTee,
  addShotSheetRankYards,
  addShotSheetUsesHeaderYards,
  addShotSuggestIncludesPutter,
  addShotSuggestPutterHasCarry,
  addShotSuggestRanksShotYards,
  addShotSuggestSource,
  addShotSuggestUsesPlayWheelTarget,
  addShotSuggestYardsLeft,
  clubToRankInput,
  lastClosedShotYards,
  MIN_CLOSED_SHOTS_FOR_RANK,
  rankCatchUpClubs,
  rankDistanceYards,
  rankTopClubs,
  playAndAddShotShareClosestCarryRanker,
  rankClosestCarryIds,
  remainingPinRanksLastClosedShot,
  remainingPinUsesPhoneGps,
  resolveAddShotSuggestTarget,
  top3RanksByAbsCarryMinusD,
  top3SortsByCarryAscending,
  top3SortsByCarryDescending,
  resolveDistanceTarget,
  resolveNextShotDistanceTarget,
  resolveRemainingPinTarget,
  shotYardsDistanceTarget,
  type RankClubInput,
} from './rankClubs';
import { lastLandingMark, markToGreen, toGreenDisplayFromHole } from './yardsToGreen';

function club(
  partial: Partial<RankClubInput> & Pick<RankClubInput, 'id' | 'loftRank' | 'avgYards' | 'count'>,
): RankClubInput {
  return {
    name: partial.id,
    shortName: partial.id,
    ...partial,
  };
}

const bag: RankClubInput[] = [
  club({ id: 'Dr', name: 'Driver', shortName: 'Dr', loftRank: 0, avgYards: 250, count: 8 }),
  club({ id: '5i', name: '5 Iron', shortName: '5i', loftRank: 4, avgYards: 180, count: 5 }),
  club({ id: '6i', name: '6 Iron', shortName: '6i', loftRank: 5, avgYards: 165, count: 6 }),
  club({ id: '7i', name: '7 Iron', shortName: '7i', loftRank: 6, avgYards: 150, count: 7 }),
  club({ id: '8i', name: '8 Iron', shortName: '8i', loftRank: 7, avgYards: 140, count: 5 }),
  club({ id: '9i', name: '9 Iron', shortName: '9i', loftRank: 8, avgYards: 130, count: 4 }),
  club({ id: 'PW', name: 'Pitching Wedge', shortName: 'PW', loftRank: 9, avgYards: 120, count: 5 }),
];

test('MIN_CLOSED_SHOTS_FOR_RANK is 5', () => {
  assert.equal(MIN_CLOSED_SHOTS_FOR_RANK, 5);
});

test('Suggested uses STOCK_AVG_CARRY until typed or ≥5 live; estimated never ranks; putter stays out', () => {
  const stock = club({ id: 'club_7i', loftRank: 9, avgYards: 0, count: 0 });
  assert.equal(rankDistanceYards(stock), 150);
  const typed = club({
    id: 'club_7i',
    loftRank: 9,
    avgYards: 0,
    count: 0,
    typicalCarryYards: 145,
  });
  assert.equal(rankDistanceYards(typed), 145);
  const live = club({
    id: 'club_7i',
    loftRank: 9,
    avgYards: 162,
    count: 5,
    typicalCarryYards: 145,
  });
  assert.equal(rankDistanceYards(live), 162);
  assert.equal(rankDistanceYards(club({ id: 'club_putter', loftRank: 18, avgYards: 8, count: 20 })), null);
});

test('invalid 0,0 / quality none green is not D — ranking falls back instead of inventing a pin', () => {
  const target = resolveDistanceTarget({
    toGreen: { yards: null, quality: 'none' },
    lastClosedYards: 140,
  });
  assert.deepEqual(target, { source: 'last_closed_shot', dYards: 140 });
});

test('no D (no green, no last closed shot) falls back to empty ranking / full bag', () => {
  const target = resolveDistanceTarget({
    toGreen: { yards: null, quality: 'none' },
    lastClosedYards: null,
  });
  assert.equal(target, null);
  assert.deepEqual(rankTopClubs(bag, target), []);
});

test('yards-to-green wins over last closed shot only when quality !== none', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const green = { lat: 37.0 + 150 / 111_320, lng: -122.0 };
  const dYards = roundYards(haversineYards(from, green));
  const target = resolveDistanceTarget({
    toGreen: { yards: dYards, quality: 'good' },
    lastClosedYards: 260,
  });
  assert.ok(target);
  assert.equal(target?.source, 'yards_to_green');
  assert.equal(target?.dYards, dYards);

  const skipped = resolveDistanceTarget({
    toGreen: { yards: dYards, quality: 'none' },
    lastClosedYards: 260,
  });
  assert.deepEqual(skipped, { source: 'last_closed_shot', dYards: 260 });
});

test('last closed shot on the hole is D when there is no green pin', () => {
  const target = resolveDistanceTarget({
    toGreen: { yards: null, quality: 'none' },
    lastClosedYards: 148,
  });
  assert.deepEqual(target, { source: 'last_closed_shot', dYards: 148 });
});

test('lastClosedShotYards uses the most recent closed shot and skips the open one', () => {
  const yards = lastClosedShotYards([
    { endedAt: 'a', distanceYards: 240 },
    { endedAt: 'b', distanceYards: 155 },
    { endedAt: null, distanceYards: null },
  ]);
  assert.equal(yards, 155);
});

test('lastClosedShotYards skips no_gps / none even if yards were present', () => {
  const yards = lastClosedShotYards([
    { endedAt: 'a', distanceYards: 240, source: 'gps', fixQuality: 'good' },
    { endedAt: 'b', distanceYards: 12, source: 'no_gps', fixQuality: 'none' },
    { endedAt: 'c', distanceYards: 90, source: 'gps', fixQuality: 'none' },
  ]);
  assert.equal(yards, 240);
});

test('lastClosedShotYards uses placed yards (no GPS quality) and still skips putter', () => {
  const yards = lastClosedShotYards([
    { endedAt: 'a', distanceYards: 155, source: 'gps', fixQuality: 'good', clubId: 'club_7i' },
    { endedAt: 'b', distanceYards: 168, source: 'placed', fixQuality: null, clubId: 'club_6i' },
  ]);
  assert.equal(yards, 168);
});

test('lastClosedShotYards skips putter shots — they are not a club sample', () => {
  const yards = lastClosedShotYards([
    { endedAt: 'a', distanceYards: 155, source: 'gps', fixQuality: 'good', clubId: 'club_7i' },
    { endedAt: 'b', distanceYards: 8, source: 'gps', fixQuality: 'good', clubId: 'club_putter' },
  ]);
  assert.equal(yards, 155);
});

test('catch-up club rank uses that shot’s yards, not yards-to-green', () => {
  const shotTarget = shotYardsDistanceTarget(148);
  const liveTarget = resolveDistanceTarget({
    toGreen: { yards: 260, quality: 'good' },
    lastClosedYards: 148,
  });
  assert.deepEqual(shotTarget, { source: 'shot_yards', dYards: 148 });
  assert.equal(liveTarget?.source, 'yards_to_green');
  assert.equal(liveTarget?.dYards, 260);
  assert.deepEqual(
    rankCatchUpClubs(bag, 148).map((c) => c.id),
    ['7i', '8i', '6i'],
  );
  assert.deepEqual(
    rankTopClubs(bag, liveTarget).map((c) => c.id),
    ['Dr', '5i', '6i'],
  );
  assert.deepEqual(rankCatchUpClubs(bag, null), []);
  assert.equal(shotYardsDistanceTarget(null), null);
  assert.equal(shotYardsDistanceTarget(Number.NaN), null);
});

test('catch-up top-3 uses seed until ≥5 live shots; putter stays out', () => {
  const ranked = rankCatchUpClubs(
    [
      club({
        id: 'club_putter',
        name: 'Putter',
        shortName: 'Pt',
        loftRank: 16,
        avgYards: 8,
        count: 20,
        typicalCarryYards: 8,
      }),
      club({
        id: 'club_gw',
        name: '52°',
        shortName: '52°',
        loftRank: 13,
        avgYards: 0,
        count: 0,
        typicalCarryYards: 105,
      }),
      club({
        id: 'club_sw',
        name: '56°',
        shortName: '56°',
        loftRank: 14,
        avgYards: 0,
        count: 2,
        typicalCarryYards: 90,
      }),
      club({
        id: 'club_7i',
        name: '7 Iron',
        shortName: '7i',
        loftRank: 9,
        avgYards: 150,
        count: 8,
      }),
    ],
    92,
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ['club_sw', 'club_gw', 'club_7i'],
  );
  assert.ok(!ranked.some((c) => c.id === 'club_putter'));

  const live = rankCatchUpClubs(
    [
      club({
        id: 'club_gw',
        name: '52°',
        shortName: '52°',
        loftRank: 13,
        avgYards: 118,
        count: 5,
        typicalCarryYards: 105,
      }),
      club({
        id: 'club_sw',
        name: '56°',
        shortName: '56°',
        loftRank: 14,
        avgYards: 0,
        count: 2,
        typicalCarryYards: 90,
      }),
    ],
    118,
  );
  assert.equal(live[0]?.id, 'club_gw');
  assert.equal(live[0]?.deltaYards, 0);
});

test('top-3 are the lowest |avgYards − D|; clubs with <5 closed shots are excluded', () => {
  const ranked = rankTopClubs(bag, { source: 'last_closed_shot', dYards: 148 });
  assert.deepEqual(
    ranked.map((c) => c.id),
    ['7i', '8i', '6i'],
  );
  assert.ok(!ranked.some((c) => c.id === '9i'));
  assert.equal(ranked[0].deltaYards, 2);
});

test('ties prefer the shorter club (higher loftRank)', () => {
  const ranked = rankTopClubs(
    [
      club({ id: '7i', loftRank: 6, avgYards: 150, count: 5 }),
      club({ id: '8i', loftRank: 7, avgYards: 150, count: 5 }),
      club({ id: '6i', loftRank: 5, avgYards: 150, count: 5 }),
    ],
    { source: 'last_closed_shot', dYards: 150 },
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ['8i', '7i', '6i'],
  );
});

test('soft/forced shots already in avgYards still rank (count includes them)', () => {
  const ranked = rankTopClubs(
    [
      club({ id: '7i', loftRank: 6, avgYards: 152, count: 5 }),
      club({ id: 'PW', loftRank: 9, avgYards: 80, count: 12 }),
      club({ id: 'Dr', loftRank: 0, avgYards: 250, count: 20 }),
    ],
    { source: 'yards_to_green', dYards: 150 },
  );
  assert.equal(ranked[0].id, '7i');
  assert.equal(ranked.length, 3);
});

test('fewer than 3 eligible clubs still surfaces those that qualify', () => {
  const ranked = rankTopClubs(
    [
      club({ id: '7i', loftRank: 6, avgYards: 150, count: 5 }),
      club({ id: '8i', loftRank: 7, avgYards: 140, count: 2 }),
    ],
    { source: 'last_closed_shot', dYards: 148 },
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ['7i'],
  );
});

test('no typed seed still ranks Suggested from STOCK_AVG_CARRY', () => {
  const ranked = rankTopClubs(
    [
      club({ id: 'club_7i', loftRank: 9, avgYards: 0, count: 0 }),
      club({ id: 'club_8i', loftRank: 10, avgYards: 0, count: 2 }),
    ],
    { source: 'yards_to_green', dYards: 150 },
  );
  assert.deepEqual(
    ranked.map((row) => row.id),
    ['club_7i', 'club_8i'],
  );
  assert.equal(ranked[0].deltaYards, 0);
});

test('no eligible clubs (all <5 shots) → empty ranking so UI shows full bag', () => {
  const ranked = rankTopClubs(
    [club({ id: '7i', loftRank: 6, avgYards: 150, count: 4 })],
    { source: 'last_closed_shot', dYards: 150 },
  );
  assert.deepEqual(ranked, []);
});

test('seeded bag loftRanks increase toward the short clubs', () => {
  const putter = DEFAULT_BAG.find((c) => c.id === 'club_putter');
  const driver = DEFAULT_BAG.find((c) => c.id === 'club_driver');
  const twoIron = DEFAULT_BAG.find((c) => c.id === 'club_2i');
  const fiveIron = DEFAULT_BAG.find((c) => c.id === 'club_5i');
  assert.ok(putter && driver && twoIron && fiveIron);
  assert.ok((putter?.loftRank ?? 0) > (driver?.loftRank ?? 0));
  assert.ok((fiveIron?.loftRank ?? 0) > (twoIron?.loftRank ?? 0));
});

test('clubToRankInput attaches typed typical-carry seeds; putter has none and is not rankable', () => {
  const wedge = DEFAULT_BAG.find((c) => c.id === 'club_gw');
  const putter = DEFAULT_BAG.find((c) => c.id === 'club_putter');
  assert.ok(wedge && putter);
  const wedgeIn = clubToRankInput(
    { ...wedge, enabled: true, typicalCarryYards: 105 },
    { avgYards: 0, count: 0 },
  );
  const skipped = clubToRankInput({ ...wedge, enabled: true }, { avgYards: 0, count: 0 });
  const putterIn = clubToRankInput(
    { ...putter, enabled: true, typicalCarryYards: 8 },
    { avgYards: 8, count: 12 },
  );
  assert.equal(wedgeIn.typicalCarryYards, 105);
  assert.equal(rankDistanceYards(wedgeIn), 105);
  assert.equal(skipped.typicalCarryYards, null);
  assert.equal(rankDistanceYards(skipped), 105);
  assert.equal(putterIn.typicalCarryYards, null);
  assert.equal(rankDistanceYards(putterIn), null);
});

test('putter is never in Suggested top-3 even with a live average', () => {
  const ranked = rankTopClubs(
    [
      club({ id: 'club_putter', name: 'Putter', shortName: 'Pt', loftRank: 16, avgYards: 8, count: 20 }),
      club({ id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9, avgYards: 150, count: 8 }),
      club({
        id: 'club_gw',
        name: '52°',
        shortName: '52°',
        loftRank: 13,
        avgYards: 0,
        count: 0,
        typicalCarryYards: 105,
      }),
    ],
    { source: 'yards_to_green', dYards: 10 },
  );
  assert.ok(!ranked.some((c) => c.id === 'club_putter'));
  assert.ok(ranked.length > 0);
});

test('bag-edited typical carry is the seed until 5 GPS shots; live avg then replaces it with no blend', () => {
  const seven: Club = {
    id: 'club_7i',
    name: '7 Iron',
    shortName: '7i',
    loftRank: 9,
    sortOrder: 9,
    enabled: true,
    typicalCarryYards: 145,
  };
  const seeded = clubToRankInput(seven, { avgYards: 160, count: 4 });
  assert.equal(seeded.typicalCarryYards, 145);
  assert.equal(rankDistanceYards(seeded), 145);

  const live = clubToRankInput(seven, { avgYards: 160, count: 5 });
  assert.equal(rankDistanceYards(live), 160);
  assert.notEqual(rankDistanceYards(live), (145 + 160) / 2);

  const cleared = clubToRankInput({ ...seven, typicalCarryYards: null }, { avgYards: 150, count: 3 });
  assert.equal(cleared.typicalCarryYards, null);
  assert.equal(rankDistanceYards(cleared), 150);
});

test('Add shot suggested clubs use the same remaining-yards D as the play wheel', () => {
  assert.equal(addShotSuggestUsesPlayWheelTarget(), true);
  assert.equal(addShotSuggestRanksShotYards(), false);
  assert.equal(addShotEmptyHoleSuggestsFromTee(), true);
  assert.equal(addShotAfterMarksSuggestsFromLastLanding(), true);
  assert.equal(addShotSuggestIncludesPutter(), false);
  assert.equal(addShotSuggestPutterHasCarry(), false);
  assert.equal(addShotSuggestSource(null), 'tee');
  assert.equal(addShotSuggestSource(undefined), 'tee');

  const tee = { lat: 37.0, lng: -122.0 };
  const landing = { lat: 37.0 + (200 * 0.9144) / 111_320, lng: -122.0 };
  const green = { lat: 37.0 + (371 * 0.9144) / 111_320, lng: -122.0 };
  const course = toGreenDisplayFromHole({
    courseYards: 371,
    green,
    shots: [],
  });
  const emptyPlay = resolveNextShotDistanceTarget({
    landingToGreen: markToGreen(lastLandingMark([]), green),
    courseToGreen: { yards: course.yards, quality: course.quality },
    lastClosedYards: lastClosedShotYards([]),
  });
  const emptyAdd = resolveAddShotSuggestTarget({
    lastLanding: lastLandingMark([]),
    green,
    courseToGreen: { yards: course.yards, quality: course.quality },
    lastClosedYards: lastClosedShotYards([]),
  });
  assert.deepEqual(emptyAdd, emptyPlay);
  assert.deepEqual(emptyAdd, { source: 'yards_to_green', dYards: 371 });
  assert.equal(addShotSuggestYardsLeft({ playTarget: emptyAdd, courseYards: course.yards }), 371);
  assert.notEqual(emptyAdd?.dYards, 200);

  const shots = [
    {
      seq: 1,
      startLat: tee.lat,
      startLng: tee.lng,
      endLat: landing.lat,
      endLng: landing.lng,
      endedAt: 'a',
      source: 'placed' as const,
      fixQuality: null,
      distanceYards: 200,
    },
  ];
  const afterLanding = lastLandingMark(shots);
  assert.deepEqual(afterLanding, landing);
  assert.equal(addShotSuggestSource(afterLanding), 'from_pin');
  const landingToGreen = markToGreen(afterLanding, green);
  const afterPlay = resolveNextShotDistanceTarget({
    landingToGreen,
    courseToGreen: { yards: 371, quality: 'good' },
    lastClosedYards: 200,
  });
  const afterAdd = resolveAddShotSuggestTarget({
    lastLanding: afterLanding,
    green,
    courseToGreen: { yards: 371, quality: 'good' },
    lastClosedYards: 200,
  });
  assert.deepEqual(afterAdd, afterPlay);
  assert.equal(afterAdd?.source, 'yards_to_green');
  assert.equal(afterAdd?.dYards, landingToGreen.yards);
  assert.notEqual(afterAdd?.dYards, 371);
  assert.notEqual(afterAdd?.dYards, 200);
  assert.deepEqual(rankCatchUpClubs(bag, 200).map((c) => c.id), ['5i', '6i', '7i']);
  assert.deepEqual(rankTopClubs(bag, afterAdd).map((c) => c.id), ['6i', '5i', '7i']);
  assert.notDeepEqual(
    rankTopClubs(bag, afterAdd).map((c) => c.id),
    rankCatchUpClubs(bag, 200).map((c) => c.id),
  );
  const withPutter = [
    ...bag,
    club({
      id: PUTTER_CLUB_ID,
      name: 'Putter',
      shortName: 'Pt',
      loftRank: 16,
      avgYards: 8,
      count: 20,
      typicalCarryYards: 8,
    }),
  ];
  const emptyIds = rankTopClubs(withPutter, emptyAdd).map((c) => c.id);
  const afterIds = rankTopClubs(withPutter, afterAdd).map((c) => c.id);
  assert.equal(emptyIds.length, 3);
  assert.equal(afterIds.length, 3);
  assert.ok(!emptyIds.includes(PUTTER_CLUB_ID));
  assert.ok(!afterIds.includes(PUTTER_CLUB_ID));
  const strip = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 230 },
      { id: 'club_5i', carry: 170 },
      { id: 'club_7i', carry: 150 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: addShotSuggestYardsLeft({ playTarget: afterAdd, courseYards: 371 }),
  });
  assert.equal(strip.ids[strip.ids.length - 1], PUTTER_CLUB_ID);
  assert.equal(strip.carries[PUTTER_CLUB_ID], undefined);
  assert.ok(!clubStripOpeningIds(strip.ids, strip.windowStart).includes(PUTTER_CLUB_ID));
  assert.notEqual(strip.pickId, PUTTER_CLUB_ID);

  const noInvent = resolveAddShotSuggestTarget({
    lastLanding: null,
    green: null,
    courseToGreen: { yards: null, quality: 'none' },
    lastClosedYards: null,
  });
  assert.equal(noInvent, null);
  assert.equal(addShotSuggestYardsLeft({ playTarget: null, courseYards: 371 }), 371);
  assert.equal(addShotSuggestYardsLeft({ playTarget: null, courseYards: null }), null);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const placeStrip = hole.slice(hole.indexOf('const addShotSuggestTarget'), hole.indexOf('const placeStripItems'));
  assert.match(hole, /resolveAddShotSuggestTarget/);
  assert.match(hole, /addShotSuggestYardsLeft/);
  assert.match(placeStrip, /lastLanding: lastLandingMark\(shots\)/);
  assert.match(placeStrip, /tee: holeTee/);
  assert.match(placeStrip, /courseToGreen: toGreen/);
  assert.match(placeStrip, /playTarget: addShotSuggestTarget/);
  assert.match(placeStrip, /addShotSheetRankYards/);
  assert.match(placeStrip, /headerYards: pickerYards/);
  assert.match(placeStrip, /yardsLeft: placeSuggestYards/);
  assert.doesNotMatch(placeStrip, /yardsLeft: pickerYards;/);
  assert.doesNotMatch(placeStrip, /yardsLeft: placedYards/);
  assert.match(hole, /windowStart=\{placeStripPlan\.windowStart\}/);
  assert.match(hole, /addShotSheetOpeningClubIds/);
  assert.match(hole, /items=\{placeOpeningItems/);
  assert.equal(addShotSheetUsesHeaderYards(), true);
  assert.equal(addShotSheetRankYards({ headerYards: 281, remainingPin: 371 }), 281);
  assert.equal(addShotSheetRankYards({ headerYards: 281, remainingPin: null }), 281);
  assert.equal(addShotSheetRankYards({ headerYards: null, remainingPin: 371 }), 371);
  assert.match(placeStrip, /editClubOpen/);
  assert.doesNotMatch(placeStrip, /phone|fix\?\.lat|house/);
  assert.match(hole, /const placeStripItems[\s\S]*?filter\(\(id\) => !isPutterClubId/);
});

test('next suggested ranks from the new landing, not the card tee number', () => {
  const tee = { lat: 37.0, lng: -122.0 };
  const landing = { lat: 37.0 + (200 * 0.9144) / 111_320, lng: -122.0 };
  const green = { lat: 37.0 + (371 * 0.9144) / 111_320, lng: -122.0 };
  const course = toGreenDisplayFromHole({
    courseYards: 371,
    green,
    shots: [{ seq: 1, startLat: tee.lat, startLng: tee.lng, fixQuality: 'good' }],
  });
  assert.equal(course.yards, 371);
  const landingToGreen = markToGreen(
    lastLandingMark([
      {
        seq: 1,
        endLat: landing.lat,
        endLng: landing.lng,
        endedAt: 'a',
        source: 'placed',
        fixQuality: null,
      },
    ]),
    green,
  );
  assert.ok(landingToGreen.yards != null);
  assert.ok(Math.abs((landingToGreen.yards ?? 0) - 171) < 8);
  const target = resolveNextShotDistanceTarget({
    landingToGreen,
    courseToGreen: { yards: course.yards, quality: course.quality },
    lastClosedYards: 200,
  });
  assert.equal(target?.source, 'yards_to_green');
  assert.equal(target?.dYards, landingToGreen.yards);
  assert.notEqual(target?.dYards, 371);

  const before = resolveNextShotDistanceTarget({
    landingToGreen: { yards: null, quality: 'none' },
    courseToGreen: { yards: 371, quality: 'good' },
    lastClosedYards: null,
  });
  assert.deepEqual(before, { source: 'yards_to_green', dYards: 371 });
});

test('typical-carry seed ranks a stock club before 5 live shots; live avg takes over after', () => {
  const seeded = rankTopClubs(
    [
      club({
        id: 'club_gw',
        name: '52°',
        shortName: '52°',
        loftRank: 13,
        avgYards: 0,
        count: 0,
        typicalCarryYards: 105,
      }),
      club({
        id: 'club_sw',
        name: '56°',
        shortName: '56°',
        loftRank: 14,
        avgYards: 0,
        count: 2,
        typicalCarryYards: 90,
      }),
      club({
        id: 'club_7i',
        name: '7 Iron',
        shortName: '7i',
        loftRank: 9,
        avgYards: 150,
        count: 8,
      }),
    ],
    { source: 'last_closed_shot', dYards: 92 },
  );
  assert.deepEqual(
    seeded.map((c) => c.id),
    ['club_sw', 'club_gw', 'club_7i'],
  );

  const live = rankTopClubs(
    [
      club({
        id: 'club_gw',
        name: '52°',
        shortName: '52°',
        loftRank: 13,
        avgYards: 118,
        count: 5,
        typicalCarryYards: 105,
      }),
      club({
        id: 'club_sw',
        name: '56°',
        shortName: '56°',
        loftRank: 14,
        avgYards: 0,
        count: 2,
        typicalCarryYards: 90,
      }),
    ],
    { source: 'last_closed_shot', dYards: 118 },
  );
  assert.equal(live[0]?.id, 'club_gw');
  assert.equal(live[0]?.deltaYards, 0);
});

test('TF 53: top-3 is closest carry to remaining pin yards — not shortest or longest', () => {
  assert.equal(remainingPinRanksLastClosedShot(), false);
  assert.equal(remainingPinUsesPhoneGps(), false);
  assert.equal(top3RanksByAbsCarryMinusD(), true);
  assert.equal(top3SortsByCarryDescending(), false);
  assert.equal(top3SortsByCarryAscending(), false);
  assert.equal(playAndAddShotShareClosestCarryRanker(), true);

  const cypress6Tee = { lat: 35.0349146, lng: -92.0203523 };
  const cypress6Green = { lat: 35.0332467, lng: -92.0234644 };
  const teeToPin = markToGreen(cypress6Tee, cypress6Green);
  assert.ok(teeToPin.yards != null && teeToPin.yards > 300 && teeToPin.yards < 430);
  const empty = resolveRemainingPinTarget({
    landingToGreen: { yards: null, quality: 'none' },
    teeToGreen: teeToPin,
    courseToGreen: { yards: null, quality: 'none' },
  });
  assert.deepEqual(empty, { source: 'yards_to_green', dYards: teeToPin.yards });
  assert.notEqual(empty?.dYards, 280);
  const ignoresLastClosed = resolveNextShotDistanceTarget({
    landingToGreen: { yards: null, quality: 'none' },
    teeToGreen: teeToPin,
    courseToGreen: { yards: null, quality: 'none' },
    lastClosedYards: 280,
  });
  assert.deepEqual(ignoresLastClosed, empty);

  const noPin = resolveRemainingPinTarget({
    landingToGreen: { yards: null, quality: 'none' },
    teeToGreen: { yards: null, quality: 'none' },
    courseToGreen: { yards: null, quality: 'none' },
  });
  assert.equal(noPin, null);

  const landing = { lat: cypress6Tee.lat + (220 * 0.9144) / 111_320, lng: cypress6Tee.lng };
  const fromPin = markToGreen(landing, cypress6Green);
  const after = resolveRemainingPinTarget({
    landingToGreen: fromPin,
    teeToGreen: teeToPin,
    courseToGreen: { yards: 371, quality: 'good' },
  });
  assert.equal(after?.source, 'yards_to_green');
  assert.equal(after?.dYards, fromPin.yards);
  assert.notEqual(after?.dYards, teeToPin.yards);
  assert.notEqual(after?.dYards, 220);

  const docBag: RankClubInput[] = [
    club({ id: 'club_lw', shortName: 'LW', loftRank: 17, avgYards: 0, count: 0, typicalCarryYards: 75 }),
    club({ id: 'club_7i', shortName: '7i', loftRank: 9, avgYards: 0, count: 0, typicalCarryYards: 150 }),
    club({ id: 'club_5i', shortName: '5i', loftRank: 7, avgYards: 0, count: 0, typicalCarryYards: 170 }),
    club({ id: 'club_2i', shortName: '2i', loftRank: 4, avgYards: 0, count: 0, typicalCarryYards: 239 }),
    club({ id: 'club_3w', shortName: '3W', loftRank: 1, avgYards: 0, count: 0, typicalCarryYards: 254 }),
    club({ id: 'club_driver', shortName: 'Dr', loftRank: 0, avgYards: 0, count: 0, typicalCarryYards: 280 }),
    club({ id: PUTTER_CLUB_ID, shortName: 'Pt', loftRank: 18, avgYards: 8, count: 20, typicalCarryYards: 8 }),
  ];
  const teeIds = rankTopClubs(docBag, empty).map((row) => row.id);
  assert.deepEqual(teeIds, ['club_driver', 'club_3w', 'club_2i']);
  assert.ok(!teeIds.includes(PUTTER_CLUB_ID));
  const midIds = rankTopClubs(docBag, { source: 'yards_to_green', dYards: 155 }).map((row) => row.id);
  assert.deepEqual(midIds, ['club_7i', 'club_5i', 'club_lw']);
  assert.ok(!midIds.includes('club_driver'));
  assert.ok(!midIds.includes('club_3w'));
  const shortIds = rankTopClubs(docBag, { source: 'yards_to_green', dYards: 80 }).map((row) => row.id);
  assert.equal(shortIds[0], 'club_lw');
  assert.ok(!shortIds.includes('club_driver'));

  const stripMid = planClubStrip({
    clubs: docBag.map((row) => ({ id: row.id, carry: row.typicalCarryYards })),
    yardsLeft: 155,
  });
  assert.deepEqual(clubStripOpeningIds(stripMid.ids, stripMid.windowStart), [
    'club_lw',
    'club_7i',
    'club_5i',
  ]);
  assert.notDeepEqual(clubStripOpeningIds(stripMid.ids, stripMid.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.match(hole, /const teeToGreen = markToGreen\(holeTee, green\)/);
  assert.match(hole, /teeToGreen,/);
  assert.match(pick, /const teeToGreen = markToGreen\(holeTee, green\)/);
  const watchPush = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(watchPush, /yardsToGreen: target\?\.dYards/);
  assert.doesNotMatch(watchPush, /yardsToGreen: liveToGreen\.yards/);
  assert.match(pick, /yardsToGreen: target\?\.dYards/);
  assert.doesNotMatch(pick, /yardsToGreen\(fix, green\)/);

  const withBomb = [
    { id: 'club_lw', carry: 75 },
    { id: 'club_7i', carry: 150 },
    { id: 'club_5i', carry: 170 },
    { id: 'club_2i', carry: 239 },
    { id: 'club_3w', carry: 254 },
    { id: 'club_driver', carry: 280 },
    { id: 'club_bomb', carry: 400 },
  ];
  const longest3 = [...withBomb].sort((a, b) => b.carry - a.carry).slice(0, 3).map((row) => row.id);
  assert.deepEqual(longest3, ['club_bomb', 'club_driver', 'club_3w']);
  assert.deepEqual(rankClosestCarryIds(withBomb, 155), ['club_7i', 'club_5i', 'club_lw']);
  assert.deepEqual(rankClosestCarryIds(withBomb, 281), ['club_driver', 'club_3w', 'club_2i']);
  assert.ok(!rankClosestCarryIds(withBomb, 281).includes('club_bomb'));
  const strip = readFileSync(new URL('./clubStrip.ts', import.meta.url), 'utf8');
  assert.match(strip, /rankClosestCarryIds/);

  const header281 = planClubStrip({
    clubs: docBag.map((row) => ({ id: row.id, carry: row.typicalCarryYards })),
    yardsLeft: addShotSheetRankYards({ headerYards: 281, remainingPin: empty?.dYards ?? null }),
  });
  assert.equal(addShotSheetRankYards({ headerYards: 281, remainingPin: empty?.dYards ?? null }), 281);
  assert.deepEqual(clubStripOpeningIds(header281.ids, header281.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);
  assert.notDeepEqual(clubStripOpeningIds(header281.ids, header281.windowStart), [
    'club_lw',
    'club_7i',
    'club_5i',
  ]);
  assert.equal(header281.windowStart > 0, true);

  const smoking = planClubStrip({
    clubs: [
      { id: 'club_sw', carry: 101 },
      { id: 'club_gw', carry: 120 },
      { id: 'club_48', carry: 136 },
      { id: 'club_7i', carry: 150 },
      { id: 'club_2i', carry: 239 },
      { id: 'club_3w', carry: 254 },
      { id: 'club_driver', carry: 280 },
    ],
    yardsLeft: addShotSheetRankYards({ headerYards: 281, remainingPin: 40 }),
  });
  assert.deepEqual(rankClosestCarryIds(
    [
      { id: 'club_sw', carry: 101 },
      { id: 'club_gw', carry: 120 },
      { id: 'club_48', carry: 136 },
      { id: 'club_2i', carry: 239 },
      { id: 'club_3w', carry: 254 },
      { id: 'club_driver', carry: 280 },
    ],
    281,
  ), ['club_driver', 'club_3w', 'club_2i']);
  assert.deepEqual(clubStripOpeningIds(smoking.ids, smoking.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);
  assert.deepEqual(clubStripOpeningIds(smoking.ids, 0), [
    'club_sw',
    'club_gw',
    'club_48',
  ]);
  assert.deepEqual(
    addShotSheetOpeningClubIds({
      clubs: [
        { id: 'club_sw', carry: 101 },
        { id: 'club_gw', carry: 120 },
        { id: 'club_48', carry: 136 },
        { id: 'club_7i', carry: 150 },
        { id: 'club_2i', carry: 239 },
        { id: 'club_3w', carry: 254 },
        { id: 'club_driver', carry: 280 },
      ],
      headerYards: 281,
      remainingPin: 40,
    }),
    ['club_2i', 'club_3w', 'club_driver'],
  );
  assert.notDeepEqual(
    addShotSheetOpeningClubIds({
      clubs: [
        { id: 'club_sw', carry: 101 },
        { id: 'club_gw', carry: 120 },
        { id: 'club_48', carry: 136 },
        { id: 'club_2i', carry: 239 },
        { id: 'club_3w', carry: 254 },
        { id: 'club_driver', carry: 280 },
      ],
      headerYards: 281,
    }),
    ['club_sw', 'club_gw', 'club_48'],
  );
  assert.match(hole, /addShotSheetOpeningClubIds/);
  assert.match(hole, /placeOpeningItems/);
});
