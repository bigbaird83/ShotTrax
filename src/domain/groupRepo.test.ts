import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  addGroupPlayer,
  cleanPlayerName,
  getGroupGames,
  listGroupPlayers,
  listRecentPlayers,
  loadGroup,
  recentPartnersForRound,
  rememberRecentPartner,
  removeGroupPlayer,
  removeRecentPlayer,
  setGroupGames,
  setPlayerHoleScore,
  updateGroupPlayer,
} from '../db/groupRepo';
import {
  collectRoundHistoryExport,
  deleteRound,
  getHole,
  restoreRoundHistory,
  startRound,
  updateHoleScore,
} from '../db/repo';
import { migrate } from '../db/schema';
import { DEFAULT_GROUP_GAMES, planGroupGames } from './groupGames';
import { serializeRoundHistory } from './roundTransfer';

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();

function openMemory(runMigrate = true): SQLiteDatabase {
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

const skipDb = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

test('player names are trimmed to one short line', () => {
  assert.equal(cleanPlayerName('  Sam   Snead  '), 'Sam Snead');
  assert.equal(cleanPlayerName('   '), null);
  assert.equal(cleanPlayerName('x'.repeat(40))?.length, 24);
});

test('first partner adds the owner; four players max; blank name refused', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  assert.deepEqual(listGroupPlayers(db, round.id), []);
  assert.equal(addGroupPlayer(db, round.id, { name: ' ', handicap: null }).status, 'no_name');

  assert.equal(addGroupPlayer(db, round.id, { name: 'Sam', handicap: 12 }).status, 'added');
  assert.deepEqual(
    listGroupPlayers(db, round.id).map((p) => [p.name, p.isMe, p.handicap]),
    [
      ['You', true, null],
      ['Sam', false, 12],
    ],
  );
  assert.equal(addGroupPlayer(db, round.id, { name: 'Ann', handicap: null }).status, 'added');
  assert.equal(addGroupPlayer(db, round.id, { name: 'Bo', handicap: 99 }).status, 'added');
  assert.equal(listGroupPlayers(db, round.id).find((p) => p.name === 'Bo')?.handicap, null);
  assert.equal(addGroupPlayer(db, round.id, { name: 'Cy', handicap: null }).status, 'full');
  assert.equal(listGroupPlayers(db, round.id).length, 4);
});

test('scores: owner reads the hole, partners store their own; games plan from it', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  const added = addGroupPlayer(db, round.id, { name: 'Sam', handicap: null });
  assert.equal(added.status, 'added');
  if (added.status !== 'added') return;
  const sam = added.player;
  const hole1 = getHole(db, round.id, 1);
  assert.ok(hole1);
  if (!hole1) return;
  updateHoleScore(db, hole1.id, 4);
  setPlayerHoleScore(db, sam.id, 1, 5);
  setPlayerHoleScore(db, sam.id, 2, 3);
  setPlayerHoleScore(db, sam.id, 2, 4);
  setPlayerHoleScore(db, sam.id, 3, 0);

  const group = loadGroup(db, round.id);
  const me = group.players.find((p) => p.isMe);
  const partner = group.players.find((p) => p.id === sam.id);
  assert.equal(me?.scores[1], 4);
  assert.deepEqual(partner?.scores, { 1: 5, 2: 4 });
  assert.equal(group.holes.length, 18);

  const result = planGroupGames({ holes: group.holes, players: group.players, settings: group.settings });
  assert.deepEqual(result.skins?.won, { [me!.id]: 1, [sam.id]: 0 });

  setPlayerHoleScore(db, sam.id, 2, null);
  assert.deepEqual(loadGroup(db, round.id).players.find((p) => p.id === sam.id)?.scores, { 1: 5 });

  updateGroupPlayer(db, sam.id, { name: 'Samuel', handicap: 9 });
  assert.equal(listGroupPlayers(db, round.id).find((p) => p.id === sam.id)?.name, 'Samuel');
  assert.equal(listGroupPlayers(db, round.id).find((p) => p.id === sam.id)?.handicap, 9);

  removeGroupPlayer(db, sam.id);
  assert.deepEqual(
    listGroupPlayers(db, round.id).map((p) => p.isMe),
    [true],
  );
  const leftover = db.getAllSync('SELECT * FROM player_hole_scores');
  assert.equal(leftover.length, 0);
});

test('games settings round-trip; delete round clears the group', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  assert.deepEqual(getGroupGames(db, round.id), DEFAULT_GROUP_GAMES);
  setGroupGames(db, round.id, { ...DEFAULT_GROUP_GAMES, stableford: true, net: true });
  assert.equal(getGroupGames(db, round.id).stableford, true);
  const added = addGroupPlayer(db, round.id, { name: 'Sam', handicap: null });
  if (added.status === 'added') setPlayerHoleScore(db, added.player.id, 1, 4);
  deleteRound(db, round.id);
  assert.equal(db.getAllSync('SELECT * FROM round_players').length, 0);
  assert.equal(db.getAllSync('SELECT * FROM player_hole_scores').length, 0);
});

test('restoring a file over the round keeps the phone group', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  const hole1 = getHole(db, round.id, 1);
  if (hole1) updateHoleScore(db, hole1.id, 4);
  db.runSync('UPDATE rounds SET finished_at = ? WHERE id = ?', ['2026-06-01T20:00:00.000Z', round.id]);
  const file = serializeRoundHistory(collectRoundHistoryExport(db, '2026-06-02T00:00:00.000Z'));

  const added = addGroupPlayer(db, round.id, { name: 'Sam', handicap: 5 });
  if (added.status === 'added') setPlayerHoleScore(db, added.player.id, 1, 5);
  setGroupGames(db, round.id, { ...DEFAULT_GROUP_GAMES, stableford: true });
  // Change the stored round so the restore really replaces it.
  if (hole1) updateHoleScore(db, hole1.id, 6);

  const restored = restoreRoundHistory(db, file);
  assert.equal(restored.ok, true);
  assert.equal(getHole(db, round.id, 1)?.score, 4);
  const group = loadGroup(db, round.id);
  assert.deepEqual(
    group.players.map((p) => [p.name, p.handicap]),
    [
      ['You', null],
      ['Sam', 5],
    ],
  );
  assert.equal(group.players.find((p) => p.name === 'Sam')?.scores[1], 5);
  assert.equal(group.settings.stableford, true);
});

test('adding a partner records them once; case and a blank handicap do not split or wipe', skipDb, () => {
  const db = memoryDb();
  const first = startRound(db, 18, 'Group Test');
  assert.equal(addGroupPlayer(db, first.id, { name: 'bob', handicap: 12 }).status, 'added');
  assert.deepEqual(
    listRecentPlayers(db).map((player) => [player.name, player.nameKey, player.handicap]),
    [['bob', 'bob', 12]],
  );

  const second = startRound(db, 18, 'Next');
  assert.equal(addGroupPlayer(db, second.id, { name: 'Bob ', handicap: null }).status, 'added');
  const third = startRound(db, 18, 'Third');
  assert.equal(addGroupPlayer(db, third.id, { name: 'BOB', handicap: null }).status, 'added');
  const recent = listRecentPlayers(db);
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.name, 'BOB');
  assert.equal(recent[0]?.nameKey, 'bob');
  assert.equal(recent[0]?.handicap, 12);
  assert.equal(
    recent.some((player) => player.name === 'You'),
    false,
  );

  rememberRecentPartner(db, { name: 'BOB', handicap: 8, at: '2026-06-02T00:00:00.000Z' });
  assert.equal(listRecentPlayers(db)[0]?.handicap, 8);
  rememberRecentPartner(db, { name: 'Bob', handicap: 0, at: '2026-06-03T00:00:00.000Z' });
  assert.equal(listRecentPlayers(db)[0]?.handicap, 0);
  rememberRecentPartner(db, { name: 'bob', handicap: null, at: '2026-06-04T00:00:00.000Z' });
  assert.equal(listRecentPlayers(db)[0]?.name, 'bob');
  assert.equal(listRecentPlayers(db)[0]?.handicap, 0);
});

test('recent partners are newest first, and the 16th write drops the oldest', skipDb, () => {
  const db = memoryDb();
  for (let index = 0; index < 16; index += 1) {
    rememberRecentPartner(db, {
      name: `P${index}`,
      handicap: null,
      at: `2026-06-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    });
  }
  const recent = listRecentPlayers(db);
  assert.equal(recent.length, 15);
  assert.deepEqual(
    recent.map((player) => player.name),
    Array.from({ length: 15 }, (_, index) => `P${15 - index}`),
  );
  assert.equal(
    recent.some((player) => player.name === 'P0'),
    false,
  );
});

test('removing a recent partner leaves round players and scores alone', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  const added = addGroupPlayer(db, round.id, { name: 'Sam', handicap: 4 });
  assert.equal(added.status, 'added');
  if (added.status !== 'added') return;
  setPlayerHoleScore(db, added.player.id, 1, 5);
  const saved = listRecentPlayers(db).find((player) => player.name === 'Sam');
  assert.ok(saved);
  if (!saved) return;
  removeRecentPlayer(db, saved.id);
  assert.equal(listRecentPlayers(db).length, 0);
  assert.equal(listGroupPlayers(db, round.id).find((player) => player.id === added.player.id)?.handicap, 4);
  assert.equal(loadGroup(db, round.id).players.find((player) => player.id === added.player.id)?.scores[1], 5);
});

test('recent offer skips partners already in the round and hides at three partners', skipDb, () => {
  const db = memoryDb();
  const earlier = startRound(db, 18, 'Earlier');
  assert.equal(addGroupPlayer(db, earlier.id, { name: 'Sam', handicap: 5 }).status, 'added');
  assert.equal(addGroupPlayer(db, earlier.id, { name: 'Ann', handicap: null }).status, 'added');
  const round = startRound(db, 18, 'Today');
  assert.equal(addGroupPlayer(db, round.id, { name: 'sam', handicap: null }).status, 'added');
  assert.deepEqual(
    recentPartnersForRound(db, round.id).map((player) => [player.name, player.handicap]),
    [['Ann', null]],
  );
  assert.equal(addGroupPlayer(db, round.id, { name: 'Bo', handicap: null }).status, 'added');
  assert.equal(addGroupPlayer(db, round.id, { name: 'Cy', handicap: null }).status, 'added');
  assert.deepEqual(recentPartnersForRound(db, round.id), []);
  assert.equal(listRecentPlayers(db).length, 4);
});

test('deleting or restoring a round does not change the recent list, and export omits it', skipDb, () => {
  const db = memoryDb();
  const round = startRound(db, 18, 'Group Test');
  const hole1 = getHole(db, round.id, 1);
  if (hole1) updateHoleScore(db, hole1.id, 4);
  db.runSync('UPDATE rounds SET finished_at = ? WHERE id = ?', ['2026-06-01T20:00:00.000Z', round.id]);
  const file = serializeRoundHistory(collectRoundHistoryExport(db, '2026-06-02T00:00:00.000Z'));

  assert.equal(addGroupPlayer(db, round.id, { name: 'Sam', handicap: 5 }).status, 'added');
  rememberRecentPartner(db, { name: 'Pat', handicap: 3, at: '2026-06-03T00:00:00.000Z' });
  const before = listRecentPlayers(db).map((player) => [player.name, player.handicap, player.lastUsedAt]);
  const exported = serializeRoundHistory(collectRoundHistoryExport(db, '2026-06-04T00:00:00.000Z'));
  assert.equal(exported.includes('recent_players'), false);
  assert.equal(exported.includes('Pat'), false);

  deleteRound(db, round.id);
  assert.deepEqual(
    listRecentPlayers(db).map((player) => [player.name, player.handicap, player.lastUsedAt]),
    before,
  );
  assert.equal(db.getAllSync('SELECT * FROM round_players').length, 0);

  const restored = restoreRoundHistory(db, file);
  assert.equal(restored.ok, true);
  assert.deepEqual(
    listRecentPlayers(db).map((player) => [player.name, player.handicap, player.lastUsedAt]),
    before,
  );
});

test('recent_players is created, with a unique name_key, when migrating an existing database', skipDb, () => {
  const db = openMemory(false);
  db.execSync(`
    CREATE TABLE rounds (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      course_name TEXT,
      hole_count INTEGER NOT NULL
    );
  `);
  db.runSync(
    `INSERT INTO rounds (id, started_at, hole_count, course_name) VALUES ('r1', '2026-01-01T00:00:00.000Z', 18, 'Old Course')`,
  );
  migrate(db);

  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(recent_players)').map((column) => column.name);
  assert.deepEqual(columns, ['id', 'name', 'name_key', 'handicap', 'last_used_at']);
  const indexes = db.getAllSync<{ name: string; unique: number }>('PRAGMA index_list(recent_players)');
  const unique = indexes.find((index) => index.unique === 1);
  assert.equal(unique?.name, 'recent_players_name_key');
  assert.deepEqual(
    db.getAllSync<{ name: string }>('PRAGMA index_info(recent_players_name_key)').map((column) => column.name),
    ['name_key'],
  );
  assert.equal(
    db.getFirstSync<{ course_name: string }>('SELECT course_name FROM rounds WHERE id = ?', ['r1'])?.course_name,
    'Old Course',
  );

  migrate(db);
  assert.deepEqual(
    db.getAllSync<{ name: string }>('PRAGMA table_info(recent_players)').map((column) => column.name),
    ['id', 'name', 'name_key', 'handicap', 'last_used_at'],
  );
  assert.equal(
    db.getFirstSync<{ course_name: string }>('SELECT course_name FROM rounds WHERE id = ?', ['r1'])?.course_name,
    'Old Course',
  );
});
