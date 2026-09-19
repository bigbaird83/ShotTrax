import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { includeInDistanceAverages, includeInTop3Samples } from './shotSource';
import { COPY } from './playerCopy';
import {
  emptyPuttDraft,
  finishPuttsChipLabel,
  holeAfterDone,
  isNearOrOnGreen,
  planMadeIt,
  puttsFromWalkOff,
  shouldAutoOpenClubPick,
} from './putts';
import { rankTopClubs } from './rankClubs';
import {
  AUTO_PUTTS_FROM_GPS,
  AUTO_PUTTS_FROM_LEAVE_GREEN,
  MIC_SHOT_ASSIST,
  PUTT_ASSIST,
  WATCH_ASSIST,
} from '../sensing/assists';

test('Signal Lab: no auto-putts from GPS or leaving the green', () => {
  assert.equal(AUTO_PUTTS_FROM_GPS, false);
  assert.equal(AUTO_PUTTS_FROM_LEAVE_GREEN, false);
  assert.equal(PUTT_ASSIST, false);
  assert.equal(WATCH_ASSIST, false);
  assert.equal(MIC_SHOT_ASSIST, false);
  assert.equal(puttsFromWalkOff({ yards: 3, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff({ yards: 80, quality: 'good' }), null);
  assert.equal(isNearOrOnGreen({ yards: 5, quality: 'good' }), true);
  assert.equal(puttsFromWalkOff({ yards: 5, quality: 'good' }), null);
});

test('Signal Lab: Made it only stores user-chosen buckets and advances the hole', () => {
  assert.equal(planMadeIt(emptyPuttDraft()).ok, false);
  assert.equal(planMadeIt({ putts: 3, lengths: [] }).ok, false);
  const made = planMadeIt({ putts: 99, lengths: ['over_20', 'inside_3'] });
  assert.equal(made.ok, true);
  if (made.ok) {
    assert.equal(made.putts, 2);
    assert.deepEqual(made.lengths, ['over_20', 'inside_3']);
  }
  assert.deepEqual(holeAfterDone(4, 18), { kind: 'hole', holeNumber: 5 });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });
});

test('Signal Lab: Finish putts · Hole N is score-only — never a fabricated distance', () => {
  const chip = finishPuttsChipLabel(6);
  assert.equal(chip, 'Finish putts · Hole 6');
  assert.doesNotMatch(chip, /yd|mi|km|GPS/i);
  assert.equal(puttsFromWalkOff({ yards: 8, quality: 'soft' }), null);
});

test('Signal Lab: putter stays out of averages and top-3', () => {
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
  assert.equal(
    includeInTop3Samples({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
  const ranked = rankTopClubs(
    [
      {
        id: PUTTER_CLUB_ID,
        name: 'Putter',
        shortName: 'Pt',
        loftRank: 16,
        avgYards: 8,
        count: 20,
      },
      {
        id: 'club_7i',
        name: '7 Iron',
        shortName: '7i',
        loftRank: 9,
        avgYards: 150,
        count: 8,
      },
    ],
    { source: 'yards_to_green', dYards: 10 },
  );
  assert.ok(!ranked.some((club) => club.id === PUTTER_CLUB_ID));
});

test('Signal Lab: next hole stays on play — All clubs does not auto-open', () => {
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 1 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: true, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);
  assert.equal(COPY.pickClub, 'Pick a club');
  assert.equal(COPY.pickClubLede, 'Picking a club marks where you hit from.');
});
