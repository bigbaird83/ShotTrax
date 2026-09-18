import assert from 'node:assert/strict';
import { test } from 'node:test';
import { includeInDistanceAverages } from './shotSource';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  averageWithBadges,
  shotMovesClubAverage,
  shotsForClubAverage,
} from './averages';

test('empty set has zero average and no badges', () => {
  const a = averageWithBadges([]);
  assert.equal(a.count, 0);
  assert.equal(a.includesSoft, false);
  assert.equal(a.includesForced, false);
});

test('good, soft, and forced shots all stay in the average', () => {
  const a = averageWithBadges([
    { yards: 150, fixQuality: 'good' },
    { yards: 170, fixQuality: 'soft' },
    { yards: 160, fixQuality: 'forced' },
  ]);
  assert.equal(a.count, 3);
  assert.equal(a.avgYards, 160);
  assert.equal(a.includesSoft, true);
  assert.equal(a.includesForced, true);
});

test('placed samples count with no GPS quality badges', () => {
  const a = averageWithBadges([
    { yards: 150, fixQuality: 'good' },
    { yards: 170, fixQuality: null },
  ]);
  assert.equal(a.count, 2);
  assert.equal(a.avgYards, 160);
  assert.equal(a.includesSoft, false);
  assert.equal(a.includesForced, false);
});

test('soft-only set still averages and badges soft, not forced', () => {
  const a = averageWithBadges([
    { yards: 100, fixQuality: 'soft' },
    { yards: 120, fixQuality: 'soft' },
  ]);
  assert.equal(a.avgYards, 110);
  assert.equal(a.includesSoft, true);
  assert.equal(a.includesForced, false);
});

test('a shot 20% off is stored on the hole and excluded from the average', () => {
  const holeShot = {
    source: 'gps' as const,
    distanceYards: 180,
    fixQuality: 'good' as const,
    clubId: 'club_7i',
  };
  assert.equal(includeInDistanceAverages(holeShot), true);
  assert.equal(shotMovesClubAverage({ yards: 180, baselineYards: 150 }), false);
  const kept = shotsForClubAverage([{ yards: 180, fixQuality: 'good' }], {
    typedCarryYards: 150,
    estimatedCarryYards: null,
  });
  assert.deepEqual(kept, []);
  assert.equal(averageWithBadges(kept).count, 0);
  assert.equal(shotMovesClubAverage({ yards: 179, baselineYards: 150 }), true);
});

test('a shot with no baseline still starts the average', () => {
  const kept = shotsForClubAverage([{ yards: 190, fixQuality: 'good' }], {
    typedCarryYards: null,
    estimatedCarryYards: null,
  });
  assert.equal(kept.length, 1);
  assert.equal(averageWithBadges(kept).avgYards, 190);
});

test('putter stays out of averages', () => {
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
});

test('inside 20% still updates; live average beats the seed', () => {
  const kept = shotsForClubAverage(
    [
      { yards: 150, fixQuality: 'good' },
      { yards: 160, fixQuality: 'good' },
      { yards: 200, fixQuality: 'soft' },
    ],
    { typedCarryYards: 150, estimatedCarryYards: 140 },
  );
  assert.deepEqual(
    kept.map((shot) => shot.yards),
    [150, 160],
  );
  assert.equal(averageWithBadges(kept).avgYards, 155);
  const fromEstimated = shotsForClubAverage([{ yards: 200, fixQuality: 'good' }], {
    typedCarryYards: null,
    estimatedCarryYards: 160,
  });
  assert.deepEqual(fromEstimated, []);
});
