import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatShotLockChip,
  shotLockChipUsesCarryAverage,
  shotLockChipUsesHoleCardYards,
  shotLockIsModal,
} from './shotLock';

test('shot lock chip is club · logged from-to yards, not a modal or the card', () => {
  assert.equal(formatShotLockChip({ shortName: '7i', distanceYards: 162 }), '7i · 162');
  assert.equal(formatShotLockChip({ shortName: '7i', distanceYards: 162.4 }), '7i · 162');
  assert.equal(formatShotLockChip({ shortName: '7i', distanceYards: null }), null);
  assert.equal(formatShotLockChip({ shortName: '7i', distanceYards: Number.NaN }), null);
  assert.notEqual(formatShotLockChip({ shortName: '7i', distanceYards: 162 }), '7i · 371');
  assert.notEqual(formatShotLockChip({ shortName: '7i', distanceYards: 162 }), '7i · 155');
  assert.equal(shotLockIsModal(), false);
  assert.equal(shotLockChipUsesHoleCardYards(), false);
  assert.equal(shotLockChipUsesCarryAverage(), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /formatShotLockChip/);
  assert.match(hole, /planPlacedShot\(placeFrom, placeTo\)/);
  assert.match(hole, /closePrior\.distanceYards/);
  assert.doesNotMatch(hole.slice(hole.indexOf('const commitPlaced'), hole.indexOf('const onConfirmUndo')), /Alert\.alert/);
  assert.doesNotMatch(hole.slice(hole.indexOf('formatShotLockChip'), hole.indexOf('formatShotLockChip') + 400), /hole\.yards|typicalCarry|avgYards/);
});
