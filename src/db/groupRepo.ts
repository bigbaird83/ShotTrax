import type { SQLiteDatabase } from 'expo-sqlite';
import {
  DEFAULT_GROUP_GAMES,
  GROUP_MAX_PLAYERS,
  parseGroupGameSettings,
  parseGroupHandicap,
  type GroupGameSettings,
  type GroupHoleIn,
  type GroupPlayerIn,
} from '../domain/groupGames';
import { finishedHoleDisplayScore } from '../domain/holeScore';
import { totalPenaltyStrokes } from '../domain/penalty';
import { newId } from '../lib/id';
import { listHoles, listPenaltiesForHole, listShotsForHole } from './repo';

/** Default name for the phone's owner in a group. */
export const GROUP_ME_NAME = 'You';
const MAX_NAME_LENGTH = 24;

export type GroupPlayer = {
  id: string;
  roundId: string;
  name: string;
  handicap: number | null;
  isMe: boolean;
  sortOrder: number;
};

type PlayerRow = {
  id: string;
  round_id: string;
  name: string;
  handicap: number | null;
  is_me: number;
  sort_order: number;
};

function mapPlayer(row: PlayerRow): GroupPlayer {
  return {
    id: row.id,
    roundId: row.round_id,
    name: row.name,
    handicap: parseGroupHandicap(row.handicap),
    isMe: row.is_me === 1,
    sortOrder: row.sort_order,
  };
}

/** Trimmed, one line, short. Blank → null. */
export function cleanPlayerName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name ? name : null;
}

export function listGroupPlayers(db: SQLiteDatabase, roundId: string): GroupPlayer[] {
  return db
    .getAllSync<PlayerRow>(
      'SELECT * FROM round_players WHERE round_id = ? ORDER BY is_me DESC, sort_order ASC',
      [roundId],
    )
    .map(mapPlayer);
}

function ensureMe(db: SQLiteDatabase, roundId: string): void {
  const me = db.getFirstSync<{ id: string }>(
    'SELECT id FROM round_players WHERE round_id = ? AND is_me = 1',
    [roundId],
  );
  if (me) return;
  db.runSync(
    'INSERT INTO round_players (id, round_id, name, handicap, is_me, sort_order) VALUES (?, ?, ?, NULL, 1, 0)',
    [newId(), roundId, GROUP_ME_NAME],
  );
}

export type AddPlayerResult =
  | { status: 'added'; player: GroupPlayer }
  | { status: 'full' }
  | { status: 'no_name' };

/** Adds a playing partner. The owner row is created with the first partner. Max four in all. */
export function addGroupPlayer(
  db: SQLiteDatabase,
  roundId: string,
  args: { name: string; handicap: number | null },
): AddPlayerResult {
  const name = cleanPlayerName(args.name);
  if (!name) return { status: 'no_name' };
  let player: GroupPlayer | null = null;
  let full = false;
  db.withTransactionSync(() => {
    ensureMe(db, roundId);
    const players = listGroupPlayers(db, roundId);
    if (players.length >= GROUP_MAX_PLAYERS) {
      full = true;
      return;
    }
    const id = newId();
    const sortOrder = Math.max(0, ...players.map((p) => p.sortOrder)) + 1;
    db.runSync(
      'INSERT INTO round_players (id, round_id, name, handicap, is_me, sort_order) VALUES (?, ?, ?, ?, 0, ?)',
      [id, roundId, name, parseGroupHandicap(args.handicap), sortOrder],
    );
    player = listGroupPlayers(db, roundId).find((p) => p.id === id) ?? null;
  });
  if (full) return { status: 'full' };
  return player ? { status: 'added', player } : { status: 'no_name' };
}

export function updateGroupPlayer(
  db: SQLiteDatabase,
  playerId: string,
  args: { name?: string; handicap?: number | null },
): void {
  if (args.name !== undefined) {
    const name = cleanPlayerName(args.name);
    if (name) db.runSync('UPDATE round_players SET name = ? WHERE id = ?', [name, playerId]);
  }
  if (args.handicap !== undefined) {
    db.runSync('UPDATE round_players SET handicap = ? WHERE id = ?', [parseGroupHandicap(args.handicap), playerId]);
  }
}

/** Removes a partner and their scores. The owner row stays. */
export function removeGroupPlayer(db: SQLiteDatabase, playerId: string): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM player_hole_scores WHERE player_id = ?', [playerId]);
    db.runSync('DELETE FROM round_players WHERE id = ? AND is_me = 0', [playerId]);
  });
}

/** A partner's strokes on a hole. Null clears it. The owner's score is the hole's own score. */
export function setPlayerHoleScore(
  db: SQLiteDatabase,
  playerId: string,
  holeNumber: number,
  strokes: number | null,
): void {
  if (strokes == null) {
    db.runSync('DELETE FROM player_hole_scores WHERE player_id = ? AND hole_number = ?', [playerId, holeNumber]);
    return;
  }
  if (!Number.isInteger(strokes) || strokes < 1 || strokes > 20) return;
  db.runSync(
    `INSERT INTO player_hole_scores (player_id, hole_number, strokes) VALUES (?, ?, ?)
     ON CONFLICT (player_id, hole_number) DO UPDATE SET strokes = excluded.strokes`,
    [playerId, holeNumber, strokes],
  );
}

export function getGroupGames(db: SQLiteDatabase, roundId: string): GroupGameSettings {
  const row = db.getFirstSync<{ group_games: string | null }>('SELECT group_games FROM rounds WHERE id = ?', [roundId]);
  if (!row?.group_games) return DEFAULT_GROUP_GAMES;
  try {
    return parseGroupGameSettings(JSON.parse(row.group_games));
  } catch {
    return DEFAULT_GROUP_GAMES;
  }
}

export function setGroupGames(db: SQLiteDatabase, roundId: string, settings: GroupGameSettings): void {
  db.runSync('UPDATE rounds SET group_games = ? WHERE id = ?', [JSON.stringify(settings), roundId]);
}

/** The owner's score on each hole: posted score, or logged strokes once the hole is closed. */
function ownerScores(db: SQLiteDatabase, roundId: string): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const hole of listHoles(db, roundId)) {
    out[hole.number] = hole.puttsDone
      ? finishedHoleDisplayScore({
          score: hole.score,
          shotCount: listShotsForHole(db, hole.id).length,
          putts: hole.putts,
          penaltyStrokes: totalPenaltyStrokes(listPenaltiesForHole(db, hole.id)),
        })
      : hole.score;
  }
  return out;
}

export type GroupSnapshot = {
  holes: GroupHoleIn[];
  players: (GroupPlayer & { scores: GroupPlayerIn['scores'] })[];
  settings: GroupGameSettings;
};

/** Everything the group screen and games need for one round. */
export function loadGroup(db: SQLiteDatabase, roundId: string): GroupSnapshot {
  const holes = listHoles(db, roundId).map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.handicap,
  }));
  const players = listGroupPlayers(db, roundId);
  const rows = db.getAllSync<{ player_id: string; hole_number: number; strokes: number }>(
    `SELECT s.player_id, s.hole_number, s.strokes FROM player_hole_scores s
     INNER JOIN round_players p ON p.id = s.player_id WHERE p.round_id = ?`,
    [roundId],
  );
  const mine = players.some((p) => p.isMe) ? ownerScores(db, roundId) : {};
  return {
    holes,
    settings: getGroupGames(db, roundId),
    players: players.map((player) => ({
      ...player,
      scores: player.isMe
        ? mine
        : Object.fromEntries(rows.filter((r) => r.player_id === player.id).map((r) => [r.hole_number, r.strokes])),
    })),
  };
}
