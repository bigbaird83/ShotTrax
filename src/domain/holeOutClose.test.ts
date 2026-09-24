import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  closeOpenShotToExistingPin,
  finishHoleOut,
  getHole,
  insertOpenShot,
  listShotsForHole,
  setHoleGreen,
  startRound,
} from '../db/repo';
import { migrate } from '../db/schema';
import { haversineYards, roundYards } from './haversine';
import { planHoleOutCloseToPin } from './holeOutClose';
import { hasClosedGpsTrail } from './shotSource';

/** Fixture pins for this test only. Not a course and not a live GPS sample. */
const FIXTURE_TEE = { lat: 36.568, lng: -121.95 };
const FIXTURE_MARK = { lat: 36.57, lng: -121.95 };
const FIXTURE_PIN = { lat: 36.572, lng: -121.95 };
const FIXTURE_OTHER_PIN = { lat: 36.5735, lng: -121.949 };

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

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
  migrate(db as unknown as SQLiteDatabase);
  return db as unknown as SQLiteDatabase;
}

test('planHoleOutCloseToPin uses the stored mark and an existing pin only', () => {
  const planned = planHoleOutCloseToPin({
    shotId: 'approach',
    start: FIXTURE_MARK,
    startFixQuality: 'good',
    pin: FIXTURE_PIN,
  });
  assert.ok(planned);
  assert.equal(planned.shotId, 'approach');
  assert.equal(planned.endLat, FIXTURE_PIN.lat);
  assert.equal(planned.endLng, FIXTURE_PIN.lng);
  assert.equal(planned.endAccuracyM, null);
  assert.equal(planned.endFixQuality, null);
  assert.equal(planned.fixQuality, 'good');
  assert.equal(planned.impossibleJump, false);
  assert.equal(planned.distanceYards, roundYards(haversineYards(FIXTURE_MARK, FIXTURE_PIN)));
  assert.ok(planned.distanceYards > 0);
  assert.equal(
    planHoleOutCloseToPin({
      shotId: 'approach',
      start: FIXTURE_MARK,
      startFixQuality: 'good',
      pin: null,
    }),
    null,
  );
  assert.equal(
    planHoleOutCloseToPin({
      shotId: 'approach',
      start: FIXTURE_MARK,
      startFixQuality: 'soft',
      pin: { lat: 0, lng: 0 },
    }),
    null,
  );
  assert.equal(
    planHoleOutCloseToPin({
      shotId: '',
      start: FIXTURE_MARK,
      startFixQuality: 'good',
      pin: FIXTURE_PIN,
    }),
    null,
  );
});

test('club then hole out keeps one closed shot from the mark to the pin', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  setHoleGreen(db, hole.id, { ...FIXTURE_PIN, source: 'course_centroid' });
  const driveId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_driver',
    seq: 1,
    lat: FIXTURE_TEE.lat,
    lng: FIXTURE_TEE.lng,
    accuracyM: 6,
    startFixQuality: 'good',
  });
  applyClosedShot(db, {
    shotId: driveId,
    endLat: FIXTURE_MARK.lat,
    endLng: FIXTURE_MARK.lng,
    endAccuracyM: 8,
    endFixQuality: 'good',
    distanceYards: roundYards(haversineYards(FIXTURE_TEE, FIXTURE_MARK)),
    impossibleJump: false,
    fixQuality: 'good',
  });
  const approachId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 2,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 5,
    startFixQuality: 'good',
  });

  const sealed = closeOpenShotToExistingPin(db, hole.id, FIXTURE_PIN);
  finishHoleOut(db, hole.id);

  const shots = listShotsForHole(db, hole.id);
  const drive = shots.find((shot) => shot.id === driveId);
  const approach = shots.find((shot) => shot.id === approachId);
  const finished = getHole(db, round.id, 1);
  assert.equal(sealed, true);
  assert.equal(shots.length, 2);
  assert.ok(drive);
  assert.equal(drive.clubId, 'club_driver');
  assert.equal(drive.startLat, FIXTURE_TEE.lat);
  assert.equal(drive.startLng, FIXTURE_TEE.lng);
  assert.equal(drive.endLat, FIXTURE_MARK.lat);
  assert.equal(drive.endLng, FIXTURE_MARK.lng);
  assert.equal(drive.holeOut, false);
  assert.ok(approach);
  assert.equal(approach.clubId, 'club_7i');
  assert.equal(approach.startLat, FIXTURE_MARK.lat);
  assert.equal(approach.startLng, FIXTURE_MARK.lng);
  assert.equal(approach.endLat, FIXTURE_PIN.lat);
  assert.equal(approach.endLng, FIXTURE_PIN.lng);
  assert.equal(approach.distanceYards, roundYards(haversineYards(FIXTURE_MARK, FIXTURE_PIN)));
  assert.ok(approach.endedAt);
  assert.equal(approach.holeOut, true);
  assert.equal(approach.endAccuracyM, null);
  assert.equal(approach.endFixQuality, null);
  assert.equal(approach.fixQuality, 'good');
  assert.equal(hasClosedGpsTrail(approach), true);
  assert.equal(finished?.score, 2);
  assert.equal(finished?.putts, 0);
  assert.equal(finished?.puttsDone, true);
});

test('hole out uses the caller pin when it differs from the stored green', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  setHoleGreen(db, hole.id, { ...FIXTURE_PIN, source: 'course_centroid' });
  const approachId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_sw',
    seq: 1,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 7,
    startFixQuality: 'soft',
  });
  assert.equal(closeOpenShotToExistingPin(db, hole.id, FIXTURE_OTHER_PIN), true);
  const shot = listShotsForHole(db, hole.id).find((row) => row.id === approachId);
  assert.ok(shot);
  assert.equal(shot.endLat, FIXTURE_OTHER_PIN.lat);
  assert.equal(shot.endLng, FIXTURE_OTHER_PIN.lng);
  assert.equal(shot.clubId, 'club_sw');
  assert.equal(shot.startLat, FIXTURE_MARK.lat);
  assert.equal(getHole(db, round.id, 1)?.greenLat, FIXTURE_PIN.lat);
});

test('hole out falls back to the green already stored on the hole', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  setHoleGreen(db, hole.id, { ...FIXTURE_PIN, source: 'course_centroid' });
  insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_pw',
    seq: 1,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 4,
    startFixQuality: 'good',
  });
  assert.equal(closeOpenShotToExistingPin(db, hole.id, null), true);
  const shot = listShotsForHole(db, hole.id)[0];
  assert.equal(shot?.endLat, FIXTURE_PIN.lat);
  assert.equal(shot?.endLng, FIXTURE_PIN.lng);
  assert.equal(shot?.startLat, FIXTURE_MARK.lat);
});

test('no existing pin does not invent an end, and the open shot is still there', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  assert.equal(hole.greenLat, null);
  const shotId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_8i',
    seq: 1,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 5,
    startFixQuality: 'good',
  });
  assert.equal(closeOpenShotToExistingPin(db, hole.id, null), false);
  finishHoleOut(db, hole.id);
  const shots = listShotsForHole(db, hole.id);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]?.id, shotId);
  assert.equal(shots[0]?.endLat, null);
  assert.equal(shots[0]?.endLng, null);
  assert.equal(shots[0]?.startLat, FIXTURE_MARK.lat);
  assert.equal(shots[0]?.clubId, 'club_8i');
  assert.equal(shots[0]?.holeOut, true);
  assert.equal(getHole(db, round.id, 1)?.score, 1);
  assert.equal(getHole(db, round.id, 1)?.greenLat, null);
});

test('marked shots then hole out keep their pins', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  setHoleGreen(db, hole.id, { ...FIXTURE_PIN, source: 'course_centroid' });
  const driveId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_driver',
    seq: 1,
    lat: FIXTURE_TEE.lat,
    lng: FIXTURE_TEE.lng,
    accuracyM: 6,
    startFixQuality: 'good',
  });
  applyClosedShot(db, {
    shotId: driveId,
    endLat: FIXTURE_MARK.lat,
    endLng: FIXTURE_MARK.lng,
    endAccuracyM: 6,
    endFixQuality: 'good',
    distanceYards: 180,
    impossibleJump: false,
    fixQuality: 'good',
  });
  const wedgeId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_sw',
    seq: 2,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 5,
    startFixQuality: 'good',
  });
  applyClosedShot(db, {
    shotId: wedgeId,
    endLat: FIXTURE_PIN.lat,
    endLng: FIXTURE_PIN.lng,
    endAccuracyM: 5,
    endFixQuality: 'good',
    distanceYards: 40,
    impossibleJump: false,
    fixQuality: 'good',
  });
  assert.equal(closeOpenShotToExistingPin(db, hole.id, FIXTURE_PIN), false);
  finishHoleOut(db, hole.id);
  const shots = listShotsForHole(db, hole.id);
  assert.equal(shots.length, 2);
  assert.equal(shots[0]?.id, driveId);
  assert.equal(shots[0]?.endLat, FIXTURE_MARK.lat);
  assert.equal(shots[0]?.holeOut, false);
  assert.equal(shots[1]?.id, wedgeId);
  assert.equal(shots[1]?.endLat, FIXTURE_PIN.lat);
  assert.equal(shots[1]?.endLng, FIXTURE_PIN.lng);
  assert.equal(shots[1]?.distanceYards, 40);
  assert.equal(shots[1]?.clubId, 'club_sw');
  assert.equal(shots[1]?.holeOut, true);
  assert.equal(getHole(db, round.id, 1)?.score, 2);
});

test('club pick without hole out leaves the shot open', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  setHoleGreen(db, hole.id, { ...FIXTURE_PIN, source: 'course_centroid' });
  const shotId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 1,
    lat: FIXTURE_MARK.lat,
    lng: FIXTURE_MARK.lng,
    accuracyM: 5,
    startFixQuality: 'good',
  });
  const shots = listShotsForHole(db, hole.id);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]?.id, shotId);
  assert.equal(shots[0]?.endedAt, null);
  assert.equal(shots[0]?.endLat, null);
  assert.equal(shots[0]?.clubId, 'club_7i');
  assert.equal(shots[0]?.holeOut, false);
  assert.equal(getHole(db, round.id, 1)?.score, null);
  assert.equal(getHole(db, round.id, 1)?.puttsDone, false);
});

test('Hole out seals the open club shot before scoring; club pick and putts do not', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const finish = hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const onAddPenalty'));
  const pinAt = finish.indexOf('closeOpenShotToExistingPin');
  const approachAt = finish.indexOf('closeApproachBeforePutts');
  const flagAt = finish.indexOf('finishHoleOut');
  assert.ok(pinAt >= 0 && approachAt > pinAt && flagAt > approachAt);
  assert.doesNotMatch(finish, /addPlacedShot|insertNoGpsShot|insertOpenShot|club_putter/);

  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  const watchPin = watchFn.indexOf('closeOpenShotToExistingPin');
  const watchApproach = watchFn.indexOf('closeApproachBeforePutts');
  const watchFlag = watchFn.indexOf('finishHoleOut');
  assert.ok(watchPin >= 0 && watchApproach > watchPin && watchFlag > watchApproach);
  assert.doesNotMatch(watchFn, /addPlacedShot|insertNoGpsShot|insertOpenShot/);

  const openPutt = hole.slice(hole.indexOf('const openPuttSheet'), hole.indexOf('const saveDraft'));
  assert.match(openPutt, /closeApproachBeforePutts/);
  assert.doesNotMatch(openPutt, /closeOpenShotToExistingPin/);

  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const markFn = actions.slice(actions.indexOf('export async function markShotWithClub'), actions.indexOf('export async function endOpenShot'));
  assert.doesNotMatch(markFn, /closeOpenShotToExistingPin|planHoleOutCloseToPin/);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const finishOut = repo.slice(repo.indexOf('export function finishHoleOut'), repo.indexOf('export function sealOpenShotWithoutGps'));
  assert.doesNotMatch(finishOut, /closeOpenShotToExistingPin|planHoleOutCloseToPin|end_lat/);
  const seal = repo.slice(repo.indexOf('export function closeOpenShotToExistingPin'), repo.indexOf('export function attachHolePuttLength'));
  assert.match(seal, /planHoleOutCloseToPin/);
  assert.match(seal, /getOpenShotForHole/);
  assert.doesNotMatch(seal, /INSERT INTO shots|insertOpenShot|acceptFix|getCurrentFix/);
});
