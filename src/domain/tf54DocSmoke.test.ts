import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  canMakeCurrentPutt,
  emptyPuttSheetPick,
  holeOutFlagsLastRealShot,
  holeOutInventPutts,
  planPlayDockFinish,
  playDockHoleOutIsChipInOnly,
  playDockPuttAlwaysWhenUnfinished,
  playDockPuttUsesShowPuttPillsGate,
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItSitsWithAddUndo,
  watchPuttSheetPinsMadeIt,
} from './putts';
import {
  shouldWatchStayFrontmost,
  watchStayBackgroundMode,
  watchStayIdleDoesNotCountAsLeave,
  watchStayWhenIdleWithoutTaps,
} from './watchStay';

test('TF 54 A/E: Watch Made it is reserved on the putt sheet — always enabled, never clipped off', () => {
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetPinsMadeIt(), true);
  assert.equal(watchPuttSheetMadeItSitsWithAddUndo(), true);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const puttOpen = watch.slice(
    watch.indexOf('} else if session.putt.open'),
    watch.indexOf('} else {\n        clubPick'),
  );
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.doesNotMatch(puttOpen, /ScrollView/);
  assert.doesNotMatch(puttOpen, /statusHeader/);
  assert.match(watchSheet, /LazyVGrid/);
  assert.match(watchSheet, /HStack\(spacing: 4\)/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /layoutPriority\(1\)/);
  assert.ok(watchSheet.indexOf('LazyVGrid') < watchSheet.indexOf('Text("Made it")'));
  assert.ok(watchSheet.indexOf('Text("Made it")') < watchSheet.indexOf('if !session.putt.lengths'));
  const actions = watchSheet.slice(watchSheet.indexOf('HStack(spacing: 4)'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.ok(actions.indexOf('Text("Add putt")') >= 0);
  assert.ok(actions.indexOf('Text("Undo")') >= 0);
  assert.ok(actions.indexOf('Text("Made it")') >= 0);
  assert.ok(actions.indexOf('Text("Add putt")') < actions.indexOf('Text("Made it")'));
  assert.ok(actions.indexOf('Text("Undo")') < actions.indexOf('Text("Made it")'));
  const madeBtn = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled/);
  assert.doesNotMatch(watchSheet, /Text\("Hole Out"\)/);
  assert.match(clubPick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, /Text\("Made it"\)/);

  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /incomingOpen \|\| \(putt\.open && list\.selectedClubId == "club_putter"\)/);
  assert.match(applySheet, /next\.canMake = true/);

  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /pushWatchPuttSheet\(\{ open: true/);
  assert.doesNotMatch(watchFn, /open: puttOpenRef\.current/);
});

test('TF 54 F: stay holds while live / idle — crown and Back/Home still end it', () => {
  assert.equal(watchStayWhenIdleWithoutTaps(), true);
  assert.equal(watchStayIdleDoesNotCountAsLeave(), true);
  assert.equal(watchStayBackgroundMode(), 'self-care');
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: false }), true);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: true, userLeftApp: true }), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  assert.match(plist, /<key>WKBackgroundModes<\/key>/);
  assert.match(plist, /<string>self-care<\/string>/);
  assert.match(session, /func leave\(/);
  assert.match(session, /userLeftApp = true/);
  assert.match(session, /stopRoundStay/);
  assert.match(session, /phase == "inactive"/);
  assert.match(session, /applyClubList/);
  assert.match(session, /syncRoundStay\(\)/);
});

test('TF 54 C: dock Putt is always visible — left of shrunk Hole Out', () => {
  assert.equal(playDockPuttAlwaysWhenUnfinished(), true);
  assert.equal(playDockPuttUsesShowPuttPillsGate(), false);
  const tee = planPlayDockFinish({ putting: false, toGreen: { yards: 371, quality: 'none' } });
  assert.equal(tee.showPutts, true);
  assert.equal(tee.showHoleOut, true);
  const putter = planPlayDockFinish({ putting: true, toGreen: { yards: 371, quality: 'none' } });
  assert.equal(putter.showPutts, true);
  assert.equal(putter.showHoleOut, true);
  const near = planPlayDockFinish({ putting: false, toGreen: { yards: 36, quality: 'soft' } });
  assert.equal(near.showPutts, true);
  assert.equal(near.showHoleOut, true);
  const hard = planPlayDockFinish({ putting: false, toGreen: { yards: 12, quality: 'hard' } });
  assert.equal(hard.showPutts, true);
  assert.equal(hard.showHoleOut, true);
  const placing = planPlayDockFinish({ placing: true });
  assert.equal(placing.showPutts, false);
  assert.equal(placing.showHoleOut, false);
  const done = planPlayDockFinish({ puttsDone: true });
  assert.equal(done.showPutts, false);
  assert.equal(done.showHoleOut, false);
  assert.equal(playDockHoleOutIsChipInOnly(), true);
  assert.equal(holeOutFlagsLastRealShot(), true);
  assert.equal(holeOutInventPutts(), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  const puttAt = dock.indexOf('<PuttDock');
  const holeOutAt = dock.indexOf('testID="play-dock-hole-out"');
  assert.ok(puttAt >= 0 && holeOutAt > puttAt);
  assert.match(dock, /styles\.dockHoleOutShrunk/);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.doesNotMatch(dock, /onMadeIt/);
});
