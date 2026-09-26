import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  collectRoundCsv,
  collectRoundHistoryExport,
  deleteShotOnHole,
  getHole,
  insertPenalty,
  insertPenaltyInTransaction,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  restoreRoundHistory,
  startRound,
} from '../db/repo';
import { migrate } from '../db/schema';
import { formatPenaltyRow, scoreAfterPenalty } from './penalty';
import { orderHoleSteps } from './penaltySteps';
import { COPY } from './playerCopy';
import { SHOTS_CSV_HEADERS } from './roundCsv';
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

function openMemory(runMigrate: boolean): SQLiteDatabase {
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
  if (runMigrate) migrate(wrapped);
  return wrapped;
}

function memoryDb(): SQLiteDatabase {
  return openMemory(true);
}

function insertMarkedShot(
  db: SQLiteDatabase,
  args: { id: string; holeId: string; clubId: string; seq: number; startedAt: string; endLat: number },
): void {
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, 35.51, -92.11, ?, -92.1, 170, 'good', 0, ?, ?, 'gps')`,
    [args.id, args.holeId, args.clubId, args.seq, args.endLat, args.startedAt, args.startedAt],
  );
}

test('hole screen opens Penalty beside All clubs and drops the Drop entry', () => {
  assert.equal(COPY.penaltySaveFailed, 'Couldn’t save the penalty. Try again.');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const menu = hole.slice(hole.indexOf('visible={menuOpen}'), hole.indexOf('visible={scorecardOpen}'));
  assert.match(menu, /label=\{COPY\.penalty\}/);
  assert.match(menu, /openPenaltySheet\(\)/);
  assert.doesNotMatch(menu, /COPY\.drop/);
  assert.doesNotMatch(hole, /takeDrop|setDropOpen|COPY\.drop/);

  const float = hole.slice(hole.indexOf('styles.allClubsFloat'), hole.indexOf('styles.dock', hole.indexOf('styles.allClubsFloat')));
  const allAt = float.indexOf('COPY.allClubs');
  const penaltyAt = float.indexOf('COPY.penalty');
  assert.ok(allAt >= 0 && penaltyAt > allAt);
  assert.match(float, /openPenaltySheet/);
  const opener = hole.slice(hole.indexOf('const openPenaltySheet'), hole.indexOf('const onAddPenalty'));
  assert.match(opener, /defaultPenaltyAfterShot\(shots\)/);
  assert.match(opener, /setPenaltyOpen\(true\)/);
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
  if (menu.replay === 'deleted') throw new Error('menu penalty was treated as deleted');
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

test('an existing penalty table gains after-shot columns and keeps old rows null', needsSqlite, () => {
  const db = openMemory(false);
  db.execSync(`
    CREATE TABLE hole_penalties (
      id TEXT PRIMARY KEY NOT NULL,
      hole_id TEXT NOT NULL,
      strokes INTEGER NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'penalty',
      lat REAL,
      lng REAL
    );
  `);
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('legacy', 'hole-old', 1, 'ob', NULL, '2026-09-20T15:00:00.000Z', 'penalty', NULL, NULL)`,
  );
  migrate(db);
  const names = db.getAllSync<{ name: string }>('PRAGMA table_info(hole_penalties)').map((col) => col.name);
  assert.ok(names.includes('after_shot_id'));
  assert.ok(names.includes('after_shot_seq'));
  const legacy = db.getFirstSync<{ after_shot_id: string | null; after_shot_seq: number | null }>(
    'SELECT after_shot_id, after_shot_seq FROM hole_penalties WHERE id = ?',
    ['legacy'],
  );
  assert.equal(legacy?.after_shot_id, null);
  assert.equal(legacy?.after_shot_seq, null);
  migrate(db);
  assert.equal(
    db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM hole_penalties')?.n,
    1,
  );
  assert.equal(
    db.getFirstSync<{ after_shot_id: string | null }>('SELECT after_shot_id FROM hole_penalties WHERE id = ?', [
      'legacy',
    ])?.after_shot_id,
    null,
  );
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('legacy-2', 'hole-old', 2, 'water', NULL, '2026-09-20T15:05:00.000Z', 'penalty', NULL, NULL)`,
  );
  const listed = listPenaltiesForHole(db, 'hole-old');
  assert.deepEqual(
    listed.map((row) => ({ id: row.id, afterShotId: row.afterShotId, afterShotSeq: row.afterShotSeq })),
    [
      { id: 'legacy', afterShotId: null, afterShotSeq: null },
      { id: 'legacy-2', afterShotId: null, afterShotSeq: null },
    ],
  );
});

test('a stored after-shot survives save, delete, and a json round-trip', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Magnolia');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  insertMarkedShot(db, {
    id: 'shot-8i',
    holeId: hole.id,
    clubId: 'club_8i',
    seq: 1,
    startedAt: '2026-09-20T15:00:00.000Z',
    endLat: 35.513,
  });
  insertMarkedShot(db, {
    id: 'shot-sw',
    holeId: hole.id,
    clubId: 'club_sw',
    seq: 2,
    startedAt: '2026-09-20T15:04:00.000Z',
    endLat: 35.516,
  });

  const empty = memoryDb();
  const emptyRound = startRound(empty, 9, 'Empty');
  const emptyHole = listHoles(empty, emptyRound.id)[0];
  assert.ok(emptyHole);
  const beforeShots = insertPenalty(empty, {
    holeId: emptyHole.id,
    par: emptyHole.par,
    currentScore: emptyHole.score,
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
  });
  if (beforeShots.replay === 'deleted') throw new Error('penalty was treated as deleted');
  assert.equal(beforeShots.penalty.afterShotId, null);
  assert.equal(beforeShots.penalty.afterShotSeq, null);
  assert.deepEqual(
    orderHoleSteps([], listPenaltiesForHole(empty, emptyHole.id)).map((step) =>
      step.kind === 'penalty' ? step.label : step.id,
    ),
    ['+1 OB'],
  );

  const attached = insertPenalty(db, {
    holeId: hole.id,
    par: hole.par,
    currentScore: hole.score,
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-8i',
    afterShotSeq: 1,
  });
  if (attached.replay === 'deleted') throw new Error('attached penalty was treated as deleted');
  assert.equal(attached.penalty.afterShotId, 'shot-8i');
  assert.equal(attached.penalty.afterShotSeq, 1);
  const shots = listShotsForHole(db, hole.id);
  assert.deepEqual(
    orderHoleSteps(shots, listPenaltiesForHole(db, hole.id)).map((step) =>
      step.kind === 'penalty' ? step.label : step.id,
    ),
    ['shot-8i', '+1 OB', 'shot-sw'],
  );

  const removed = deleteShotOnHole(db, {
    roundId: round.id,
    holeNumber: hole.number,
    shotId: 'shot-8i',
    confirmed: true,
  });
  assert.equal(removed.status, 'commit');
  const afterDelete = listPenaltiesForHole(db, hole.id);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0]?.afterShotId, 'shot-8i');
  assert.equal(afterDelete[0]?.afterShotSeq, 1);
  const remaining = listShotsForHole(db, hole.id);
  assert.equal(remaining.length, 1);
  assert.doesNotThrow(() => orderHoleSteps(remaining, afterDelete));
  assert.ok(
    orderHoleSteps(remaining, afterDelete).some((step) => step.kind === 'penalty' && step.label === '+1 OB'),
  );

  const replay = memoryDb();
  const replayRound = startRound(replay, 9, 'Replay');
  const replayHole = listHoles(replay, replayRound.id)[0];
  assert.ok(replayHole);
  insertMarkedShot(replay, {
    id: 'shot-8i',
    holeId: replayHole.id,
    clubId: 'club_8i',
    seq: 1,
    startedAt: '2026-09-20T15:00:00.000Z',
    endLat: 35.513,
  });
  insertMarkedShot(replay, {
    id: 'shot-sw',
    holeId: replayHole.id,
    clubId: 'club_sw',
    seq: 2,
    startedAt: '2026-09-20T15:04:00.000Z',
    endLat: 35.516,
  });
  insertPenalty(replay, {
    holeId: replayHole.id,
    par: replayHole.par,
    currentScore: replayHole.score,
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-8i',
    afterShotSeq: 1,
  });
  replay.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind)
     VALUES ('legacy-null', ?, 1, 'water', NULL, '2026-09-20T15:02:00.000Z', 'penalty')`,
    [replayHole.id],
  );
  const legacy = listPenaltiesForHole(replay, replayHole.id).find((row) => row.id === 'legacy-null');
  assert.equal(legacy?.afterShotId, null);
  assert.equal(legacy?.afterShotSeq, null);
  assert.deepEqual(
    orderHoleSteps(listShotsForHole(replay, replayHole.id), listPenaltiesForHole(replay, replayHole.id)).map((step) =>
      step.kind === 'penalty' ? step.label : step.id,
    ),
    ['shot-8i', '+1 Water', '+1 OB', 'shot-sw'],
  );

  const exported = collectRoundHistoryExport(replay, '2026-09-25T00:00:00.000Z');
  const raw = JSON.parse(serializeRoundHistory(exported)) as {
    rounds: { holes: { penalties: Record<string, unknown>[] }[] }[];
  };
  const saved = raw.rounds[0].holes[0].penalties.find((row) => row.reason === 'ob');
  assert.ok(saved);
  assert.equal(saved.afterShotId, 'shot-8i');
  assert.equal(saved.afterShotSeq, 1);
  const savedLegacy = raw.rounds[0].holes[0].penalties.find((row) => row.id === 'legacy-null');
  assert.equal(savedLegacy?.afterShotId, null);
  assert.equal(savedLegacy?.afterShotSeq, null);

  const csv = collectRoundCsv(replay);
  assert.equal(csv.shotsCsv.startsWith('\uFEFF"round_id","hole_number","shot_number"'), true);
  assert.deepEqual([...SHOTS_CSV_HEADERS], [
    'round_id',
    'hole_number',
    'shot_number',
    'club',
    'distance_yards',
    'start_lat',
    'start_lng',
    'end_lat',
    'end_lng',
    'fix_quality',
    'source',
    'typed_yards',
  ]);
  assert.equal(csv.shotsCsv.includes('after_shot'), false);
  assert.match(csv.shotsCsv, /,1,,"",,,,,,"","Penalty"/);

  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, JSON.stringify(raw));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  const restoredHole = listHoles(fresh, replayRound.id)[0];
  assert.ok(restoredHole);
  const restoredPenalties = listPenaltiesForHole(fresh, restoredHole.id);
  const restoredOb = restoredPenalties.find((row) => row.reason === 'ob');
  assert.equal(restoredOb?.afterShotId, 'shot-8i');
  assert.equal(restoredOb?.afterShotSeq, 1);
  const restoredShots = listShotsForHole(fresh, restoredHole.id);
  assert.equal(restoredShots.some((shot) => shot.id === 'shot-8i'), false);
  assert.deepEqual(
    restoredShots.map((shot) => shot.seq),
    [1, 2],
  );
  assert.deepEqual(
    orderHoleSteps(restoredShots, restoredPenalties).map((step) =>
      step.kind === 'penalty' ? step.label : `seq ${restoredShots.find((shot) => shot.id === step.id)?.seq}`,
    ),
    ['seq 1', '+1 Water', '+1 OB', 'seq 2'],
  );
  const again = restoreRoundHistory(fresh, JSON.stringify(raw));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.updated, 0);

  const older = JSON.parse(JSON.stringify(raw)) as typeof raw;
  for (const penalty of older.rounds[0].holes[0].penalties) {
    delete penalty.afterShotId;
    delete penalty.afterShotSeq;
  }
  const olderDb = memoryDb();
  const olderRestore = restoreRoundHistory(olderDb, JSON.stringify(older));
  assert.equal(olderRestore.ok, true);
  if (!olderRestore.ok) return;
  const olderHole = listHoles(olderDb, replayRound.id)[0];
  assert.ok(olderHole);
  assert.deepEqual(
    listPenaltiesForHole(olderDb, olderHole.id).map((row) => ({
      reason: row.reason,
      afterShotId: row.afterShotId,
      afterShotSeq: row.afterShotSeq,
    })),
    [
      { reason: 'water', afterShotId: null, afterShotSeq: null },
      { reason: 'ob', afterShotId: null, afterShotSeq: null },
    ],
  );
  const olderAgain = restoreRoundHistory(olderDb, JSON.stringify(older));
  assert.equal(olderAgain.ok, true);
  if (!olderAgain.ok) return;
  assert.equal(olderAgain.updated, 0);
});
