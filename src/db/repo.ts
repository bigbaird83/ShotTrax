import type { SQLiteDatabase } from 'expo-sqlite';
import { averageWithBadges, type ClubAverage } from '../domain/averages';
import type { Club, FixQuality, Hole, OpenShot, Round, Shot } from '../domain/types';
import { newId } from '../lib/id';

type ClubRow = {
  id: string;
  name: string;
  short_name: string;
  loft_rank: number;
  sort_order: number;
  enabled: number;
};

type RoundRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  course_name: string | null;
  hole_count: number;
};

type HoleRow = {
  id: string;
  round_id: string;
  number: number;
  par: number;
  score: number | null;
  green_lat: number | null;
  green_lng: number | null;
};

type ShotRow = {
  id: string;
  hole_id: string;
  club_id: string | null;
  seq: number;
  start_lat: number;
  start_lng: number;
  start_accuracy_m: number | null;
  start_fix_quality: string;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy_m: number | null;
  end_fix_quality: string | null;
  distance_yards: number | null;
  fix_quality: string;
  impossible_jump: number;
  started_at: string;
  ended_at: string | null;
};

function mapClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    loftRank: row.loft_rank,
    sortOrder: row.sort_order,
    enabled: row.enabled === 1,
  };
}

function mapRound(row: RoundRow): Round {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    courseName: row.course_name,
    holeCount: row.hole_count,
  };
}

function mapHole(row: HoleRow): Hole {
  return {
    id: row.id,
    roundId: row.round_id,
    number: row.number,
    par: row.par,
    score: row.score,
    greenLat: row.green_lat,
    greenLng: row.green_lng,
  };
}

function mapShot(row: ShotRow): Shot {
  return {
    id: row.id,
    holeId: row.hole_id,
    clubId: row.club_id,
    seq: row.seq,
    startLat: row.start_lat,
    startLng: row.start_lng,
    startAccuracyM: row.start_accuracy_m,
    startFixQuality: row.start_fix_quality as FixQuality,
    endLat: row.end_lat,
    endLng: row.end_lng,
    endAccuracyM: row.end_accuracy_m,
    endFixQuality: row.end_fix_quality as FixQuality | null,
    distanceYards: row.distance_yards,
    fixQuality: row.fix_quality as FixQuality,
    impossibleJump: row.impossible_jump === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function listClubs(db: SQLiteDatabase, enabledOnly = false): Club[] {
  const sql = enabledOnly
    ? 'SELECT * FROM clubs WHERE enabled = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM clubs ORDER BY sort_order ASC';
  return db.getAllSync<ClubRow>(sql).map(mapClub);
}

export function setClubEnabled(db: SQLiteDatabase, id: string, enabled: boolean): void {
  db.runSync('UPDATE clubs SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export function addClub(db: SQLiteDatabase, name: string, shortName: string): Club {
  const max = db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) AS n FROM clubs');
  const sortOrder = (max?.n ?? -1) + 1;
  const club: Club = {
    id: newId(),
    name: name.trim(),
    shortName: shortName.trim() || name.trim().slice(0, 3),
    loftRank: sortOrder,
    sortOrder,
    enabled: true,
  };
  db.runSync(
    'INSERT INTO clubs (id, name, short_name, loft_rank, sort_order, enabled) VALUES (?, ?, ?, ?, ?, 1)',
    [club.id, club.name, club.shortName, club.loftRank, club.sortOrder],
  );
  return club;
}

export function updateClub(
  db: SQLiteDatabase,
  id: string,
  name: string,
  shortName: string,
): void {
  db.runSync('UPDATE clubs SET name = ?, short_name = ? WHERE id = ?', [
    name.trim(),
    shortName.trim() || name.trim().slice(0, 3),
    id,
  ]);
}

export function deleteClub(db: SQLiteDatabase, id: string): 'deleted' | 'disabled' {
  const used = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM shots WHERE club_id = ?',
    [id],
  );
  if ((used?.n ?? 0) > 0) {
    db.runSync('UPDATE clubs SET enabled = 0 WHERE id = ?', [id]);
    return 'disabled';
  }
  db.runSync('DELETE FROM clubs WHERE id = ?', [id]);
  return 'deleted';
}

export function listRounds(db: SQLiteDatabase): Round[] {
  return db
    .getAllSync<RoundRow>('SELECT * FROM rounds ORDER BY started_at DESC')
    .map(mapRound);
}

export function getRound(db: SQLiteDatabase, id: string): Round | null {
  const row = db.getFirstSync<RoundRow>('SELECT * FROM rounds WHERE id = ?', [id]);
  return row ? mapRound(row) : null;
}

export function getActiveRound(db: SQLiteDatabase): Round | null {
  const row = db.getFirstSync<RoundRow>(
    'SELECT * FROM rounds WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  return row ? mapRound(row) : null;
}

export function startRound(
  db: SQLiteDatabase,
  holeCount: 9 | 18,
  courseName: string | null,
): Round {
  const id = newId();
  const startedAt = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT INTO rounds (id, started_at, finished_at, course_name, hole_count) VALUES (?, ?, NULL, ?, ?)',
      [id, startedAt, courseName, holeCount],
    );
    for (let n = 1; n <= holeCount; n += 1) {
      db.runSync(
        'INSERT INTO holes (id, round_id, number, par, score) VALUES (?, ?, ?, 4, NULL)',
        [newId(), id, n],
      );
    }
  });
  return {
    id,
    startedAt,
    finishedAt: null,
    courseName,
    holeCount,
  };
}

export function finishRound(db: SQLiteDatabase, id: string): void {
  db.runSync('UPDATE rounds SET finished_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

export function listHoles(db: SQLiteDatabase, roundId: string): Hole[] {
  return db
    .getAllSync<HoleRow>('SELECT * FROM holes WHERE round_id = ? ORDER BY number ASC', [roundId])
    .map(mapHole);
}

export function getHole(db: SQLiteDatabase, roundId: string, number: number): Hole | null {
  const row = db.getFirstSync<HoleRow>(
    'SELECT * FROM holes WHERE round_id = ? AND number = ?',
    [roundId, number],
  );
  return row ? mapHole(row) : null;
}

export function updateHolePar(db: SQLiteDatabase, holeId: string, par: number): void {
  db.runSync('UPDATE holes SET par = ? WHERE id = ?', [par, holeId]);
}

export function updateHoleScore(db: SQLiteDatabase, holeId: string, score: number | null): void {
  db.runSync('UPDATE holes SET score = ? WHERE id = ?', [score, holeId]);
}

/** Green estimate from current GPS or a map long-press. Not a licensed course pin. */
export function setHoleGreen(
  db: SQLiteDatabase,
  holeId: string,
  green: { lat: number; lng: number } | null,
): void {
  db.runSync('UPDATE holes SET green_lat = ?, green_lng = ? WHERE id = ?', [
    green?.lat ?? null,
    green?.lng ?? null,
    holeId,
  ]);
}

export function listShotsForHole(db: SQLiteDatabase, holeId: string): Shot[] {
  return db
    .getAllSync<ShotRow>('SELECT * FROM shots WHERE hole_id = ? ORDER BY seq ASC', [holeId])
    .map(mapShot);
}

export function getOpenShotForHole(db: SQLiteDatabase, holeId: string): OpenShot | null {
  const row = db.getFirstSync<ShotRow>(
    'SELECT * FROM shots WHERE hole_id = ? AND ended_at IS NULL ORDER BY seq DESC LIMIT 1',
    [holeId],
  );
  if (!row) return null;
  return {
    id: row.id,
    startLat: row.start_lat,
    startLng: row.start_lng,
    startFixQuality: row.start_fix_quality as FixQuality,
  };
}

export function nextShotSeq(db: SQLiteDatabase, holeId: string): number {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COALESCE(MAX(seq), 0) AS n FROM shots WHERE hole_id = ?',
    [holeId],
  );
  return (row?.n ?? 0) + 1;
}

export function insertOpenShot(
  db: SQLiteDatabase,
  args: {
    holeId: string;
    clubId: string;
    seq: number;
    lat: number;
    lng: number;
    accuracyM: number | null;
    startFixQuality: FixQuality;
  },
): string {
  const id = newId();
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq,
      start_lat, start_lng, start_accuracy_m, start_fix_quality,
      distance_yards, fix_quality, impossible_jump, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)`,
    [
      id,
      args.holeId,
      args.clubId,
      args.seq,
      args.lat,
      args.lng,
      args.accuracyM,
      args.startFixQuality,
      args.startFixQuality,
      new Date().toISOString(),
    ],
  );
  return id;
}

export function applyClosedShot(
  db: SQLiteDatabase,
  close: {
    shotId: string;
    endLat: number;
    endLng: number;
    endAccuracyM: number | null;
    endFixQuality: FixQuality;
    distanceYards: number;
    impossibleJump: boolean;
    fixQuality: FixQuality;
  },
): void {
  db.runSync(
    `UPDATE shots SET
      end_lat = ?, end_lng = ?, end_accuracy_m = ?, end_fix_quality = ?,
      distance_yards = ?, fix_quality = ?, impossible_jump = ?, ended_at = ?
     WHERE id = ?`,
    [
      close.endLat,
      close.endLng,
      close.endAccuracyM,
      close.endFixQuality,
      close.distanceYards,
      close.fixQuality,
      close.impossibleJump ? 1 : 0,
      new Date().toISOString(),
      close.shotId,
    ],
  );
}

export type ClubAverageRow = ClubAverage & {
  club: Club;
};

export function listClubAverages(db: SQLiteDatabase): ClubAverageRow[] {
  const clubs = listClubs(db, false);
  const shots = db.getAllSync<{ club_id: string; distance_yards: number; fix_quality: string }>(
    `SELECT club_id, distance_yards, fix_quality
     FROM shots
     WHERE distance_yards IS NOT NULL AND club_id IS NOT NULL`,
  );
  return clubs.map((club) => {
    const forClub = shots
      .filter((s) => s.club_id === club.id)
      .map((s) => ({
        yards: s.distance_yards,
        fixQuality: s.fix_quality as FixQuality,
      }));
    return { club, ...averageWithBadges(forClub) };
  });
}

export function getClubMap(db: SQLiteDatabase): Record<string, Club> {
  const map: Record<string, Club> = {};
  for (const club of listClubs(db)) {
    map[club.id] = club;
  }
  return map;
}
