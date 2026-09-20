import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { includeInDistanceAverages, includeInTop3Samples } from './shotSource';
import { COPY } from './playerCopy';
import {
  attachPuttLengthInventGps,
  attachPuttLengthInventYards,
  attachPuttLengthIsStatsOnly,
  attachPuttLengthReopensHole,
  attachPuttLengthWritesScore,
  canMakeCurrentPutt,
  canMakePutt,
  commitPuttLength,
  emptyPuttDraft,
  emptyPuttSheetPick,
  finishPuttsChipLabel,
  holeAfterDone,
  holeOutClosesOnLastMark,
  holeOutFlagsLastRealShot,
  holeOutInsertsShot,
  holeOutInventPutts,
  holeOutKeepsTappedClub,
  holeOutSetsGirFromOffGreen,
  isNearOrOnGreen,
  NEAR_GREEN_YD,
  onGreenPuttsAreScoreOnly,
  pickPuttLength,
  planAttachPuttLength,
  planFinishHoleOut,
  planFinishedPuttAttachRows,
  madeItEnabledWithEmptyLength,
  madeItRequiresLengthPick,
  planMadeIt,
  planMadeItFromPick,
  planPersistMadeIt,
  planPuttLengthSlots,
  playDockHoleOutCallsMadeIt,
  playDockHoleOutIsChipInOnly,
  playDockKeepsHoleOutForOffGreen,
  watchClubPickHoleOutIsChipInOnly,
  watchPuttSheetAddPuttIsMissOnly,
  watchPuttSheetAddPuttLabel,
  watchPuttSheetLengthLabel,
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItLabel,
  watchPuttSheetMadeItRequiresLength,
  watchPuttSheetUndoLabel,
  watchPuttSheetUsesTwoColumnGrid,
  WATCH_PUTT_LENGTHS,
  PUTT_LENGTHS,
  playDockPuttOpensExistingSheet,
  playDockPuttUsesShowPuttPillsGate,
  puttLoggedWithoutLength,
  puttSheetCtaLabel,
  puttSheetDistanceTapCommits,
  puttSheetHasAddPuttControl,
  puttSheetNoLengthCue,
  puttSheetNoLengthCueBlocksMadeIt,
  puttSheetNoLengthCueInventGps,
  puttSheetNoLengthCueIsModal,
  puttSheetShowsHoleOut,
  planPlayDockFinish,
  puttPillsInventGreenEdge,
  puttPillsProximityQualities,
  puttPillsProximityUsesHardOrForced,
  puttPillsUseHydratedGreenCentroid,
  puttPillsUseYardsToGreen,
  puttsFromWalkOff,
  shouldAutoOpenClubPick,
  showPuttNoLengthCue,
  showPuttPills,
} from './putts';
import {
  watchHoleOutClosesOnLastMark,
  watchHoleOutFlagsLastRealShot,
  watchHoleOutInventPutts,
} from './watchClubPick';
import { rankTopClubs } from './rankClubs';
import {
  AUTO_PUTTS_FROM_GPS,
  AUTO_PUTTS_FROM_LEAVE_GREEN,
  MIC_SHOT_ASSIST,
  PUTT_ASSIST,
  WATCH_ASSIST,
} from '../sensing/assists';

test('Signal Lab: dock Putt is putter or ≤40 yd haversine to green centroid, good/soft only', () => {
  assert.equal(NEAR_GREEN_YD, 40);
  assert.equal(puttPillsUseYardsToGreen(), true);
  assert.equal(puttPillsUseHydratedGreenCentroid(), true);
  assert.equal(puttPillsInventGreenEdge(), false);
  assert.deepEqual([...puttPillsProximityQualities()], ['good', 'soft']);
  assert.equal(puttPillsProximityUsesHardOrForced(), false);
  assert.equal(showPuttPills({ putting: true }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 40, quality: 'good' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 40, quality: 'soft' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 41, quality: 'good' } }), false);
  assert.equal(showPuttPills({ toGreen: { yards: 12, quality: 'forced' } }), false);
  assert.equal(showPuttPills({ toGreen: { yards: 12, quality: 'hard' } }), false);
  assert.equal(showPuttPills({ putting: true, toGreen: { yards: 12, quality: 'forced' } }), true);
  const far = planPlayDockFinish({ toGreen: { yards: 160, quality: 'good' } });
  assert.equal(far.showHoleOut, true);
  assert.equal(far.showPutts, false);
  const near = planPlayDockFinish({ toGreen: { yards: 36, quality: 'soft' } });
  assert.equal(near.showHoleOut, true);
  assert.equal(near.showPutts, true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /const liveToGreen = yardsToGreen\(fix, green\)/);
  const dock = hole.slice(hole.indexOf('const dockFinish'), hole.indexOf('const showFirstLaunchTip'));
  assert.match(dock, /toGreen: liveToGreen/);
  assert.doesNotMatch(dock, /playHeaderYards|polygon|greenEdge/);
  assert.equal(playDockPuttUsesShowPuttPillsGate(), true);
  assert.equal(playDockPuttOpensExistingSheet(), true);
  const watchPush = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(watchPush, /yardsToGreen: liveToGreen\.yards/);
  assert.match(watchPush, /yardsQuality: liveToGreen\.quality/);

  const sensing = readFileSync(new URL('../sensing/yardsToGreen.ts', import.meta.url), 'utf8');
  assert.match(sensing, /haversineYards\(fix, greenCentroid\)/);
  assert.match(sensing, /classifyAccuracyM/);
});

test('Signal Lab: no auto-putts from GPS or leaving the green', () => {
  assert.equal(AUTO_PUTTS_FROM_GPS, false);
  assert.equal(AUTO_PUTTS_FROM_LEAVE_GREEN, false);
  assert.equal(PUTT_ASSIST, false);
  assert.equal(WATCH_ASSIST, false);
  assert.equal(MIC_SHOT_ASSIST, false);
  assert.equal(puttsFromWalkOff({ yards: 3, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff({ yards: 80, quality: 'good' }), null);
  assert.equal(isNearOrOnGreen({ yards: 5, quality: 'good' }), true);
  assert.equal(isNearOrOnGreen({ yards: 8, quality: 'forced' }), false);
  assert.equal(puttsFromWalkOff({ yards: 5, quality: 'good' }), null);
});

test('Signal Lab: Hole Out closes on the last real mark — no invented putt GPS', () => {
  assert.equal(holeOutClosesOnLastMark(), true);
  assert.equal(holeOutFlagsLastRealShot(), true);
  assert.equal(holeOutInsertsShot(), false);
  assert.equal(holeOutInventPutts(), false);
  assert.equal(holeOutKeepsTappedClub(), true);
  assert.equal(holeOutSetsGirFromOffGreen(), false);
  assert.equal(onGreenPuttsAreScoreOnly(), true);
  assert.equal(watchHoleOutClosesOnLastMark(), true);
  assert.equal(watchHoleOutFlagsLastRealShot(), true);
  assert.equal(watchHoleOutInventPutts(), false);
  const offGreen = planFinishHoleOut();
  assert.equal(offGreen.putts, 0);
  assert.deepEqual(offGreen.lengths, []);
  assert.equal(offGreen.gir, false);
  const emptyMade = planMadeIt(emptyPuttDraft());
  assert.equal(emptyMade.ok, true);
  assert.deepEqual(emptyMade.lengths, []);
  assert.doesNotMatch(JSON.stringify(emptyMade), /yd|lat|lng|GPS/i);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const finishOut = repo.slice(repo.indexOf('export function finishHoleOut'), repo.indexOf('export function sealOpenShotWithoutGps'));
  assert.match(finishOut, /planFinishHoleOut/);
  assert.match(finishOut, /updateHolePutts/);
  assert.match(finishOut, /persistCloseHoleScore/);
  assert.match(finishOut, /planFlagLastRealShot/);
  assert.match(finishOut, /hole_out/);
  assert.doesNotMatch(finishOut, /INSERT INTO shots|insertShot|lat|lng|accuracy|acceptFix|addPlacedShot|club_putter/);
  const finishPutts = repo.slice(repo.indexOf('export function finishHolePutts'), repo.indexOf('export function finishHoleOut'));
  assert.match(finishPutts, /planMadeIt/);
  assert.match(finishPutts, /planPersistMadeIt/);
  assert.match(finishPutts, /persistCloseHoleScore/);
  assert.doesNotMatch(finishPutts, /lat|lng|acceptFix|insertShot/);

  const close = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const closeFn = close.slice(
    close.indexOf('Close the approach before the putt sheet'),
    close.indexOf('export function addNoGpsShot'),
  );
  assert.match(closeFn, /Never inserts a putter GPS shot/);
  assert.match(closeFn, /sealOpenShotWithoutGps/);
  assert.doesNotMatch(closeFn, /club_putter|insertPutter/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const finish = hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const onAddPenalty'));
  assert.match(finish, /closeApproachBeforePutts/);
  assert.match(finish, /finishHoleOut/);
  assert.doesNotMatch(finish, /addPlacedShot|insertNoGpsShot|club_putter/);
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /puttOpenRef\.current \|\| pending \|\| draft\.lengths\.length > 0/);
  assert.match(watchFn, /applyMadeIt\(target, draft, pending\)/);
  assert.match(watchFn, /finishHoleOut/);
  assert.doesNotMatch(watchFn, /addPlacedShot|insertNoGpsShot/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
});

test('Signal Lab: TF 49 putt sheet is pick → Made it on putt N≥1; Add putt is a miss; Hole Out stays on the dock', () => {
  assert.equal(puttSheetDistanceTapCommits(), false);
  assert.equal(puttSheetHasAddPuttControl(), true);
  assert.equal(puttSheetCtaLabel(), 'Made it');
  assert.equal(COPY.madeIt, 'Made it');
  assert.equal(COPY.addPutt, 'Add a putt');
  assert.equal(puttSheetShowsHoleOut(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);
  assert.equal(COPY.holeOut, 'Hole Out');
  assert.equal(onGreenPuttsAreScoreOnly(), true);

  const picked = pickPuttLength(emptyPuttSheetPick(), '3_to_10');
  assert.equal(picked.pending, '3_to_10');
  assert.deepEqual(picked.draft.lengths, []);
  assert.equal(madeItEnabledWithEmptyLength(), true);
  assert.equal(madeItRequiresLengthPick(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  const emptyClose = planMadeIt(picked.draft);
  assert.equal(emptyClose.ok, true);
  assert.deepEqual(emptyClose.lengths, []);
  assert.equal(canMakeCurrentPutt(picked), true);
  assert.equal(planMadeIt(picked.draft, picked.pending).ok, true);
  const madeOne = planMadeIt(picked.draft, picked.pending);
  if (madeOne.ok) {
    assert.equal(madeOne.putts, 1);
    assert.deepEqual(madeOne.lengths, ['3_to_10']);
  }

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /pickPuttLength\(\{ draft, pending \}, bucket\.id\)/);
  assert.doesNotMatch(sheet, /onPress=\{\(\) => onAdd\(bucket\.id\)\}/);
  assert.match(sheet, /label=\{COPY\.addPutt\}/);
  assert.match(sheet, /commitPuttLength\(\{ draft, pending \}\)/);
  assert.match(sheet, /onAdd\(added\)/);
  assert.match(sheet, /const canMake = !disabled/);
  assert.match(sheet, /showPuttNoLengthCue\(pick\)/);
  assert.match(sheet, /COPY\.noLengthCue/);
  assert.match(sheet, /testID="putt-no-length-cue"/);
  assert.match(sheet, /onMadeIt\(pending\)/);
  assert.match(sheet, /label=\{COPY\.madeIt\}/);
  assert.match(sheet, /label=\{COPY\.undoPutt\}/);
  assert.doesNotMatch(sheet, /COPY\.holeOut/);
  assert.doesNotMatch(sheet, /finishHoleOut/);
  assert.doesNotMatch(sheet, /Alert\.alert|Modal/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const body = hole.slice(hole.indexOf('<PuttSheetBody'), hole.indexOf('</PuttSheetBody>'));
  assert.match(body, /onAdd=\{onAddPutt\}/);
  assert.match(body, /onMadeIt=\{onMadeIt\}/);
  assert.doesNotMatch(body, /COPY\.holeOut|finishHoleOut/);
  const apply = hole.slice(hole.indexOf('const applyMadeIt'), hole.indexOf('useEffect(() => {\n    if (puttsParam'));
  assert.match(apply, /planMadeIt\(draft, pending\)/);
  assert.match(apply, /madeItAdvancesHole/);
  assert.match(apply, /holeAfterDone/);
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /puttOpenRef\.current \|\| pending \|\| draft\.lengths\.length > 0/);
  assert.match(watchFn, /applyMadeIt\(target, draft, pending\)/);
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.match(dock, /testID="play-dock-hole-out"/);
  assert.match(dock, /COPY\.holeOut/);
  assert.match(dock, /onPress=\{onFinishHole\}/);
  assert.doesNotMatch(dock, /onMadeIt/);
  assert.match(dock, /<PuttDock/);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.match(dock, /styles\.dockHoleOutShrunk/);
  const puttAt = dock.indexOf('<PuttDock');
  const holeOutAt = dock.indexOf('testID="play-dock-hole-out"');
  assert.ok(puttAt >= 0 && holeOutAt > puttAt);
  assert.doesNotMatch(dock, /onAdd=\{onAddPutt\}/);
  assert.doesNotMatch(dock, /PUTT_LENGTHS/);
  assert.equal(playDockHoleOutIsChipInOnly(), true);
  assert.equal(playDockHoleOutCallsMadeIt(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);
  const finish = hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const onAddPenalty'));
  assert.match(finish, /finishHoleOut/);
  assert.doesNotMatch(finish, /addPlacedShot|insertNoGpsShot|club_putter/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const puttOpen = watch.slice(
    watch.indexOf('} else if session.putt.open'),
    watch.indexOf('} else {\n        clubPick'),
  );
  assert.doesNotMatch(puttOpen, /ScrollView/);
  assert.match(puttOpen, /puttSheet/);
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, /LazyVGrid/);
  assert.match(watchSheet, /GridItem\(\.flexible/);
  assert.match(watchSheet, /session\.pickPuttLength\(bucket\.id\)/);
  assert.doesNotMatch(watchSheet, /session\.addPutt\(lengthId: bucket\.id\)/);
  assert.match(watchSheet, /Text\("0–3"\)|watchPuttBuckets/);
  assert.match(watchSheet, /Text\("Add putt"\)/);
  assert.match(watchSheet, /session\.addPutt\(\)/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /\.disabled\(session\.sending\)/);
  assert.doesNotMatch(watchSheet, /!session\.putt\.canMake/);
  assert.match(watchSheet, /Text\("Undo"\)/);
  assert.match(watchSheet, /Text\("No length — pick a distance"\)/);
  assert.doesNotMatch(watchSheet, /Text\("Hole Out"\)/);
  assert.doesNotMatch(watchSheet, /alert|Alert|sheet\(/);
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetMadeItRequiresLength(), false);
  assert.equal(watchPuttSheetAddPuttIsMissOnly(), true);
  assert.equal(watchClubPickHoleOutIsChipInOnly(), true);
  assert.equal(watchPuttSheetUsesTwoColumnGrid(), true);
  assert.equal(watchPuttSheetAddPuttLabel(), 'Add putt');
  assert.equal(watchPuttSheetUndoLabel(), 'Undo');
  assert.equal(watchPuttSheetMadeItLabel(), 'Made it');
  assert.deepEqual(
    WATCH_PUTT_LENGTHS.map((row) => row.label),
    ['0–3', '3–10', '10–20', '20+'],
  );
  assert.deepEqual(
    WATCH_PUTT_LENGTHS.map((row) => row.id),
    PUTT_LENGTHS.map((row) => row.id),
  );
  assert.equal(watchPuttSheetLengthLabel('inside_3'), '0–3');
  assert.equal(COPY.addPutt, 'Add a putt');
  const watchDock = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(watchDock, /Text\("Hole Out"\)/);
  assert.match(watchDock, /session\.madeIt\(\)/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /var canMake: Bool = true/);
  const pickLen = session.slice(session.indexOf('func pickPuttLength'), session.indexOf('func addPutt'));
  assert.match(pickLen, /next\.pending = lengthId/);
  assert.match(pickLen, /next\.canMake = true/);
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.match(madeFn, /payload\["lengthId"\] = pending/);
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /next\.canMake = true/);
  const addFn = session.slice(session.indexOf('func addPutt'), session.indexOf('func undoPutt'));
  assert.match(addFn, /next\.canMake = true/);
});

test('Signal Lab: Made it enabled after distance pick with zero putts logged; Add putt still commits a miss; Made it closes hole', () => {
  const picked = pickPuttLength(emptyPuttSheetPick(), 'inside_3');
  assert.equal(picked.draft.lengths.length, 0);
  assert.equal(picked.pending, 'inside_3');
  assert.equal(canMakePutt(picked.draft, picked.pending), true);
  assert.equal(canMakeCurrentPutt(picked), true);
  assert.equal(puttSheetDistanceTapCommits(), false);
  const miss = commitPuttLength(picked);
  assert.deepEqual(miss.draft, { putts: 1, lengths: ['inside_3'] });
  assert.equal(miss.pending, null);
  assert.equal(canMakeCurrentPutt(miss), true);
  assert.equal(showPuttNoLengthCue(miss), true);
  const holing = planMadeIt(emptyPuttDraft(), 'inside_3');
  assert.equal(holing.ok, true);
  if (holing.ok) {
    assert.equal(holing.putts, 1);
    assert.deepEqual(holing.lengths, ['inside_3']);
  }
  assert.equal(holeAfterDone(4, 18).kind, 'hole');
  assert.deepEqual(holeAfterDone(4, 18), { kind: 'hole', holeNumber: 5 });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const apply = hole.slice(hole.indexOf('const applyMadeIt'), hole.indexOf('const dest = holeAfterDone(targetHole'));
  assert.match(apply, /planMadeIt\(draft, pending\)/);
  assert.match(apply, /madeItAdvancesHole/);
  assert.match(hole, /holeAfterDone\(targetHole, round\.holeCount\)/);
});

test('Signal Lab: Made it with pending on putt N≥1 — no extra Add putt after the distance pick', () => {
  const putt1 = pickPuttLength(emptyPuttSheetPick(), 'over_20');
  assert.equal(canMakeCurrentPutt(putt1), true);
  const miss = commitPuttLength(putt1);
  assert.equal(miss.draft.lengths.length, 1);
  assert.equal(miss.pending, null);
  assert.equal(canMakeCurrentPutt(miss), true);
  assert.equal(showPuttNoLengthCue(miss), true);
  assert.equal(puttSheetDistanceTapCommits(), false);

  const putt2 = pickPuttLength(miss, '3_to_10');
  assert.equal(putt2.pending, '3_to_10');
  assert.deepEqual(putt2.draft.lengths, ['over_20']);
  assert.equal(canMakeCurrentPutt(putt2), true);
  const made2 = planMadeItFromPick(putt2);
  assert.equal(made2.ok, true);
  if (made2.ok) {
    assert.equal(made2.putts, 2);
    assert.deepEqual(made2.lengths, ['over_20', '3_to_10']);
  }

  const miss2 = commitPuttLength(putt2);
  const putt3 = pickPuttLength(miss2, 'inside_3');
  assert.equal(canMakeCurrentPutt(putt3), true);
  const made3 = planMadeItFromPick(putt3);
  assert.equal(made3.ok, true);
  if (made3.ok) {
    assert.equal(made3.putts, 3);
    assert.deepEqual(made3.lengths, ['over_20', '3_to_10', 'inside_3']);
  }

  const emptyPutt2 = planMadeIt(miss.draft, null);
  assert.equal(emptyPutt2.putts, 2);
  assert.deepEqual(emptyPutt2.lengths, ['over_20']);
  assert.deepEqual(planPuttLengthSlots(emptyPutt2.putts, emptyPutt2.lengths), ['over_20', null]);
  const persistEmpty2 = planPersistMadeIt(emptyPutt2);
  assert.equal(persistEmpty2.putts, 2);
  assert.deepEqual(persistEmpty2.lengths, ['over_20']);

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /const canMake = !disabled/);
  assert.match(sheet, /onMadeIt\(pending\)/);
  assert.match(sheet, /commitPuttLength\(\{ draft, pending \}\)/);
  assert.doesNotMatch(sheet, /onPress=\{\(\) => onAdd\(bucket\.id\)\}/);
});

test('Signal Lab: Made it enabled with empty length; soft cue present; pending still commits length', () => {
  assert.equal(madeItEnabledWithEmptyLength(), true);
  assert.equal(madeItRequiresLengthPick(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  assert.equal(canMakePutt(emptyPuttDraft()), true);
  assert.equal(showPuttNoLengthCue(emptyPuttSheetPick()), true);
  const emptyClose = planMadeIt(emptyPuttDraft());
  assert.equal(emptyClose.ok, true);
  assert.equal(emptyClose.putts, 1);
  assert.deepEqual(emptyClose.lengths, []);
  assert.doesNotMatch(JSON.stringify(emptyClose), /yd|lat|lng|GPS/i);

  const picked = pickPuttLength(emptyPuttSheetPick(), 'inside_3');
  assert.equal(canMakeCurrentPutt(picked), true);
  assert.equal(showPuttNoLengthCue(picked), false);
  const withLen = planMadeItFromPick(picked);
  assert.equal(withLen.ok, true);
  if (withLen.ok) {
    assert.equal(withLen.putts, 1);
    assert.deepEqual(withLen.lengths, ['inside_3']);
  }

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /const canMake = !disabled/);
  assert.match(sheet, /showPuttNoLengthCue\(pick\)/);
  assert.match(sheet, /testID="putt-no-length-cue"/);
  assert.match(sheet, /COPY\.noLengthCue/);
  assert.doesNotMatch(sheet, /Alert\.alert|Modal/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, /Text\("No length — pick a distance"\)/);
  assert.match(watchSheet, /session\.putt\.pending == nil/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /\.disabled\(session\.sending\)/);
  assert.doesNotMatch(watchSheet, /!session\.putt\.canMake/);
  assert.doesNotMatch(watchSheet, /alert|Alert/);
});

test('Signal Lab: soft No length cue is inline when Made it is off for missing length — never a blocking modal', () => {
  assert.equal(COPY.noLength, 'No length');
  assert.equal(COPY.noLengthCue, 'No length — pick a distance');
  assert.equal(puttSheetNoLengthCue(), COPY.noLengthCue);
  assert.equal(puttSheetNoLengthCueBlocksMadeIt(), false);
  assert.equal(puttSheetNoLengthCueIsModal(), false);
  assert.equal(puttSheetNoLengthCueInventGps(), false);
  assert.equal(showPuttNoLengthCue(emptyPuttSheetPick()), true);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  assert.equal(puttLoggedWithoutLength({ putts: 1, lengths: [] }), true);
  const picked = pickPuttLength(emptyPuttSheetPick(), 'inside_3');
  assert.equal(canMakeCurrentPutt(picked), true);
  assert.equal(showPuttNoLengthCue(picked), false);
  const miss = commitPuttLength(picked);
  assert.equal(showPuttNoLengthCue(miss), true);
  assert.equal(canMakeCurrentPutt(miss), true);

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /showPuttNoLengthCue\(pick\)/);
  assert.match(sheet, /testID="putt-no-length-cue"/);
  assert.match(sheet, /COPY\.noLengthCue/);
  assert.match(sheet, /const canMake = !disabled/);
  assert.doesNotMatch(sheet, /Alert\.alert|Modal|finishHoleOut/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, /Text\("No length — pick a distance"\)/);
  assert.match(watchSheet, /session\.putt\.pending == nil/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /\.disabled\(session\.sending\)/);
  assert.doesNotMatch(watchSheet, /!session\.putt\.canMake/);
  assert.doesNotMatch(watchSheet, /alert|Alert/);
});

test('Signal Lab: Made it only stores user-chosen buckets and advances the hole', () => {
  const emptyMade = planMadeIt(emptyPuttDraft());
  assert.equal(emptyMade.ok, true);
  assert.deepEqual(emptyMade.lengths, []);
  const noBuckets = planMadeIt({ putts: 3, lengths: [] });
  assert.equal(noBuckets.ok, true);
  assert.equal(noBuckets.putts, 3);
  assert.deepEqual(noBuckets.lengths, []);
  const made = planMadeIt({ putts: 2, lengths: ['over_20', 'inside_3'] });
  assert.equal(made.ok, true);
  if (made.ok) {
    assert.equal(made.putts, 3);
    assert.deepEqual(made.lengths, ['over_20', 'inside_3']);
  }
  const persistTwo = planPersistMadeIt({ putts: 2, lengths: ['over_20', 'inside_3'] });
  assert.equal(persistTwo.putts, 2);
  assert.deepEqual(persistTwo.lengths, ['over_20', 'inside_3']);
  const onePutt = planMadeIt(emptyPuttDraft(), 'over_20');
  assert.equal(onePutt.ok, true);
  if (onePutt.ok) {
    assert.equal(onePutt.putts, 1);
    assert.deepEqual(onePutt.lengths, ['over_20']);
  }
  assert.deepEqual(holeAfterDone(4, 18), { kind: 'hole', holeNumber: 5 });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });
});

test('Signal Lab: Finish putts · Hole N is score-only — never a fabricated distance', () => {
  const chip = finishPuttsChipLabel(6);
  assert.equal(chip, 'Finish putts · Hole 6');
  assert.doesNotMatch(chip, /yd|mi|km|GPS/i);
  assert.equal(puttsFromWalkOff({ yards: 8, quality: 'soft' }), null);
});

test('Signal Lab: putter stays out of averages and top-3', () => {
  assert.equal(
    includeInDistanceAverages({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
  assert.equal(
    includeInTop3Samples({
      source: 'gps',
      distanceYards: 12,
      fixQuality: 'good',
      clubId: PUTTER_CLUB_ID,
    }),
    false,
  );
  const ranked = rankTopClubs(
    [
      {
        id: PUTTER_CLUB_ID,
        name: 'Putter',
        shortName: 'Pt',
        loftRank: 16,
        avgYards: 8,
        count: 20,
      },
      {
        id: 'club_7i',
        name: '7 Iron',
        shortName: '7i',
        loftRank: 9,
        avgYards: 150,
        count: 8,
      },
    ],
    { source: 'yards_to_green', dYards: 10 },
  );
  assert.ok(!ranked.some((club) => club.id === PUTTER_CLUB_ID));
});

test('Signal: dock Putt opens sheet; Hole Out is chip-in only; no third dock row', () => {
  assert.equal(playDockPuttOpensExistingSheet(), true);
  assert.equal(playDockPuttUsesShowPuttPillsGate(), true);
  assert.equal(showPuttPills({ putting: true }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 40, quality: 'good' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 40, quality: 'soft' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 41, quality: 'good' } }), false);
  assert.equal(showPuttPills({ toGreen: { yards: 12, quality: 'forced' } }), false);
  assert.equal(playDockHoleOutIsChipInOnly(), true);
  assert.equal(playDockHoleOutCallsMadeIt(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);
  assert.equal(holeOutFlagsLastRealShot(), true);
  assert.equal(holeOutInventPutts(), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.match(dock, /onPress=\{onFinishHole\}/);
  assert.doesNotMatch(dock, /onMadeIt/);
  assert.doesNotMatch(dock, /PUTT_LENGTHS/);
  const finish = hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const onAddPenalty'));
  assert.match(finish, /finishHoleOut/);
  assert.doesNotMatch(finish, /lat|lng|acceptFix|insertShot|club_putter/);
});

test('Signal Lab: next hole stays on play — All clubs does not auto-open', () => {
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 1 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: true, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);
  assert.equal(COPY.pickClub, 'Pick a club');
  assert.equal(COPY.pickClubLede, 'Picking a club marks where you hit from.');
});

test('Signal Lab: TF 51.x attach putt length after no-length Made it — stats only', () => {
  assert.equal(madeItEnabledWithEmptyLength(), true);
  assert.equal(madeItRequiresLengthPick(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);
  const emptyClose = planMadeIt(emptyPuttDraft());
  assert.equal(emptyClose.ok, true);
  assert.equal(emptyClose.putts, 1);
  assert.deepEqual(emptyClose.lengths, []);
  assert.equal(attachPuttLengthIsStatsOnly(), true);
  assert.equal(attachPuttLengthReopensHole(), false);
  assert.equal(attachPuttLengthWritesScore(), false);
  assert.equal(attachPuttLengthInventGps(), false);
  assert.equal(attachPuttLengthInventYards(), false);

  const rows = planFinishedPuttAttachRows({
    puttsDone: true,
    putts: emptyClose.putts,
    lengths: emptyClose.lengths,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.missingLength, true);
  const attached = planAttachPuttLength(
    { puttsDone: true, putts: emptyClose.putts, lengths: emptyClose.lengths },
    0,
    '3_to_10',
  );
  assert.equal(attached.ok, true);
  if (attached.ok) {
    assert.equal(attached.putts, 1);
    assert.deepEqual(attached.lengths, ['3_to_10']);
    assert.equal(attached.reopen, false);
    assert.equal(attached.writeScore, false);
  }
  assert.doesNotMatch(JSON.stringify(attached), /yd|lat|lng|GPS/i);

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /const canMake = !disabled/);
  assert.match(sheet, /showPuttNoLengthCue\(pick\)/);
  assert.match(sheet, /COPY\.addPutt/);
  assert.match(sheet, /COPY\.madeIt/);
  assert.doesNotMatch(sheet, /attachHolePuttLength|FinishedPuttRows/);

  const rowsUi = readFileSync(new URL('../ui/FinishedPuttRows.tsx', import.meta.url), 'utf8');
  assert.match(rowsUi, /testID="finished-putt-rows"/);
  assert.match(rowsUi, /testID=\{`finished-putt-row-\$\{row\.n\}`\}/);
  assert.match(rowsUi, /PUTT_LENGTHS\.map/);
  assert.match(rowsUi, /onAttach\(row\.index, bucket\.id\)/);
  assert.doesNotMatch(rowsUi, /setPuttOpen|finishHolePutts|persistCloseHoleScore|Alert\.alert|Modal/);
  assert.doesNotMatch(rowsUi, /lat|lng|acceptFix|insertShot|invent/);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const attach = repo.slice(
    repo.indexOf('export function attachHolePuttLength'),
    repo.indexOf('export function setHoleGreen'),
  );
  assert.match(attach, /planAttachPuttLength/);
  assert.match(attach, /UPDATE holes SET putt_lengths = \?/);
  assert.match(attach, /putts_done \?\? 0/);
  assert.doesNotMatch(attach, /SET putts_done|updateHoleScore|persistCloseHoleScore|finishHolePutts/);
  assert.doesNotMatch(attach, /lat|lng|acceptFix|insertShot/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const chip = hole.slice(hole.indexOf('finishedMini.visible'), hole.indexOf('simBanner ?'));
  assert.match(chip, /testID="finished-hole-chip"/);
  assert.match(chip, /setScorecardOpen\(true\)/);
  assert.match(chip, /<FinishedPuttRows/);
  assert.match(chip, /onAttach=\{onAttachFinishedPuttLength\}/);
  assert.doesNotMatch(chip, /setPuttOpen\(true\)|finishHolePutts|router\.replace/);
  const attachFn = hole.slice(
    hole.indexOf('const onAttachFinishedPuttLength'),
    hole.indexOf('useEffect(() => {\n    setAttachPuttIndex(null)'),
  );
  assert.match(attachFn, /attachHolePuttLength\(db, hole\.id, index, lengthId\)/);
  assert.doesNotMatch(attachFn, /setPuttOpen|finishHolePutts|persistCloseHoleScore|router\.replace/);

  const apply = hole.slice(hole.indexOf('const applyMadeIt'), hole.indexOf('const dest = holeAfterDone(targetHole'));
  assert.match(apply, /planMadeIt\(draft, pending\)/);
  assert.match(apply, /madeItAdvancesHole/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);

  const scorecard = readFileSync(new URL('./scorecard.ts', import.meta.url), 'utf8');
  assert.match(scorecard, /puttsDone === false/);
  assert.match(scorecard, /scorecardShowsIncompleteCue/);
});
