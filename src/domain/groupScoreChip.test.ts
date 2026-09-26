import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';

test('Group score chip sits under the live yards badge and opens group scoring on this hole', () => {
  assert.equal(COPY.groupScoreChip, 'Group score');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const corner = hole.slice(hole.indexOf('styles.headerCorner'), hole.indexOf('hazardCarries.length > 0'));
  // The corner lets taps through to the chip; the yards badge itself stays untappable.
  assert.match(hole, /pointerEvents="box-none"\s+style=\{\[styles\.headerCorner/);
  assert.match(corner, /<View pointerEvents="none" testID="live-gps-to-pin">/);
  assert.ok(corner.indexOf('testID="live-gps-to-pin"') < corner.indexOf('testID="group-score-chip"'));
  const chip = corner.slice(corner.indexOf('groupPlaying && !catchUpFullScreen'));
  assert.match(chip, /router\.push\(`\/round\/\$\{id\}\/group\?hole=\$\{holeNumber\}`\)/);
  assert.match(chip, /numberOfLines=\{1\}/);
  assert.match(chip, /COPY\.groupScoreChip/);
  // Only when a group is playing: two or more players.
  assert.match(hole, /if \(group\.players\.length < 2\) return \{ groupPlaying: false/);
});
