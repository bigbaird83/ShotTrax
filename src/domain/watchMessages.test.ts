import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECK_PHONE,
  PHONE_UNAVAILABLE,
  clubListPayload,
  clubPickPayload,
  formatClubMarkedFeedback,
  parseClubList,
  parseClubPick,
} from './watchMessages';

test('clubList round-trips the locked schema', () => {
  const msg = clubListPayload({
    top3: ['club_7i', 'club_8i', 'club_6i'],
    bag: ['club_driver', 'club_7i'],
    labels: { club_7i: '7i', club_8i: '8i', club_6i: '6i', club_driver: 'Dr' },
    holeNumber: 4,
    yardsToGreen: 164,
    yardsQuality: 'good',
  });
  assert.equal(msg.type, 'clubList');
  const parsed = parseClubList(JSON.parse(JSON.stringify(msg)));
  assert.deepEqual(parsed, msg);
});

test('clubList allows null yards and none quality', () => {
  const msg = clubListPayload({
    top3: [],
    bag: ['club_pw'],
    labels: { club_pw: 'PW' },
    holeNumber: 1,
    yardsToGreen: null,
    yardsQuality: 'none',
  });
  assert.equal(parseClubList(msg)?.yardsToGreen, null);
  assert.equal(parseClubList({ ...msg, holeNumber: 0 }), null);
  assert.equal(parseClubList({ ...msg, type: 'nope' }), null);
});

test('clubPick parses required fields and optional Watch GPS', () => {
  const pick = clubPickPayload({
    clubId: 'club_7i',
    at: '2026-09-17T18:00:00.000Z',
    lat: 37.1,
    lng: -122.2,
    accuracyM: 4,
  });
  assert.equal(pick.type, 'clubPick');
  const parsed = parseClubPick(JSON.parse(JSON.stringify(pick)));
  assert.deepEqual(parsed, pick);
  assert.equal(parseClubPick({ type: 'clubPick', clubId: '', at: 'x' }), null);
});

test('Watch feedback copy', () => {
  assert.equal(formatClubMarkedFeedback('7i'), '7i marked ✓');
  assert.equal(PHONE_UNAVAILABLE, 'Phone unavailable');
  assert.equal(CHECK_PHONE, 'Check phone');
});
