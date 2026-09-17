import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  addPuttLength,
  canMakePutt,
  clampPutts,
  emptyPuttDraft,
  finishPuttsChipLabel,
  holeAfterDone,
  holesNeedingPutts,
  isNearOrOnGreen,
  madeItAdvancesHole,
  NEAR_GREEN_YD,
  parsePuttLengths,
  planMadeIt,
  PUTT_LENGTHS,
  PUTT_MAX,
  putterOpensPuttSheet,
  puttsFromWalkOff,
  serializePuttLengths,
  setPuttCount,
  shouldAutoOpenClubPick,
  undoLastPutt,
} from './putts';

test('putts clamp to 0–5', () => {
  assert.equal(clampPutts(-1), 0);
  assert.equal(clampPutts(0), 0);
  assert.equal(clampPutts(3), 3);
  assert.equal(clampPutts(5), 5);
  assert.equal(clampPutts(9), 5);
  assert.equal(clampPutts(Number.NaN), 0);
  assert.equal(PUTT_MAX, 5);
});

test('length buckets are player-voice Under 3 ft · 3–10 · 10–20 · 20+', () => {
  assert.deepEqual(
    PUTT_LENGTHS.map((row) => row.label),
    ['Under 3 ft', '3–10', '10–20', '20+'],
  );
});

test('putt lengths serialize and drop unknown ids', () => {
  assert.deepEqual(parsePuttLengths(null), []);
  assert.deepEqual(parsePuttLengths('inside_3,over_20,nope'), ['inside_3', 'over_20']);
  assert.equal(serializePuttLengths(['3_to_10', '10_to_20']), '3_to_10,10_to_20');
});

test('each bucket tap adds its own putt; undo drops the last', () => {
  const trimmed = setPuttCount({ putts: 3, lengths: ['inside_3', '3_to_10', 'over_20'] }, 1);
  assert.deepEqual(trimmed, { putts: 1, lengths: ['inside_3'] });
  const first = addPuttLength(emptyPuttDraft(), 'over_20');
  assert.deepEqual(first, { putts: 1, lengths: ['over_20'] });
  const second = addPuttLength(first, '3_to_10');
  assert.deepEqual(second, { putts: 2, lengths: ['over_20', '3_to_10'] });
  const third = addPuttLength(second, 'inside_3');
  assert.deepEqual(third, { putts: 3, lengths: ['over_20', '3_to_10', 'inside_3'] });
  assert.deepEqual(undoLastPutt(third), second);
  const full = addPuttLength({ putts: 5, lengths: ['inside_3', 'inside_3', 'inside_3', 'inside_3', 'inside_3'] }, 'over_20');
  assert.equal(full.putts, 5);
});

test('Made it needs at least one putt with a bucket', () => {
  assert.equal(canMakePutt(emptyPuttDraft()), false);
  assert.equal(canMakePutt({ putts: 0, lengths: [] }), false);
  assert.equal(canMakePutt({ putts: 3, lengths: [] }), false);
  assert.equal(canMakePutt({ putts: 1, lengths: ['inside_3'] }), true);
  assert.equal(canMakePutt({ putts: 2, lengths: ['over_20', '3_to_10'] }), true);
  const planned = planMadeIt({ putts: 99, lengths: ['3_to_10'] });
  assert.equal(planned.ok, true);
  if (planned.ok) {
    assert.equal(planned.putts, 1);
    assert.deepEqual(planned.lengths, ['3_to_10']);
  }
});

test('next hole with no shots opens Pick a club (club-select = mark)', () => {
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), true);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);
});

test('near / on green is live yards-to-green within 40 yd — never a putt record', () => {
  assert.equal(NEAR_GREEN_YD, 40);
  assert.equal(isNearOrOnGreen({ yards: 28, quality: 'good' }), true);
  assert.equal(isNearOrOnGreen({ yards: 40, quality: 'soft' }), true);
  assert.equal(isNearOrOnGreen({ yards: 41, quality: 'good' }), false);
  assert.equal(isNearOrOnGreen({ yards: 12, quality: 'none' }), false);
  assert.equal(isNearOrOnGreen({ yards: null, quality: 'good' }), false);
});

test('walking off the green / to the next tee does not invent putts', () => {
  assert.equal(puttsFromWalkOff({ yards: 6, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff({ yards: 80, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff(), null);
});

test('Finish putts chip is score-only — never a fabricated distance', () => {
  const chip = finishPuttsChipLabel(7);
  assert.equal(chip, 'Finish putts · Hole 7');
  assert.doesNotMatch(chip, /yd|mi|km|GPS/i);
  assert.equal(puttsFromWalkOff({ yards: 4, quality: 'good' }), null);
});

test('Made it advances to the next hole, or summary after the last', () => {
  assert.deepEqual(holeAfterDone(1, 18), { kind: 'hole', holeNumber: 2 });
  assert.deepEqual(holeAfterDone(9, 9), { kind: 'summary' });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });
  assert.equal(madeItAdvancesHole({ sheetHoleNumber: 4, currentHoleNumber: 4 }), true);
  assert.equal(madeItAdvancesHole({ sheetHoleNumber: 3, currentHoleNumber: 5 }), false);
});

test('Finish putts chip stays for holes you left without Made it', () => {
  assert.equal(finishPuttsChipLabel(4), 'Finish putts · Hole 4');
  const pending = holesNeedingPutts(
    [
      { number: 1, puttsDone: false, shotCount: 3, puttCount: 0 },
      { number: 2, puttsDone: true, shotCount: 2, puttCount: 2 },
      { number: 3, puttsDone: false, shotCount: 0, puttCount: 0 },
      { number: 4, puttsDone: false, shotCount: 1, puttCount: 0 },
      { number: 5, puttsDone: false, shotCount: 0, puttCount: 2 },
    ],
    4,
  );
  assert.deepEqual(
    pending.map((row) => row.number),
    [1, 5],
  );
  assert.equal(
    holesNeedingPutts([{ number: 4, puttsDone: false, shotCount: 2, puttCount: 0 }], 4).length,
    0,
  );
});

test('selecting Putter opens the putt sheet — not a GPS mark; change-club does not', () => {
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID }), true);
  assert.equal(putterOpensPuttSheet({ clubId: 'club_7i' }), false);
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID, relabel: true }), false);
  assert.equal(putterOpensPuttSheet({ clubId: null }), false);
});
