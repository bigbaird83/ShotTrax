import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubPickPayload } from './watchMessages';
import {
  QUEUED_WILL_SYNC,
  enqueueWatchClubPick,
  watchClubMarkAttachWatchFixOnPutter,
  watchClubMarkDropsWhenUnreachable,
  watchClubMarkFeedbackWhenQueued,
  watchClubMarkNeverFreezesOnPhoneUnavailable,
  watchClubMarkQueuesWhenUnreachable,
  watchClubMarkUsesTransferUserInfo,
  watchClubMarkUsesWatchGpsWhenUnreachable,
  watchClubPickShouldApply,
  watchPuttPickShowsQueuedWhenUnreachable,
  watchSelectedClubPillNeverHides,
  watchSelectedHighlightUsesLimeFillOrBorder,
  watchSelectedPuttBucketNeverHides,
} from './watchClubQueue';

test('TF 58: unreachable phone queues club mark with Watch fix — UI not frozen', () => {
  assert.equal(watchClubMarkUsesTransferUserInfo(), true);
  assert.equal(watchClubMarkQueuesWhenUnreachable(), true);
  assert.equal(watchClubMarkDropsWhenUnreachable(), false);
  assert.equal(watchClubMarkUsesWatchGpsWhenUnreachable(), true);
  assert.equal(watchClubMarkAttachWatchFixOnPutter(), false);
  assert.equal(watchClubMarkNeverFreezesOnPhoneUnavailable(), true);
  assert.equal(watchClubMarkFeedbackWhenQueued(), QUEUED_WILL_SYNC);
  assert.equal(watchPuttPickShowsQueuedWhenUnreachable(), true);
  assert.equal(QUEUED_WILL_SYNC, 'Queued · will sync');

  const first = clubPickPayload({ clubId: 'club_7i', at: '2026-09-20T21:00:00.000Z' });
  const second = clubPickPayload({ clubId: 'club_8i', at: '2026-09-20T21:00:01.000Z' });
  const queued = enqueueWatchClubPick(enqueueWatchClubPick([], first), second);
  assert.equal(queued.length, 2);
  assert.equal(enqueueWatchClubPick(queued, first).length, 2);
  assert.equal(watchClubPickShouldApply(first.at), true);
  assert.equal(watchClubPickShouldApply(first.at), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /isClubPick/);
  assert.match(sendFn, /sendClubMarkReliable/);
  assert.match(sendFn, /sendPuttPickReliable/);
  assert.match(sendFn, /sendReliableQueued/);
  assert.match(sendFn, /transferUserInfo\(payload\)/);
  assert.match(sendFn, /enqueuePending/);
  assert.match(sendFn, /noteQueued/);
  assert.match(sendFn, /Queued · will sync/);
  assert.doesNotMatch(sendFn.slice(sendFn.indexOf('private func sendClubMarkReliable')), /failUnavailable/);
  assert.doesNotMatch(sendFn.slice(sendFn.indexOf('private func sendPuttPickReliable')), /failUnavailable/);

  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  assert.match(madeFn, /sendPick\(payload\)/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.doesNotMatch(clubPick, /\.disabled\(session\.sending\)/);
  const puttOpen = watch.slice(watch.indexOf('} else if session.putt.open'), watch.indexOf('private var puttSheet'));
  assert.match(puttOpen, /session\.feedback/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /watchClubPickShouldApply/);
  assert.match(service, /queueWatchClubPickEvent/);
  assert.match(service, /flushPendingClubPicks/);
  assert.match(service, /forgetWatchClubPickAt/);
});

test('TF 58: selected Watch putt bucket and club pill stay visible with lime highlight', () => {
  assert.equal(watchSelectedPuttBucketNeverHides(), true);
  assert.equal(watchSelectedClubPillNeverHides(), true);
  assert.equal(watchSelectedHighlightUsesLimeFillOrBorder(), true);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const sheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  const lengthBtn = watch.slice(watch.indexOf('private func puttLengthButton'), watch.indexOf('private var clubPick'));
  assert.match(sheet, /"0–3"/);
  assert.match(sheet, /"3–10"/);
  assert.match(sheet, /"10–20"/);
  assert.match(sheet, /"20\+"/);
  assert.match(lengthBtn, /let selected = session\.putt\.pending == id/);
  assert.match(lengthBtn, /Text\(label\)/);
  assert.match(lengthBtn, /background\(selected \? outdoorLime/);
  assert.match(lengthBtn, /stroke\(selected \? outdoorLime/);
  assert.doesNotMatch(lengthBtn, /Color\("accent"\)/);
  assert.doesNotMatch(lengthBtn, /\.tint\(/);
  assert.doesNotMatch(sheet, /filter \{ \$0 != |pending != id/);

  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /let selected = club\.id == stripSelectedId/);
  assert.match(clubPick, /session\.list\.label\(for: club\.id\)/);
  assert.match(clubPick, /background\(selected \? outdoorLime/);
  assert.match(clubPick, /stroke\(selected \? outdoorLime/);
  assert.doesNotMatch(clubPick, /stripSelectedId \? Color\("accent"\)/);
  assert.doesNotMatch(clubPick, /filter \{ \$0 != selected|filter \{ \$0 == selected/);

  const phoneStrip = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phoneStrip, /pick && styles\.pillPick/);
  assert.match(phoneStrip, /item\.label/);
  assert.doesNotMatch(phoneStrip, /items\.filter\(\(item\) => item\.id !== pickId\)/);

  const phonePutt = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(phonePutt, /PUTT_LENGTHS\.map/);
  assert.match(phonePutt, /pending === bucket\.id && styles\.bucketOn/);
  assert.match(phonePutt, /\{bucket\.label\}/);
});
