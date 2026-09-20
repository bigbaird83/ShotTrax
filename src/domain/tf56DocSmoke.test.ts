import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyWatchPuttPickAdds,
  applyWatchPuttPickToDraft,
  canMakeCurrentPutt,
  emptyPuttDraft,
  emptyPuttSheetPick,
  planMadeIt,
  watchPuttSheetMadeItAcceptsMadeIt,
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItIsFullWidthRow,
  watchPuttSheetMadeItLabel,
  watchPuttSheetMadeItRequiresLength,
  watchPuttSheetMadeItSitsWithAddUndo,
  watchPuttSheetPinsMadeIt,
} from './putts';
import {
  watchPlayHasDedicatedPuttControl,
  watchPuttControlAttachWatchFix,
  watchPuttControlInventGps,
  watchPuttControlInventYards,
  watchPuttControlIsClubWheel,
  watchPuttControlOpensPuttSheet,
  watchPuttControlSitsAboveClubStrip,
  watchPuttControlSitsBesideBackHome,
} from './watchClubPick';
import {
  watchPuttActionsMustReachPhone,
  watchPuttAddsNeverDropAfterFirst,
  watchPuttPickMadeUsesTransferUserInfo,
  watchPuttPickSerializesOnPhone,
  watchPuttPickUsesTransferUserInfo,
  watchPuttPickUsesUniqueAt,
} from './watchPuttSync';

const WATCH_MADE = /Text\("Made(?: it)?"\)/;

test('Signal: TF 56 Watch Made is always on the Add/Undo row — empty length OK, planMadeIt N-count intact', () => {
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetPinsMadeIt(), true);
  assert.equal(watchPuttSheetMadeItSitsWithAddUndo(), true);
  assert.equal(watchPuttSheetMadeItIsFullWidthRow(), true);
  assert.equal(watchPuttSheetMadeItRequiresLength(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  assert.equal(watchPuttSheetMadeItLabel(), 'Made');
  assert.equal(watchPuttSheetMadeItAcceptsMadeIt(), true);
  assert.ok(['Made', 'Made it'].includes(watchPuttSheetMadeItLabel()));

  const empty = planMadeIt(emptyPuttDraft());
  assert.equal(empty.ok, true);
  assert.equal(empty.putts, 1);
  assert.deepEqual(empty.lengths, []);
  const oneAdd = applyWatchPuttPickToDraft(emptyPuttDraft(), { action: 'add', lengthId: 'inside_3' });
  assert.equal(oneAdd.putts, 1);
  const madeOne = planMadeIt(oneAdd, null);
  assert.equal(madeOne.putts, 2);
  const twoAdds = applyWatchPuttPickAdds(emptyPuttDraft(), ['inside_3', '3_to_10']);
  assert.equal(twoAdds.putts, 2);
  const madeTwo = planMadeIt(twoAdds, null);
  assert.equal(madeTwo.putts, 3);
  assert.deepEqual(madeTwo.lengths, ['inside_3', '3_to_10']);
  const madePending = planMadeIt(twoAdds, 'over_20');
  assert.equal(madePending.putts, 3);
  assert.deepEqual(madePending.lengths, ['inside_3', '3_to_10', 'over_20']);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.doesNotMatch(watchSheet, /LazyVGrid\(/);
  assert.match(watchSheet, /"0–3"/);
  assert.match(watchSheet, /"3–10"/);
  assert.match(watchSheet, /"10–20"/);
  assert.match(watchSheet, /"20\+"/);
  assert.match(watchSheet, WATCH_MADE);
  assert.match(watchSheet, /Text\("Made"\)/);
  assert.match(watchSheet, /Text\("Add putt"\)/);
  assert.match(watchSheet, /Text\("Undo"\)/);
  const addUndo = watchSheet.slice(watchSheet.indexOf('Text("Add putt")'), watchSheet.indexOf('session.madeIt()'));
  assert.match(addUndo, /Text\("Add putt"\)/);
  assert.match(addUndo, /Text\("Undo"\)/);
  assert.doesNotMatch(addUndo, WATCH_MADE);
  assert.ok(watchSheet.indexOf('"0–3"') < watchSheet.indexOf('Text("Made")'));
  assert.ok(watchSheet.indexOf('Text("Add putt")') < watchSheet.indexOf('Text("Made")'));
  assert.ok(watchSheet.indexOf('Text("Undo")') < watchSheet.indexOf('Text("Made")'));
  const madeBtn = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled/);
  assert.match(watchSheet, /layoutPriority\(1\)/);
  assert.match(madeBtn, /maxWidth: \.infinity/);

  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /incomingOpen \|\| putt\.open/);
  assert.doesNotMatch(applySheet, /list\.selectedClubId == "club_putter"/);
});

test('Fairway: every Watch puttPick add/Made/N≥2 reaches phone via transferUserInfo + queue', () => {
  assert.equal(watchPuttPickUsesTransferUserInfo(), true);
  assert.equal(watchPuttPickMadeUsesTransferUserInfo(), true);
  assert.equal(watchPuttAddsNeverDropAfterFirst(), true);
  assert.equal(watchPuttPickSerializesOnPhone(), true);
  assert.equal(watchPuttPickUsesUniqueAt(), true);
  assert.deepEqual([...watchPuttActionsMustReachPhone()], ['add', 'undo', 'made']);

  const two = applyWatchPuttPickAdds(emptyPuttDraft(), ['over_20', 'inside_3']);
  assert.equal(two.putts, 2);
  assert.deepEqual(two.lengths, ['over_20', 'inside_3']);
  const first = applyWatchPuttPickToDraft(emptyPuttDraft(), { action: 'add', lengthId: 'inside_3' });
  const second = applyWatchPuttPickToDraft(first, { action: 'add', lengthId: '3_to_10' });
  assert.equal(second.putts, 2);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  assert.match(sendFn, /isPuttPick/);
  assert.match(sendFn, /sendPuttPickReliable/);
  assert.match(sendFn, /transferUserInfo\(payload\)/);
  assert.match(sendFn, /enqueuePending/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /uniquePuttAt\(\)/);
  assert.match(addFn, /"action": "add"/);
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.match(madeFn, /uniquePuttAt\(\)/);
  assert.match(madeFn, /"action": "made"/);
  assert.match(madeFn, /sendPick\(payload\)/);
  assert.doesNotMatch(madeFn, /attachWatchFix/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /applyWatchPuttPickToDraft/);
  assert.match(watchFn, /puttDraftRef\.current = next/);
  assert.match(watchFn, /applyMadeIt\(target, draft, pending\)/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /enqueuePuttPick/);
  assert.match(service, /puttPickTail/);
  assert.match(service, /handlePuttPickNow/);
  assert.match(service, /queueWatchPuttPickEvent/);
});

test('Fairway: dedicated Watch Putt opens the sheet only — no attachWatchFix, no invent yards/GPS', () => {
  assert.equal(watchPlayHasDedicatedPuttControl(), true);
  assert.equal(watchPuttControlSitsAboveClubStrip(), true);
  assert.equal(watchPuttControlSitsBesideBackHome(), true);
  assert.equal(watchPuttControlOpensPuttSheet(), true);
  assert.equal(watchPuttControlIsClubWheel(), false);
  assert.equal(watchPuttControlAttachWatchFix(), false);
  assert.equal(watchPuttControlInventGps(), false);
  assert.equal(watchPuttControlInventYards(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /Text\("Putt"\)/);
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.match(clubPick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, WATCH_MADE);
  assert.ok(clubPick.indexOf('session.openPuttSheet()') < clubPick.indexOf('Text("Hole Out")'));
  assert.ok(clubPick.indexOf('Text("Putt")') < clubPick.indexOf('ScrollView(.horizontal'));

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const openFn = session.slice(session.indexOf('func openPuttSheet'), session.indexOf('func pickPuttLength'));
  assert.match(openFn, /sheet\.open = true/);
  assert.match(openFn, /"club_putter"/);
  assert.doesNotMatch(openFn, /selectedClubId/);
  assert.doesNotMatch(openFn, /attachWatchFix/);
  assert.doesNotMatch(openFn, /lat|lng|accuracyM|yards/);
});

test('TF 56: Watch companion Made UI is baked into production EAS — no EAS run', () => {
  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.match(app, /@bacons\/apple-targets/);
  assert.match(app, /ShotTraxxWatch/);
  assert.match(app, /com\.shottrax\.app\.watch/);
  assert.match(app, /appExtensions/);
  const target = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(target, /type: 'watch'/);
  assert.match(target, /ShotTraxxWatch/);
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /Text\("Made"\)/);
  assert.match(watch, /session\.madeIt\(\)/);
});
