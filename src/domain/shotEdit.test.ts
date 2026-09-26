import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { SQLiteDatabase } from 'expo-sqlite';
import { MAX_SHOT_YD } from '../config/sensing';
import { YARD_TEST_COURSE_ID } from '../course/yardTestCourse';
import {
  collectRoundCsv,
  collectRoundHistoryExport,
  getHole,
  getShot,
  insertPenalty,
  listClubAverages,
  listDispersionShots,
  listPenaltiesForHole,
  listShotsForHole,
  moveShotSpotOnHole,
  restoreRoundHistory,
  setHoleGreen,
  startRound,
  updateClubCarry,
  updateShotClub,
} from '../db/repo';
import { migrate } from '../db/schema';
import { clubCarryMeta } from './bagDistance';
import { planDispersion } from './dispersion';
import { haversineYards, roundYards } from './haversine';
import { COPY, formatBagCarrySuggestion, formatDispersionPlacedNote } from './playerCopy';
import { formatHistoryDate } from './roundHistory';
import { confirmPlacedShot, includeInDistanceAverages } from './shotSource';
import { acceptTransferShot, serializeRoundHistory } from './roundTransfer';
import {
  applyChangeShotClub,
  applyMoveShotSpot,
  canMoveFromPin,
  canMoveToPin,
  clubAverageForShots,
  dispersionForShot,
  editReadsPhoneFix,
  editRunsAcceptFix,
  frameMapCenter,
  moveSpotDraftOrigin,
  moveSpotRewritesPenaltyOrder,
  moveSpotRewritesPutts,
  moveSpotSavesBeforeConfirm,
  moveSpotSnaps,
  planChangeShotClub,
  planMoveShotPin,
  shotStoredPosition,
  snapshotShot,
} from './shotEdit';
import type { Shot } from './types';

function shot(partial: Partial<Shot> & { id: string }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    seq: 1,
    startLat: 37,
    startLng: -122,
    startAccuracyM: 5,
    startFixQuality: 'good',
    endLat: 37.001,
    endLng: -122,
    endAccuracyM: 6,
    endFixQuality: 'soft',
    distanceYards: 120,
    typedYards: null,
    fixQuality: 'soft',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: 't1',
    source: 'gps',
    suggested: false,
    holeOut: false,
    ...partial,
  };
}

test('club-only change keeps coordinates and source; putter is rejected', () => {
  const gps = shot({ id: 's1' });
  const plan = planChangeShotClub(gps, 'club_6i');
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.keepsCoordinates, true);
  assert.equal(plan.clubId, 'club_6i');
  assert.equal(plan.snapshot.startLat, gps.startLat);
  assert.equal(plan.snapshot.endLng, gps.endLng);
  assert.equal(plan.snapshot.source, 'gps');
  assert.equal(plan.snapshot.distanceYards, 120);
  assert.equal(plan.snapshot.fixQuality, 'soft');
  assert.equal(planChangeShotClub(gps, 'club_putter').ok, false);
});

test('moving either pin badges Placed, recomputes yards, and has no GPS quality', () => {
  const gps = shot({ id: 's1' });
  const nextFrom = { lat: 37.002, lng: -122 };
  const moved = planMoveShotPin(gps, 'from', nextFrom);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.plan.source, 'placed');
  assert.equal(moved.plan.fixQuality, null);
  assert.equal(moved.plan.startFixQuality, null);
  assert.equal(moved.plan.endFixQuality, null);
  assert.equal(moved.from.lat, nextFrom.lat);
  assert.equal(moved.to.lat, gps.endLat);
  assert.ok(moved.plan.distanceYards !== gps.distanceYards);
  assert.equal(includeInDistanceAverages(moved.plan), true);
  assert.equal(moved.snapshot.source, 'gps');
  assert.equal(moved.snapshot.fixQuality, 'soft');
});

test('move to on an open GPS shot closes it as Placed without inventing the from pin', () => {
  const open = shot({
    id: 's2',
    endLat: null,
    endLng: null,
    endAccuracyM: null,
    endFixQuality: null,
    distanceYards: null,
    fixQuality: 'good',
    endedAt: null,
  });
  assert.equal(canMoveFromPin(open), false);
  assert.equal(canMoveToPin(open), true);
  const landed = { lat: 37.0015, lng: -122 };
  const moved = planMoveShotPin(open, 'to', landed);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.from.lat, open.startLat);
  assert.equal(moved.to.lat, landed.lat);
  assert.equal(moved.plan.source, 'placed');
  assert.ok(moved.plan.distanceYards != null && moved.plan.distanceYards > 0);
});

test('no_gps shots cannot grow invented pins; club change still works', () => {
  const logged = shot({
    id: 's3',
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startFixQuality: 'none',
    endFixQuality: 'none',
    fixQuality: 'none',
    distanceYards: null,
  });
  assert.equal(canMoveFromPin(logged), false);
  assert.equal(canMoveToPin(logged), false);
  assert.equal(planMoveShotPin(logged, 'to', { lat: 37, lng: -122 }).ok, false);
  assert.equal(planChangeShotClub(logged, 'club_pw').ok, true);
});

test('a placed pin move over 400 saves without the 400-yard ask', () => {
  const gps = shot({ id: 's4' });
  const far = { lat: 37.02, lng: -122 };
  const moved = planMoveShotPin(gps, 'to', far);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.plan.impossibleJump, false);
  assert.ok(moved.plan.distanceYards > MAX_SHOT_YD);
  assert.deepEqual(confirmPlacedShot(moved.plan, false), { status: 'commit' });
  assert.deepEqual(confirmPlacedShot(moved.plan, true), { status: 'commit' });
  assert.equal(moved.plan.fixQuality, null);
});

test('invalid or 0,0 pins are rejected — never invented GPS', () => {
  const gps = shot({ id: 's5' });
  assert.equal(planMoveShotPin(gps, 'from', { lat: 0, lng: 0 }).ok, false);
  assert.equal(planMoveShotPin(gps, 'to', { lat: 99, lng: 0 }).ok, false);
});

test('editing an earlier shot does not read the phone fix or run acceptFix', () => {
  assert.equal(editReadsPhoneFix(), false);
  assert.equal(editRunsAcceptFix(), false);

  const earlier = shot({
    id: 's-early',
    seq: 1,
    startLat: 37.01,
    startLng: -122.01,
    endLat: 37.012,
    endLng: -122.01,
    distanceYards: 150,
  });
  const phone = { lat: 40.7128, lng: -74.006 };
  const club = planChangeShotClub(earlier, 'club_8i');
  assert.equal(club.ok, true);
  if (!club.ok) return;
  assert.equal(club.keepsCoordinates, true);
  assert.equal(club.snapshot.startLat, earlier.startLat);
  assert.equal(club.snapshot.startLng, earlier.startLng);
  assert.equal(club.snapshot.endLat, earlier.endLat);
  assert.equal(club.snapshot.endLng, earlier.endLng);
  assert.equal(club.snapshot.source, 'gps');
  assert.notEqual(club.snapshot.startLat, phone.lat);

  const tap = { lat: 37.013, lng: -122.01 };
  const moved = planMoveShotPin(earlier, 'to', tap);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.to.lat, tap.lat);
  assert.equal(moved.to.lng, tap.lng);
  assert.notEqual(moved.to.lat, phone.lat);
  assert.notEqual(moved.from.lat, phone.lat);
  assert.equal(moved.plan.source, 'placed');
  assert.equal(moved.plan.fixQuality, null);
  assert.equal(includeInDistanceAverages(moved.plan), true);
  assert.equal(
    includeInDistanceAverages({ ...moved.plan, clubId: 'club_putter' }),
    false,
  );

  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const changeStart = actions.indexOf('export function changeShotClub');
  const undoStart = actions.indexOf('export function undoShotEdit');
  assert.ok(changeStart >= 0 && undoStart > changeStart);
  const editFns = actions.slice(changeStart, undoStart);
  assert.doesNotMatch(editFns, /getCurrentFix|resolveMarkFix|getFix|acceptFix|forceMark/);
  assert.match(editFns, /planChangeShotClub/);
  assert.match(editFns, /planMoveShotPin/);
  assert.match(editFns, /confirmPlacedShot/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const editClub = hole.slice(hole.indexOf('const commitEditClub'), hole.indexOf('const commitMovePin'));
  const editMove = hole.slice(hole.indexOf('const commitMovePin'), hole.indexOf('const onUndoEdit'));
  assert.doesNotMatch(editClub, /getCurrentFix|resolveMarkFix|getFix|acceptFix/);
  assert.doesNotMatch(editMove, /getCurrentFix|resolveMarkFix|getFix|acceptFix/);
  assert.doesNotMatch(editMove, /COPY\.tooFar/);
});

test('snapshot is a restore copy of the shot before the edit', () => {
  const gps = shot({ id: 's6', suggested: true });
  const snap = snapshotShot(gps);
  assert.equal(snap.id, 's6');
  assert.equal(snap.clubId, 'club_7i');
  assert.equal(snap.source, 'gps');
  assert.equal(snap.suggested, true);
  assert.equal(snap.startLat, gps.startLat);
  assert.equal(snap.endLat, gps.endLat);
});

const SEED = { typedCarryYards: null, estimatedCarryYards: null };

function chain(): Shot[] {
  return [
    shot({
      id: 's1',
      seq: 1,
      clubId: 'club_7i',
      startLat: 35.1,
      startLng: -92.3,
      endLat: 35.102,
      endLng: -92.3,
      distanceYards: 200,
    }),
    shot({
      id: 's2',
      seq: 2,
      clubId: 'club_6i',
      startLat: 35.102,
      startLng: -92.3,
      endLat: 35.104,
      endLng: -92.3,
      distanceYards: 180,
    }),
    shot({
      id: 's3',
      seq: 3,
      clubId: 'club_pw',
      startLat: 35.104,
      startLng: -92.3,
      endLat: 35.105,
      endLng: -92.3,
      distanceYards: 90,
    }),
  ];
}

test('changing club moves the sample to the new club and keeps the pins', () => {
  const shots = chain();
  const before = clubAverageForShots(shots, 'club_7i', SEED);
  assert.equal(before.count, 1);
  assert.equal(before.avgYards, 200);
  const changed = applyChangeShotClub(shots, 's1', 'club_8i');
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.equal(clubAverageForShots(changed.shots, 'club_7i', SEED).count, 0);
  const next = clubAverageForShots(changed.shots, 'club_8i', SEED);
  assert.equal(next.count, 1);
  assert.equal(next.avgYards, 200);
  const edited = changed.shots[0]!;
  assert.equal(edited.startLat, shots[0]!.startLat);
  assert.equal(edited.endLat, shots[0]!.endLat);
  assert.equal(edited.endLng, shots[0]!.endLng);
  assert.equal(edited.distanceYards, shots[0]!.distanceYards);
  assert.equal(edited.source, 'gps');
  assert.equal(shots[0]!.clubId, 'club_7i');
  assert.equal(applyChangeShotClub(shots, 's1', 'club_putter').ok, false);
});

test('moving a spot updates this shot and the next shot, and saves the dropped pin', () => {
  assert.equal(moveSpotSnaps(), false);
  assert.equal(moveSpotSavesBeforeConfirm(), false);
  assert.equal(moveSpotRewritesPutts(), false);
  assert.equal(moveSpotRewritesPenaltyOrder(), false);
  const shots = chain();
  const dropped = { lat: 35.103, lng: -92.301 };
  const tee = { lat: 35.1, lng: -92.3 };
  const green = { lat: 35.106, lng: -92.3 };
  const moved = applyMoveShotSpot({
    shots,
    shotId: 's1',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  if (moved.status !== 'commit') return;
  assert.equal(moved.point.lat, dropped.lat);
  assert.equal(moved.point.lng, dropped.lng);
  assert.equal(moved.nextId, 's2');
  const first = moved.shots[0]!;
  const second = moved.shots[1]!;
  const third = moved.shots[2]!;
  assert.equal(first.endLat, dropped.lat);
  assert.equal(first.endLng, dropped.lng);
  assert.equal(first.startLat, shots[0]!.startLat);
  assert.equal(first.startLng, shots[0]!.startLng);
  assert.notEqual(first.endLat, tee.lat);
  assert.notEqual(first.endLat, green.lat);
  assert.notEqual(first.endLat, shots[0]!.endLat);
  assert.equal(first.distanceYards, roundYards(haversineYards(
    { lat: first.startLat!, lng: first.startLng! },
    dropped,
  )));
  assert.notEqual(first.distanceYards, shots[0]!.distanceYards);
  assert.equal(first.source, 'placed');
  assert.equal(first.fixQuality, null);
  assert.equal(first.startFixQuality, null);
  assert.equal(first.endFixQuality, null);
  assert.equal(first.startAccuracyM, null);
  assert.equal(first.endAccuracyM, null);
  assert.equal(includeInDistanceAverages(first), true);
  assert.equal(second.startLat, dropped.lat);
  assert.equal(second.startLng, dropped.lng);
  assert.equal(second.endLat, shots[1]!.endLat);
  assert.equal(second.distanceYards, roundYards(haversineYards(
    dropped,
    { lat: second.endLat!, lng: second.endLng! },
  )));
  assert.notEqual(second.distanceYards, shots[1]!.distanceYards);
  assert.equal(second.source, 'placed');
  assert.equal(second.fixQuality, null);
  assert.equal(third.startLat, shots[2]!.startLat);
  assert.equal(third.endLat, shots[2]!.endLat);
  assert.equal(third.distanceYards, shots[2]!.distanceYards);
  assert.equal(third.source, 'gps');
  assert.equal(shots[0]!.endLat, 35.102);
  assert.equal(shots[1]!.startLat, 35.102);
  const beforeDisp = dispersionForShot(shots[0]!, green);
  const afterDisp = dispersionForShot(first, green);
  assert.ok(beforeDisp);
  assert.ok(afterDisp);
  assert.equal(beforeDisp?.placed, false);
  assert.equal(afterDisp?.placed, true);
  assert.notEqual(afterDisp?.along, beforeDisp?.along);
  const avg = clubAverageForShots(moved.shots, 'club_7i', SEED);
  assert.equal(avg.count, 1);
  assert.equal(avg.avgYards, first.distanceYards);
});

test('moving the last shot only changes that shot', () => {
  const shots = chain();
  const dropped = { lat: 35.106, lng: -92.302 };
  const moved = applyMoveShotSpot({
    shots,
    shotId: 's3',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  if (moved.status !== 'commit') return;
  assert.equal(moved.nextId, null);
  assert.equal(moved.shots[0]!.endLat, shots[0]!.endLat);
  assert.equal(moved.shots[0]!.distanceYards, shots[0]!.distanceYards);
  assert.equal(moved.shots[0]!.source, 'gps');
  assert.equal(moved.shots[1]!.startLat, shots[1]!.startLat);
  assert.equal(moved.shots[1]!.endLat, shots[1]!.endLat);
  assert.equal(moved.shots[1]!.distanceYards, shots[1]!.distanceYards);
  assert.equal(moved.shots[1]!.source, 'gps');
  assert.equal(moved.shots[2]!.endLat, dropped.lat);
  assert.equal(moved.shots[2]!.endLng, dropped.lng);
  assert.equal(moved.shots[2]!.startLat, shots[2]!.startLat);
  assert.notEqual(moved.shots[2]!.distanceYards, shots[2]!.distanceYards);
  assert.equal(moved.shots[2]!.clubId, 'club_pw');
});

test('a shot with no stored position is not saved until the pin is dropped and confirmed', () => {
  const blank = shot({
    id: 'blank',
    seq: 1,
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startAccuracyM: null,
    endAccuracyM: null,
    startFixQuality: 'none',
    endFixQuality: 'none',
    fixQuality: 'none',
    distanceYards: null,
    typedYards: 140,
  });
  const next = shot({ id: 'next', seq: 2, startLat: 35.2, startLng: -92.2, endLat: 35.201, endLng: -92.2 });
  const device = { lat: 40.7128, lng: -74.006 };
  const mapCenter = { lat: 35.15, lng: -92.31 };
  assert.equal(shotStoredPosition(blank), null);
  const fromDevice = moveSpotDraftOrigin({ stored: null, device, mapCenter });
  assert.equal(fromDevice?.kind, 'device');
  assert.equal(fromDevice?.point.lat, device.lat);
  assert.equal(fromDevice?.point.lng, device.lng);
  const fromCenter = moveSpotDraftOrigin({ stored: null, device: null, mapCenter });
  assert.equal(fromCenter?.kind, 'map_center');
  assert.equal(fromCenter?.point.lat, mapCenter.lat);
  const storedFirst = moveSpotDraftOrigin({
    stored: { lat: 35.102, lng: -92.3 },
    device,
    mapCenter,
  });
  assert.equal(storedFirst?.kind, 'stored');
  assert.equal(storedFirst?.point.lat, 35.102);
  assert.equal(moveSpotDraftOrigin({ stored: null, device: { lat: 0, lng: 0 }, mapCenter })?.kind, 'map_center');
  assert.equal(frameMapCenter([null, mapCenter])?.lat, mapCenter.lat);

  const cancelled = applyMoveShotSpot({
    shots: [blank, next],
    shotId: 'blank',
    point: device,
    dropped: false,
    confirmed: true,
  });
  assert.equal(cancelled.status, 'cancel');
  if (cancelled.status !== 'cancel') return;
  assert.equal(cancelled.shots[0]!.startLat, null);
  assert.equal(cancelled.shots[0]!.endLat, null);
  assert.equal(cancelled.shots[0]!.distanceYards, null);
  assert.equal(cancelled.shots[0]!.source, 'no_gps');
  assert.equal(cancelled.shots[0]!.typedYards, 140);
  assert.equal(cancelled.shots[1]!.startLat, next.startLat);
  assert.equal(blank.endLat, null);

  const unconfirmed = applyMoveShotSpot({
    shots: [blank, next],
    shotId: 'blank',
    point: { lat: 35.2, lng: -92.25 },
    dropped: true,
    confirmed: false,
  });
  assert.equal(unconfirmed.status, 'cancel');
  if (unconfirmed.status !== 'cancel') return;
  assert.equal(unconfirmed.shots[0]!.endLat, null);

  const dropped = { lat: 35.22, lng: -92.255 };
  const saved = applyMoveShotSpot({
    shots: [blank, next],
    shotId: 'blank',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(saved.status, 'commit');
  if (saved.status !== 'commit') return;
  assert.equal(saved.shots[0]!.endLat, dropped.lat);
  assert.equal(saved.shots[0]!.endLng, dropped.lng);
  assert.equal(saved.shots[0]!.startLat, null);
  assert.equal(saved.shots[0]!.startLng, null);
  assert.equal(saved.shots[0]!.distanceYards, null);
  assert.equal(saved.shots[0]!.typedYards, 140);
  assert.equal(saved.shots[0]!.source, 'placed');
  assert.equal(saved.shots[0]!.fixQuality, null);
  assert.notEqual(saved.shots[0]!.endLat, device.lat);
  assert.notEqual(saved.shots[0]!.endLat, mapCenter.lat);
  assert.equal(saved.shots[1]!.startLat, next.startLat);
  assert.equal(saved.shots[1]!.distanceYards, next.distanceYards);
  assert.equal(saved.nextId, null);
  assert.equal(applyMoveShotSpot({
    shots: [blank],
    shotId: 'blank',
    point: { lat: 0, lng: 0 },
    dropped: true,
    confirmed: true,
  }).status, 'rejected');
});

test('move spot does not pull a neighbor that was not measured from this spot', () => {
  const shots = chain();
  shots[1] = { ...shots[1]!, startLat: 36, startLng: -90 };
  const dropped = { lat: 35.103, lng: -92.3 };
  const moved = applyMoveShotSpot({
    shots,
    shotId: 's1',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  if (moved.status !== 'commit') return;
  assert.equal(moved.nextId, null);
  assert.equal(moved.shots[1]!.startLat, 36);
  assert.equal(moved.shots[1]!.distanceYards, shots[1]!.distanceYards);
  assert.equal(moved.shots[0]!.endLat, dropped.lat);
});

test('both screens offer Change club, Move spot, and Delete on the shot sheet', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  const holeSheet = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(holeSheet, /label=\{COPY\.changeClub\}/);
  assert.match(holeSheet, /label=\{COPY\.moveSpot\}/);
  assert.match(holeSheet, /label=\{COPY\.deleteShot\}/);
  assert.match(holeSheet, /onDeleteShot\(editingShot\.id\)/);
  assert.match(hole, /moveSpotDraftOrigin/);
  assert.match(hole, /if \(!editShotId \|\| !moveSpotDropped\) return/);
  const reviewSheet = review.slice(review.indexOf('visible={editOpen && !clubOpen}'), review.indexOf('visible={clubOpen}'));
  assert.match(reviewSheet, /COPY\.changeClub/);
  assert.match(reviewSheet, /COPY\.moveSpot/);
  assert.match(reviewSheet, /COPY\.deleteShot/);
  assert.match(reviewSheet, /onDeleteShot\(editingShot\.id\)/);
  assert.match(review, /deleteShotPrompt/);
  assert.match(review, /moveSpotDraftOrigin/);
  assert.match(review, /if \(!stored\)/);
  assert.match(review, /userFix=\{null\}/);
  const commit = review.slice(review.indexOf('const commitMoveSpot'), review.indexOf('const commitClub'));
  assert.match(commit, /if \(!hole \|\| !editShotId \|\| !moveDraft \|\| !moveDropped\) return/);
  assert.doesNotMatch(commit, /getCurrentFix|acceptFix|forceMark/);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const service = actions.slice(actions.indexOf('export function moveShotSpot'), actions.indexOf('export async function takeDrop'));
  assert.match(service, /moveShotSpotOnHole/);
  assert.doesNotMatch(service, /getCurrentFix|acceptFix|forceMark/);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const repoFn = repo.slice(repo.indexOf('export function moveShotSpotOnHole'), repo.indexOf('export function reopenShot'));
  assert.match(repoFn, /applyMoveShotSpot/);
  assert.doesNotMatch(repoFn, /hole_penalties|UPDATE holes|updateHoleScore|persistRecomputedHoleScore|putts/);
});

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();

function memoryDb(): SQLiteDatabase {
  if (!DatabaseSync) throw new Error('node:sqlite unavailable');
  const raw = new DatabaseSync(':memory:');
  const args = (params?: unknown[]) => (params ?? []) as (string | number | null)[];
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params?: unknown[]) => raw.prepare(sql).run(...args(params)),
    getAllSync: (sql: string, params?: unknown[]) => raw.prepare(sql).all(...args(params)),
    getFirstSync: (sql: string, params?: unknown[]) => raw.prepare(sql).get(...args(params)) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params?: unknown[]) => statement.run(...args(params)), finalizeSync: () => {} };
    },
    withTransactionSync: (run: () => void) => {
      raw.exec('BEGIN');
      try {
        run();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  const wrapped = db as unknown as SQLiteDatabase;
  migrate(wrapped);
  return wrapped;
}

function insertGpsShot(
  db: SQLiteDatabase,
  args: {
    id: string;
    holeId: string;
    clubId: string;
    seq: number;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    yards: number;
    startedAt?: string;
  },
): void {
  const stamp = args.startedAt ?? '2026-06-01T18:00:00.000Z';
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq,
      start_lat, start_lng, start_accuracy_m, start_fix_quality,
      end_lat, end_lng, end_accuracy_m, end_fix_quality,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, 5, 'good', ?, ?, 6, 'good', ?, 'good', 0, ?, ?, 'gps')`,
    [
      args.id,
      args.holeId,
      args.clubId,
      args.seq,
      args.startLat,
      args.startLng,
      args.endLat,
      args.endLng,
      args.yards,
      stamp,
      stamp,
    ],
  );
}

test('saved club and spot round-trip, and putts, score, and penalty order stay put', {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const legacy = acceptTransferShot({
    clubId: 'club_7i',
    seq: 1,
    start: { lat: 35.1, lng: -92.3 },
    end: { lat: 35.102, lng: -92.3 },
    source: 'gps',
    startedAt: '2026-06-01T18:00:00.000Z',
    distanceYards: 200,
  });
  assert.equal(legacy?.clubId, 'club_7i');
  assert.equal(legacy?.source, 'gps');

  const db = memoryDb();
  const round = startRound(db, 18, 'North Hills');
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  if (!hole) return;
  insertGpsShot(db, {
    id: 's1',
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 1,
    startLat: 35.1,
    startLng: -92.3,
    endLat: 35.102,
    endLng: -92.3,
    yards: 150,
  });
  insertGpsShot(db, {
    id: 's2',
    holeId: hole.id,
    clubId: 'club_6i',
    seq: 2,
    startLat: 35.102,
    startLng: -92.3,
    endLat: 35.104,
    endLng: -92.3,
    yards: 150,
  });
  const penalty = insertPenalty(db, {
    holeId: hole.id,
    par: hole.par,
    currentScore: hole.score,
    strokes: 1,
    reason: 'water',
    note: null,
    afterShotId: 's1',
    afterShotSeq: 1,
  });
  db.runSync('UPDATE holes SET putts = 2, score = 5, putts_done = 1 WHERE id = ?', [hole.id]);
  const before7 = listClubAverages(db).find((row) => row.club.id === 'club_7i');
  const before6 = listClubAverages(db).find((row) => row.club.id === 'club_6i');
  assert.equal(before7?.count, 1);
  assert.equal(before6?.count, 1);

  const untouched = moveShotSpotOnHole(db, {
    roundId: round.id,
    holeNumber: 1,
    shotId: 's1',
    point: { lat: 35.103, lng: -92.3 },
    dropped: false,
    confirmed: false,
  });
  assert.equal(untouched.status, 'cancel');
  assert.equal(getShot(db, 's1')?.endLat, 35.102);
  assert.equal(getShot(db, 's1')?.clubId, 'club_7i');
  assert.equal(getShot(db, 's1')?.source, 'gps');

  updateShotClub(db, 's1', 'club_8i');
  const afterClub = getShot(db, 's1');
  assert.equal(afterClub?.clubId, 'club_8i');
  assert.equal(afterClub?.source, 'gps');
  assert.equal(afterClub?.endLat, 35.102);
  assert.equal(afterClub?.distanceYards, 150);
  const movedClub = listClubAverages(db);
  assert.equal(movedClub.find((row) => row.club.id === 'club_7i')?.count, 0);
  assert.equal(movedClub.find((row) => row.club.id === 'club_8i')?.count, 1);

  const dropped = { lat: 35.103, lng: -92.301 };
  const moved = moveShotSpotOnHole(db, {
    roundId: round.id,
    holeNumber: 1,
    shotId: 's1',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  const first = getShot(db, 's1');
  const second = getShot(db, 's2');
  assert.equal(first?.endLat, dropped.lat);
  assert.equal(first?.endLng, dropped.lng);
  assert.equal(first?.source, 'placed');
  assert.equal(first?.fixQuality, null);
  assert.equal(second?.startLat, dropped.lat);
  assert.equal(second?.startLng, dropped.lng);
  assert.notEqual(first?.distanceYards, 150);
  assert.notEqual(second?.distanceYards, 150);
  const holeAfter = getHole(db, round.id, 1);
  assert.equal(holeAfter?.putts, 2);
  assert.equal(holeAfter?.score, 5);
  const penalties = listPenaltiesForHole(db, hole.id);
  assert.equal(penalties.length, 1);
  assert.equal(penalties[0]?.id, penalty.penalty.id);
  assert.equal(penalties[0]?.afterShotId, 's1');
  assert.equal(penalties[0]?.afterShotSeq, 1);
  assert.equal(penalties[0]?.strokes, 1);

  const csv = collectRoundCsv(db).shotsCsv;
  assert.match(csv, /8i/);
  assert.match(csv, new RegExp(String(dropped.lat)));
  assert.match(csv, /Placed/);

  const exported = serializeRoundHistory(collectRoundHistoryExport(db, '2026-06-02T00:00:00.000Z'));
  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, exported);
  assert.equal(restored.ok, true);
  const restoredHole = getHole(fresh, round.id, 1);
  assert.ok(restoredHole);
  if (!restoredHole) return;
  const restoredShots = listShotsForHole(fresh, restoredHole.id);
  const restoredFirst = restoredShots.find((row) => row.seq === 1);
  const restoredSecond = restoredShots.find((row) => row.seq === 2);
  assert.equal(restoredFirst?.clubId, 'club_8i');
  assert.equal(restoredFirst?.endLat, dropped.lat);
  assert.equal(restoredFirst?.endLng, dropped.lng);
  assert.equal(restoredFirst?.source, 'placed');
  assert.equal(restoredFirst?.fixQuality, null);
  assert.equal(restoredSecond?.startLat, dropped.lat);
  assert.equal(restoredSecond?.startLng, dropped.lng);
  assert.equal(restoredHole.putts, 2);
  assert.equal(restoredHole.score, 5);
});

/** Same line Show numbers builds. DispersionPlot must keep `point.placed ? \` · ${COPY.placed}\``. */
function showNumbersLabel(point: {
  playedAt: string;
  courseName: string;
  holeNumber: number;
  placed: boolean;
}): string {
  return `${formatHistoryDate(point.playedAt)} · ${point.courseName} · H${point.holeNumber}${
    point.placed ? ` · ${COPY.placed}` : ''
  }`;
}

test('a hand-moved GPS shot is Placed on Dispersion; a club change leaves the source', {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'North Hills');
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  if (!hole) return;
  setHoleGreen(db, hole.id, { lat: 35.104, lng: -92.3, source: 'course_centroid' });
  insertGpsShot(db, {
    id: 'gps-1',
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 1,
    startLat: 35.1,
    startLng: -92.3,
    endLat: 35.102,
    endLng: -92.3,
    yards: 150,
  });

  const before = planDispersion(listDispersionShots(db), 'club_7i');
  assert.equal(before.count, 1);
  assert.equal(before.placed, 0);
  assert.equal(formatDispersionPlacedNote(before.placed), null);
  assert.equal(before.points[0]?.placed, false);
  assert.equal(showNumbersLabel(before.points[0]!).includes('Placed'), false);
  assert.equal(getShot(db, 'gps-1')?.source, 'gps');

  updateShotClub(db, 'gps-1', 'club_8i');
  const clubOnly = getShot(db, 'gps-1');
  assert.equal(clubOnly?.clubId, 'club_8i');
  assert.equal(clubOnly?.source, 'gps');
  assert.equal(clubOnly?.fixQuality, 'good');
  assert.equal(clubOnly?.endLat, 35.102);
  const afterClub = planDispersion(listDispersionShots(db), 'club_8i');
  assert.equal(afterClub.placed, 0);
  assert.equal(formatDispersionPlacedNote(afterClub.placed), null);
  assert.equal(showNumbersLabel(afterClub.points[0]!).endsWith(' · Placed'), false);

  const dropped = { lat: 35.103, lng: -92.301 };
  const moved = moveShotSpotOnHole(db, {
    roundId: round.id,
    holeNumber: 1,
    shotId: 'gps-1',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  const saved = getShot(db, 'gps-1');
  assert.equal(saved?.source, 'placed');
  assert.equal(saved?.fixQuality, null);
  assert.equal(saved?.endLat, dropped.lat);
  assert.equal(saved?.endLng, dropped.lng);
  assert.equal(saved?.clubId, 'club_8i');

  const plan = planDispersion(listDispersionShots(db), 'club_8i');
  assert.equal(plan.count, 1);
  assert.equal(plan.placed, 1);
  assert.equal(plan.points[0]?.placed, true);
  assert.equal(
    formatDispersionPlacedNote(plan.placed),
    'Includes 1 placed shot. Placed shots are set by hand and may be less accurate than GPS-marked ones.',
  );
  assert.equal(showNumbersLabel(plan.points[0]!).endsWith(' · Placed'), true);
  assert.equal(planDispersion(listDispersionShots(db), 'club_7i').count, 0);
});

test('a club change updates both clubs and switches the five-shot label', {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const db = memoryDb();
  updateClubCarry(db, 'club_5i', 170);
  updateClubCarry(db, 'club_6i', 160);
  updateClubCarry(db, 'club_9i', 130);
  const round = startRound(db, 18, 'North Hills');
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  if (!hole) return;

  const sevenYards = [145, 148, 150, 152, 155];
  sevenYards.forEach((yards, index) => {
    insertGpsShot(db, {
      id: `7i-${index}`,
      holeId: hole.id,
      clubId: 'club_7i',
      seq: index + 1,
      startLat: 35.1,
      startLng: -92.3,
      endLat: 35.102,
      endLng: -92.3,
      yards,
    });
  });
  const eightYards = [136, 138, 140, 142];
  eightYards.forEach((yards, index) => {
    insertGpsShot(db, {
      id: `8i-${index}`,
      holeId: hole.id,
      clubId: 'club_8i',
      seq: sevenYards.length + index + 1,
      startLat: 35.1,
      startLng: -92.3,
      endLat: 35.102,
      endLng: -92.3,
      yards,
    });
  });

  const before = listClubAverages(db);
  const before7 = before.find((row) => row.club.id === 'club_7i');
  const before8 = before.find((row) => row.club.id === 'club_8i');
  assert.equal(before7?.count, 5);
  assert.equal(before7?.avgYards, 150);
  assert.equal(before7?.bag.kind, 'live');
  assert.equal(clubCarryMeta(before7!.bag), '5 shots');
  assert.equal(before8?.count, 4);
  assert.equal(before8?.avgYards, 139);
  assert.equal(before8?.bag.kind, 'estimated');
  assert.equal(clubCarryMeta(before8!.bag), 'Estimated · 4 shots');

  updateShotClub(db, '7i-4', 'club_8i');
  const moved = getShot(db, '7i-4');
  assert.equal(moved?.clubId, 'club_8i');
  assert.equal(moved?.source, 'gps');
  assert.equal(moved?.distanceYards, 155);

  const after = listClubAverages(db);
  const after7 = after.find((row) => row.club.id === 'club_7i');
  const after8 = after.find((row) => row.club.id === 'club_8i');
  assert.equal(after7?.count, 4);
  assert.equal(after7?.avgYards, 148.75);
  assert.ok((after7?.avgYards ?? 0) < (before7?.avgYards ?? 0));
  assert.equal(after7?.bag.kind, 'estimated');
  assert.equal(clubCarryMeta(after7!.bag), 'Estimated · 4 shots');
  assert.equal(after8?.count, 5);
  assert.equal(after8?.avgYards, 142.2);
  assert.ok((after8?.avgYards ?? 0) > (before8?.avgYards ?? 0));
  assert.equal(after8?.bag.kind, 'live');
  assert.equal(after8?.bag.yards, 142);
  assert.equal(clubCarryMeta(after8!.bag), '5 shots');
});

test('the update line follows a club change on both clubs', {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const db = memoryDb();
  updateClubCarry(db, 'club_7i', 200);
  updateClubCarry(db, 'club_8i', 220);
  const round = startRound(db, 18, 'North Hills');
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  if (!hole) return;

  for (let i = 0; i < 5; i += 1) {
    insertGpsShot(db, {
      id: `far-7-${i}`,
      holeId: hole.id,
      clubId: 'club_7i',
      seq: i + 1,
      startLat: 35.1,
      startLng: -92.3,
      endLat: 35.102,
      endLng: -92.3,
      yards: 150,
      startedAt: `2026-06-01T18:00:0${i}.000Z`,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    insertGpsShot(db, {
      id: `far-8-${i}`,
      holeId: hole.id,
      clubId: 'club_8i',
      seq: i + 6,
      startLat: 35.1,
      startLng: -92.3,
      endLat: 35.102,
      endLng: -92.3,
      yards: 140,
      startedAt: `2026-06-01T18:00:1${i}.000Z`,
    });
  }

  const before = listClubAverages(db);
  const before7 = before.find((row) => row.club.id === 'club_7i');
  const before8 = before.find((row) => row.club.id === 'club_8i');
  assert.equal(before7?.suggestion?.yards, 150);
  assert.equal(
    formatBagCarrySuggestion(before7!.club.name, before7!.suggestion!.yards),
    'Your last five 7 Iron shots averaged 150. Update your 7 Iron to 150?',
  );
  assert.equal(before8?.suggestion, null);

  updateShotClub(db, 'far-7-4', 'club_8i');
  assert.equal(getShot(db, 'far-7-4')?.source, 'gps');

  const after = listClubAverages(db);
  const after7 = after.find((row) => row.club.id === 'club_7i');
  const after8 = after.find((row) => row.club.id === 'club_8i');
  assert.equal(after7?.suggestion, null);
  assert.equal(after8?.suggestion?.yards, 142);
  assert.equal(
    formatBagCarrySuggestion(after8!.club.name, after8!.suggestion!.yards),
    'Your last five 8 Iron shots averaged 142. Update your 8 Iron to 142?',
  );
});

test('editing a Yard Test round leaves club stats and dispersion untouched', {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const db = memoryDb();
  const real = startRound(db, 9, 'Fixture');
  const realHole = getHole(db, real.id, 1);
  assert.ok(realHole);
  if (!realHole) return;
  setHoleGreen(db, realHole.id, { lat: 35.104, lng: -92.3, source: 'course_centroid' });
  insertGpsShot(db, {
    id: 'real-7',
    holeId: realHole.id,
    clubId: 'club_7i',
    seq: 1,
    startLat: 35.1,
    startLng: -92.3,
    endLat: 35.102,
    endLng: -92.3,
    yards: 150,
  });

  const testRound = startRound(db, 9, 'Yard Test', { apiId: YARD_TEST_COURSE_ID });
  assert.equal(testRound.isTest, true);
  const testHole = getHole(db, testRound.id, 1);
  assert.ok(testHole);
  if (!testHole) return;
  insertGpsShot(db, {
    id: 'test-7',
    holeId: testHole.id,
    clubId: 'club_7i',
    seq: 1,
    startLat: 35.2,
    startLng: -92.4,
    endLat: 35.202,
    endLng: -92.4,
    yards: 170,
  });

  const fingerprint = () => ({
    clubs: listClubAverages(db).map((row) => ({
      id: row.club.id,
      count: row.count,
      avgYards: row.avgYards,
      meta: clubCarryMeta(row.bag),
      suggestion: row.suggestion
        ? formatBagCarrySuggestion(row.club.name, row.suggestion.yards)
        : null,
    })),
    dispersion: listDispersionShots(db).map((shot) => ({
      shotId: shot.shotId,
      clubId: shot.clubId,
      source: shot.source,
      distanceYards: shot.distanceYards,
    })),
  });
  const before = fingerprint();
  assert.equal(before.clubs.find((row) => row.id === 'club_7i')?.count, 1);
  assert.equal(before.dispersion.length, 1);
  assert.equal(before.dispersion[0]?.source, 'gps');

  updateShotClub(db, 'test-7', 'club_8i');
  const dropped = { lat: 35.203, lng: -92.401 };
  const moved = moveShotSpotOnHole(db, {
    roundId: testRound.id,
    holeNumber: 1,
    shotId: 'test-7',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  const edited = getShot(db, 'test-7');
  assert.equal(edited?.clubId, 'club_8i');
  assert.equal(edited?.source, 'placed');
  assert.equal(edited?.endLat, dropped.lat);
  assert.equal(edited?.endLng, dropped.lng);
  assert.deepEqual(fingerprint(), before);
});

test("export and restore keep a moved shot's new spot and Placed source", {
  skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+',
}, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'North Hills');
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  if (!hole) return;
  setHoleGreen(db, hole.id, { lat: 35.104, lng: -92.3, source: 'course_centroid' });
  insertGpsShot(db, {
    id: 'move-1',
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 1,
    startLat: 35.1,
    startLng: -92.3,
    endLat: 35.102,
    endLng: -92.3,
    yards: 150,
  });
  assert.equal(getShot(db, 'move-1')?.source, 'gps');

  const dropped = { lat: 35.103, lng: -92.301 };
  const moved = moveShotSpotOnHole(db, {
    roundId: round.id,
    holeNumber: 1,
    shotId: 'move-1',
    point: dropped,
    dropped: true,
    confirmed: true,
  });
  assert.equal(moved.status, 'commit');
  assert.equal(getShot(db, 'move-1')?.source, 'placed');

  const exported = serializeRoundHistory(collectRoundHistoryExport(db, '2026-06-02T00:00:00.000Z'));
  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, exported);
  assert.equal(restored.ok, true);
  const restoredHole = getHole(fresh, round.id, 1);
  assert.ok(restoredHole);
  if (!restoredHole) return;
  const shot = listShotsForHole(fresh, restoredHole.id).find((row) => row.seq === 1);
  assert.equal(shot?.source, 'placed');
  assert.equal(shot?.fixQuality, null);
  assert.equal(shot?.clubId, 'club_7i');
  assert.equal(shot?.startLat, 35.1);
  assert.equal(shot?.startLng, -92.3);
  assert.equal(shot?.endLat, dropped.lat);
  assert.equal(shot?.endLng, dropped.lng);

  const plan = planDispersion(listDispersionShots(fresh), 'club_7i');
  assert.equal(plan.placed, 1);
  assert.equal(plan.points[0]?.placed, true);
  assert.equal(showNumbersLabel(plan.points[0]!).endsWith(' · Placed'), true);
  assert.match(collectRoundCsv(fresh).shotsCsv, /Placed/);
  assert.match(collectRoundCsv(fresh).shotsCsv, new RegExp(String(dropped.lat)));
});
