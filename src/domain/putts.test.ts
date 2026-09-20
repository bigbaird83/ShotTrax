import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  addPuttLength,
  canCommitPutt,
  canMakePutt,
  clampPutts,
  commitPuttLength,
  emptyPuttDraft,
  emptyPuttSheetPick,
  pickPuttLength,
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
  planFinishHoleOut,
  planMadeIt,
  planPlayDockFinish,
  playDockHoleOutLabel,
  puttsLiveOnPlayDock,
  PUTT_LENGTHS,
  PUTT_MAX,
  playDockKeepsHoleOutForOffGreen,
  putterOpensPuttSheet,
  puttSheetCtaLabel,
  puttSheetDistanceTapCommits,
  puttSheetHasAddPuttControl,
  puttSheetShowsHoleOut,
  puttPillsInventGreenEdge,
  puttPillsNearGreenYards,
  puttPillsProximityQualities,
  puttPillsProximityUsesHardOrForced,
  puttPillsUseHydratedGreenCentroid,
  puttPillsUseYardsToGreen,
  puttsFromWalkOff,
  serializePuttLengths,
  setPuttCount,
  shouldAutoOpenClubPick,
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

test('Signal: pick a length does not commit; Add putt commits; Made it needs logged putts', () => {
  assert.equal(puttSheetDistanceTapCommits(), false);
  assert.equal(puttSheetHasAddPuttControl(), true);
  assert.equal(puttSheetCtaLabel(), 'Made it');
  assert.equal(puttSheetShowsHoleOut(), false);
  assert.equal(playDockKeepsHoleOutForOffGreen(), true);

  const picked = pickPuttLength(emptyPuttSheetPick(), 'over_20');
  assert.equal(picked.pending, 'over_20');
  assert.deepEqual(picked.draft, emptyPuttDraft());
  assert.equal(canCommitPutt(picked), true);
  assert.equal(canMakePutt(picked.draft), false);
  assert.equal(planMadeIt(picked.draft).ok, false);

  const idle = commitPuttLength(emptyPuttSheetPick());
  assert.deepEqual(idle.draft, emptyPuttDraft());
  assert.equal(idle.pending, null);

  const logged = commitPuttLength(picked);
  assert.equal(logged.pending, null);
  assert.deepEqual(logged.draft, { putts: 1, lengths: ['over_20'] });
  assert.equal(canMakePutt(logged.draft), true);

  const two = commitPuttLength(pickPuttLength({ draft: logged.draft, pending: null }, 'inside_3'));
  assert.deepEqual(two.draft.lengths, ['over_20', 'inside_3']);
});

test('Made it needs at least one putt with a bucket', () => {
  assert.equal(canMakePutt(emptyPuttDraft()), false);
  assert.equal(canMakePutt({ putts: 0, lengths: [] }), false);
  assert.equal(canMakePutt({ putts: 3, lengths: [] }), false);
  assert.equal(canMakePutt({ putts: 1, lengths: ['inside_3'] }), true);
  assert.equal(canMakePutt({ putts: 2, lengths: ['over_20', '3_to_10'] }), true);
  const planned = planMadeIt({ putts: 99, lengths: ['3_to_10'] });
  assert.equal(planned.ok, true);
  if (planned.ok) {
    assert.equal(planned.putts, 1);
    assert.deepEqual(planned.lengths, ['3_to_10']);
  }
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

test('Signal: putt pills when putter or ≤40 yd good/soft; Hole Out stays either way', () => {
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
  assert.equal(far.showPutts, false);
  const fringe = planPlayDockFinish({ putting: false, toGreen: { yards: 36, quality: 'soft' } });
  assert.equal(fringe.showHoleOut, true);
  assert.equal(fringe.showPutts, true);
  const junk = planPlayDockFinish({ putting: false, toGreen: { yards: 10, quality: 'forced' } });
  assert.equal(junk.showHoleOut, true);
  assert.equal(junk.showPutts, false);
  const putter = planPlayDockFinish({ putting: true, toGreen: { yards: 180, quality: 'good' } });
  assert.equal(putter.showHoleOut, true);
  assert.equal(putter.showPutts, true);
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
  assert.match(hole, /testID="play-dock-putts"|PuttDock/);
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
  assert.match(dock, /COPY\.holeOut/);
  assert.match(dock, /onFinishHole|onMadeIt/);
  assert.match(play, /styles\.scorecardChip/);
  assert.doesNotMatch(dock, /COPY\.scorecard/);
  assert.match(hole, /finishHoleOut/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /Text\("Hole Out"\)/);
  assert.match(watch, /session\.madeIt\(\)/);
  assert.match(watch, /showPuttChips|puttSheet/);
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

test('selecting Putter opens the putt sheet — not a GPS mark; change-club does not', () => {
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID }), true);
  assert.equal(putterOpensPuttSheet({ clubId: 'club_7i' }), false);
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID, relabel: true }), false);
  assert.equal(putterOpensPuttSheet({ clubId: null }), false);
});
