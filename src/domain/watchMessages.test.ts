import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIC_SHOT_ASSIST, PUTT_ASSIST, WATCH_ASSIST } from '../sensing/assists';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { yardsToGreen } from '../sensing/yardsToGreen';
import type { GpsFix } from './types';
import {
  CLUB_LIST_KEYS,
  PHONE_UNAVAILABLE,
  WATCH_MESSAGE_TYPES,
  clubListPayload,
  clubListPushKey,
  clubNavPayload,
  clubPickPayload,
  formatClubMarkedFeedback,
  isIso8601,
  MADE_IT_FEEDBACK,
  parseClubList,
  parseClubNav,
  parseClubPick,
  parsePuttPick,
  parsePuttSheet,
  parseWatchInboundIntent,
  watchPayloadRunsAcceptFix,
  puttPickPayload,
  puttSheetPayload,
  PUTTS_ON_WATCH,
  toWatchYardsQuality,
} from './watchMessages';

function fixAt(lat: number, lng: number, accuracyM: number | null): GpsFix {
  return {
    lat,
    lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp: 0,
  };
}

const origin = { lat: 37, lng: -122 };
const green = { lat: 37 + 150 / 111_320, lng: -122 };

const listBase = {
  top3: ['club_7i', 'club_8i', 'club_6i'],
  bag: ['club_driver', 'club_7i'],
  labels: { club_7i: '7i', club_8i: '8i', club_6i: '6i', club_driver: 'Dr' },
};

test('clubList locked schema is type, top3, bag, labels, holeNumber, yardsToGreen, yardsQuality', () => {
  const msg = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: 164,
    yardsQuality: 'good',
  });
  assert.deepEqual(Object.keys(msg).sort(), [...CLUB_LIST_KEYS].sort());
  assert.equal(msg.type, 'clubList');
  assert.equal(msg.holeNumber, 4);
  assert.equal(msg.yardsToGreen, 164);
  assert.equal(msg.yardsQuality, 'good');
  const parsed = parseClubList(JSON.parse(JSON.stringify(msg)));
  assert.deepEqual(parsed, msg);
  assert.equal(parseClubList({ type: 'clubList', top3: [], bag: [], labels: {} }), null);
});

test('clubList yardsToGreen is yardsToGreen().yards with the same good/soft/none bands as phone', () => {
  const good = yardsToGreen(fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M - 0.1), green);
  const soft = yardsToGreen(fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M), green);
  const poor = yardsToGreen(fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M + 0.1), green);
  assert.equal(good.quality, 'good');
  assert.equal(soft.quality, 'soft');
  assert.equal(poor.quality, 'none');
  assert.equal(poor.yards, null);

  const goodMsg = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: good.yards,
    yardsQuality: toWatchYardsQuality(good.quality),
  });
  assert.equal(goodMsg.yardsToGreen, good.yards);
  assert.equal(goodMsg.yardsQuality, 'good');

  const softMsg = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: soft.yards,
    yardsQuality: toWatchYardsQuality(soft.quality),
  });
  assert.equal(softMsg.yardsQuality, 'soft');
  assert.equal(softMsg.yardsToGreen, soft.yards);

  const noneMsg = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: poor.yards,
    yardsQuality: toWatchYardsQuality(poor.quality),
  });
  assert.equal(noneMsg.yardsToGreen, null);
  assert.equal(noneMsg.yardsQuality, 'none');
  assert.equal(toWatchYardsQuality('forced'), 'none');
  assert.equal(toWatchYardsQuality('none'), 'none');
});

test('clubList allows null yards and none quality; rejects invalid hole, type, or forced quality', () => {
  const msg = clubListPayload({
    top3: [],
    bag: ['club_pw'],
    labels: { club_pw: 'PW' },
    holeNumber: 1,
    yardsToGreen: null,
    yardsQuality: 'none',
  });
  assert.equal(msg.type, 'clubList');
  assert.equal(
    clubListPayload({ ...msg, yardsToGreen: 90, yardsQuality: 'none' }).yardsToGreen,
    null,
  );
  assert.equal(parseClubList(msg)?.yardsToGreen, null);
  assert.equal(parseClubList({ ...msg, yardsToGreen: 90, yardsQuality: 'none' })?.yardsToGreen, null);
  assert.equal(parseClubList({ ...msg, holeNumber: 0 }), null);
  assert.equal(parseClubList({ ...msg, type: 'nope' }), null);
  assert.equal(parseClubList({ ...msg, yardsQuality: 'forced' }), null);
  assert.equal(parseClubList({ type: 'status', top3: [], bag: [], labels: {} }), null);
});

test('clubList push key changes on hole, fix quality, and bag rank', () => {
  const base = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: 164,
    yardsQuality: 'good',
  });
  const hole = clubListPayload({ ...listBase, holeNumber: 5, yardsToGreen: 164, yardsQuality: 'good' });
  const quality = clubListPayload({ ...listBase, holeNumber: 4, yardsToGreen: 164, yardsQuality: 'soft' });
  const none = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: null,
    yardsQuality: 'none',
  });
  const rank = clubListPayload({
    ...listBase,
    top3: ['club_8i', 'club_7i', 'club_6i'],
    holeNumber: 4,
    yardsToGreen: 164,
    yardsQuality: 'good',
  });
  const sameYardsLastClub = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: 164,
    yardsQuality: 'good',
    lastClubId: 'club_7i',
  });
  assert.notEqual(clubListPushKey(base), clubListPushKey(hole));
  assert.notEqual(clubListPushKey(base), clubListPushKey(quality));
  assert.notEqual(clubListPushKey(base), clubListPushKey(none));
  assert.notEqual(clubListPushKey(base), clubListPushKey(rank));
  assert.notEqual(clubListPushKey(base), clubListPushKey(sameYardsLastClub));
});

test('clubPick required keys are type, clubId, ISO8601 at; Watch GPS is optional stretch', () => {
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

test('clubPick may carry Watch GPS; phone prefers it only when fresh and at least as accurate', () => {
  const parsed = parseClubPick({
    type: 'clubPick',
    clubId: 'club_7i',
    at: '2026-09-17T18:00:00.000Z',
    lat: 37.1,
    lng: -122.2,
    accuracyM: 4,
  });
  assert.equal(parsed?.lat, 37.1);
  assert.equal(parsed?.lng, -122.2);
  assert.equal(parsed?.accuracyM, 4);
});

test('Watch Connectivity this cut is clubList, clubPick, puttSheet, puttPick, clubNav, and nearby start', () => {
  assert.deepEqual(
    [...WATCH_MESSAGE_TYPES],
    [
      'clubList',
      'clubPick',
      'puttSheet',
      'puttPick',
      'clubNav',
      'nearbyCourses',
      'nearbyTees',
      'nearbyRequest',
      'nearbyCoursePick',
      'startRound',
    ],
  );
});

test('Watch Back and Home never parse as a club pick', () => {
  const back = clubNavPayload({ action: 'back', at: '2026-09-17T22:00:00.000Z' });
  const home = clubNavPayload({ action: 'home', at: '2026-09-17T22:00:00.000Z' });
  assert.equal(back.type, 'clubNav');
  assert.equal(home.action, 'home');
  assert.deepEqual(parseClubNav(JSON.parse(JSON.stringify(back))), back);
  assert.equal(parseClubPick(back), null);
  assert.equal(parseClubPick(home), null);
  assert.equal(watchPayloadRunsAcceptFix(back), false);
  assert.equal(watchPayloadRunsAcceptFix(home), false);
  assert.equal(
    watchPayloadRunsAcceptFix(clubPickPayload({ clubId: 'club_7i', at: '2026-09-17T22:00:00.000Z' })),
    true,
  );
  assert.equal('lat' in back, false);
  assert.equal('lng' in home, false);
  assert.equal(parseClubNav({ type: 'clubNav', action: 'mark', at: '2026-09-17T22:00:00.000Z' }), null);
});

test('Signal Lab: only a club tap, Watch tap, or Same club runs acceptFix', () => {
  const at = '2026-09-17T22:00:00.000Z';
  const back = parseWatchInboundIntent(clubNavPayload({ action: 'back', at }));
  const home = parseWatchInboundIntent(clubNavPayload({ action: 'home', at }));
  const club = parseWatchInboundIntent(clubPickPayload({ clubId: 'club_7i', at }));
  const sameClub = parseWatchInboundIntent(clubPickPayload({ clubId: 'club_8i', at }));
  const putter = parseWatchInboundIntent(clubPickPayload({ clubId: 'club_putter', at }));
  assert.equal(back?.kind, 'leave');
  assert.equal(back?.runsAcceptFix, false);
  if (back?.kind === 'leave') {
    assert.equal(back.savesGps, false);
    assert.equal(back.closesPendingShot, false);
  }
  assert.equal(home?.kind, 'leave');
  assert.equal(home?.runsAcceptFix, false);
  assert.equal(club?.kind, 'club');
  assert.equal(club?.runsAcceptFix, true);
  assert.equal(sameClub?.kind, 'club');
  assert.equal(sameClub?.runsAcceptFix, true);
  assert.equal(putter?.kind, 'putter');
  assert.equal(putter?.runsAcceptFix, false);
  assert.equal(watchPayloadRunsAcceptFix(clubNavPayload({ action: 'back', at })), false);
  assert.equal(watchPayloadRunsAcceptFix(clubNavPayload({ action: 'home', at })), false);
  assert.equal(watchPayloadRunsAcceptFix(clubPickPayload({ clubId: 'club_putter', at })), false);
  assert.equal(watchPayloadRunsAcceptFix(clubPickPayload({ clubId: 'club_7i', at })), true);
});

test('Watch feedback is marked ✓ or Phone unavailable — never silent fail', () => {
  assert.equal(formatClubMarkedFeedback('7i'), '7i marked ✓');
  assert.equal(PHONE_UNAVAILABLE, 'Phone unavailable');
});

test('Watch companion is club-pick only — no motion, mic, or auto-putt', () => {
  assert.equal(WATCH_ASSIST, false);
  assert.equal(MIC_SHOT_ASSIST, false);
  assert.equal(PUTT_ASSIST, false);
});

test('puttSheet is buckets plus Made it — never GPS and never invented putts', () => {
  const msg = puttSheetPayload({ open: true, holeNumber: 4, lengths: ['over_20'] });
  assert.equal(msg.type, 'puttSheet');
  assert.equal(msg.open, true);
  assert.equal(msg.canMake, true);
  assert.equal(msg.canAdd, true);
  assert.equal(msg.labels.inside_3, 'Under 3 ft');
  assert.equal(msg.labels.over_20, '20+');
  const parsed = parsePuttSheet(JSON.parse(JSON.stringify(msg)));
  assert.deepEqual(parsed, msg);
  assert.equal(parsePuttSheet({ type: 'puttSheet', open: true, holeNumber: 0, lengths: [] }), null);
  assert.equal(puttSheetPayload({ open: false, holeNumber: 4, lengths: [] }).canMake, false);
});

test('puttPick add needs a bucket; Made it finishes; undo drops the last', () => {
  const add = puttPickPayload({
    action: 'add',
    lengthId: 'inside_3',
    at: '2026-09-17T22:00:00.000Z',
  });
  assert.equal(add.type, 'puttPick');
  assert.deepEqual(parsePuttPick(JSON.parse(JSON.stringify(add))), add);
  assert.equal(parsePuttPick({ type: 'puttPick', action: 'add', at: '2026-09-17T22:00:00.000Z' }), null);
  const made = parsePuttPick({
    type: 'puttPick',
    action: 'made',
    at: '2026-09-17T22:00:00.000Z',
  });
  assert.equal(made?.action, 'made');
  assert.equal(MADE_IT_FEEDBACK, 'Made it ✓');
  assert.equal(PUTTS_ON_WATCH, 'Putts');
});
