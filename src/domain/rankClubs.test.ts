import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BAG } from './defaultBag';
import { haversineYards, roundYards } from './haversine';
import {
  lastClosedShotYards,
  MIN_CLOSED_SHOTS_FOR_RANK,
  rankTopClubs,
  resolveDistanceTarget,
  type RankClubInput,
} from './rankClubs';

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

test('no D (no green, no last closed shot) falls back to empty ranking / full bag', () => {
  const target = resolveDistanceTarget({ from: null, green: null, lastClosedYards: null });
  assert.equal(target, null);
  assert.deepEqual(rankTopClubs(bag, target), []);
});

test('yards-to-green wins over last closed shot when both exist', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const green = { lat: 37.0 + 150 / 111_320, lng: -122.0 };
  const target = resolveDistanceTarget({ from, green, lastClosedYards: 260 });
  assert.ok(target);
  assert.equal(target?.source, 'yards_to_green');
  assert.equal(target?.dYards, roundYards(haversineYards(from, green)));
});

test('last closed shot on the hole is D when there is no green pin', () => {
  const target = resolveDistanceTarget({
    from: { lat: 1, lng: 1 },
    green: null,
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

test('lastClosedShotYards skips no_gps even if yards were present', () => {
  const yards = lastClosedShotYards([
    { endedAt: 'a', distanceYards: 240, source: 'gps' },
    { endedAt: 'b', distanceYards: 12, source: 'no_gps' },
  ]);
  assert.equal(yards, 240);
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
  assert.ok(putter && driver);
  assert.ok((putter?.loftRank ?? 0) > (driver?.loftRank ?? 0));
});
