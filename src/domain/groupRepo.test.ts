import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  addGroupPlayer,
  cleanPlayerName,
  getGroupGames,
  listGroupPlayers,
  loadGroup,
  removeGroupPlayer,
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
