import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { emptyPuttDraft } from './putts';
import { parsePuttPick, puttPickPayload } from './watchMessages';
import {
  applyWatchPuttPick,
  applyWatchPuttPickAdds,
  enqueueWatchPuttPick,
  rememberWatchPuttPickAt,
  watchPuttActionsMustReachPhone,
  watchPuttPickAdvancesDraftOnEachAdd,
  watchPuttPickDedupesByAt,
  watchPuttPickDropsWhenUnreachable,
  watchPuttPickKeepsMadeLengthId,
  watchPuttPickQueuesWhenUnreachable,
  watchPuttPickSerializesAdds,
  watchPuttPickSinglePendingSlot,
  watchPuttPickUsesTransferUserInfo,
  watchTargetShipsInProductionEas,
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
  assert.match(service, /enqueuePuttPick/);
  assert.match(service, /puttPickChain/);
});

test('TF 56: Watch puttPick add twice advances phone draft putts === 2', () => {
  assert.equal(watchPuttPickSerializesAdds(), true);
  assert.equal(watchPuttPickAdvancesDraftOnEachAdd(), true);

  const once = applyWatchPuttPick(emptyPuttDraft(), { action: 'add', lengthId: 'inside_3' });
  assert.equal(once.putts, 1);
  const twice = applyWatchPuttPickAdds(['inside_3', '3_to_10']);
  assert.equal(twice.putts, 2);
  assert.deepEqual(twice.lengths, ['inside_3', '3_to_10']);
  const staleSecond = applyWatchPuttPick(emptyPuttDraft(), { action: 'add', lengthId: '3_to_10' });
  assert.equal(staleSecond.putts, 1);
  const advanced = applyWatchPuttPick(once, { action: 'add', lengthId: '3_to_10' });
  assert.equal(advanced.putts, 2);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /applyWatchPuttPick\(puttDraftRef\.current/);
  assert.match(watchFn, /writePuttDraft\(next\)/);
  assert.match(watchFn, /setPuttOpen\(true\)/);
  assert.match(watchFn, /puttOpenRef\.current = true/);
  assert.match(hole, /puttDraftRef\.current = next/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf('const puttDraftRef'), hole.indexOf('const puttSheetHoleRef')),
    /puttDraftRef\.current = puttDraft/,
  );

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /func puttPickAt/);
  assert.match(session, /lastPuttPickMs/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /puttPickAt\(\)/);
  assert.doesNotMatch(addFn, /isoNow\(\)/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /function enqueuePuttPick/);
  assert.match(service, /void enqueuePuttPick/);
});

test('TF 56: Watch companion is in production EAS — stale wrist binary is a cook', () => {
  assert.equal(watchTargetShipsInProductionEas(), true);
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: {
      plugins: unknown[];
      extra: { eas: { build: { experimental: { ios: { appExtensions: { targetName: string }[] } } } } };
    };
  };
  assert.ok(app.expo.plugins.includes('@bacons/apple-targets'));
  const extensions = app.expo.extra.eas.build.experimental.ios.appExtensions;
  assert.ok(extensions.some((row) => row.targetName === 'ShotTraxxWatch'));
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  assert.ok(pkg.dependencies['@bacons/apple-targets']);
  const watchCfg = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(watchCfg, /type: 'watch'/);
  assert.match(watchCfg, /name: 'ShotTraxxWatch'/);
});
