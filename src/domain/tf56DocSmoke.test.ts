import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyWatchPuttPickAdds,
  applyWatchPuttPickToDraft,
  canMakeCurrentPutt,
  emptyPuttDraft,
  emptyPuttSheetPick,
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
  watchPuttControlIsClubWheel,
  watchPuttControlOpensPuttSheet,
} from './watchClubPick';
import {
  watchPuttAddsNeverDropAfterFirst,
  watchPuttPickSerializesOnPhone,
  watchPuttPickUsesUniqueAt,
} from './watchPuttSync';

const WATCH_MADE = /Text\("Made(?: it)?"\)/;

test('TF 56 A: Watch putt sheet Made is short, always on, full-width under Add/Undo', () => {
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetPinsMadeIt(), true);
  assert.equal(watchPuttSheetMadeItSitsWithAddUndo(), true);
  assert.equal(watchPuttSheetMadeItIsFullWidthRow(), true);
  assert.equal(watchPuttSheetMadeItRequiresLength(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  assert.equal(watchPuttSheetMadeItLabel(), 'Made');
  assert.equal(watchPuttSheetMadeItAcceptsMadeIt(), true);
  assert.ok(['Made', 'Made it'].includes(watchPuttSheetMadeItLabel()) || watchPuttSheetMadeItAcceptsMadeIt());

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, /LazyVGrid/);
  assert.match(watchSheet, WATCH_MADE);
  assert.match(watchSheet, /Text\("Made"\)/);
  assert.match(watchSheet, /Text\("Add putt"\)/);
  assert.match(watchSheet, /Text\("Undo"\)/);
  assert.ok(watchSheet.indexOf('LazyVGrid') < watchSheet.indexOf('Text("Made")'));
  assert.ok(watchSheet.indexOf('Text("Add putt")') < watchSheet.indexOf('Text("Made")'));
  assert.ok(watchSheet.indexOf('Text("Undo")') < watchSheet.indexOf('Text("Made")'));
  const addUndo = watchSheet.slice(watchSheet.indexOf('HStack(spacing: 4)'), watchSheet.indexOf('session.madeIt()'));
  assert.match(addUndo, /Text\("Add putt"\)/);
  assert.match(addUndo, /Text\("Undo"\)/);
  assert.doesNotMatch(addUndo, WATCH_MADE);
  const madeBtn = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled/);
  assert.match(madeBtn, /maxWidth: \.infinity/);

  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /incomingOpen \|\| putt\.open/);
  assert.doesNotMatch(applySheet, /list\.selectedClubId == "club_putter"/);
});

test('TF 56 B: two Watch puttPick adds land on phone draft putts===2', () => {
  assert.equal(watchPuttAddsNeverDropAfterFirst(), true);
  assert.equal(watchPuttPickSerializesOnPhone(), true);
  assert.equal(watchPuttPickUsesUniqueAt(), true);

  const first = applyWatchPuttPickToDraft(emptyPuttDraft(), { action: 'add', lengthId: 'inside_3' });
  assert.equal(first.putts, 1);
  const second = applyWatchPuttPickToDraft(first, { action: 'add', lengthId: '3_to_10' });
  assert.equal(second.putts, 2);
  assert.deepEqual(second.lengths, ['inside_3', '3_to_10']);

  const two = applyWatchPuttPickAdds(emptyPuttDraft(), ['over_20', 'inside_3']);
  assert.equal(two.putts, 2);
  assert.deepEqual(two.lengths, ['over_20', 'inside_3']);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /applyWatchPuttPickToDraft/);
  assert.match(watchFn, /puttDraftRef\.current = next/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /enqueuePuttPick/);
  assert.match(service, /puttPickTail/);
  assert.match(service, /handlePuttPickNow/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /uniquePuttAt/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /uniquePuttAt\(\)/);
});

test('TF 56 C: dedicated Watch Putt control — not the club wheel', () => {
  assert.equal(watchPlayHasDedicatedPuttControl(), true);
  assert.equal(watchPuttControlOpensPuttSheet(), true);
  assert.equal(watchPuttControlIsClubWheel(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(clubPick, /Text\("Putt"\)/);
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.match(clubPick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, WATCH_MADE);
  assert.ok(clubPick.indexOf('session.openPuttSheet()') < clubPick.indexOf('Text("Hole Out")'));
  assert.ok(clubPick.indexOf('Text("Putt")') > clubPick.indexOf('ScrollView(.horizontal'));

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const openFn = session.slice(session.indexOf('func openPuttSheet'), session.indexOf('func pickPuttLength'));
  assert.match(openFn, /sheet\.open = true/);
  assert.match(openFn, /"club_putter"/);
  assert.doesNotMatch(openFn, /selectedClubId/);
  assert.doesNotMatch(openFn, /attachWatchFix/);
});

test('TF 56 D: Watch companion is baked into production EAS — no EAS run', () => {
  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.match(app, /@bacons\/apple-targets/);
  assert.match(app, /ShotTraxxWatch/);
  assert.match(app, /com\.shottrax\.app\.watch/);
  assert.match(app, /appExtensions/);
  const target = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(target, /type: 'watch'/);
  assert.match(target, /ShotTraxxWatch/);
});
