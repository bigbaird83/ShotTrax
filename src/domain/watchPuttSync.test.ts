import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePuttPick, puttPickPayload } from './watchMessages';
import {
  enqueueWatchPuttPick,
  rememberWatchPuttPickAt,
  watchPuttActionsMustReachPhone,
  watchPuttPickDedupesByAt,
  watchPuttPickDropsWhenUnreachable,
  watchPuttPickKeepsMadeLengthId,
  watchPuttPickQueuesWhenUnreachable,
  watchPuttPickSinglePendingSlot,
  watchPuttPickUsesTransferUserInfo,
} from './watchPuttSync';

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
});
