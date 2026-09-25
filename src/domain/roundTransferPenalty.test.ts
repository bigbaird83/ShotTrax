import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { collectRoundHistoryExport, listHoles, listShotsForHole, restoreRoundHistory, startRound } from '../db/repo';
import { migrate } from '../db/schema';
import { loggedHoleStrokes } from './holeScore';
import {
  planRoundHistoryImport,
  ROUND_HISTORY_EXPORT_KIND,
  ROUND_HISTORY_EXPORT_VERSION,
  serializeRoundHistory,
} from './roundTransfer';

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

const penaltyAt = '2026-09-20T15:10:00.000Z';
const dropAt = '2026-09-20T15:22:00.000Z';
const zeroAt = '2026-09-20T15:30:00.000Z';

function seedRound(db: SQLiteDatabase): { roundId: string; holeId: string; penaltyId: string; dropId: string } {
  const round = startRound(db, 9, 'Magnolia');
  const hole = listHoles(db, round.id)[0];
  db.runSync('UPDATE holes SET par = 4, score = 6, putts = 2, putts_done = 1 WHERE id = ?', [hole.id]);
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('pen-water', ?, 2, 'water', NULL, ?, 'penalty', 35.52, -92.12)`,
    [hole.id, penaltyAt],
  );
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('pen-drop', ?, 1, 'ob', 'lateral', ?, 'drop', NULL, NULL)`,
    [hole.id, dropAt],
  );
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('pen-zero', ?, 1, 'unplayable', NULL, ?, 'penalty', 0, 0)`,
    [hole.id, zeroAt],
  );
  return { roundId: round.id, holeId: hole.id, penaltyId: 'pen-water', dropId: 'pen-drop' };
}

function strokeSnapshot(db: SQLiteDatabase, roundId: string) {
  const hole = listHoles(db, roundId).find((row) => row.number === 1);
  assert.ok(hole);
  const penaltyStrokes = savedPenalties(db, roundId).reduce((sum, row) => sum + row.strokes, 0);
  const shotCount = listShotsForHole(db, hole.id).length;
  return {
    score: hole.score,
    total: loggedHoleStrokes({ shotCount, putts: hole.putts, penaltyStrokes }),
  };
}

function withoutPenaltyField(raw: string): string {
  const doc = JSON.parse(raw) as { rounds: { holes: Record<string, unknown>[] }[] };
  for (const round of doc.rounds) {
    for (const hole of round.holes) delete hole.penalties;
  }
  return JSON.stringify(doc);
}

function savedPenalties(db: SQLiteDatabase, roundId: string) {
  const hole = listHoles(db, roundId).find((row) => row.number === 1);
  assert.ok(hole);
  return db
    .getAllSync<{
      id: string;
      kind: string;
      strokes: number;
      reason: string;
      note: string | null;
      created_at: string;
      lat: number | null;
      lng: number | null;
    }>(
      'SELECT id, kind, strokes, reason, note, created_at, lat, lng FROM hole_penalties WHERE hole_id = ? ORDER BY created_at ASC',
      [hole.id],
    )
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      strokes: row.strokes,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at,
      lat: row.lat,
      lng: row.lng,
    }));
}

test('export keeps penalties and drops, and a replace puts them back', needsSqlite, () => {
  const db = memoryDb();
  const seeded = seedRound(db);
  const doc = collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z');
  assert.equal(doc.version, 2);
  assert.equal(ROUND_HISTORY_EXPORT_VERSION, 2);
  const exported = JSON.parse(serializeRoundHistory(doc)) as {
    rounds: { holes: { penalties: Record<string, unknown>[] }[] }[];
  };
  const penalties = exported.rounds[0].holes[0].penalties;
  assert.equal(penalties.length, 3);
  assert.deepEqual(exported.rounds[0].holes[1].penalties, []);
  const water = penalties.find((row) => row.reason === 'water');
  const drop = penalties.find((row) => row.kind === 'drop');
  const zero = penalties.find((row) => row.reason === 'unplayable');
  assert.ok(water && drop && zero);
  assert.equal(water.kind, 'penalty');
  assert.equal(water.strokes, 2);
  assert.equal(water.note, null);
  assert.equal(water.createdAt, penaltyAt);
  assert.equal(water.lat, 35.52);
  assert.equal(water.lng, -92.12);
  assert.equal(drop.strokes, 1);
  assert.equal(drop.reason, 'ob');
  assert.equal(drop.note, 'lateral');
  assert.equal(drop.createdAt, dropAt);
  assert.equal('lat' in drop, false);
  assert.equal('lng' in drop, false);
  assert.equal('lat' in zero, false);
  assert.equal('lng' in zero, false);
  assert.equal(JSON.stringify(penalties).includes('"lat":0'), false);
  assert.equal(JSON.stringify(penalties).includes('"lng":0'), false);

  db.runSync('UPDATE holes SET score = 9 WHERE id = ?', [seeded.holeId]);
  const replaced = restoreRoundHistory(db, serializeRoundHistory(doc));
  assert.equal(replaced.ok, true);
  if (!replaced.ok) return;
  assert.equal(replaced.updated, 1);
  assert.equal(listHoles(db, seeded.roundId)[0].score, 6);
  const after = savedPenalties(db, seeded.roundId);
  assert.deepEqual(
    after.map(({ id: _id, ...row }) => row),
    [
      { kind: 'penalty', strokes: 2, reason: 'water', note: null, createdAt: penaltyAt, lat: 35.52, lng: -92.12 },
      { kind: 'drop', strokes: 1, reason: 'ob', note: 'lateral', createdAt: dropAt, lat: null, lng: null },
      { kind: 'penalty', strokes: 1, reason: 'unplayable', note: null, createdAt: zeroAt, lat: null, lng: null },
    ],
  );
  assert.deepEqual(
    after.map((row) => row.id),
    [seeded.penaltyId, seeded.dropId, 'pen-zero'],
  );

  const ids = after.map((row) => row.id);
  const again = restoreRoundHistory(db, serializeRoundHistory(doc));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.updated, 0);
  assert.deepEqual(savedPenalties(db, seeded.roundId).map((row) => row.id), ids);
});

test('fresh install restore keeps penalties and drops and skips bad rows', needsSqlite, () => {
  const source = memoryDb();
  seedRound(source);
  const raw = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(source, '2026-09-24T12:00:00.000Z'))) as {
    rounds: { holes: { penalties: Record<string, unknown>[] }[] }[];
  };
  raw.rounds[0].holes[0].penalties.push(
    { kind: 'mulligan', strokes: 1, reason: 'water', createdAt: penaltyAt },
    { kind: 'penalty', strokes: 9, reason: 'water', createdAt: penaltyAt },
    { kind: 'penalty', strokes: 1.5, reason: 'ob', createdAt: penaltyAt },
    { kind: 'penalty', strokes: 1, reason: '   ', createdAt: penaltyAt },
    { kind: 'penalty', strokes: 1, createdAt: penaltyAt },
    { kind: 'drop', strokes: 1, reason: 'lost ball', note: '  ', createdAt: '2026-09-20T15:40:00.000Z', lat: 0, lng: 0 },
    { kind: 'penalty', strokes: '2', reason: 'other', createdAt: penaltyAt },
  );
  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, JSON.stringify(raw));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.added, 1);
  const roundId = (raw.rounds[0] as { id: string }).id;
  assert.equal(listHoles(fresh, roundId)[0]?.score, 6);
  const rows = savedPenalties(fresh, roundId);
  assert.deepEqual(
    rows.map(({ id: _id, ...row }) => row),
    [
      { kind: 'penalty', strokes: 2, reason: 'water', note: null, createdAt: penaltyAt, lat: 35.52, lng: -92.12 },
      { kind: 'drop', strokes: 1, reason: 'ob', note: 'lateral', createdAt: dropAt, lat: null, lng: null },
      { kind: 'penalty', strokes: 1, reason: 'unplayable', note: null, createdAt: zeroAt, lat: null, lng: null },
      { kind: 'drop', strokes: 1, reason: 'lost ball', note: null, createdAt: '2026-09-20T15:40:00.000Z', lat: null, lng: null },
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['pen-water', 'pen-drop', 'pen-zero', rows[3]?.id],
  );
  assert.equal(rows[3]?.id === 'pen-water' || rows[3]?.id === 'pen-drop' || rows[3]?.id === 'pen-zero', false);
});

test('v1 and build 92 v2 files with no penalties field still restore', needsSqlite, () => {
  const hole = {
    number: 1,
    par: 4,
    score: 5,
    putts: 1,
    shots: [],
    legacyMarker: true,
  };
  const round = {
    id: 'old-round',
    startedAt: '2026-01-02T00:00:00.000Z',
    finishedAt: null,
    courseName: 'Magnolia',
    holeCount: 9,
    holes: [hole],
  };
  for (const version of [1, 2]) {
    const db = memoryDb();
    const raw = {
      kind: ROUND_HISTORY_EXPORT_KIND,
      version,
      exportedAt: '2026-01-01T00:00:00.000Z',
      rounds: [{ ...round, id: `old-${version}` }],
    };
    const plan = planRoundHistoryImport(raw);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.rounds[0].holes[0].penalties, undefined);
    assert.equal(plan.rounds[0].holes[0].score, 5);
    const restored = restoreRoundHistory(db, JSON.stringify(raw));
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.added, 1);
    assert.equal(listHoles(db, `old-${version}`)[0].score, 5);
    assert.deepEqual(savedPenalties(db, `old-${version}`), []);
  }
});

test('a round whose only difference is penalties is replaced', needsSqlite, () => {
  const db = memoryDb();
  const base = {
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: '2026-09-24T12:00:00.000Z',
    rounds: [
      {
        id: 'r-pen',
        startedAt: '2026-09-20T15:00:00.000Z',
        finishedAt: null,
        courseName: 'Magnolia',
        holeCount: 9,
        holes: [{ number: 1, par: 4, score: 5, putts: 1, shots: [] }],
      },
    ],
  };
  const first = restoreRoundHistory(db, JSON.stringify(base));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.added, 1);
  assert.deepEqual(savedPenalties(db, 'r-pen'), []);

  const withPenalty = structuredClone(base);
  (withPenalty.rounds[0].holes[0] as { penalties: unknown[] }).penalties = [
    { kind: 'penalty', strokes: 1, reason: 'water', note: null, createdAt: penaltyAt, lat: 35.51, lng: -92.11 },
  ];
  const second = restoreRoundHistory(db, JSON.stringify(withPenalty));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.updated, 1);
  assert.equal(second.added, 0);
  assert.deepEqual(
    savedPenalties(db, 'r-pen').map(({ id: _id, ...row }) => row),
    [{ kind: 'penalty', strokes: 1, reason: 'water', note: null, createdAt: penaltyAt, lat: 35.51, lng: -92.11 }],
  );

  const third = restoreRoundHistory(db, JSON.stringify(withPenalty));
  assert.equal(third.ok, true);
  if (!third.ok) return;
  assert.equal(third.updated, 0);
});

test('a build 92 file with no penalties field does not wipe a stored penalty', needsSqlite, () => {
  const db = memoryDb();
  const seeded = seedRound(db);
  const beforePenalties = savedPenalties(db, seeded.roundId);
  const beforeStrokes = strokeSnapshot(db, seeded.roundId);
  assert.equal(beforeStrokes.score, beforeStrokes.total);

  const legacy = withoutPenaltyField(serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z')));
  const parsed = JSON.parse(legacy) as { rounds: { holes: Record<string, unknown>[] }[] };
  assert.equal('penalties' in parsed.rounds[0].holes[0], false);
  const plan = planRoundHistoryImport(legacy);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.rounds[0].holes[0].penalties, undefined);

  const skipped = restoreRoundHistory(db, legacy);
  assert.equal(skipped.ok, true);
  if (!skipped.ok) return;
  assert.equal(skipped.updated, 0);
  assert.deepEqual(savedPenalties(db, seeded.roundId), beforePenalties);
  assert.deepEqual(strokeSnapshot(db, seeded.roundId), beforeStrokes);

  const changed = JSON.parse(legacy) as { rounds: { holes: { score: number }[] }[] };
  changed.rounds[0].holes[0].score = 9;
  const replaced = restoreRoundHistory(db, JSON.stringify(changed));
  assert.equal(replaced.ok, true);
  if (!replaced.ok) return;
  assert.equal(replaced.updated, 1);
  assert.equal(listHoles(db, seeded.roundId)[0].score, 9);
  assert.deepEqual(
    savedPenalties(db, seeded.roundId).map(({ id: _id, ...row }) => row),
    beforePenalties.map(({ id: _id, ...row }) => row),
  );
  assert.equal(strokeSnapshot(db, seeded.roundId).total, beforeStrokes.total);
  assert.equal(savedPenalties(db, seeded.roundId).some((row) => row.lat === 0 && row.lng === 0), true);
});

test('an explicit empty penalties list removes them, and a second restore is a no-op', needsSqlite, () => {
  const db = memoryDb();
  const seeded = seedRound(db);
  const file = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z'))) as {
    rounds: { holes: { penalties: unknown[]; score: number }[] }[];
  };
  for (const hole of file.rounds[0].holes) hole.penalties = [];
  const cleared = restoreRoundHistory(db, JSON.stringify(file));
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.updated, 1);
  assert.deepEqual(savedPenalties(db, seeded.roundId), []);
  assert.equal(listHoles(db, seeded.roundId)[0].score, 6);
  assert.equal(strokeSnapshot(db, seeded.roundId).total, 2);

  const again = restoreRoundHistory(db, JSON.stringify(file));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.updated, 0);
  assert.deepEqual(savedPenalties(db, seeded.roundId), []);
  assert.deepEqual(strokeSnapshot(db, seeded.roundId), { score: 6, total: 2 });
});

const exportedAt = '2026-09-24T12:00:00.000Z';
const beforeExport = '2026-09-24T08:00:00.000Z';
const afterExport = '2026-09-24T18:00:00.000Z';

function blankRound(db: SQLiteDatabase): { roundId: string; holeId: string } {
  const round = startRound(db, 9, 'Magnolia');
  const hole = listHoles(db, round.id)[0];
  db.runSync('UPDATE holes SET par = 4, score = 4, putts = 2, putts_done = 1 WHERE id = ?', [hole.id]);
  return { roundId: round.id, holeId: hole.id };
}

function addPenalty(db: SQLiteDatabase, holeId: string, id: string, createdAt: string, reason = 'water'): void {
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES (?, ?, 1, ?, NULL, ?, 'penalty', 35.51, -92.11)`,
    [id, holeId, reason, createdAt],
  );
}

test('empty file list keeps a phone penalty created after exportedAt', needsSqlite, () => {
  const db = memoryDb();
  const { roundId, holeId } = blankRound(db);
  const file = serializeRoundHistory(collectRoundHistoryExport(db, exportedAt));
  addPenalty(db, holeId, 'pen-later', afterExport);
  const restored = restoreRoundHistory(db, file);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.updated, 0);
  assert.deepEqual(
    savedPenalties(db, roundId).map((row) => row.id),
    ['pen-later'],
  );
});

test('empty file list removes a phone penalty created before exportedAt', needsSqlite, () => {
  const db = memoryDb();
  const { roundId, holeId } = blankRound(db);
  addPenalty(db, holeId, 'pen-early', beforeExport);
  const file = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, exportedAt))) as {
    rounds: { holes: { penalties: unknown[] }[] }[];
  };
  for (const hole of file.rounds[0].holes) hole.penalties = [];
  const restored = restoreRoundHistory(db, JSON.stringify(file));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.updated, 1);
  assert.deepEqual(savedPenalties(db, roundId), []);
});

test('file penalty plus a newer phone penalty does not duplicate the file row', needsSqlite, () => {
  const db = memoryDb();
  const { roundId, holeId } = blankRound(db);
  addPenalty(db, holeId, 'pen-a', afterExport, 'water');
  addPenalty(db, holeId, 'pen-b', '2026-09-24T19:00:00.000Z', 'ob');
  const file = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, exportedAt))) as {
    rounds: { holes: ({ id?: string; penalties: { id?: string }[] } & { score: number })[] }[];
  };
  const hole = file.rounds[0].holes[0];
  hole.penalties = hole.penalties.filter((row) => row.id === 'pen-a');
  hole.score = 8;
  const restored = restoreRoundHistory(db, JSON.stringify(file));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.updated, 1);
  assert.equal(listHoles(db, roundId)[0].score, 8);
  assert.deepEqual(
    savedPenalties(db, roundId).map((row) => row.id),
    ['pen-a', 'pen-b'],
  );
});

test('replacing a round for another reason still keeps a newer phone penalty', needsSqlite, () => {
  const db = memoryDb();
  const { roundId, holeId } = blankRound(db);
  const file = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, exportedAt))) as {
    rounds: { holes: { penalties: unknown[]; score: number }[] }[];
  };
  addPenalty(db, holeId, 'pen-later', afterExport);
  file.rounds[0].holes[0].score = 9;
  const restored = restoreRoundHistory(db, JSON.stringify(file));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.updated, 1);
  assert.equal(listHoles(db, roundId)[0].score, 9);
  assert.deepEqual(
    savedPenalties(db, roundId).map((row) => ({ id: row.id, createdAt: row.createdAt, lat: row.lat, lng: row.lng })),
    [{ id: 'pen-later', createdAt: afterExport, lat: 35.51, lng: -92.11 }],
  );
});

test('restoring the same new-format file twice does not change the newer penalty', needsSqlite, () => {
  const db = memoryDb();
  const { roundId, holeId } = blankRound(db);
  const file = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, exportedAt))) as {
    rounds: { holes: { penalties: unknown[]; score: number }[] }[];
  };
  addPenalty(db, holeId, 'pen-later', afterExport);
  file.rounds[0].holes[0].score = 9;
  const raw = JSON.stringify(file);
  const first = restoreRoundHistory(db, raw);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.updated, 1);
  const ids = savedPenalties(db, roundId).map((row) => row.id);
  const score = listHoles(db, roundId)[0].score;
  const second = restoreRoundHistory(db, raw);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.updated, 0);
  assert.equal(second.added, 0);
  assert.deepEqual(savedPenalties(db, roundId).map((row) => row.id), ids);
  assert.equal(listHoles(db, roundId)[0].score, score);
  assert.deepEqual(ids, ['pen-later']);
});
