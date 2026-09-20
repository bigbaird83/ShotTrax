import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItIsFullWidthRow,
  watchPuttSheetMadeItLabel,
  watchPuttSheetSelectedBucketNeverHides,
  watchPuttSheetSelectedIsHighlightNotRemoval,
} from './putts';
import {
  watchPlayHasDedicatedPuttControl,
  watchPuttControlAttachWatchFix,
  watchPuttControlInventGps,
  watchPuttControlOpensPuttSheet,
  watchSelectedClubHighlightNeverHidesPill,
  watchSelectedClubNeverVanishes,
} from './watchClubPick';
import {
  QUEUED_WILL_SYNC,
  watchClubMarkFeedbackWhenQueued,
  watchClubMarkNeverFreezesOnPhoneUnavailable,
  watchClubMarkQueuesWhenUnreachable,
  watchClubMarkUsesTransferUserInfo,
  watchClubMarkUsesWatchGpsWhenUnreachable,
} from './watchClubQueue';

const WATCH_MADE = /Text\("Made(?: it)?"\)/;

test('TF 58 P0: phone-in-cart club mark queues Watch GPS — never freeze on PHONE_UNAVAILABLE', () => {
  assert.equal(watchClubMarkUsesTransferUserInfo(), true);
  assert.equal(watchClubMarkQueuesWhenUnreachable(), true);
  assert.equal(watchClubMarkUsesWatchGpsWhenUnreachable(), true);
  assert.equal(watchClubMarkNeverFreezesOnPhoneUnavailable(), true);
  assert.equal(watchClubMarkFeedbackWhenQueued(), 'Queued · will sync');
  assert.equal(QUEUED_WILL_SYNC, 'Queued · will sync');

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix\(&payload\)/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.doesNotMatch(pickFn.slice(0, pickFn.indexOf('if clubId != "club_putter"')), /attachWatchFix/);
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /isClubPick/);
  assert.match(sendFn, /sendClubMarkReliable/);
  assert.match(sendFn, /transferUserInfo\(payload\)/);
  assert.match(sendFn, /"Queued · will sync"/);
  assert.doesNotMatch(
    sendFn.slice(sendFn.indexOf('private func sendClubMarkReliable')),
    /failUnavailable|Phone unavailable/,
  );
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.match(madeFn, /sendPick\(payload\)/);
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /sendPick\(/);
  assert.doesNotMatch(addFn, /attachWatchFix/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.doesNotMatch(clubPick, /\.disabled\(session\.sending\)/);
});

test('TF 58 P0: Made pill + 0–3 + hole Putt above the club strip', () => {
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetMadeItIsFullWidthRow(), true);
  assert.equal(watchPuttSheetMadeItLabel(), 'Made');
  assert.equal(watchPlayHasDedicatedPuttControl(), true);
  assert.equal(watchPuttControlOpensPuttSheet(), true);
  assert.equal(watchPuttControlAttachWatchFix(), false);
  assert.equal(watchPuttControlInventGps(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const sheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.doesNotMatch(sheet, /LazyVGrid\(/);
  assert.match(sheet, /"0–3"/);
  assert.match(sheet, /"3–10"/);
  assert.match(sheet, /"10–20"/);
  assert.match(sheet, /"20\+"/);
  assert.match(sheet, WATCH_MADE);
  assert.match(sheet, /Text\("Add putt"\)/);
  assert.match(sheet, /Text\("Undo"\)/);
  assert.ok(sheet.indexOf('"0–3"') < sheet.indexOf('Text("Made")'));
  assert.ok(sheet.indexOf('Text("Add putt")') < sheet.indexOf('Text("Made")'));
  const madeBtn = sheet.slice(sheet.indexOf('session.madeIt()'), sheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled/);
  assert.doesNotMatch(madeBtn, /borderedProminent/);
  assert.match(madeBtn, /maxWidth: \.infinity/);
  assert.match(madeBtn, /minHeight: 48/);
  assert.match(madeBtn, /outdoorLime/);
  assert.match(madeBtn, /stroke\(Color\("cream"\)/);
  assert.match(sheet, /layoutPriority\(1\)/);

  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /Text\("Putt"\)/);
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.match(clubPick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, WATCH_MADE);
  assert.ok(clubPick.indexOf('session.leave("back")') < clubPick.indexOf('Text("Putt")'));
  assert.ok(clubPick.indexOf('Text("Putt")') < clubPick.indexOf('ScrollView(.horizontal'));
  assert.ok(clubPick.indexOf('ScrollView(.horizontal') < clubPick.indexOf('Text("Hole Out")'));

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const openFn = session.slice(session.indexOf('func openPuttSheet'), session.indexOf('func pickPuttLength'));
  assert.match(openFn, /sheet\.open = true/);
  assert.doesNotMatch(openFn, /attachWatchFix/);
  assert.doesNotMatch(openFn, /lat|lng|accuracyM|yards/);
});

test('TF 58 P0: selected 0–3 and selected club stay on-screen with lime highlight', () => {
  assert.equal(watchPuttSheetSelectedBucketNeverHides(), true);
  assert.equal(watchPuttSheetSelectedIsHighlightNotRemoval(), true);
  assert.equal(watchSelectedClubNeverVanishes(), true);
  assert.equal(watchSelectedClubHighlightNeverHidesPill(), true);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /200\.0 \/ 255\.0/);
  assert.match(watch, /outdoorLime/);
  const lengthBtn = watch.slice(watch.indexOf('private func puttLengthButton'), watch.indexOf('private var clubPick'));
  assert.match(lengthBtn, /Text\(label\)/);
  assert.match(lengthBtn, /pending == id/);
  assert.match(lengthBtn, /background\(selected \? outdoorLime : Color\.clear\)/);
  assert.doesNotMatch(lengthBtn, /Color\("accent"\)/);
  const wheel = watch.slice(watch.indexOf('ForEach(wheelClubs'), watch.indexOf('private var moreClubs'));
  assert.match(wheel, /session\.list\.label\(for: club\.id\)/);
  assert.match(wheel, /background\(selected \? outdoorLime : Color\("bg"\)\)/);
  assert.doesNotMatch(wheel, /Color\("accent"\)/);

  const phoneStrip = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phoneStrip, /pick && styles\.pillPick/);
  assert.match(phoneStrip, /\{item\.label\}/);
  const phonePutt = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(phonePutt, /PUTT_LENGTHS\.map/);
  assert.match(phonePutt, /pending === bucket\.id && styles\.bucketOn/);
});
