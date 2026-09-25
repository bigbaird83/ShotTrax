import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  finishHoleOut,
  finishHolePutts,
  getHole,
  getRoundSharedAt,
  getRoundShareToken,
  isRoundShared,
  markHoleStarted,
  markRoundShared,
  restoreRoundHistory,
  startRound,
} from '../db/repo';
import { migrate } from '../db/schema';
import { putSharedBoard } from './shareBoardSync';
import type { SpectatorPayload } from './spectator';
import { ROUND_HISTORY_EXPORT_KIND, ROUND_HISTORY_EXPORT_VERSION } from './roundTransfer';
import {
  publishExplicitRoundShare,
  publishRoundScoreboard,
  type SharedPayloadUpload,
} from '../services/roundScoreboard';

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
  return wrap(raw);
}

function wrap(raw: InstanceType<NonNullable<typeof DatabaseSync>>): SQLiteDatabase {
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

type PutCall = { token: string; payload: SpectatorPayload; url: string; method: string };

/** Stand-in for putSharedPayload: records the call and performs the worker PUT with a mock fetch. */
function mockPutSharedPayload(): { upload: SharedPayloadUpload; puts: PutCall[] } {
  const puts: PutCall[] = [];
  const upload: SharedPayloadUpload = (token, payload) => {
    const call: PutCall = { token, payload, url: '', method: '' };
    puts.push(call);
    return putSharedBoard(token, payload, {
      baseUrl: 'https://share.example.test',
      fetch: async (input, init) => {
        call.url = String(input);
        call.method = String(init?.method ?? '');
        return new Response('ok', { status: 200 });
      },
    });
  };
  return { upload, puts };
}

async function flushPuts(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Hole screen effect: stamp start, then publish. Runs on hole change and after each close. */
function followHole(
  db: SQLiteDatabase,
  roundId: string,
  holeNumber: number,
  upload: SharedPayloadUpload,
): void {
  markHoleStarted(db, roundId, holeNumber);
  publishRoundScoreboard(db, roundId, { currentHoleNumber: holeNumber, upload });
}

/** Live-board screen effect. */
function followBoard(db: SQLiteDatabase, roundId: string, upload: SharedPayloadUpload): void {
  publishRoundScoreboard(db, roundId, { upload });
}

function closeMadeIt(db: SQLiteDatabase, roundId: string, holeNumber: number): void {
  const hole = getHole(db, roundId, holeNumber);
  assert.ok(hole);
  finishHolePutts(db, hole.id, 2, ['inside_3', '3_to_10']);
}

function closeHoleOut(db: SQLiteDatabase, roundId: string, holeNumber: number): void {
  const hole = getHole(db, roundId, holeNumber);
  assert.ok(hole);
  finishHoleOut(db, hole.id);
}

/** Enter, close, and leave several holes the way the play screen publishes. */
function playUnsharedStretch(db: SQLiteDatabase, roundId: string, upload: SharedPayloadUpload): void {
  followHole(db, roundId, 1, upload);
  closeMadeIt(db, roundId, 1);
  followHole(db, roundId, 1, upload);
  followHole(db, roundId, 2, upload);
  closeHoleOut(db, roundId, 2);
  followHole(db, roundId, 2, upload);
  followHole(db, roundId, 3, upload);
  closeMadeIt(db, roundId, 3);
  followHole(db, roundId, 3, upload);
  followHole(db, roundId, 4, upload);
  followBoard(db, roundId, upload);
}

test('playing an unshared round never calls putSharedPayload', needsSqlite, async () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Magnolia');
  const { upload, puts } = mockPutSharedPayload();

  playUnsharedStretch(db, round.id, upload);
  await flushPuts();

  assert.equal(puts.length, 0);
  assert.equal(isRoundShared(db, round.id), false);
  assert.equal(getRoundSharedAt(db, round.id), null);
  assert.equal(getRoundShareToken(db, round.id), null);
});

test('Share uploads, later hole changes on that round publish, and another round stays quiet', needsSqlite, async () => {
  const db = memoryDb();
  const shared = startRound(db, 9, 'Magnolia');
  const { upload, puts } = mockPutSharedPayload();

  playUnsharedStretch(db, shared.id, upload);
  await flushPuts();
  assert.equal(puts.length, 0);

  const first = publishExplicitRoundShare(db, shared.id, { currentHoleNumber: 4, upload });
  await flushPuts();
  assert.ok(first);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].method, 'PUT');
  assert.match(puts[0].url, /https:\/\/share\.example\.test\//);
  assert.match(puts[0].url, new RegExp(puts[0].token));
  assert.equal(puts[0].payload.token, first.token);
  assert.ok(puts[0].payload.holes.some((hole) => hole.score != null));
  const sharedAt = getRoundSharedAt(db, shared.id);
  assert.ok(sharedAt);
  const token = getRoundShareToken(db, shared.id);
  assert.equal(token, first.token);

  followHole(db, shared.id, 4, upload);
  closeHoleOut(db, shared.id, 4);
  followHole(db, shared.id, 4, upload);
  followHole(db, shared.id, 5, upload);
  followBoard(db, shared.id, upload);
  await flushPuts();
  assert.ok(puts.length > 1);
  assert.ok(puts.every((call) => call.token === token && call.method === 'PUT'));

  const other = startRound(db, 9, 'Oak Hills');
  const beforeOther = puts.length;
  playUnsharedStretch(db, other.id, upload);
  await flushPuts();
  assert.equal(puts.length, beforeOther);
  assert.equal(isRoundShared(db, other.id), false);
  assert.equal(getRoundShareToken(db, other.id), null);

  followHole(db, shared.id, 5, upload);
  await flushPuts();
  assert.equal(puts.length, beforeOther + 1);
  assert.equal(puts[puts.length - 1].token, token);

  publishExplicitRoundShare(db, shared.id, { currentHoleNumber: 5, upload });
  assert.equal(getRoundSharedAt(db, shared.id), sharedAt);
});

test('a board code already on the phone does not count as shared', needsSqlite, async () => {
  if (!DatabaseSync) return;
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE rounds (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      course_name TEXT,
      hole_count INTEGER NOT NULL,
      share_token TEXT
    );
  `);
  raw.prepare(
    'INSERT INTO rounds (id, started_at, finished_at, course_name, hole_count, share_token) VALUES (?, ?, NULL, ?, ?, ?)',
  ).run('old-round', '2026-09-01T12:00:00.000Z', 'Pine Valley', 18, 'AB12CD');
  const db = wrap(raw);

  assert.equal(getRoundShareToken(db, 'old-round'), 'AB12CD');
  assert.equal(getRoundSharedAt(db, 'old-round'), null);
  assert.equal(isRoundShared(db, 'old-round'), false);

  const { upload, puts } = mockPutSharedPayload();
  publishRoundScoreboard(db, 'old-round', { currentHoleNumber: 3, upload });
  publishRoundScoreboard(db, 'old-round', { upload });
  await flushPuts();
  assert.equal(puts.length, 0);

  const published = publishExplicitRoundShare(db, 'old-round', { currentHoleNumber: 3, upload });
  await flushPuts();
  assert.equal(puts.length, 1);
  assert.equal(puts[0].token, 'AB12CD');
  assert.equal(published?.token, 'AB12CD');
  assert.equal(getRoundShareToken(db, 'old-round'), 'AB12CD');
  assert.ok(getRoundSharedAt(db, 'old-round'));
});

test('restore keeps shared_at on the round that was already shared', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Magnolia');
  markRoundShared(db, round.id, '2026-09-24T15:00:00.000Z');
  const token = 'KEEPME';
  db.runSync('UPDATE rounds SET share_token = ? WHERE id = ?', [token, round.id]);

  const restored = restoreRoundHistory(
    db,
    JSON.stringify({
      kind: ROUND_HISTORY_EXPORT_KIND,
      version: ROUND_HISTORY_EXPORT_VERSION,
      exportedAt: '2026-09-24T16:00:00.000Z',
      rounds: [
        {
          id: round.id,
          startedAt: round.startedAt,
          finishedAt: null,
          courseName: 'Magnolia',
          holeCount: 9,
          holes: [{ number: 1, par: 4, score: 4, putts: 2, shots: [] }],
        },
      ],
    }),
  );
  assert.equal(restored.ok, true);
  assert.equal(getRoundSharedAt(db, round.id), '2026-09-24T15:00:00.000Z');
  assert.equal(getRoundShareToken(db, round.id), token);
});

test('hole and board screens publish only through the shared gate; Share taps set the flag', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const board = readFileSync(new URL('../../app/round/[id]/board.tsx', import.meta.url), 'utf8');
  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const scoreboard = readFileSync(new URL('../services/roundScoreboard.ts', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

  assert.match(hole, /publishRoundScoreboard\(db, id, \{ currentHoleNumber: holeNumber \}\)/);
  assert.doesNotMatch(hole, /putSharedPayload|markRoundShared|publishExplicitRoundShare/);
  assert.match(board, /publishRoundScoreboard\(db, id\)/);
  assert.doesNotMatch(board, /putSharedPayload|markRoundShared|publishExplicitRoundShare/);

  const snapshot = share.slice(
    share.indexOf('export async function shareRoundSnapshot'),
    share.indexOf('export async function shareLiveBoard'),
  );
  const live = share.slice(share.indexOf('export async function shareLiveBoard'));
  assert.match(snapshot, /publishExplicitRoundShare\(/);
  assert.match(snapshot, /scorecardImageShareContent\(imageUrl\)/);
  assert.doesNotMatch(snapshot, /formatLiveBoardShare|putSharedPayload|planned\.message/);
  assert.match(live, /publishExplicitRoundShare\(/);
  assert.match(live, /formatLiveBoardShare/);
  assert.doesNotMatch(live, /putSharedPayload/);

  const publish = scoreboard.slice(
    scoreboard.indexOf('export function publishRoundScoreboard'),
    scoreboard.indexOf('export function publishExplicitRoundShare'),
  );
  assert.match(publish, /if \(!isRoundShared\(db, roundId\)\) return null/);
  assert.ok(publish.indexOf('isRoundShared') < publish.indexOf('planRoundShare'));
  assert.ok(publish.indexOf('isRoundShared') < publish.indexOf('uploadSharedPayload'));
  assert.doesNotMatch(publish, /markRoundShared/);
  const explicit = scoreboard.slice(scoreboard.indexOf('export function publishExplicitRoundShare'));
  assert.ok(explicit.indexOf('markRoundShared') < explicit.indexOf('publishRoundScoreboard'));
  const uploader = scoreboard.slice(
    scoreboard.indexOf('function uploadSharedPayload'),
    scoreboard.indexOf('export function publishRoundScoreboard'),
  );
  assert.match(uploader, /putSharedPayload/);
  assert.match(schema, /ensureColumn\(db, 'rounds', 'shared_at', 'TEXT'\)/);
  assert.doesNotMatch(schema, /UPDATE rounds SET shared_at/);
});
