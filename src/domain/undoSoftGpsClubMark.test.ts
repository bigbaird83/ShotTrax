import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  getHole,
  getRound,
  insertOpenShot,
  listRounds,
  listShotsForHole,
  setRoundLastClub,
  startRound,
  undoLastSoftGpsClubMark as undoLastSoftGpsClubMarkInRepo,
} from '../db/repo';
import { migrate } from '../db/schema';
import type { Shot } from './types';
import { WATCH_MESSAGE_TYPES } from './watchMessages';
import {
  isSoftGpsClubMark,
  planUndoLastSoftGpsClubMark,
  undoLastSoftGpsClubMarkClearsHole,
  undoLastSoftGpsClubMarkScope,
  undoLastSoftGpsClubMarkStartsRound,
} from './undoSoftGpsClubMark';

function shot(partial: Partial<Shot> & { id: string; seq: number }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    startLat: 1,
    startLng: 2,
    startAccuracyM: 20,
    startFixQuality: 'soft',
    endLat: null,
    endLng: null,
    endAccuracyM: null,
    endFixQuality: null,
    distanceYards: null,
    typedYards: null,
    fixQuality: 'soft',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: null,
    source: 'gps',
    suggested: false,
    holeOut: false,
    ...partial,
  };
}

test('a Soft GPS club mark is a live club tap saved at soft accuracy', () => {
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1 })), true);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, startFixQuality: 'good', fixQuality: 'soft' })), false);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, startFixQuality: 'forced' })), false);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, clubId: null })), false);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, source: 'placed', startFixQuality: null, fixQuality: null })), false);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, source: 'no_gps', startLat: null, startLng: null, startFixQuality: 'none', fixQuality: 'none' })), false);
  assert.equal(isSoftGpsClubMark(shot({ id: 's', seq: 1, startLat: null })), false);
});

test('undo of the open soft mark deletes it and reopens the prior shot', () => {
  const prior = shot({
    id: 's1',
    seq: 1,
    clubId: 'club_driver',
    startFixQuality: 'good',
    fixQuality: 'soft',
    endedAt: 't1',
    endLat: 1.001,
    endLng: 2,
    distanceYards: 110,
  });
  const open = shot({ id: 's2', seq: 2, clubId: 'club_7i' });
  const plan = planUndoLastSoftGpsClubMark([prior, open]);
  assert.deepEqual(plan, {
    deleteShotId: 's2',
    reopenShotId: 's1',
    nextLastClubId: 'club_driver',
    keepShotIds: ['s1'],
    usesUndoLast: true,
  });
});

test('a lone soft mark is the only row removed', () => {
  const plan = planUndoLastSoftGpsClubMark([shot({ id: 's1', seq: 1 })]);
  assert.deepEqual(plan, {
    deleteShotId: 's1',
    reopenShotId: null,
    nextLastClubId: null,
    keepShotIds: [],
    usesUndoLast: true,
  });
});

test('two soft marks: only the newer one is removed', () => {
  const first = shot({ id: 's1', seq: 1, clubId: 'club_driver', endedAt: 't1', endLat: 1.001, endLng: 2, distanceYards: 200 });
  const second = shot({ id: 's2', seq: 2, clubId: 'club_5i' });
  const plan = planUndoLastSoftGpsClubMark([first, second]);
  assert.equal(plan?.deleteShotId, 's2');
  assert.deepEqual(plan?.keepShotIds, ['s1']);
  assert.equal(plan?.usesUndoLast, true);
  assert.equal(plan?.nextLastClubId, 'club_driver');
});

test('a later good mark stays; only the earlier soft club mark is removed', () => {
  const soft = shot({
    id: 'soft',
    seq: 1,
    clubId: 'club_7i',
    endedAt: 't1',
    endLat: 1.002,
    endLng: 2,
    distanceYards: 150,
    fixQuality: 'forced',
  });
  const good = shot({
    id: 'good',
    seq: 2,
    clubId: 'club_pw',
    startAccuracyM: 8,
    startFixQuality: 'good',
    fixQuality: 'good',
  });
  const plan = planUndoLastSoftGpsClubMark([soft, good]);
  assert.equal(plan?.deleteShotId, 'soft');
  assert.deepEqual(plan?.keepShotIds, ['good']);
  assert.equal(plan?.reopenShotId, null);
  assert.equal(plan?.usesUndoLast, false);
  assert.equal(plan?.nextLastClubId, 'club_pw');
  assert.equal(plan?.keepShotIds.length, 1);
});

test('good, placed, and empty holes have no soft mark to undo', () => {
  assert.equal(
    planUndoLastSoftGpsClubMark([
      shot({ id: 's1', seq: 1, startFixQuality: 'good', fixQuality: 'good', startAccuracyM: 5 }),
    ]),
    null,
  );
  assert.equal(
    planUndoLastSoftGpsClubMark([
      shot({ id: 's1', seq: 1, source: 'placed', startFixQuality: null, fixQuality: null, endedAt: 't1' }),
    ]),
    null,
  );
  assert.equal(planUndoLastSoftGpsClubMark([]), null);
});

test('undo does not start a round and does not clear the hole unless it was the only mark', () => {
  assert.equal(undoLastSoftGpsClubMarkStartsRound(), false);
  assert.equal(undoLastSoftGpsClubMarkClearsHole(), false);
  assert.equal(undoLastSoftGpsClubMarkScope(), 'phone');
  assert.equal(WATCH_MESSAGE_TYPES.includes('clubPick'), true);
  assert.equal(
    (WATCH_MESSAGE_TYPES as readonly string[]).some((type) => type.toLowerCase().includes('undo')),
    false,
  );
});

test('mid-hole control lives on the play overlay and only calls the soft-mark undo', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.match(play, /testID="undo-last-soft-gps"/);
  assert.match(play, /onUndoSoftGps/);
  assert.match(play, /planUndoLastSoftGpsClubMark\(shots\)/);
  assert.match(play, /softGpsUndo\?\.usesUndoLast/);
  assert.doesNotMatch(dock, /undo-last-soft-gps|onUndoSoftGps/);
  const handler = hole.slice(hole.indexOf('const onUndoSoftGps'), hole.indexOf('const onEndShot'));
  assert.match(handler, /undoLastSoftGpsClubMark\(db/);
  assert.doesNotMatch(handler, /startRound|router\.(replace|push)|undoLastShot\(/);
  const watch = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(watch, /undoLastSoft|undo-last-soft-gps/);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const fn = repo.slice(
    repo.indexOf('export function undoLastSoftGpsClubMark'),
    repo.indexOf('/** Forgotten swing:'),
  );
  assert.match(fn, /planUndoLastSoftGpsClubMark/);
  assert.match(fn, /deleteShot\(/);
  assert.doesNotMatch(fn, /startRound|INSERT INTO rounds|DELETE FROM shots WHERE hole_id/);
});

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

test('stored undo removes only the latest soft club mark and keeps the round', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  assert.equal(hole.par, null);
  assert.equal(hole.greenLat, null);
  const driverId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_driver',
    seq: 1,
    lat: 1,
    lng: 2,
    accuracyM: 8,
    startFixQuality: 'good',
  });
  applyClosedShot(db, {
    shotId: driverId,
    endLat: 1.001,
    endLng: 2,
    endAccuracyM: 20,
    endFixQuality: 'soft',
    distanceYards: 110,
    impossibleJump: false,
    fixQuality: 'soft',
  });
  const softId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 2,
    lat: 1.001,
    lng: 2,
    accuracyM: 20,
    startFixQuality: 'soft',
  });
  setRoundLastClub(db, round.id, 'club_7i');
  const roundsBefore = listRounds(db).length;

  const result = undoLastSoftGpsClubMarkInRepo(db, round.id, 1);
  const shots = listShotsForHole(db, hole.id);
  const again = getHole(db, round.id, 1);

  assert.equal(result.ok, true);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]?.id, driverId);
  assert.equal(shots.some((row) => row.id === softId), false);
  assert.equal(shots[0]?.endedAt, null);
  assert.equal(shots[0]?.startLat, 1);
  assert.equal(shots[0]?.startLng, 2);
  assert.equal(shots[0]?.clubId, 'club_driver');
  assert.equal(listRounds(db).length, roundsBefore);
  assert.equal(getRound(db, round.id)?.lastClubId, 'club_driver');
  assert.equal(again?.par, null);
  assert.equal(again?.greenLat, null);
  assert.equal(listRounds(db).filter((row) => row.id === round.id).length, 1);
});

test('undo of a middle soft mark leaves the later good mark and the round', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  const softId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_7i',
    seq: 1,
    lat: 1,
    lng: 2,
    accuracyM: 18,
    startFixQuality: 'soft',
  });
  applyClosedShot(db, {
    shotId: softId,
    endLat: 1.002,
    endLng: 2,
    endAccuracyM: 8,
    endFixQuality: 'good',
    distanceYards: 150,
    impossibleJump: false,
    fixQuality: 'soft',
  });
  const goodId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_pw',
    seq: 2,
    lat: 1.002,
    lng: 2,
    accuracyM: 6,
    startFixQuality: 'good',
  });
  setRoundLastClub(db, round.id, 'club_pw');

  const result = undoLastSoftGpsClubMarkInRepo(db, round.id, 1);
  const shots = listShotsForHole(db, hole.id);

  assert.equal(result.ok, true);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]?.id, goodId);
  assert.equal(shots[0]?.startLat, 1.002);
  assert.equal(shots[0]?.startLng, 2);
  assert.equal(shots[0]?.startFixQuality, 'good');
  assert.equal(shots[0]?.endedAt, null);
  assert.equal(listRounds(db).length, 1);
  assert.equal(getRound(db, round.id)?.lastClubId, 'club_pw');
});

test('no soft mark is a no-op: the good shot and the round stay', { skip: needsSqlite.skip }, () => {
  const db = memoryDb();
  const round = startRound(db, 9, null);
  const hole = getHole(db, round.id, 1);
  assert.ok(hole);
  const goodId = insertOpenShot(db, {
    holeId: hole.id,
    clubId: 'club_driver',
    seq: 1,
    lat: 1,
    lng: 2,
    accuracyM: 5,
    startFixQuality: 'good',
  });
  const result = undoLastSoftGpsClubMarkInRepo(db, round.id, 1);
  const shots = listShotsForHole(db, hole.id);
  assert.equal(result.ok, false);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]?.id, goodId);
  assert.equal(listRounds(db).length, 1);
});
