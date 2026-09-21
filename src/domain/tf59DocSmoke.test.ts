import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  watchPuttSheetBackCallsAdd,
  watchPuttSheetBackCallsMade,
  watchPuttSheetBackInventGps,
  watchPuttSheetBackLabel,
  watchPuttSheetBackReturnsToHolePlay,
  watchPuttSheetHasBackOrCancel,
} from './putts';
import {
  watchPlayHasDedicatedPuttControl,
  watchPrimaryThreeVisibleWithoutScroll,
  watchPuttControlAttachWatchFix,
  watchPuttControlInventGps,
  watchPuttControlIsCompactPill,
  watchPuttControlIsFullWidthRow,
  watchPuttControlOpensPuttSheet,
  watchPuttControlPushesClubStripOffScreen,
  watchPuttControlSharesNavRow,
  watchTop3RequiresScroll,
} from './watchClubPick';
import {
  WATCH_PUTT_PILL_MIN_HEIGHT,
  watchPuttIsCompactPill,
  watchPuttSharesBackHomeRow,
  watchTallPuttPushesClubStripOffScreen,
} from './watchLayout';

test('TF 59: dedicated Putt is a compact pill on the Back/Home row — clubs stay on-screen', () => {
  assert.equal(watchPlayHasDedicatedPuttControl(), true);
  assert.equal(watchPuttControlOpensPuttSheet(), true);
  assert.equal(watchPuttControlSharesNavRow(), true);
  assert.equal(watchPuttControlIsCompactPill(), true);
  assert.equal(watchPuttControlIsFullWidthRow(), false);
  assert.equal(watchPuttControlPushesClubStripOffScreen(), false);
  assert.equal(watchPrimaryThreeVisibleWithoutScroll(), true);
  assert.equal(watchTop3RequiresScroll(), false);
  assert.equal(watchPuttSharesBackHomeRow(), true);
  assert.equal(watchPuttIsCompactPill(), true);
  assert.equal(watchTallPuttPushesClubStripOffScreen(), false);
  assert.equal(WATCH_PUTT_PILL_MIN_HEIGHT, 32);
  assert.equal(watchPuttControlAttachWatchFix(), false);
  assert.equal(watchPuttControlInventGps(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  const navRow = clubPick.slice(
    clubPick.indexOf('HStack(spacing: 8)'),
    clubPick.indexOf('GeometryReader { wheelGeo'),
  );
  assert.match(navRow, /Text\("Back"\)/);
  assert.match(navRow, /Text\("Home"\)/);
  assert.match(navRow, /Text\("Putt"\)/);
  assert.match(navRow, /session\.openPuttSheet\(\)/);
  assert.match(navRow, /session\.leave\("back"\)/);
  assert.match(navRow, /session\.leave\("home"\)/);
  assert.match(navRow, /Capsule\(\)/);
  assert.match(navRow, /minHeight: 32/);
  assert.doesNotMatch(navRow, /maxWidth: \.infinity, minHeight: 40/);
  assert.ok(navRow.indexOf('Text("Back")') < navRow.indexOf('Text("Putt")'));
  assert.ok(navRow.indexOf('Text("Home")') < navRow.indexOf('Text("Putt")'));

  const puttBtn = clubPick.slice(
    clubPick.indexOf('session.openPuttSheet()'),
    clubPick.indexOf('GeometryReader { wheelGeo'),
  );
  assert.match(puttBtn, /Capsule\(\)/);
  assert.match(puttBtn, /minHeight: 32/);
  assert.doesNotMatch(puttBtn, /maxWidth: \.infinity/);
  assert.doesNotMatch(puttBtn, /minHeight: 40/);
  assert.doesNotMatch(puttBtn, /minHeight: 44/);

  assert.ok(clubPick.indexOf('HStack(spacing: 8)') < clubPick.indexOf('Text("Putt")'));
  assert.ok(clubPick.indexOf('Text("Putt")') < clubPick.indexOf('ScrollView(.horizontal'));
  assert.ok(clubPick.indexOf('Text("Putt")') < clubPick.indexOf('GeometryReader { wheelGeo'));
  assert.ok(clubPick.indexOf('GeometryReader { wheelGeo') < clubPick.indexOf('Text("Hole Out")'));
  assert.match(clubPick, /layoutPriority\(1\)/);
  assert.doesNotMatch(clubPick, /Text\("Made(?: it)?"\)/);
});

test('TF 59: Watch putt-sheet Back/Cancel returns to hole play — no Made/Add, no invent GPS', () => {
  assert.equal(watchPuttSheetHasBackOrCancel(), true);
  assert.equal(watchPuttSheetBackLabel(), 'Back');
  assert.equal(watchPuttSheetBackReturnsToHolePlay(), true);
  assert.equal(watchPuttSheetBackCallsMade(), false);
  assert.equal(watchPuttSheetBackCallsAdd(), false);
  assert.equal(watchPuttSheetBackInventGps(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const puttOpen = watch.slice(
    watch.indexOf('} else if session.putt.open'),
    watch.indexOf('} else {\n        clubPick'),
  );
  assert.match(puttOpen, /session\.closePuttSheet\(\)/);
  assert.match(puttOpen, /Text\("Back"\)/);
  assert.doesNotMatch(puttOpen, /session\.madeIt\(\)/);
  assert.doesNotMatch(puttOpen, /session\.addPutt/);
  assert.doesNotMatch(puttOpen, /attachWatchFix|CLLocation|lat|lng/);
  assert.doesNotMatch(puttOpen, /ScrollView/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const closeFn = session.slice(session.indexOf('func closePuttSheet'), session.indexOf('func pickPuttLength'));
  assert.match(closeFn, /userClosedPutt = true/);
  assert.match(closeFn, /sheet\.open = false/);
  assert.doesNotMatch(closeFn, /madeIt|addPutt|attachWatchFix/);
  assert.doesNotMatch(closeFn, /sendPick|lat|lng|accuracyM|yards/);

  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /userClosedPutt/);
  assert.match(applySheet, /incomingOpen \|\| putt\.open/);
});
