import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageWithBadges } from './averages';

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
