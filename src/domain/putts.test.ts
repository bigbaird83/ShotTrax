import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  addPuttLength,
  attachPuttLengthInventGps,
  attachPuttLengthInventYards,
  attachPuttLengthIsStatsOnly,
  attachPuttLengthReopensHole,
  attachPuttLengthWritesScore,
  canAttachPuttLength,
  canCommitPutt,
  canMakeCurrentPutt,
  canMakePutt,
  madeItEnabledWithEmptyLength,
  madeItRequiresLengthPick,
  clampPutts,
  commitPuttLength,
  emptyPuttDraft,
  emptyPuttSheetPick,
  pickPuttLength,
  planMadeItFromPick,
  finishHoleBuriedInScorecard,
  finishHoleLivesOnPlayDock,
  finishPuttsChipLabel,
  holeAfterDone,
  holeOutFlagsLastRealShot,
  holeOutInsertsShot,
  holeOutInventPutts,
  holeOutSetsGirFromOffGreen,
  planFlagLastRealShot,
  holesNeedingPutts,
  isLivePuttProximityQuality,
  isNearOrOnGreen,
  madeItAdvancesHole,
  NEAR_GREEN_YD,
  parsePuttLengths,
  parsePuttLengthSlots,
  planAttachPuttLength,
  planFinishHoleOut,
  planFinishedPuttAttachRows,
  planFinishedPuttRows,
  planMadeIt,
  planPersistMadeIt,
  planPuttLengthSlots,
  planPlayDockFinish,
  playDockHoleOutLabel,
  playDockHoleOutCallsMadeIt,
  playDockHoleOutIsChipInOnly,
  playDockPuttLabel,
  playDockPuttOpensExistingSheet,
  playDockPuttAlwaysWhenUnfinished,
  playDockPuttUsesShowPuttPillsGate,
  puttsLiveOnPlayDock,
  PUTT_LENGTHS,
  PUTT_MAX,
  playDockKeepsHoleOutForOffGreen,
  watchClubPickHoleOutIsChipInOnly,
  watchPuttSheetAddPuttIsMissOnly,
  watchPuttSheetAddPuttLabel,
  watchPuttSheetLengthLabel,
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItIsFullWidthRow,
  watchPuttSheetMadeItLabel,
  watchPuttSheetMadeItRequiresLength,
  watchPuttSheetMadeItSharesAddUndoHStack,
  watchPuttSheetPinsMadeIt,
  watchPuttSheetUndoLabel,
  watchPuttSheetUsesTwoColumnGrid,
  WATCH_PUTT_LENGTHS,
  putterOpensPuttSheet,
  puttLoggedWithoutLength,
  puttSheetCtaLabel,
  puttSheetDistanceTapCommits,
  puttSheetHasAddPuttControl,
  puttSheetNoLengthCue,
  puttSheetNoLengthCueBlocksMadeIt,
  puttSheetNoLengthCueInventGps,
  puttSheetNoLengthCueIsModal,
  puttSheetShowsHoleOut,
  puttPillsInventGreenEdge,
  puttPillsNearGreenYards,
  puttPillsProximityQualities,
  puttPillsProximityUsesHardOrForced,
  puttPillsUseHydratedGreenCentroid,
  puttPillsUseYardsToGreen,
  puttsFromWalkOff,
  serializePuttLengths,
  serializePuttLengthSlots,
  setPuttCount,
  shouldAutoOpenClubPick,
  showPuttNoLengthCue,
  showPuttPills,
  undoLastPutt,
} from './putts';
import { playScorecardIsDockAction, playScorecardIsHeaderChip } from './playLayout';

test('putts clamp to 0–5', () => {
  assert.equal(clampPutts(-1), 0);
  assert.equal(clampPutts(0), 0);
  assert.equal(clampPutts(3), 3);
  assert.equal(clampPutts(5), 5);
  assert.equal(clampPutts(9), 5);
  assert.equal(clampPutts(Number.NaN), 0);
  assert.equal(PUTT_MAX, 5);
});

test('length buckets are player-voice Under 3 ft · 3–10 · 10–20 · 20+', () => {
  assert.deepEqual(
    PUTT_LENGTHS.map((row) => row.label),
    ['Under 3 ft', '3–10', '10–20', '20+'],
  );
});

test('putt lengths serialize and drop unknown ids', () => {
  assert.deepEqual(parsePuttLengths(null), []);
  assert.deepEqual(parsePuttLengths('inside_3,over_20,nope'), ['inside_3', 'over_20']);
  assert.equal(serializePuttLengths(['3_to_10', '10_to_20']), '3_to_10,10_to_20');
});

test('each committed bucket is its own putt; undo drops the last', () => {
  const trimmed = setPuttCount({ putts: 3, lengths: ['inside_3', '3_to_10', 'over_20'] }, 1);
  assert.deepEqual(trimmed, { putts: 1, lengths: ['inside_3'] });
  const first = addPuttLength(emptyPuttDraft(), 'over_20');
  assert.deepEqual(first, { putts: 1, lengths: ['over_20'] });
  const second = addPuttLength(first, '3_to_10');
  assert.deepEqual(second, { putts: 2, lengths: ['over_20', '3_to_10'] });
  const third = addPuttLength(second, 'inside_3');
  assert.deepEqual(third, { putts: 3, lengths: ['over_20', '3_to_10', 'inside_3'] });
  assert.deepEqual(undoLastPutt(third), second);
  const full = addPuttLength({ putts: 5, lengths: ['inside_3', 'inside_3', 'inside_3', 'inside_3', 'inside_3'] }, 'over_20');
  assert.equal(full.putts, 5);
});

test('Signal: pick a length does not commit; Add putt commits a miss; Made it on putt 1', () => {
  assert.equal(puttSheetDistanceTapCommits(), false);
  assert.equal(puttSheetHasAddPuttControl(), true);
  assert.equal(puttSheetCtaLabel(), 'Made it');
  assert.equal(puttSheetShowsHoleOut(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);

  const picked = pickPuttLength(emptyPuttSheetPick(), 'over_20');
  assert.equal(picked.pending, 'over_20');
  assert.deepEqual(picked.draft, emptyPuttDraft());
  assert.equal(picked.draft.lengths.length, 0);
  assert.equal(canCommitPutt(picked), true);
  assert.equal(canMakePutt(picked.draft, picked.pending), true);
  assert.equal(canMakeCurrentPutt(picked), true);
  const onePutt = planMadeIt(picked.draft, picked.pending);
  assert.equal(onePutt.ok, true);
  if (onePutt.ok) {
    assert.equal(onePutt.putts, 1);
    assert.deepEqual(onePutt.lengths, ['over_20']);
  }
  const emptyClose = planMadeIt(picked.draft);
  assert.equal(emptyClose.ok, true);
  assert.deepEqual(emptyClose.lengths, []);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);

  const idle = commitPuttLength(emptyPuttSheetPick());
  assert.deepEqual(idle.draft, emptyPuttDraft());
  assert.equal(idle.pending, null);

  const logged = commitPuttLength(picked);
  assert.equal(logged.pending, null);
  assert.deepEqual(logged.draft, { putts: 1, lengths: ['over_20'] });
  assert.equal(canMakePutt(logged.draft), true);
  assert.equal(canMakeCurrentPutt(logged), true);
  assert.equal(showPuttNoLengthCue(logged), true);

  const putt2 = pickPuttLength({ draft: logged.draft, pending: null }, 'inside_3');
  assert.equal(putt2.pending, 'inside_3');
  assert.deepEqual(putt2.draft.lengths, ['over_20']);
  assert.equal(canMakeCurrentPutt(putt2), true);
  const madeTwo = planMadeItFromPick(putt2);
  assert.equal(madeTwo.ok, true);
  if (madeTwo.ok) {
    assert.equal(madeTwo.putts, 2);
    assert.deepEqual(madeTwo.lengths, ['over_20', 'inside_3']);
  }

  const two = commitPuttLength(putt2);
  assert.deepEqual(two.draft.lengths, ['over_20', 'inside_3']);
});

test('Made it on putt N with empty length closes N putts; putt N attaches later', () => {
  const miss = commitPuttLength(pickPuttLength(emptyPuttSheetPick(), 'over_20'));
  assert.deepEqual(miss.draft, { putts: 1, lengths: ['over_20'] });
  assert.equal(miss.pending, null);
  const madeTwo = planMadeIt(miss.draft, null);
  assert.equal(madeTwo.ok, true);
  assert.equal(madeTwo.putts, 2);
  assert.deepEqual(madeTwo.lengths, ['over_20']);
  assert.deepEqual(planPuttLengthSlots(madeTwo.putts, madeTwo.lengths), ['over_20', null]);

  const miss2 = commitPuttLength(pickPuttLength(miss, '3_to_10'));
  assert.deepEqual(miss2.draft, { putts: 2, lengths: ['over_20', '3_to_10'] });
  const madeThree = planMadeIt(miss2.draft, null);
  assert.equal(madeThree.putts, 3);
  assert.deepEqual(madeThree.lengths, ['over_20', '3_to_10']);
  assert.deepEqual(planPuttLengthSlots(madeThree.putts, madeThree.lengths), [
    'over_20',
    '3_to_10',
    null,
  ]);

  const emptyOne = planMadeIt(emptyPuttDraft(), null);
  assert.equal(emptyOne.putts, 1);
  assert.deepEqual(emptyOne.lengths, []);
  assert.deepEqual(planPuttLengthSlots(emptyOne.putts, emptyOne.lengths), [null]);

  const withPending = planMadeIt({ putts: 1, lengths: ['over_20'] }, 'inside_3');
  assert.equal(withPending.putts, 2);
  assert.deepEqual(withPending.lengths, ['over_20', 'inside_3']);

  const persistOne = planPersistMadeIt({ putts: 1, lengths: ['over_20'] });
  assert.equal(persistOne.putts, 1);
  assert.deepEqual(persistOne.lengths, ['over_20']);
  const persistTwo = planPersistMadeIt(madeTwo);
  assert.equal(persistTwo.putts, 2);
  assert.deepEqual(persistTwo.lengths, ['over_20']);
});

test('Made it stays enabled with empty length; pending still commits a bucket', () => {
  assert.equal(madeItEnabledWithEmptyLength(), true);
  assert.equal(madeItRequiresLengthPick(), false);
  assert.equal(canMakePutt(emptyPuttDraft()), true);
  assert.equal(canMakePutt({ putts: 0, lengths: [] }), true);
  assert.equal(canMakePutt({ putts: 3, lengths: [] }), true);
  const emptyClose = planMadeIt(emptyPuttDraft());
  assert.equal(emptyClose.ok, true);
  assert.equal(emptyClose.putts, 1);
  assert.deepEqual(emptyClose.lengths, []);
  assert.equal(canMakePutt({ putts: 1, lengths: ['inside_3'] }), true);
  assert.equal(canMakePutt({ putts: 2, lengths: ['over_20', '3_to_10'] }), true);
  assert.equal(canMakePutt(emptyPuttDraft(), 'inside_3'), true);
  assert.equal(canMakeCurrentPutt({ draft: emptyPuttDraft(), pending: 'inside_3' }), true);
  assert.equal(canMakeCurrentPutt({ draft: { putts: 1, lengths: ['over_20'] }, pending: null }), true);
  assert.equal(canMakeCurrentPutt({ draft: { putts: 1, lengths: ['over_20'] }, pending: 'inside_3' }), true);
  const planned = planMadeIt({ putts: 99, lengths: ['3_to_10'] });
  assert.equal(planned.ok, true);
  if (planned.ok) {
    assert.equal(planned.putts, 5);
    assert.deepEqual(planned.lengths, ['3_to_10']);
  }
  const holing = planMadeIt({ putts: 1, lengths: ['over_20'] }, 'inside_3');
  assert.equal(holing.ok, true);
  if (holing.ok) {
    assert.equal(holing.putts, 2);
    assert.deepEqual(holing.lengths, ['over_20', 'inside_3']);
  }
  const capped = {
    draft: { putts: 5, lengths: ['inside_3', 'inside_3', 'inside_3', 'inside_3', 'inside_3'] as const },
    pending: null,
  };
  assert.equal(canMakeCurrentPutt(capped), true);
});

test('Signal: soft No length cue is inline stats-only — never blocks Made it or invents GPS', () => {
  assert.equal(puttSheetNoLengthCue(), 'No length — pick a distance');
  assert.equal(puttSheetNoLengthCueBlocksMadeIt(), false);
  assert.equal(puttSheetNoLengthCueIsModal(), false);
  assert.equal(puttSheetNoLengthCueInventGps(), false);
  assert.equal(showPuttNoLengthCue(emptyPuttSheetPick()), true);
  assert.equal(puttLoggedWithoutLength({ putts: 2, lengths: [] }), true);
  assert.equal(showPuttNoLengthCue({ draft: { putts: 2, lengths: [] }, pending: null }), true);
  const picked = pickPuttLength(emptyPuttSheetPick(), '3_to_10');
  assert.equal(canMakeCurrentPutt(picked), true);
  assert.equal(showPuttNoLengthCue(picked), false);
  const miss = commitPuttLength(picked);
  assert.equal(canMakeCurrentPutt(miss), true);
  assert.equal(showPuttNoLengthCue(miss), true);
  const putt2 = pickPuttLength(miss, 'inside_3');
  assert.equal(canMakeCurrentPutt(putt2), true);
  assert.equal(showPuttNoLengthCue(putt2), false);
});

test('next hole with no shots stays on play — All clubs does not auto-open', () => {
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);
});

test('near / on green is live yards-to-green within 40 yd — never a putt record', () => {
  assert.equal(NEAR_GREEN_YD, 40);
  assert.equal(isNearOrOnGreen({ yards: 28, quality: 'good' }), true);
  assert.equal(isNearOrOnGreen({ yards: 40, quality: 'soft' }), true);
  assert.equal(isNearOrOnGreen({ yards: 41, quality: 'good' }), false);
  assert.equal(isNearOrOnGreen({ yards: 12, quality: 'none' }), false);
  assert.equal(isNearOrOnGreen({ yards: null, quality: 'good' }), false);
  assert.equal(isNearOrOnGreen({ yards: 8, quality: 'forced' }), false);
  assert.equal(isNearOrOnGreen({ yards: 8, quality: 'hard' }), false);
  assert.equal(isLivePuttProximityQuality('good'), true);
  assert.equal(isLivePuttProximityQuality('soft'), true);
  assert.equal(isLivePuttProximityQuality('forced'), false);
  assert.equal(isLivePuttProximityQuality('hard'), false);
  assert.equal(isLivePuttProximityQuality('none'), false);
});

test('Signal: dock Putt when putter or ≤40 yd good/soft; Hole Out stays either way', () => {
  assert.equal(puttPillsNearGreenYards(), 40);
  assert.equal(puttPillsUseYardsToGreen(), true);
  assert.deepEqual([...puttPillsProximityQualities()], ['good', 'soft']);
  assert.equal(puttPillsProximityUsesHardOrForced(), false);
  assert.equal(puttPillsUseHydratedGreenCentroid(), true);
  assert.equal(puttPillsInventGreenEdge(), false);
  assert.equal(showPuttPills({ putting: true }), true);
  assert.equal(showPuttPills({ putting: true, toGreen: { yards: 180, quality: 'good' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 40, quality: 'good' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 32, quality: 'soft' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 41, quality: 'good' } }), false);
  assert.equal(showPuttPills({ toGreen: { yards: 12, quality: 'forced' } }), false);
  assert.equal(showPuttPills({ toGreen: { yards: 12, quality: 'hard' } }), false);
  assert.equal(showPuttPills({ putting: true, toGreen: { yards: 12, quality: 'forced' } }), true);
  assert.equal(showPuttPills({ toGreen: { yards: 8, quality: 'none' } }), false);
  assert.equal(showPuttPills({}), false);

  const far = planPlayDockFinish({ putting: false, toGreen: { yards: 160, quality: 'good' } });
  assert.equal(far.kind, 'hole_out');
  assert.equal(far.showHoleOut, true);
  assert.equal(far.showPutts, true);
  const fringe = planPlayDockFinish({ putting: false, toGreen: { yards: 36, quality: 'soft' } });
  assert.equal(fringe.showHoleOut, true);
  assert.equal(fringe.showPutts, true);
  const junk = planPlayDockFinish({ putting: false, toGreen: { yards: 10, quality: 'forced' } });
  assert.equal(junk.showHoleOut, true);
  assert.equal(junk.showPutts, true);
  const putter = planPlayDockFinish({ putting: true, toGreen: { yards: 180, quality: 'good' } });
  assert.equal(putter.showHoleOut, true);
  assert.equal(putter.showPutts, true);
  assert.equal(playDockPuttAlwaysWhenUnfinished(), true);
  const hidden = planPlayDockFinish({ readOnly: true, putting: true });
  assert.equal(hidden.showHoleOut, false);
  assert.equal(hidden.showPutts, false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('const dockFinish'), hole.indexOf('const showFirstLaunchTip'));
  assert.match(dock, /planPlayDockFinish/);
  assert.match(dock, /toGreen: liveToGreen/);
  assert.doesNotMatch(dock, /playHeaderYards|onGreen:/);
  assert.match(hole, /const liveToGreen = yardsToGreen\(fix, green\)/);
  assert.match(hole, /from '@\/src\/sensing\/yardsToGreen'/);
  assert.match(hole, /<PuttDock/);
  assert.match(hole, /openPuttSheet\(holeNumber\)/);
  assert.match(hole, /styles\.dockHoleOutShrunk/);
  const puttDock = readFileSync(new URL('../ui/PuttDock.tsx', import.meta.url), 'utf8');
  assert.match(puttDock, /testID="play-dock-putts"/);
  assert.match(puttDock, /COPY\.putt/);
  assert.doesNotMatch(puttDock, /PUTT_LENGTHS|onAdd|onUndo/);
  assert.match(hole, /testID=\{toast === COPY\.holeOut \? 'hole-out-chip'/);
});

test('Finish hole / putts live on the play dock — not buried in Scorecard', () => {
  assert.equal(finishHoleLivesOnPlayDock(), true);
  assert.equal(puttsLiveOnPlayDock(), true);
  assert.equal(finishHoleBuriedInScorecard(), false);
  assert.equal(playScorecardIsHeaderChip(), true);
  assert.equal(playScorecardIsDockAction(), false);
  assert.equal(playDockHoleOutLabel(), 'Hole Out');
  assert.equal(holeOutInventPutts(), false);
  assert.equal(holeOutSetsGirFromOffGreen(), false);
  assert.equal(holeOutFlagsLastRealShot(), true);
  assert.equal(holeOutInsertsShot(), false);
  assert.equal(planFlagLastRealShot([]).shotId, null);
  const offGreen = planFinishHoleOut();
  assert.equal(offGreen.ok, true);
  assert.equal(offGreen.putts, 0);
  assert.deepEqual(offGreen.lengths, []);
  assert.equal(offGreen.gir, false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.match(dock, /<PuttDock/);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.match(dock, /COPY\.holeOut/);
  assert.match(dock, /onPress=\{onFinishHole\}/);
  assert.doesNotMatch(dock, /onMadeIt/);
  const puttAt = dock.indexOf('<PuttDock');
  const holeOutAt = dock.indexOf('testID="play-dock-hole-out"');
  assert.ok(puttAt >= 0 && holeOutAt > puttAt);
  assert.equal(playDockPuttOpensExistingSheet(), true);
  assert.equal(playDockPuttUsesShowPuttPillsGate(), false);
  assert.equal(playDockPuttAlwaysWhenUnfinished(), true);
  assert.equal(playDockPuttLabel(), 'Putt');
  assert.equal(playDockHoleOutIsChipInOnly(), true);
  assert.equal(playDockHoleOutCallsMadeIt(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);
  assert.match(play, /styles\.scorecardChip/);
  assert.doesNotMatch(dock, /COPY\.scorecard/);
  assert.match(hole, /finishHoleOut/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /Text\("Hole Out"\)/);
  assert.match(watch, /session\.madeIt\(\)/);
  assert.match(watch, /showPuttChips|puttSheet/);
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, /LazyVGrid/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /Text\("Add putt"\)/);
  assert.match(watchSheet, /Text\("Undo"\)/);
  assert.match(watchSheet, /session\.sending \|\|/);
  assert.doesNotMatch(watchSheet, /!session\.putt\.canMake/);
  const madeBtn = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled\(session\.sending\)/);
  assert.doesNotMatch(watchSheet, /Text\("Hole Out"\)/);
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetMadeItRequiresLength(), false);
  assert.equal(watchPuttSheetAddPuttIsMissOnly(), true);
  assert.equal(watchClubPickHoleOutIsChipInOnly(), true);
  assert.equal(watchPuttSheetUsesTwoColumnGrid(), true);
  assert.equal(watchPuttSheetAddPuttLabel(), 'Add putt');
  assert.equal(watchPuttSheetUndoLabel(), 'Undo');
  assert.equal(watchPuttSheetMadeItLabel(), 'Made it');
  assert.deepEqual(
    WATCH_PUTT_LENGTHS.map((row) => [row.id, row.label]),
    [
      ['inside_3', '0–3'],
      ['3_to_10', '3–10'],
      ['10_to_20', '10–20'],
      ['over_20', '20+'],
    ],
  );
  assert.equal(watchPuttSheetLengthLabel('inside_3'), '0–3');
  assert.doesNotMatch(watch, /Scorecard/);
});

test('walking off the green / to the next tee does not invent putts', () => {
  assert.equal(puttsFromWalkOff({ yards: 6, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff({ yards: 80, quality: 'good' }), null);
  assert.equal(puttsFromWalkOff(), null);
});

test('Finish putts chip is score-only — never a fabricated distance', () => {
  const chip = finishPuttsChipLabel(7);
  assert.equal(chip, 'Finish putts · Hole 7');
  assert.doesNotMatch(chip, /yd|mi|km|GPS/i);
  assert.equal(puttsFromWalkOff({ yards: 4, quality: 'good' }), null);
});

test('Made it advances to the next hole, or summary after the last', () => {
  assert.deepEqual(holeAfterDone(1, 18), { kind: 'hole', holeNumber: 2 });
  assert.deepEqual(holeAfterDone(9, 9), { kind: 'summary' });
  assert.deepEqual(holeAfterDone(18, 18), { kind: 'summary' });
  assert.equal(madeItAdvancesHole({ sheetHoleNumber: 4, currentHoleNumber: 4 }), true);
  assert.equal(madeItAdvancesHole({ sheetHoleNumber: 3, currentHoleNumber: 5 }), false);
});

test('Finish putts chip stays for holes you left without Made it', () => {
  assert.equal(finishPuttsChipLabel(4), 'Finish putts · Hole 4');
  const pending = holesNeedingPutts(
    [
      { number: 1, puttsDone: false, shotCount: 3, puttCount: 0 },
      { number: 2, puttsDone: true, shotCount: 2, puttCount: 2 },
      { number: 3, puttsDone: false, shotCount: 0, puttCount: 0 },
      { number: 4, puttsDone: false, shotCount: 1, puttCount: 0 },
      { number: 5, puttsDone: false, shotCount: 0, puttCount: 2 },
    ],
    4,
  );
  assert.deepEqual(
    pending.map((row) => row.number),
    [1, 5],
  );
  assert.equal(
    holesNeedingPutts([{ number: 4, puttsDone: false, shotCount: 2, puttCount: 0 }], 4).length,
    0,
  );
});

test('TF 51.x: attach putt length after no-length Made it — stats only, never reopens', () => {
  assert.equal(attachPuttLengthIsStatsOnly(), true);
  assert.equal(attachPuttLengthReopensHole(), false);
  assert.equal(attachPuttLengthWritesScore(), false);
  assert.equal(attachPuttLengthInventGps(), false);
  assert.equal(attachPuttLengthInventYards(), false);

  const emptyClose = planMadeIt(emptyPuttDraft());
  assert.equal(emptyClose.ok, true);
  assert.equal(emptyClose.putts, 1);
  assert.deepEqual(emptyClose.lengths, []);

  const slots = planPuttLengthSlots(emptyClose.putts, emptyClose.lengths);
  assert.deepEqual(slots, [null]);
  assert.deepEqual(parsePuttLengthSlots('', 1), [null]);
  assert.deepEqual(parsePuttLengthSlots('inside_3', 2), ['inside_3', null]);
  assert.deepEqual(parsePuttLengthSlots(',inside_3', 2), [null, 'inside_3']);
  assert.equal(serializePuttLengthSlots(['inside_3', null]), 'inside_3');
  assert.equal(serializePuttLengthSlots([null, 'inside_3']), ',inside_3');

  const blockedOpen = planAttachPuttLength(
    { puttsDone: false, putts: 1, lengths: [] },
    0,
    'inside_3',
  );
  assert.equal(blockedOpen.ok, false);

  const attached = planAttachPuttLength(
    { puttsDone: true, putts: emptyClose.putts, lengths: emptyClose.lengths },
    0,
    'inside_3',
  );
  assert.equal(attached.ok, true);
  if (attached.ok) {
    assert.equal(attached.putts, 1);
    assert.deepEqual(attached.lengths, ['inside_3']);
    assert.deepEqual(attached.slots, ['inside_3']);
    assert.equal(attached.puttsDone, true);
    assert.equal(attached.reopen, false);
    assert.equal(attached.writeScore, false);
  }
  assert.equal(
    canAttachPuttLength({ puttsDone: true, putts: 1, lengths: ['inside_3'] }, 0, '3_to_10'),
    false,
  );

  const missThenEmpty = planAttachPuttLength(
    { puttsDone: true, putts: 2, lengths: ['over_20'] },
    1,
    '3_to_10',
  );
  assert.equal(missThenEmpty.ok, true);
  if (missThenEmpty.ok) {
    assert.equal(missThenEmpty.putts, 2);
    assert.deepEqual(missThenEmpty.lengths, ['over_20', '3_to_10']);
    assert.equal(missThenEmpty.reopen, false);
  }

  const secondFirst = planAttachPuttLength(
    { puttsDone: true, putts: 2, lengths: [] },
    1,
    'over_20',
  );
  assert.equal(secondFirst.ok, true);
  if (secondFirst.ok) {
    assert.equal(secondFirst.putts, 2);
    assert.deepEqual(secondFirst.slots, [null, 'over_20']);
    assert.deepEqual(secondFirst.lengths, ['over_20']);
  }

  const rows = planFinishedPuttAttachRows({
    puttsDone: true,
    putts: 1,
    lengths: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.n, 1);
  assert.equal(rows[0]?.missingLength, true);
  assert.equal(rows[0]?.label, 'No length');
  assert.deepEqual(
    planFinishedPuttAttachRows({ puttsDone: true, putts: 2, lengths: ['over_20', 'inside_3'] }),
    [],
  );
  assert.deepEqual(planFinishedPuttRows({ puttsDone: false, putts: 1, lengths: [] }), []);
});

test('selecting Putter opens the putt sheet — not a GPS mark; change-club does not', () => {
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID }), true);
  assert.equal(putterOpensPuttSheet({ clubId: 'club_7i' }), false);
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID, relabel: true }), false);
  assert.equal(putterOpensPuttSheet({ clubId: null }), false);
});

test('TF 54: dock Putt + shrunken Hole Out; Watch Made it always on putt sheet', () => {
  assert.equal(playDockPuttAlwaysWhenUnfinished(), true);
  assert.equal(playDockPuttUsesShowPuttPillsGate(), false);
  assert.equal(planPlayDockFinish({ putting: false, toGreen: { yards: 371, quality: 'good' } }).showPutts, true);
  assert.equal(planPlayDockFinish({ putting: false, toGreen: { yards: 371, quality: 'none' } }).showPutts, true);
  assert.equal(planPlayDockFinish({ putting: true, toGreen: { yards: 371, quality: 'good' } }).showPutts, true);
  assert.equal(planPlayDockFinish({ putting: false, toGreen: { yards: 36, quality: 'soft' } }).showPutts, true);
  assert.equal(planPlayDockFinish({ readOnly: true }).showPutts, false);
  assert.equal(planPlayDockFinish({ putting: false, puttsDone: true }).showPutts, false);
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetPinsMadeIt(), true);
  assert.equal(watchPuttSheetMadeItIsFullWidthRow(), true);
  assert.equal(watchPuttSheetMadeItSharesAddUndoHStack(), false);
  assert.equal(watchPuttSheetMadeItRequiresLength(), false);
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  const puttAt = dock.indexOf('<PuttDock');
  const holeOutAt = dock.indexOf('testID="play-dock-hole-out"');
  assert.ok(puttAt >= 0 && holeOutAt > puttAt);
  assert.match(dock, /styles\.dockHoleOutShrunk/);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.doesNotMatch(dock, /onMadeIt/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.match(watchSheet, /LazyVGrid/);
  assert.match(watchSheet, /Text\("Made it"\)/);
  assert.match(watchSheet, /Text\("Add putt"\)/);
  assert.match(watchSheet, /Text\("Undo"\)/);
  assert.match(watchSheet, /Text\("0–3"\)|watchPuttBuckets/);
  assert.ok(watchSheet.indexOf('LazyVGrid') < watchSheet.indexOf('Text("Made it")'));
  const addUndo = watchSheet.slice(watchSheet.indexOf('HStack(spacing: 4)'), watchSheet.indexOf('session.madeIt()'));
  assert.ok(addUndo.indexOf('Text("Made it")') < 0);
  assert.match(watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths')), /maxWidth: \.infinity/);
  assert.doesNotMatch(watchSheet, /!session\.putt\.canMake/);
  const madeAlways = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeAlways, /\.disabled\(session\.sending\)/);
  assert.doesNotMatch(watchSheet, /Text\("Hole Out"\)/);
  assert.doesNotMatch(watchSheet, /ScrollView/);
  assert.match(clubPick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(clubPick, /Text\("Made it"\)/);
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /clubId == "club_putter"/);
  assert.match(pickFn, /sheet\.open = true/);
  assert.match(pickFn, /sheet\.canMake = true/);
});
