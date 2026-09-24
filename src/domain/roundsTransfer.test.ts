import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  collectRoundHistoryExport,
  deleteRound,
  listHoles,
  listRounds,
  listShotsForHole,
  restoreRoundHistory,
} from '../db/repo';
import { migrate } from '../db/schema';
import {
  formatRestoreToast,
  planRoundHistoryImport,
  planRoundRestoreMerge,
  roundExportFilename,
  ROUND_HISTORY_EXPORT_KIND,
  ROUND_HISTORY_EXPORT_VERSION,
  serializeRoundHistory,
  type RoundTransferRound,
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

/** Just enough of expo-sqlite's sync API for repo.ts, over node:sqlite. */
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

const start = { lat: 35.51, lng: -92.11 };
const end = { lat: 35.513, lng: -92.11 };

function fileRound(over: Partial<RoundTransferRound> & { id: string | null; startedAt: string }): Record<string, unknown> {
  return {
    finishedAt: null,
    courseName: 'Magnolia',
    holeCount: 9,
    courseApiId: null,
    courseLat: null,
    courseLng: null,
    holes: [
      {
        number: 1,
        par: 4,
        score: 5,
        putts: 2,
        shots: [
          { clubId: 'club_driver', seq: 1, source: 'gps', start, end, startedAt: over.startedAt },
        ],
      },
    ],
    ...over,
  };
}

function doc(rounds: Record<string, unknown>[]): string {
  return JSON.stringify({
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: '2026-09-24T12:00:00.000Z',
    rounds,
  });
}

test('export filename is ShotTraxx-rounds-YYYY-MM-DD.json in local time', () => {
  assert.equal(roundExportFilename(new Date(2026, 8, 4, 23, 59)), 'ShotTraxx-rounds-2026-09-04.json');
  assert.equal(roundExportFilename(new Date(2027, 0, 31, 0, 1)), 'ShotTraxx-rounds-2027-01-31.json');
});

test('export payload carries ids, course, timestamps, holes, scores, shots, and clubs', needsSqlite, () => {
  const db = memoryDb();
  restoreRoundHistory(
    db,
    doc([fileRound({ id: 'r-1', startedAt: '2026-09-20T15:00:00.000Z', finishedAt: '2026-09-20T17:00:00.000Z' })]),
  );
  const payload = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z')));
  assert.equal(payload.kind, ROUND_HISTORY_EXPORT_KIND);
  assert.equal(payload.version, ROUND_HISTORY_EXPORT_VERSION);
  assert.equal(payload.exportedAt, '2026-09-24T12:00:00.000Z');
  assert.ok(Array.isArray(payload.clubs) && payload.clubs.length > 0);
  for (const club of payload.clubs) {
    assert.equal(typeof club.id, 'string');
    assert.equal(typeof club.name, 'string');
  }
  assert.equal(payload.rounds.length, 1);
  const round = payload.rounds[0];
  assert.equal(round.id, 'r-1');
  assert.equal(round.courseName, 'Magnolia');
  assert.equal(round.startedAt, '2026-09-20T15:00:00.000Z');
  assert.equal(round.finishedAt, '2026-09-20T17:00:00.000Z');
  assert.equal(round.holeCount, 9);
  const hole = round.holes[0];
  assert.equal(hole.number, 1);
  assert.equal(hole.par, 4);
  assert.equal(hole.score, 5);
  assert.equal(hole.putts, 2);
  assert.equal(hole.shots.length, 1);
  assert.equal(hole.shots[0].clubId, 'club_driver');
  assert.ok(payload.clubs.some((club: { id: string }) => club.id === 'club_driver'));
  assert.deepEqual(hole.shots[0].start, start);
  assert.equal(hole.shots[0].startedAt, '2026-09-20T15:00:00.000Z');

  // Round-trips through the importer with its id.
  const back = planRoundHistoryImport(JSON.stringify(payload));
  assert.equal(back.ok, true);
  if (back.ok) assert.equal(back.rounds[0].id, 'r-1');
});

test('restore merge: same id replaces, new id adds, other rounds stay', () => {
  const existing = [
    { id: 'a', startedAt: '2026-09-01T10:00:00.000Z', courseName: 'Magnolia', holeCount: 9 },
    { id: 'b', startedAt: '2026-09-02T10:00:00.000Z', courseName: 'Oak Hills', holeCount: 18 },
  ];
  const round = (id: string | null, startedAt: string, courseName = 'Magnolia'): RoundTransferRound =>
    ({ id, startedAt, courseName, holeCount: 9, holes: [] }) as unknown as RoundTransferRound;
  const merge = planRoundRestoreMerge({
    existing,
    incoming: [
      round('a', '2026-09-01T10:00:00.000Z'),
      round('c', '2026-09-03T10:00:00.000Z'),
      round('c', '2026-09-03T10:00:00.000Z'),
      round(null, '2026-09-01T10:00:00.000Z'),
      round(null, '2026-09-04T10:00:00.000Z'),
      round('z', '2026-09-01T10:00:00.000Z'),
    ],
  });
  assert.deepEqual(merge.replace.map((r) => r.id), ['a']);
  assert.deepEqual(merge.add.map((r) => r.id ?? r.startedAt), ['c', '2026-09-04T10:00:00.000Z']);
  assert.equal(merge.skipped, 3);
});

test('restore writes to SQLite: replaces the same id, adds new, keeps the rest', needsSqlite, () => {
  const db = memoryDb();
  const first = restoreRoundHistory(
    db,
    doc([
      fileRound({ id: 'keep', startedAt: '2026-09-01T10:00:00.000Z', courseName: 'Oak Hills' }),
      fileRound({ id: 'swap', startedAt: '2026-09-02T10:00:00.000Z' }),
    ]),
  );
  assert.deepEqual(first.ok && { added: first.added, updated: first.updated }, { added: 2, updated: 0 });
  const swapHole = listHoles(db, 'swap')[0];
  assert.equal(swapHole.score, 5);

  const second = restoreRoundHistory(
    db,
    doc([
      {
        ...fileRound({ id: 'swap', startedAt: '2026-09-02T10:00:00.000Z', courseName: 'Magnolia Back' }),
        holes: [{ number: 1, par: 4, score: 3, putts: 1, shots: [] }],
      },
      fileRound({ id: 'new', startedAt: '2026-09-05T10:00:00.000Z' }),
    ]),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.added, 1);
  assert.equal(second.updated, 1);
  assert.equal(formatRestoreToast(second), '1 round added, 1 round updated.');

  const ids = listRounds(db).map((r) => r.id).sort();
  assert.deepEqual(ids, ['keep', 'new', 'swap']);
  const swapped = listRounds(db).find((r) => r.id === 'swap');
  assert.equal(swapped?.courseName, 'Magnolia Back');
  const holes = listHoles(db, 'swap');
  assert.equal(holes.length, 1);
  assert.equal(holes[0].score, 3);
  assert.equal(listShotsForHole(db, holes[0].id).length, 0);
  // The untouched round keeps its shot.
  assert.equal(listShotsForHole(db, listHoles(db, 'keep')[0].id).length, 1);

  // Same file again: only updates, no duplicates.
  const again = restoreRoundHistory(db, doc([fileRound({ id: 'new', startedAt: '2026-09-05T10:00:00.000Z' })]));
  assert.equal(again.ok && again.added, 0);
  assert.equal(listRounds(db).length, 3);

  deleteRound(db, 'keep');
  assert.equal(listRounds(db).length, 2);
});

test('restore rejects a file that is not ShotTraxx rounds', needsSqlite, () => {
  const db = memoryDb();
  assert.equal(restoreRoundHistory(db, '{"hello":1}').ok, false);
  assert.equal(restoreRoundHistory(db, 'not json').ok, false);
  assert.equal(listRounds(db).length, 0);
  assert.equal(formatRestoreToast({ added: 0, updated: 0 }), 'Those rounds are already on this phone.');
  assert.equal(formatRestoreToast({ added: 2, updated: 0 }), '2 rounds added.');
});

test('Home drops export/restore; menu opens Export / Restore rounds', () => {
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /exportRounds|restoreRounds|restore-rounds|rounds-transfer|presentRoundHistoryShare/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const menu = hole.slice(hole.indexOf('visible={menuOpen}'), hole.indexOf('visible={scorecardOpen}'));
  assert.match(menu, /COPY\.roundsTransfer/);
  assert.match(menu, /\/rounds-transfer/);
  const screen = readFileSync(new URL('../../app/rounds-transfer.tsx', import.meta.url), 'utf8');
  assert.match(screen, /pickRoundHistoryFile/);
  assert.match(screen, /presentRoundHistoryShare/);
  assert.match(screen, /COPY\.restoreRoundsConfirm/);
  assert.doesNotMatch(screen, /TextInput/);
});
