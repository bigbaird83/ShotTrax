import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubListPayload, parseClubList, parsePuttPick, parsePuttSheet, puttPickPayload } from './watchMessages';
import {
  enqueueWatchPuttPick,
  planWatchMadeItAdvance,
  rememberWatchPuttPickAt,
  watchPuttActionsMustReachPhone,
  watchPuttPickDedupesByAt,
  watchPuttPickDropsWhenUnreachable,
  watchPuttPickKeepsMadeLengthId,
  watchPuttPickQueuesWhenUnreachable,
  watchPuttPickSinglePendingSlot,
  watchPuttPickUsesTransferUserInfo,
  watchPuttAddsNeverDropAfterFirst,
  watchPuttPickSerializesOnPhone,
  watchPuttPickUsesUniqueAt,
} from './watchPuttSync';
import { applyWatchPuttPickAdds, emptyPuttDraft } from './putts';

test('TF 53 D: puttPick queues every tap — not one pending slot, not reachable-only', () => {
  assert.equal(watchPuttPickUsesTransferUserInfo(), true);
  assert.equal(watchPuttPickQueuesWhenUnreachable(), true);
  assert.equal(watchPuttPickDropsWhenUnreachable(), false);
  assert.equal(watchPuttPickSinglePendingSlot(), false);
  assert.equal(watchPuttPickDedupesByAt(), true);
  assert.equal(watchPuttPickKeepsMadeLengthId(), true);
  assert.deepEqual([...watchPuttActionsMustReachPhone()], ['add', 'undo', 'made']);

  const add = puttPickPayload({
    action: 'add',
    lengthId: 'inside_3',
    at: '2026-09-20T14:00:00.000Z',
  });
  const add2 = puttPickPayload({
    action: 'add',
    lengthId: '3_to_10',
    at: '2026-09-20T14:00:01.000Z',
  });
  const made = puttPickPayload({
    action: 'made',
    lengthId: '10_to_20',
    at: '2026-09-20T14:00:02.000Z',
  });
  const queued = enqueueWatchPuttPick(enqueueWatchPuttPick(enqueueWatchPuttPick([], add), add2), made);
  assert.equal(queued.length, 3);
  assert.deepEqual(queued.map((row) => row.action), ['add', 'add', 'made']);
  assert.equal(enqueueWatchPuttPick(queued, add).length, 3);

  const first = rememberWatchPuttPickAt([], made.at);
  assert.equal(first.apply, true);
  const dup = rememberWatchPuttPickAt(first.seen, made.at);
  assert.equal(dup.apply, false);

  const madeLen = parsePuttPick({
    type: 'puttPick',
    action: 'made',
    at: '2026-09-20T14:00:03.000Z',
    lengthId: 'over_20',
  });
  assert.equal(madeLen?.lengthId, 'over_20');

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const phone = readFileSync(new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(session, /sendPuttPickReliable/);
  assert.match(session, /transferUserInfo\(payload\)/);
  assert.match(session, /pendingQueue/);
  assert.match(session, /pendingWatchQueue/);
  assert.match(session, /enqueuePending/);
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /isPuttPick/);
  assert.match(sendFn, /sendPuttPickReliable/);
  assert.doesNotMatch(
    sendFn.slice(sendFn.indexOf('private func sendPuttPickReliable'), sendFn.length),
    /failUnavailable/,
  );
  assert.match(phone, /didReceiveUserInfo/);
  assert.match(service, /watchPuttPickShouldApply/);
  assert.match(service, /queueWatchPuttPickEvent/);
  assert.match(service, /flushPendingPuttPicks/);
  assert.match(service, /forgetWatchPuttPickAt/);
  assert.match(service, /enqueuePuttPick/);
  assert.equal(watchPuttPickSerializesOnPhone(), true);
  assert.equal(watchPuttPickUsesUniqueAt(), true);
  assert.equal(watchPuttAddsNeverDropAfterFirst(), true);
  const two = applyWatchPuttPickAdds(emptyPuttDraft(), ['inside_3', '3_to_10']);
  assert.equal(two.putts, 2);
  assert.match(session, /uniquePuttAt/);
});

test('puttPick made on hole 7 → next clubList.holeNumber === 8 and puttSheet.open === false', () => {
  const made = parsePuttPick({ type: 'puttPick', action: 'made', at: '2026-09-24T12:00:00.000Z' });
  assert.equal(made?.action, 'made');
  const last = clubListPayload({
    top3: ['club_7i', 'club_8i', 'club_6i'],
    bag: ['club_driver', 'club_7i', 'club_8i', 'club_6i', 'club_putter'],
    labels: { club_7i: '7i', club_8i: '8i', club_6i: '6i', club_driver: 'Dr', club_putter: 'Putter' },
    holeNumber: 7,
    yardsToGreen: 12,
    yardsQuality: 'good',
    selectedClubId: 'club_putter',
    complication: { yards: 12, quality: 'good' },
    teeLengthYards: 385,
    green: { lat: 33.4, lng: -111.9 },
    clubCarry: { club_7i: 150 },
  });
  const plan = planWatchMadeItAdvance({ holeNumber: 7, holeCount: 18, lengths: ['3_to_10'], last });
  assert.equal(plan.clubList.holeNumber, 8);
  assert.equal(plan.puttSheet.open, false);
  assert.equal(plan.puttSheet.done, true);
  assert.equal(plan.clubList.roundComplete, undefined);
  assert.deepEqual(plan.clubList.bag, last.bag);
  // Hole 7's yards never ride onto hole 8, and the putter is not left selected.
  assert.equal(plan.clubList.yardsToGreen, null);
  assert.equal(plan.clubList.yardsQuality, 'none');
  assert.equal(plan.clubList.complicationYards, null);
  assert.equal(plan.clubList.selectedClubId, undefined);
  assert.equal(plan.clubList.teeLengthYards, undefined);
  assert.equal(plan.clubList.greenLat, undefined);
  assert.equal(plan.clubList.clubCarry, undefined);
  // Hole Out names the destination hole's shot count. Zero means that hole has none.
  assert.equal(plan.clubList.shotCount, 0);
  assert.equal(plan.clubList.lastShotId, '');
  assert.equal(plan.clubList.lastShotClubId, '');
  const named = planWatchMadeItAdvance({
    holeNumber: 7,
    holeCount: 18,
    lengths: ['3_to_10'],
    last,
    nextLastShotId: 'shot-on-8',
    nextLastShotClubId: 'club_8i',
  });
  assert.equal(named.clubList.holeNumber, 8);
  assert.equal(named.clubList.shotCount, 1);
  assert.equal(named.clubList.lastShotId, 'shot-on-8');
  assert.equal(named.clubList.lastShotClubId, 'club_8i');
  assert.ok(parseClubList(plan.clubList));
  assert.equal(parsePuttSheet(plan.puttSheet)?.open, false);
});

test('Made it on the last hole → Round complete, not the Hole 18 putt sheet', () => {
  const plan = planWatchMadeItAdvance({ holeNumber: 18, holeCount: 18, lengths: [], last: null });
  assert.equal(plan.clubList.holeNumber, 18);
  assert.equal(plan.clubList.roundComplete, true);
  assert.equal(parseClubList(plan.clubList)?.roundComplete, true);
  assert.equal(plan.puttSheet.open, false);
  const nine = planWatchMadeItAdvance({ holeNumber: 9, holeCount: 9, lengths: [], last: null });
  assert.equal(nine.clubList.roundComplete, true);
});

test('phone Made it pushes the Watch advance; Watch closes the sheet on done / new hole', () => {
  const hole = readFileSync('app/round/[id]/hole/[number].tsx', 'utf8');
  const apply = hole.slice(hole.indexOf('const applyMadeIt'), hole.indexOf('const onAttachFinishedPuttLength'));
  assert.match(apply, /pushWatchMadeItAdvance\(\{[\s\S]*holeNumber: targetHole,\s*holeCount: round\.holeCount/);
  const watchFn = hole.slice(hole.indexOf('const onWatchPuttPick'), hole.indexOf('useWatchClubList(', hole.indexOf('const onWatchPuttPick')));
  assert.match(watchFn, /finishHoleOut\(db, row\.id\);[\s\S]*pushWatchMadeItAdvance/);
  const swift = readFileSync('targets/watch/WatchClubSession.swift', 'utf8');
  assert.match(swift, /message\["done"\] as\? Bool == true/);
  assert.match(swift, /holeChanged && putt\.holeNumber != next\.holeNumber/);
  assert.match(swift, /message\["roundComplete"\]/);
  const ui = readFileSync('targets/watch/content.swift', 'utf8');
  assert.match(ui, /session\.list\.roundComplete/);
  assert.match(ui, /Round complete/);
});
