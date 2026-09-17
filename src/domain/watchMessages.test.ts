import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIC_SHOT_ASSIST, WATCH_ASSIST } from '../sensing/assists';
import {
  CHECK_PHONE,
  PHONE_UNAVAILABLE,
  WATCH_MESSAGE_TYPES,
  clubListPayload,
  clubPickPayload,
  formatClubMarkedFeedback,
  isIso8601,
  parseClubList,
  parseClubPick,
} from './watchMessages';

test('clubList locked schema is type, top3, bag, labels', () => {
  const msg = clubListPayload({
    top3: ['club_7i', 'club_8i', 'club_6i'],
    bag: ['club_driver', 'club_7i'],
    labels: { club_7i: '7i', club_8i: '8i', club_6i: '6i', club_driver: 'Dr' },
  });
  assert.deepEqual(Object.keys(msg).sort(), ['bag', 'labels', 'top3', 'type']);
  assert.equal(msg.type, 'clubList');
  const parsed = parseClubList(JSON.parse(JSON.stringify(msg)));
  assert.deepEqual(parsed, msg);
});

test('clubList extras (hole / yards) are optional and do not add a new type', () => {
  const msg = clubListPayload({
    top3: [],
    bag: ['club_pw'],
    labels: { club_pw: 'PW' },
    holeNumber: 1,
    yardsToGreen: null,
    yardsQuality: 'none',
  });
  assert.equal(msg.type, 'clubList');
  assert.equal(parseClubList(msg)?.yardsToGreen, null);
  assert.equal(parseClubList({ ...msg, holeNumber: 0 }), null);
  assert.equal(parseClubList({ ...msg, type: 'nope' }), null);
  assert.equal(parseClubList({ type: 'status', top3: [], bag: [], labels: {} }), null);
});

test('clubPick locked schema is type, clubId, ISO8601 at — phone owns GPS', () => {
  const pick = clubPickPayload({
    clubId: 'club_7i',
    at: '2026-09-17T18:00:00.000Z',
  });
  assert.deepEqual(Object.keys(pick).sort(), ['at', 'clubId', 'type']);
  assert.equal(pick.type, 'clubPick');
  assert.equal(isIso8601(pick.at), true);
  const parsed = parseClubPick(JSON.parse(JSON.stringify(pick)));
  assert.deepEqual(parsed, pick);
  assert.equal(parseClubPick({ type: 'clubPick', clubId: '', at: '2026-09-17T18:00:00.000Z' }), null);
  assert.equal(parseClubPick({ type: 'clubPick', clubId: 'club_7i', at: 'x' }), null);
  assert.equal(parseClubPick({ type: 'mark', clubId: 'club_7i', at: '2026-09-17T18:00:00.000Z' }), null);
});

test('Watch Connectivity this cut is only clubList and clubPick', () => {
  assert.deepEqual([...WATCH_MESSAGE_TYPES], ['clubList', 'clubPick']);
});

test('Watch feedback copy', () => {
  assert.equal(formatClubMarkedFeedback('7i'), '7i marked ✓');
  assert.equal(PHONE_UNAVAILABLE, 'Phone unavailable');
  assert.equal(CHECK_PHONE, 'Check phone');
});

test('Watch companion is club-pick only — no motion or mic auto-mark', () => {
  assert.equal(WATCH_ASSIST, false);
  assert.equal(MIC_SHOT_ASSIST, false);
});
