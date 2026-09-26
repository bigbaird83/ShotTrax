import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  insertNoGpsShot,
  insertOpenShot,
  insertPenalty,
  listClubs,
  listHoles,
  listStrokesGainedHoles,
  listStrokesGainedHolesBatched,
  setHoleGreen,
  startRound,
  updateHolePutts,
} from '../db/repo';
import { migrate } from '../db/schema';
import type { HolePenalty, Shot } from './types';

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

const GREEN = { lat: 35.01, lng: -92.01 };
const START = { lat: 35.02, lng: -92.01 };

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

function savedPenalty(result: ReturnType<typeof insertPenalty>) {
  if (result.replay === 'deleted' || !result.penalty) throw new Error('penalty was not saved');
  return result.penalty;
}

test('batched strokes-gained loader matches the per-hole path', needsSqlite, () => {
  const db = memoryDb();
  const clubId = listClubs(db)[0]?.id;
  assert.ok(clubId);
  const round = startRound(db, 9, 'Fixture');
  const other = startRound(db, 9, 'Other round');
  const holes = listHoles(db, round.id);
  const hole1 = holes[0];
  const hole2 = holes[1];
  const hole4 = holes[3];
  assert.ok(hole1 && hole2 && hole4);

  const later = insertOpenShot(db, {
    holeId: hole1.id,
    clubId,
    seq: 2,
    lat: START.lat,
    lng: START.lng,
    accuracyM: 4,
    startFixQuality: 'good',
  });
  const first = insertOpenShot(db, {
    holeId: hole1.id,
    clubId,
    seq: 1,
    lat: START.lat,
    lng: START.lng,
    accuracyM: 6,
    startFixQuality: 'soft',
  });
  applyClosedShot(db, {
    shotId: first,
    endLat: GREEN.lat,
    endLng: GREEN.lng,
    endAccuracyM: 5,
    endFixQuality: 'good',
    distanceYards: 148,
    impossibleJump: false,
    fixQuality: 'good',
  });
  insertNoGpsShot(db, { holeId: hole4.id, clubId, seq: 1, typedYards: 90 });

  setHoleGreen(db, hole1.id, { lat: GREEN.lat, lng: GREEN.lng, source: 'user_estimate' });
  updateHolePutts(db, hole1.id, 2, ['10_to_20', 'inside_3'], true);
  updateHolePutts(db, hole2.id, 1, ['inside_3'], false);

  const water = savedPenalty(
    insertPenalty(db, {
      holeId: hole1.id,
      par: hole1.par,
      currentScore: hole1.score,
      strokes: 1,
      reason: 'water',
      note: 'creek',
      afterShotId: first,
      afterShotSeq: 1,
    }),
  );
  const ob = savedPenalty(
    insertPenalty(db, {
      holeId: hole1.id,
      par: hole1.par,
      currentScore: hole1.score,
      strokes: 2,
      reason: 'ob',
      note: null,
      kind: 'drop',
      afterShotId: later,
      afterShotSeq: 2,
    }),
  );
  const unplayable = savedPenalty(
    insertPenalty(db, {
      holeId: hole2.id,
      par: hole2.par,
      currentScore: hole2.score,
      strokes: 1,
      reason: 'unplayable',
      note: 'tree',
    }),
  );
  db.runSync('UPDATE hole_penalties SET created_at = ? WHERE id = ?', ['2020-01-03T00:00:00.000Z', water.id]);
  db.runSync('UPDATE hole_penalties SET created_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', ob.id]);
  db.runSync('UPDATE hole_penalties SET created_at = ? WHERE id = ?', ['2020-01-02T00:00:00.000Z', unplayable.id]);

  const otherHole = listHoles(db, other.id)[0];
  assert.ok(otherHole);
  insertOpenShot(db, {
    holeId: otherHole.id,
    clubId,
    seq: 1,
    lat: START.lat,
    lng: START.lng,
    accuracyM: 5,
    startFixQuality: 'good',
  });
  savedPenalty(
    insertPenalty(db, {
      holeId: otherHole.id,
      par: otherHole.par,
      currentScore: null,
      strokes: 1,
      reason: 'other',
      note: 'should stay on the other round',
    }),
  );

  const perHole = listStrokesGainedHoles(db, round.id);
  const batched = listStrokesGainedHolesBatched(db, round.id);
  assert.equal(perHole.length, 9);
  assert.deepEqual(batched, perHole);
  const hole1Shots = batched[0]?.shots as Shot[];
  const hole1Penalties = batched[0]?.penalties as HolePenalty[];
  assert.deepEqual(
    hole1Shots.map((shot) => shot.seq),
    [1, 2],
  );
  assert.equal(hole1Shots[0]?.startLat, START.lat);
  assert.equal(batched[0]?.puttsDone, true);
  assert.deepEqual(batched[0]?.puttLengths, ['10_to_20', 'inside_3']);
  assert.deepEqual(
    hole1Penalties.map((penalty) => penalty.afterShotSeq),
    [2, 1],
  );
  assert.equal(batched[1]?.shots.length, 0);
  assert.equal(batched[1]?.penalties.length, 1);
  assert.equal(batched[1]?.penalties[0]?.strokes, 1);
  assert.equal(batched[2]?.shots.length, 0);
  assert.equal(batched[2]?.penalties.length, 0);
  assert.equal(batched[3]?.shots.length, 1);
  assert.equal(batched[3]?.shots[0]?.startLat, null);
  assert.deepEqual(listStrokesGainedHolesBatched(db, other.id), listStrokesGainedHoles(db, other.id));
  assert.equal(listStrokesGainedHolesBatched(db, 'missing-round').length, 0);
  assert.equal(
    batched.some((hole) => (hole.shots as Shot[]).some((shot) => shot.holeId === otherHole.id)),
    false,
  );
});
