import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyWatchPuttPickAdds,
  emptyPuttDraft,
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
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { acceptFix } from '../sensing/gates';
import { preferWatchFix, watchTapUsesAccuracyGates } from './preferWatchFix';
import {
  QUEUED_WILL_SYNC,
  WATCH_CLUB_MARK_DEBOUNCE_MS,
  enqueueWatchClubPick,
  gateWatchClubPick,
  gateWatchClubPickBurst,
  watchClubPickSerializesOnPhone,
  watchFinishShotPrevBlocksLeftoverClub,
  watchFinishShotOverlayAcceptsClubMark,
  watchFinishShotFlushAppliesClubPick,
  watchFinishShotOverlayBlocksClubPick,
  watchHoleAdvanceClearsArmedClub,
  watchHighlightLogsShot,
  watchHoleAdvanceFlushesMarksToNextHole,
  watchIdleWalkInventsShots,
  watchMarkRequiresExplicitTap,
  watchClubPickReplayCreatesShot,
  watchSelectAloneMarksShot,
  watchSelectAttachWatchFix,
  watchUnstampedClubPickApplies,
  watchAllPicksUseTransferUserInfo,
  watchClubMarkFeedbackWhenQueued,
  watchClubMarkHardOver25mStillForcePrompts,
  watchClubMarkNeverFreezesOnPhoneUnavailable,
  watchClubMarkQueuesWhenUnreachable,
  watchClubMarkSilentForceOnQueue,
  watchClubMarkUsesAcceptFixGates,
  watchClubMarkUsesTransferUserInfo,
  watchClubMarkUsesWatchGpsWhenUnreachable,
  watchQueuedPicksNeverDropN2,
  watchSheetPuttMadeZeroThreeInventGps,
  watchSheetPuttMadeZeroThreeInventYards,
} from './watchClubQueue';
import type { GpsFix } from './types';

const WATCH_MADE = /Text\("Made(?: it)?"\)/;

function fix(partial: Partial<GpsFix> & { lat: number; lng: number }): GpsFix {
  return {
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: 1_000_000,
    ...partial,
  };
}

test('Signal: TF 58 club mark uses Watch GPS + 15/25 m gates; hard >25 m still force-prompts', () => {
  assert.equal(watchClubMarkUsesWatchGpsWhenUnreachable(), true);
  assert.equal(watchClubMarkUsesAcceptFixGates(), true);
  assert.equal(watchClubMarkHardOver25mStillForcePrompts(), true);
  assert.equal(watchClubMarkSilentForceOnQueue(), false);
  assert.equal(watchTapUsesAccuracyGates(), true);
  assert.equal(SOFT_GPS_MIN_M, 15);
  assert.equal(SOFT_GPS_MAX_M, 25);

  const goodWatch = preferWatchFix({
    watchFix: fix({ lat: 34.11, lng: -85.64, accuracyM: SOFT_GPS_MIN_M - 0.1 }),
    phoneFix: fix({ lat: 34.2, lng: -85.7, accuracyM: 6 }),
    nowMs: 1_001_000,
  });
  assert.equal(goodWatch.usedWatch, true);
  const goodAccept = acceptFix(goodWatch.fix!);
  assert.equal(goodAccept.ok, true);
  if (goodAccept.ok) assert.equal(goodAccept.fixQuality, 'good');

  const softWatch = preferWatchFix({
    watchFix: fix({ lat: 34.11, lng: -85.64, accuracyM: SOFT_GPS_MAX_M }),
    phoneFix: fix({ lat: 34.2, lng: -85.7, accuracyM: 6 }),
    nowMs: 1_001_000,
  });
  assert.equal(softWatch.usedWatch, true);
  const softAccept = acceptFix(softWatch.fix!);
  assert.equal(softAccept.ok, true);
  if (softAccept.ok) assert.equal(softAccept.fixQuality, 'soft');

  const poorWatch = preferWatchFix({
    watchFix: fix({ lat: 34.11, lng: -85.64, accuracyM: SOFT_GPS_MAX_M + 1 }),
    phoneFix: null,
    nowMs: 1_001_000,
  });
  assert.equal(poorWatch.usedWatch, false);
  const hardAlone = acceptFix(fix({ lat: 34.11, lng: -85.64, accuracyM: SOFT_GPS_MAX_M + 1 }));
  assert.equal(hardAlone.ok, false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix\(&payload\)/);
  assert.match(pickFn, /clubId != "club_putter"/);
  const attachFn = session.slice(session.indexOf('private func attachWatchFix'), session.indexOf('func pickSameClub'));
  assert.match(attachFn, /age <= 3/);
  assert.match(attachFn, /acc > 0/);
  assert.doesNotMatch(attachFn, /forceMark|force = true|silent/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const handle = service.slice(service.indexOf('const pick = intent.pick'), service.indexOf('async function flushPendingClubPicks'));
  assert.match(handle, /watchFixFromPick/);
  assert.match(handle, /markShotWithClub/);
  assert.match(handle, /promptForPlan/);
  assert.match(handle, /force: true/);
  assert.doesNotMatch(handle, /forcePoorGps: true|silentForce|skipAcceptFix/);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  assert.match(actions, /preferWatchFix/);
  assert.match(actions, /promptForPlan/);
});

test('Signal: TF 58 all club + putt/Made picks queue transferUserInfo — never drop N≥2', () => {
  assert.equal(watchAllPicksUseTransferUserInfo(), true);
  assert.equal(watchQueuedPicksNeverDropN2(), true);
  assert.equal(watchClubMarkUsesTransferUserInfo(), true);
  const two = applyWatchPuttPickAdds(emptyPuttDraft(), ['inside_3', '3_to_10']);
  assert.equal(two.putts, 2);
  const a = { at: '2026-09-20T22:00:00.000Z', clubId: 'club_7i' };
  const b = { at: '2026-09-20T22:00:01.000Z', clubId: 'club_8i' };
  const queued = enqueueWatchClubPick(enqueueWatchClubPick([], a), b);
  assert.equal(queued.length, 2);
  assert.equal(enqueueWatchClubPick(queued, a).length, 2);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /isPuttPick/);
  assert.match(sendFn, /isClubPick/);
  assert.match(sendFn, /sendPuttPickReliable/);
  assert.match(sendFn, /sendClubMarkReliable/);
  assert.match(sendFn, /transferUserInfo\(payload\)/);
  assert.match(sendFn, /enqueuePending/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /uniquePuttAt\(\)/);
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.match(madeFn, /uniquePuttAt\(\)/);
  assert.match(session, /pendingQueue/);
});

test('Signal: TF 58 Queued · will sync — never freeze or hard-block on phone unavailable', () => {
  assert.equal(watchClubMarkNeverFreezesOnPhoneUnavailable(), true);
  assert.equal(watchClubMarkFeedbackWhenQueued(), 'Queued · will sync');
  assert.equal(QUEUED_WILL_SYNC, 'Queued · will sync');

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /"Queued · will sync"/);
  assert.doesNotMatch(sendFn.slice(sendFn.indexOf('private func sendClubMarkReliable')), /failUnavailable|Phone unavailable/);
  assert.doesNotMatch(sendFn.slice(sendFn.indexOf('private func sendPuttPickReliable')), /failUnavailable|Phone unavailable/);
  assert.match(sendFn, /sending = false/);
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.doesNotMatch(clubPick, /\.disabled\(session\.sending\)/);
});

test('Signal: TF 58 hole Putt + Made + 0–3 are sheet-only — no invent GPS/yards', () => {
  assert.equal(watchSheetPuttMadeZeroThreeInventGps(), false);
  assert.equal(watchSheetPuttMadeZeroThreeInventYards(), false);
  assert.equal(watchPuttControlAttachWatchFix(), false);
  assert.equal(watchPuttControlInventGps(), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const openFn = session.slice(session.indexOf('func openPuttSheet'), session.indexOf('func pickPuttLength'));
  assert.doesNotMatch(openFn, /attachWatchFix|lat|lng|accuracyM|yards/);
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.doesNotMatch(madeFn, /attachWatchFix|lat|lng|accuracyM|yards/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.doesNotMatch(addFn, /attachWatchFix|lat|lng|accuracyM|yards/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const sheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(sheet, /"0–3"/);
  assert.match(sheet, WATCH_MADE);
  assert.doesNotMatch(sheet, /attachWatchFix|CLLocation|lat|lng/);
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.ok(clubPick.indexOf('actionPill("Putt")') < clubPick.indexOf('ScrollView(.horizontal'));
});

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
  // Lime fill is clipped to Made's rounded pill — not a rectangle behind it.
  assert.match(
    madeBtn,
    /\.background\(outdoorLime\)\s*(?:\/\/[^\n]*\s*)?\.clipShape\(RoundedRectangle\(cornerRadius: 12\)\)\s*\.contentShape\(RoundedRectangle\(cornerRadius: 12\)\)/,
  );
  assert.match(sheet, /layoutPriority\(1\)/);

  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /actionPill\("Putt"\)/);
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.match(clubPick, /actionPill\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, WATCH_MADE);
  assert.doesNotMatch(clubPick, /session\.leave\("back"\)/);
  // Penalty | Home | Putt sit on the row above Hole Out; the club strip is under Hole Out.
  assert.ok(clubPick.indexOf('actionPill("Putt")') < clubPick.indexOf('session.madeIt()'));
  assert.ok(clubPick.indexOf('actionPill("Putt")') < clubPick.indexOf('ScrollView(.horizontal'));
  assert.ok(clubPick.indexOf('actionPill("Hole Out")') < clubPick.indexOf('ScrollView(.horizontal'));

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
  assert.match(lengthBtn, /background\(selected \? outdoorLime : tileFill\)/);
  assert.doesNotMatch(lengthBtn, /Color\("accent"\)/);
  const wheel = watch.slice(watch.indexOf('ForEach(wheelClubs'), watch.indexOf('private var moreClubs'));
  assert.match(wheel, /session\.list\.label\(for: club\.id\)/);
  assert.match(wheel, /background\(selected \? outdoorLime : tileFill\)/);
  assert.doesNotMatch(wheel, /Color\("accent"\)/);

  const phoneStrip = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phoneStrip, /pick && styles\.pillPick/);
  assert.match(phoneStrip, /\{item\.label\}/);
  const phonePutt = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(phonePutt, /PUTT_LENGTHS\.map/);
  assert.match(phonePutt, /pending === bucket\.id && styles\.bucketOn/);
});

test('Signal: Cypress ghost 56° — highlight never marks; debounce; no hole-advance replay', () => {
  assert.equal(watchMarkRequiresExplicitTap(), true);
  assert.equal(watchSelectAloneMarksShot(), false);
  assert.equal(watchSelectAttachWatchFix(), false);
  assert.equal(watchHighlightLogsShot(), false);
  assert.equal(watchClubPickReplayCreatesShot(), false);
  assert.equal(watchUnstampedClubPickApplies(), false);
  assert.equal(watchHoleAdvanceFlushesMarksToNextHole(), false);
  assert.equal(watchIdleWalkInventsShots(), false);
  assert.equal(watchFinishShotPrevBlocksLeftoverClub(), true);
  assert.equal(watchFinishShotOverlayAcceptsClubMark(), false);
  assert.equal(watchFinishShotFlushAppliesClubPick(), false);
  assert.equal(watchFinishShotOverlayBlocksClubPick({ currentHole: 11, openShotHoles: [10] }), true);
  assert.equal(watchClubPickSerializesOnPhone(), true);
  assert.equal(watchHoleAdvanceClearsArmedClub(), true);
  assert.equal(WATCH_CLUB_MARK_DEBOUNCE_MS, 300);

  const h10 = {
    at: '2026-09-20T16:42:00.000Z',
    clubId: 'club_50',
    holeNumber: 10,
    currentHole: 10,
    nowMs: 2_000_000,
  };
  assert.equal(gateWatchClubPick(h10).apply, true);
  assert.equal(gateWatchClubPick({ ...h10, alreadyApplied: true }).reason, 'replay');
  assert.equal(gateWatchClubPick({ ...h10, currentHole: 11 }).reason, 'wrong_hole');
  assert.equal(gateWatchClubPick({ ...h10, holeNumber: null }).reason, 'wrong_hole');
  assert.equal(
    gateWatchClubPick({
      ...h10,
      last: { clubId: 'club_50', appliedAtMs: 2_000_000 - 120 },
    }).reason,
    'debounce',
  );
  const clip = gateWatchClubPickBurst(
    [
      { at: '2026-09-20T21:01:48.100Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:48.400Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:48.700Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:49.000Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:49.300Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:49.600Z', clubId: 'club_50', holeNumber: 11 },
      { at: '2026-09-20T21:01:49.900Z', clubId: 'club_50', holeNumber: 11 },
    ],
    {
      currentHole: 11,
      openShotHoles: [10],
      startMs: 2_000_000,
    },
  );
  assert.equal(clip.length, 7);
  assert.ok(clip.every((row) => row.reason === 'open_prev' && row.apply === false));
  assert.equal(
    gateWatchClubPick({
      at: '2026-09-20T21:01:50.000Z',
      clubId: 'club_driver',
      holeNumber: 11,
      currentHole: 11,
      openShotHoles: [10],
    }).reason,
    'open_prev',
  );
  assert.equal(
    gateWatchClubPick({
      at: '2026-09-20T21:01:48.000Z',
      clubId: 'club_50',
      holeNumber: 10,
      currentHole: 11,
      openShotHoles: [10],
    }).reason,
    'wrong_hole',
  );

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const selectFn = session.slice(session.indexOf('func select('), session.indexOf('func openPuttSheet'));
  assert.doesNotMatch(selectFn, /attachWatchFix|clubPick|lat|lng/);
  assert.match(selectFn, /"type": "clubSelect"/);
  const applyFn = session.slice(session.indexOf('private func applyClubList'), session.indexOf('private func applyPuttSheet'));
  assert.doesNotMatch(applyFn, /attachWatchFix|sendPick|func pick\(/);
  assert.match(applyFn, /next\.selectedClubId = nil/);
  assert.match(applyFn, /next\.lastClubId = nil/);
  assert.match(applyFn, /lastClubTapId = nil/);
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func select('));
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
  const flushFn = session.slice(session.indexOf('private func flushPending()'), session.indexOf('private func syncRoundStay'));
  assert.match(flushFn, /transfer: false/);
  assert.match(flushFn, /dropStaleClubPicks/);
  assert.doesNotMatch(flushFn, /holeNumber\s*=/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const strip = watch.slice(watch.indexOf('ScrollView(.horizontal'), watch.indexOf('Text("All clubs")'));
  assert.doesNotMatch(strip, /session\.select\(/);
  assert.doesNotMatch(strip, /onTapGesture/);
  assert.match(strip, /session\.pick\(clubId: club.id\)/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /gateWatchClubPick/);
  assert.match(service, /drainWatchClubPickQueueForHole/);
  assert.match(service, /enqueueClubPick/);
  assert.match(service, /openShotHoles: ctx\.openShotHoles/);
  assert.match(service, /watchFinishShotOverlayBlocksClubPick/);
  assert.doesNotMatch(service, /forgetWatchClubPickAt/);
  const selectBlock = service.slice(service.indexOf("if (intent.kind === 'select')"), service.indexOf("if (intent.kind === 'leave')"));
  assert.doesNotMatch(selectBlock, /markShotWithClub|attachWatchFix/);
});
