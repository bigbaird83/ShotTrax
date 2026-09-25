import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  collectRoundHistoryExport,
  getHole,
  insertPenalty,
  insertPenaltyInTransaction,
  listHoles,
  listPenaltiesForHole,
  restoreRoundHistory,
  startRound,
} from '../db/repo';
import { migrate } from '../db/schema';
import { formatPenaltyRow, scoreAfterPenalty } from './penalty';
import { COPY } from './playerCopy';
import { serializeRoundHistory } from './roundTransfer';

/** node:sqlite ships in Node 22.5+. Older Node skips the SQLite round-trips. */
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

test('hole screen opens Penalty beside All clubs and drops the Drop entry', () => {
  assert.equal(COPY.penaltySaveFailed, 'Couldn’t save the penalty. Try again.');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const menu = hole.slice(hole.indexOf('visible={menuOpen}'), hole.indexOf('visible={scorecardOpen}'));
  assert.match(menu, /label=\{COPY\.penalty\}/);
  assert.match(menu, /setPenaltyOpen\(true\)/);
  assert.doesNotMatch(menu, /COPY\.drop/);
  assert.doesNotMatch(hole, /takeDrop|setDropOpen|COPY\.drop/);

  const float = hole.slice(hole.indexOf('styles.allClubsFloat'), hole.indexOf('styles.dock', hole.indexOf('styles.allClubsFloat')));
  const allAt = float.indexOf('COPY.allClubs');
  const penaltyAt = float.indexOf('COPY.penalty');
  assert.ok(allAt >= 0 && penaltyAt > allAt);
  assert.match(float, /setPenaltyOpen\(true\)/);
  assert.equal((float.match(/style=\{styles\.allClubsPill\}/g) ?? []).length, 2);
  assert.match(float, /adjustsFontSizeToFit/);

  const floatStyle = hole.slice(hole.indexOf('allClubsFloat: {'), hole.indexOf('allClubsPill: {'));
  assert.match(floatStyle, /flexDirection: 'row'/);
  assert.match(floatStyle, /gap: 8/);
  const pillStyle = hole.slice(hole.indexOf('allClubsPill: {'), hole.indexOf('allClubsPillText:'));
  assert.match(pillStyle, /height: PHONE_WHEEL_PILL_HEIGHT/);
  assert.match(pillStyle, /maxWidth: 168/);
  assert.match(pillStyle, /flexShrink: 1/);

  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.doesNotMatch(dock, /COPY\.penalty/);
  assert.doesNotMatch(dock, /COPY\.allClubs/);
  assert.match(dock, /<ClubStrip/);
  assert.match(dock, /COPY\.addShot/);
  assert.match(dock, /COPY\.prevHole/);
  assert.match(dock, /COPY\.nextHole/);

  const save = hole.slice(hole.indexOf('const onAddPenalty'), hole.indexOf('const openBag'));
  assert.match(save, /insertPenalty\(db/);
  assert.doesNotMatch(save, /withTransactionSync/);
  assert.match(save, /console\.warn\(err\)/);
  assert.match(save, /Alert\.alert\(COPY\.penaltySaveFailed\)/);
  assert.doesNotMatch(save, /err\.message/);
  assert.equal((hole.match(/title=\{COPY\.penalty\}/g) ?? []).length, 1);
  assert.match(hole, /PENALTY_REASONS/);

  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const takeDrop = actions.slice(actions.indexOf('export async function takeDrop'));
  assert.match(takeDrop, /insertPenaltyInTransaction\(/);
  assert.doesNotMatch(takeDrop, /insertPenalty\(/);
  assert.match(takeDrop, /kind: 'drop'/);
});

test('BEGIN mock still rejects a nested transaction', needsSqlite, () => {
  const db = memoryDb();
  assert.throws(
    () => {
      db.withTransactionSync(() => {
        db.withTransactionSync(() => {
          db.runSync('SELECT 1');
        });
      });
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      return /cannot rollback|no transaction is active|cannot start a transaction/i.test(message);
    },
  );
});

test('menu penalty and in-transaction drop write both commit', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Magnolia');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  const menu = insertPenalty(db, {
    holeId: hole.id,
    par: hole.par,
    currentScore: hole.score,
    strokes: 1,
    reason: 'water',
    note: 'lateral',
    kind: 'penalty',
  });
  assert.equal(menu.penalty.kind, 'penalty');
  assert.equal(menu.score, scoreAfterPenalty(hole.score, hole.par, 1));
  assert.equal(getHole(db, round.id, hole.number)?.score, menu.score);

  // takeDrop's shape: an open BEGIN calls the non-transactional writer.
  db.withTransactionSync(() => {
    insertPenaltyInTransaction(db, {
      holeId: hole.id,
      par: hole.par,
      currentScore: menu.score,
      strokes: 1,
      reason: 'ob',
      note: null,
      kind: 'drop',
    });
  });

  const rows = listPenaltiesForHole(db, hole.id);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['penalty', 'drop'],
  );
  assert.equal(rows[1]?.reason, 'ob');
  assert.equal(formatPenaltyRow(rows[1]!), `Drop +${rows[1]!.strokes} · OB`);
  assert.equal(getHole(db, round.id, hole.number)?.score, scoreAfterPenalty(menu.score, hole.par, 1));

  const exported = collectRoundHistoryExport(db, '2026-09-25T00:00:00.000Z');
  const kinds = exported.rounds
    .flatMap((saved) => saved.holes.flatMap((savedHole) => (savedHole.penalties ?? []).map((row) => row.kind)))
    .sort();
  assert.deepEqual(kinds, ['drop', 'penalty']);

  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, serializeRoundHistory(exported));
  assert.equal(restored.ok, true);
  const restoredHole = listHoles(fresh, round.id)[0];
  assert.ok(restoredHole);
  assert.deepEqual(
    listPenaltiesForHole(fresh, restoredHole.id).map((row) => row.kind).sort(),
    ['drop', 'penalty'],
  );
  assert.equal(getHole(fresh, round.id, restoredHole.number)?.score, getHole(db, round.id, hole.number)?.score);
});
