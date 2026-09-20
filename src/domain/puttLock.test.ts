import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { includeInDistanceAverages, includeInTop3Samples } from './shotSource';
import { COPY } from './playerCopy';
import {
  emptyPuttDraft,
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
  planFinishHoleOut,
  planMadeIt,
  planPlayDockFinish,
  puttPillsInventGreenEdge,
  puttPillsProximityQualities,
  puttPillsProximityUsesHardOrForced,
  puttPillsUseHydratedGreenCentroid,
  puttPillsUseYardsToGreen,
  puttsFromWalkOff,
  shouldAutoOpenClubPick,
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

test('Signal Lab: putt pills are putter or ≤40 yd haversine to green centroid, good/soft only', () => {
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
  assert.equal(planMadeIt(emptyPuttDraft()).ok, false);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const finishOut = repo.slice(repo.indexOf('export function finishHoleOut'), repo.indexOf('export function sealOpenShotWithoutGps'));
  assert.match(finishOut, /planFinishHoleOut/);
  assert.match(finishOut, /updateHolePutts/);
  assert.match(finishOut, /planFlagLastRealShot/);
  assert.match(finishOut, /hole_out/);
  assert.doesNotMatch(finishOut, /INSERT INTO shots|insertShot|lat|lng|accuracy|acceptFix|addPlacedShot|club_putter/);
  const finishPutts = repo.slice(repo.indexOf('export function finishHolePutts'), repo.indexOf('export function finishHoleOut'));
  assert.match(finishPutts, /planMadeIt/);
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
  assert.match(watchFn, /planMadeIt/);
  assert.match(watchFn, /finishHoleOut/);
  assert.doesNotMatch(watchFn, /addPlacedShot|insertNoGpsShot/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('func madeIt()') + 220);
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
});

test('Signal Lab: Made it only stores user-chosen buckets and advances the hole', () => {
  assert.equal(planMadeIt(emptyPuttDraft()).ok, false);
  assert.equal(planMadeIt({ putts: 3, lengths: [] }).ok, false);
  const made = planMadeIt({ putts: 99, lengths: ['over_20', 'inside_3'] });
  assert.equal(made.ok, true);
  if (made.ok) {
    assert.equal(made.putts, 2);
    assert.deepEqual(made.lengths, ['over_20', 'inside_3']);
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

test('Signal Lab: next hole stays on play — All clubs does not auto-open', () => {
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 1 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: true, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);
  assert.equal(COPY.pickClub, 'Pick a club');
  assert.equal(COPY.pickClubLede, 'Picking a club marks where you hit from.');
});
