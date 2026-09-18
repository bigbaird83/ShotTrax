import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canAdvanceHole,
  finishShotChipLabel,
  holesNeedingOpenShots,
  nextBlockedByUnfinished,
} from './holeAdvance';
import { COPY } from './playerCopy';

test('Next is always allowed even if the hole is unfinished', () => {
  assert.equal(canAdvanceHole({ holeNumber: 4, holeCount: 18 }), true);
  assert.equal(canAdvanceHole({ holeNumber: 18, holeCount: 18 }), false);
  assert.equal(nextBlockedByUnfinished(true), false);
  assert.equal(nextBlockedByUnfinished(false), false);
  assert.equal(COPY.nextHole, 'Next hole');
});

test('unfinished open shots get a chip — nothing invented', () => {
  const chips = holesNeedingOpenShots(
    [
      { number: 2, hasOpenShot: true },
      { number: 3, hasOpenShot: false },
      { number: 4, hasOpenShot: true },
    ],
    4,
  );
  assert.deepEqual(
    chips.map((row) => row.number),
    [2],
  );
  assert.equal(finishShotChipLabel(2), 'Finish shot · Hole 2');
});
