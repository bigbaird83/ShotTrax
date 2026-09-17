import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWatchHoleLine } from './watchStatus';

test('Watch status is Hole N — yards stay off Watch', () => {
  assert.equal(formatWatchHoleLine(1), 'Hole 1');
  assert.equal(formatWatchHoleLine(4), 'Hole 4');
  assert.equal(formatWatchHoleLine(18), 'Hole 18');
  assert.doesNotMatch(formatWatchHoleLine(7), /yd|—|SOFT/i);
});
