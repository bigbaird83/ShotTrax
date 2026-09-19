import type { SQLiteDatabase } from 'expo-sqlite';
import {
  attachHoleFromCourse,
  seedHoleFromCourse,
  type CourseLayoutSeed,
} from '../course/layout';
import { fillEstimatedCarries, type CarrySource } from '../domain/carryFill';
import { DEFAULT_BAG, isPutterClubId } from '../domain/defaultBag';
import { bagCustomizeSeenValue, BAG_CUSTOMIZE_SETTING_KEY, shouldPromptBagCustomize } from '../domain/bagCustomize';
import { planInsertPlacedShot } from '../domain/insertShot';
import {
  COURSE_DISTANCE_SETTING_KEY,
  parseCourseDistanceUnit,
  type CourseDistanceUnit,
} from '../domain/courseDistance';
import {
  COLOR_THEME_SETTING_KEY,
  parseColorThemeId,
  type ColorThemeId,
} from '../domain/colorTheme';
import { clubAverageFromShots, type ClubAverage } from '../domain/averages';
import { rememberResolvedTee } from '../course/osmOverlay';
import { isValidLatLng } from '../domain/latLng';
import { clampPenaltyStrokes, scoreAfterPenalty } from '../domain/penalty';
import { clampPutts, planMadeIt, parsePuttLengths, serializePuttLengths, type PuttLengthId } from '../domain/putts';
import type { ShotEditSnapshot } from '../domain/shotEdit';
import {
  confirmUndoAverageEligibleAt,
  confirmUndoShotEntersAverage,
} from '../domain/confirmUndo';
import { includeInDistanceAverages, planNoGpsShot, planPlacedShot } from '../domain/shotSource';
import { planUndoLastShot } from '../domain/undoLastShot';
import { planDeleteShot } from '../domain/deleteShot';
import type {
  Club,
  FixQuality,
  GreenSource,
  Hole,
  HolePenalty,
  OpenShot,
  ParSource,
  PenaltyKind,
  PenaltyReason,
  Round,
  Shot,
  ShotFixQuality,
  ShotSource,
} from '../domain/types';
import { newId } from '../lib/id';

export type { CourseLayoutSeed } from '../course/layout';

type ClubRow = {
  id: string;
  name: string;
  short_name: string;
  loft_rank: number;
  sort_order: number;
  enabled: number;
  typical_carry_yards: number | null;
};

type RoundRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  course_name: string | null;
  hole_count: number;
  course_api_id: string | null;
  course_lat: number | null;
  course_lng: number | null;
  tee_name: string | null;
  tee_rating: number | null;
  tee_slope: number | null;
  tee_total_yards: number | null;
  last_club_id: string | null;
};

type HoleRow = {
  id: string;
  round_id: string;
  number: number;
  par: number | null;
  par_source: string | null;
  score: number | null;
  yards: number | null;
  handicap: number | null;
  green_lat: number | null;
  green_lng: number | null;
  green_source: string | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
  green_depth_yards: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  putts: number | null;
  putt_lengths: string | null;
  putts_done: number | null;
};

type ShotRow = {
  id: string;
  hole_id: string;
  club_id: string | null;
  seq: number;
  start_lat: number | null;
  start_lng: number | null;
  start_accuracy_m: number | null;
  start_fix_quality: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy_m: number | null;
  end_fix_quality: string | null;
  distance_yards: number | null;
  typed_yards: number | null;
  fix_quality: string | null;
  impossible_jump: number;
  started_at: string;
  ended_at: string | null;
  source: string | null;
  suggested: number | null;
  average_eligible_at: string | null;
};

type PenaltyRow = {
  id: string;
  hole_id: string;
  strokes: number;
  reason: string;
  note: string | null;
  created_at: string;
  kind: string | null;
  lat: number | null;
  lng: number | null;
};

function mapClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    loftRank: row.loft_rank,
    sortOrder: row.sort_order,
    enabled: row.enabled === 1,
    typicalCarryYards: isPutterClubId(row.id) ? null : (row.typical_carry_yards ?? null),
  };
}

function mapGreenSource(value: string | null): GreenSource | null {
  if (value === 'user_estimate' || value === 'course_centroid') return value;
  return null;
}

function mapParSource(value: string | null): ParSource | null {
  if (value === 'course' || value === 'user') return value;
  return null;
}

function mapRound(row: RoundRow): Round {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    courseName: row.course_name,
    holeCount: row.hole_count,
    courseApiId: row.course_api_id ?? null,
    courseLat: row.course_lat ?? null,
    courseLng: row.course_lng ?? null,
    teeName: row.tee_name ?? null,
    teeRating: row.tee_rating ?? null,
    teeSlope: row.tee_slope ?? null,
    teeTotalYards: row.tee_total_yards ?? null,
    lastClubId: row.last_club_id ?? null,
  };
}

function mapHole(row: HoleRow): Hole {
  return {
    id: row.id,
    roundId: row.round_id,
    number: row.number,
    par: row.par,
    parSource: mapParSource(row.par_source),
    score: row.score,
    yards: row.yards ?? null,
    handicap: row.handicap ?? null,
    greenLat: row.green_lat,
    greenLng: row.green_lng,
    greenSource: mapGreenSource(row.green_source),
    greenFrontLat: row.green_front_lat ?? null,
    greenFrontLng: row.green_front_lng ?? null,
    greenBackLat: row.green_back_lat ?? null,
    greenBackLng: row.green_back_lng ?? null,
    greenDepthYards: row.green_depth_yards ?? null,
    teeLat: row.tee_lat ?? null,
    teeLng: row.tee_lng ?? null,
    putts: clampPutts(row.putts ?? 0),
    puttLengths: parsePuttLengths(row.putt_lengths),
    puttsDone: (row.putts_done ?? 0) === 1,
  };
}

function mapSource(value: string | null): ShotSource {
  if (value === 'no_gps') return 'no_gps';
  if (value === 'placed') return 'placed';
  return 'gps';
}

function mapFixQuality(value: string | null, source: ShotSource): ShotFixQuality | null {
  if (source === 'placed') return null;
  if (source === 'no_gps' || value === 'none') return 'none';
  if (value === 'good' || value === 'soft' || value === 'forced') return value;
  return value as FixQuality | null;
}

function mapShot(row: ShotRow): Shot {
  const source = mapSource(row.source);
  return {
    id: row.id,
    holeId: row.hole_id,
    clubId: row.club_id,
    seq: row.seq,
    startLat: row.start_lat,
    startLng: row.start_lng,
    startAccuracyM: row.start_accuracy_m,
    startFixQuality: mapFixQuality(row.start_fix_quality, source),
    endLat: row.end_lat,
    endLng: row.end_lng,
    endAccuracyM: row.end_accuracy_m,
    endFixQuality: mapFixQuality(row.end_fix_quality, source),
    distanceYards: source === 'no_gps' ? null : row.distance_yards,
    typedYards: row.typed_yards ?? null,
    fixQuality: mapFixQuality(row.fix_quality, source),
    impossibleJump: row.impossible_jump === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    source,
    suggested: row.suggested === 1,
    averageEligibleAt: row.average_eligible_at ?? null,
  };
}

function mapPenalty(row: PenaltyRow): HolePenalty {
  const reason = row.reason;
  const kind: PenaltyKind = row.kind === 'drop' ? 'drop' : 'penalty';
  return {
    id: row.id,
    holeId: row.hole_id,
    strokes: row.strokes,
    reason:
      reason === 'water' || reason === 'ob' || reason === 'unplayable' || reason === 'other'
        ? reason
        : 'other',
    note: row.note,
    createdAt: row.created_at,
    kind,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
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

export function addClub(
  db: SQLiteDatabase,
  name: string,
  shortName: string,
  typicalCarryYards: number | null = null,
): Club {
  const max = db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) AS n FROM clubs');
  const sortOrder = (max?.n ?? -1) + 1;
  const club: Club = {
    id: newId(),
    name: name.trim(),
    shortName: shortName.trim() || name.trim().slice(0, 3),
    loftRank: sortOrder,
    sortOrder,
    enabled: true,
    typicalCarryYards,
  };
  db.runSync(
    'INSERT INTO clubs (id, name, short_name, loft_rank, sort_order, enabled, typical_carry_yards) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [club.id, club.name, club.shortName, club.loftRank, club.sortOrder, club.typicalCarryYards],
  );
  return club;
}

export function updateClubCarry(db: SQLiteDatabase, id: string, typicalCarryYards: number | null): void {
  if (isPutterClubId(id)) {
    db.runSync('UPDATE clubs SET typical_carry_yards = NULL WHERE id = ?', [id]);
    return;
  }
  db.runSync('UPDATE clubs SET typical_carry_yards = ? WHERE id = ?', [typicalCarryYards, id]);
}

export function updateClub(
  db: SQLiteDatabase,
  id: string,
  name: string,
  shortName: string,
  typicalCarryYards?: number | null,
): void {
  const trimmedName = name.trim();
  const trimmedShort = shortName.trim() || trimmedName.slice(0, 3);
  if (isPutterClubId(id)) {
    db.runSync('UPDATE clubs SET name = ?, short_name = ?, typical_carry_yards = NULL WHERE id = ?', [
      trimmedName,
      trimmedShort,
      id,
    ]);
    return;
  }
  if (typicalCarryYards === undefined) {
    db.runSync('UPDATE clubs SET name = ?, short_name = ? WHERE id = ?', [
      trimmedName,
      trimmedShort,
      id,
    ]);
    return;
  }
  db.runSync('UPDATE clubs SET name = ?, short_name = ?, typical_carry_yards = ? WHERE id = ?', [
    trimmedName,
    trimmedShort,
    typicalCarryYards,
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

export function restoreDefaultBag(db: SQLiteDatabase): void {
  const existing = new Set(listClubs(db).map((club) => club.id));
  const insert = db.prepareSync(
    'INSERT INTO clubs (id, name, short_name, loft_rank, sort_order, enabled, typical_carry_yards) VALUES (?, ?, ?, ?, ?, 1, ?)',
  );
  try {
    for (const club of DEFAULT_BAG) {
      if (existing.has(club.id)) {
        db.runSync(
          'UPDATE clubs SET name = ?, short_name = ?, loft_rank = ?, sort_order = ?, enabled = 1, typical_carry_yards = ? WHERE id = ?',
          [club.name, club.shortName, club.loftRank, club.sortOrder, club.typicalCarryYards, club.id],
        );
      } else {
        insert.executeSync([
          club.id,
          club.name,
          club.shortName,
          club.loftRank,
          club.sortOrder,
          club.typicalCarryYards,
        ]);
      }
    }
  } finally {
    insert.finalizeSync();
  }
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
  layout?: CourseLayoutSeed | null,
): Round {
  const id = newId();
  const startedAt = new Date().toISOString();
  const courseApiId = layout?.apiId ?? null;
  const courseLoc = isValidLatLng(layout?.location ?? null) ? layout?.location ?? null : null;
  const previous = db.getFirstSync<RoundRow>(
    'SELECT * FROM rounds ORDER BY started_at DESC LIMIT 1',
  );
  const lastClubId = previous?.last_club_id ?? null;
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT INTO rounds (id, started_at, finished_at, course_name, hole_count, course_api_id, course_lat, course_lng, tee_name, tee_rating, tee_slope, tee_total_yards, last_club_id) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        startedAt,
        courseName,
        holeCount,
        courseApiId,
        courseLoc?.lat ?? null,
        courseLoc?.lng ?? null,
        layout?.teeName ?? null,
        layout?.teeRating ?? null,
        layout?.teeSlope ?? null,
        layout?.teeTotalYards ?? null,
        lastClubId,
      ],
    );
    for (let n = 1; n <= holeCount; n += 1) {
      const seed = layout?.holes?.find((hole) => hole.number === n);
      const applied = seedHoleFromCourse(seed ?? null);
      db.runSync(
        'INSERT INTO holes (id, round_id, number, par, par_source, score, yards, handicap, green_lat, green_lng, green_source, green_front_lat, green_front_lng, green_back_lat, green_back_lng, green_depth_yards, tee_lat, tee_lng) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newId(),
          id,
          n,
          applied.par,
          applied.parSource,
          applied.yards,
          applied.handicap,
          applied.green?.lat ?? null,
          applied.green?.lng ?? null,
          applied.greenSource,
          applied.greenFront?.lat ?? null,
          applied.greenFront?.lng ?? null,
          applied.greenBack?.lat ?? null,
          applied.greenBack?.lng ?? null,
          applied.greenDepthYards,
          isValidLatLng(seed?.teeCentroid ?? null) ? seed!.teeCentroid!.lat : null,
          isValidLatLng(seed?.teeCentroid ?? null) ? seed!.teeCentroid!.lng : null,
        ],
      );
      const tee = isValidLatLng(seed?.teeCentroid ?? null) ? seed?.teeCentroid ?? null : null;
      const green = applied.green;
      if (tee && green) {
        rememberResolvedTee({ courseId: courseApiId, holeNumber: n, green }, tee);
      }
    }
  });
  return {
    id,
    startedAt,
    finishedAt: null,
    courseName,
    holeCount,
    courseApiId,
    courseLat: courseLoc?.lat ?? null,
    courseLng: courseLoc?.lng ?? null,
    teeName: layout?.teeName ?? null,
    teeRating: layout?.teeRating ?? null,
    teeSlope: layout?.teeSlope ?? null,
    teeTotalYards: layout?.teeTotalYards ?? null,
    lastClubId,
  };
}

/**
 * Attach a nearby course to an in-progress round. Fills blank par/green only.
 * Never overwrites user par/green and never invents missing API fields.
 */
export function attachCourseToRound(
  db: SQLiteDatabase,
  roundId: string,
  courseName: string | null,
  layout: CourseLayoutSeed,
): void {
  const courseLoc = isValidLatLng(layout.location ?? null) ? layout.location ?? null : null;
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE rounds SET course_name = COALESCE(?, course_name), course_api_id = ?, course_lat = ?, course_lng = ?, tee_name = ?, tee_rating = ?, tee_slope = ?, tee_total_yards = ? WHERE id = ?',
      [
        courseName,
        layout.apiId,
        courseLoc?.lat ?? null,
        courseLoc?.lng ?? null,
        layout.teeName ?? null,
        layout.teeRating ?? null,
        layout.teeSlope ?? null,
        layout.teeTotalYards ?? null,
        roundId,
      ],
    );
    const holes = db.getAllSync<HoleRow>(
      'SELECT * FROM holes WHERE round_id = ? ORDER BY number ASC',
      [roundId],
    );
    for (const row of holes) {
      const seed = layout.holes?.find((hole) => hole.number === row.number);
      const applied = attachHoleFromCourse(
        {
          par: row.par,
          parSource: mapParSource(row.par_source),
          greenLat: row.green_lat,
          greenLng: row.green_lng,
          greenSource: mapGreenSource(row.green_source),
        },
        seed ?? null,
      );
      const tee = isValidLatLng(seed?.teeCentroid ?? null) ? seed?.teeCentroid ?? null : null;
      db.runSync(
        'UPDATE holes SET par = ?, par_source = ?, yards = ?, handicap = ?, green_lat = ?, green_lng = ?, green_source = ?, green_front_lat = ?, green_front_lng = ?, green_back_lat = ?, green_back_lng = ?, green_depth_yards = ?, tee_lat = COALESCE(?, tee_lat), tee_lng = COALESCE(?, tee_lng) WHERE id = ?',
        [
          applied.par,
          applied.parSource,
          applied.yards,
          applied.handicap,
          applied.green?.lat ?? null,
          applied.green?.lng ?? null,
          applied.greenSource,
          applied.greenFront?.lat ?? null,
          applied.greenFront?.lng ?? null,
          applied.greenBack?.lat ?? null,
          applied.greenBack?.lng ?? null,
          applied.greenDepthYards,
          tee?.lat ?? null,
          tee?.lng ?? null,
          row.id,
        ],
      );
      if (tee && applied.green) {
        rememberResolvedTee({ courseId: layout.apiId, holeNumber: row.number, green: applied.green }, tee);
      }
    }
  });
}

export function finishRound(db: SQLiteDatabase, id: string): void {
  db.runSync('UPDATE rounds SET finished_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

export function deleteRound(db: SQLiteDatabase, id: string): void {
  db.withTransactionSync(() => {
    const holes = db.getAllSync<{ id: string }>('SELECT id FROM holes WHERE round_id = ?', [id]);
    for (const hole of holes) {
      db.runSync('DELETE FROM shots WHERE hole_id = ?', [hole.id]);
      db.runSync('DELETE FROM hole_penalties WHERE hole_id = ?', [hole.id]);
    }
    db.runSync('DELETE FROM holes WHERE round_id = ?', [id]);
    db.runSync('DELETE FROM rounds WHERE id = ?', [id]);
  });
}

export function setRoundLastClub(db: SQLiteDatabase, roundId: string, clubId: string | null): void {
  db.runSync('UPDATE rounds SET last_club_id = ? WHERE id = ?', [clubId, roundId]);
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

/** Persist a course / OSM tee. Never writes the phone. Skips if already stored. */
export function saveHoleTee(
  db: SQLiteDatabase,
  holeId: string,
  tee: { lat: number; lng: number } | null,
): void {
  if (!holeId || !isValidLatLng(tee)) return;
  const row = db.getFirstSync<{ tee_lat: number | null; tee_lng: number | null }>(
    'SELECT tee_lat, tee_lng FROM holes WHERE id = ?',
    [holeId],
  );
  if (row && isValidLatLng({ lat: row.tee_lat ?? Number.NaN, lng: row.tee_lng ?? Number.NaN })) {
    return;
  }
  db.runSync('UPDATE holes SET tee_lat = ?, tee_lng = ? WHERE id = ?', [tee.lat, tee.lng, holeId]);
}

export function updateHolePar(db: SQLiteDatabase, holeId: string, par: number | null): void {
  db.runSync('UPDATE holes SET par = ?, par_source = ? WHERE id = ?', [
    par,
    par == null ? null : 'user',
    holeId,
  ]);
}

export function updateHoleScore(db: SQLiteDatabase, holeId: string, score: number | null): void {
  db.runSync('UPDATE holes SET score = ? WHERE id = ?', [score, holeId]);
}

export function updateHolePutts(
  db: SQLiteDatabase,
  holeId: string,
  putts: number,
  lengths: PuttLengthId[],
  puttsDone = false,
): void {
  const next = clampPutts(putts);
  db.runSync('UPDATE holes SET putts = ?, putt_lengths = ?, putts_done = ? WHERE id = ?', [
    next,
    serializePuttLengths(lengths.slice(0, next)),
    puttsDone ? 1 : 0,
    holeId,
  ]);
}

/** Made it: persist user-chosen buckets and mark putts entered. Walking off the green never calls this. */
export function finishHolePutts(
  db: SQLiteDatabase,
  holeId: string,
  putts: number,
  lengths: PuttLengthId[],
): void {
  const planned = planMadeIt({ putts, lengths });
  if (!planned.ok) return;
  updateHolePutts(db, holeId, planned.putts, planned.lengths, true);
}

/** Close an open GPS shot without an end pin — never invents coordinates. */
export function sealOpenShotWithoutGps(db: SQLiteDatabase, shotId: string): void {
  db.runSync('UPDATE shots SET ended_at = COALESCE(ended_at, ?) WHERE id = ?', [
    new Date().toISOString(),
    shotId,
  ]);
}

/** Green pin from current GPS, a map long-press, or a course centroid. Never invented. */
export function setHoleGreen(
  db: SQLiteDatabase,
  holeId: string,
  green: { lat: number; lng: number; source?: GreenSource } | null,
): void {
  const valid = isValidLatLng(green) ? green : null;
  db.runSync('UPDATE holes SET green_lat = ?, green_lng = ?, green_source = ? WHERE id = ?', [
    valid?.lat ?? null,
    valid?.lng ?? null,
    valid ? (green?.source ?? 'user_estimate') : null,
    holeId,
  ]);
}

export function listShotsForHole(db: SQLiteDatabase, holeId: string): Shot[] {
  return db
    .getAllSync<ShotRow>('SELECT * FROM shots WHERE hole_id = ? ORDER BY seq ASC', [holeId])
    .map(mapShot);
}

export function getShot(db: SQLiteDatabase, shotId: string): Shot | null {
  const row = db.getFirstSync<ShotRow>('SELECT * FROM shots WHERE id = ?', [shotId]);
  return row ? mapShot(row) : null;
}

export function getOpenShotForHole(db: SQLiteDatabase, holeId: string): OpenShot | null {
  const row = db.getFirstSync<ShotRow>(
    `SELECT * FROM shots
     WHERE hole_id = ?
       AND ended_at IS NULL
       AND IFNULL(source, 'gps') IN ('gps', 'placed')
       AND start_lat IS NOT NULL
       AND start_lng IS NOT NULL
     ORDER BY seq DESC LIMIT 1`,
    [holeId],
  );
  if (!row || row.start_lat == null || row.start_lng == null) return null;
  const source = mapSource(row.source);
  return {
    id: row.id,
    startLat: row.start_lat,
    startLng: row.start_lng,
    startFixQuality: source === 'placed' ? null : (row.start_fix_quality as FixQuality) ?? 'good',
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
    clubId: string | null;
    seq: number;
    lat: number;
    lng: number;
    accuracyM: number | null;
    startFixQuality: FixQuality | null;
    source?: ShotSource;
    suggested?: boolean;
  },
): string {
  const id = newId();
  const source = args.source ?? 'gps';
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq,
      start_lat, start_lng, start_accuracy_m, start_fix_quality,
      distance_yards, fix_quality, impossible_jump, started_at, source, suggested
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?, ?)`,
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
      source,
      args.suggested ? 1 : 0,
    ],
  );
  return id;
}

/** Change club only. GPS start/end and distance_yards stay; suggested badge clears.
 * Club averages follow `club_id` on the next listClubAverages() read.
 */
export function updateShotClub(db: SQLiteDatabase, shotId: string, clubId: string): void {
  db.runSync('UPDATE shots SET club_id = ?, suggested = 0 WHERE id = ?', [clubId, shotId]);
}

/** Move from/to pins: store as Placed, haversine yards, no GPS quality. Never acceptFix. */
export function applyShotPlacement(
  db: SQLiteDatabase,
  shotId: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): boolean {
  const plan = planPlacedShot(from, to);
  if (!plan.ok) return false;
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE shots SET
      start_lat = ?, start_lng = ?, start_accuracy_m = NULL, start_fix_quality = NULL,
      end_lat = ?, end_lng = ?, end_accuracy_m = NULL, end_fix_quality = NULL,
      distance_yards = ?, typed_yards = NULL, fix_quality = NULL,
      impossible_jump = ?, ended_at = COALESCE(ended_at, ?), source = ?, suggested = 0
     WHERE id = ?`,
    [
      plan.startLat,
      plan.startLng,
      plan.endLat,
      plan.endLng,
      plan.distanceYards,
      plan.impossibleJump ? 1 : 0,
      now,
      plan.source,
      shotId,
    ],
  );
  return true;
}

/** Restore a shot after a wrong edit. Writes the snapshot back — never invents GPS. */
export function restoreShotSnapshot(db: SQLiteDatabase, snap: ShotEditSnapshot): void {
  db.runSync(
    `UPDATE shots SET
      club_id = ?,
      start_lat = ?, start_lng = ?, start_accuracy_m = ?, start_fix_quality = ?,
      end_lat = ?, end_lng = ?, end_accuracy_m = ?, end_fix_quality = ?,
      distance_yards = ?, typed_yards = ?, fix_quality = ?,
      impossible_jump = ?, ended_at = ?, source = ?, suggested = ?
     WHERE id = ?`,
    [
      snap.clubId,
      snap.startLat,
      snap.startLng,
      snap.startAccuracyM,
      snap.startFixQuality,
      snap.endLat,
      snap.endLng,
      snap.endAccuracyM,
      snap.endFixQuality,
      snap.distanceYards,
      snap.typedYards,
      snap.fixQuality,
      snap.impossibleJump ? 1 : 0,
      snap.endedAt,
      snap.source,
      snap.suggested ? 1 : 0,
      snap.id,
    ],
  );
}

export function reopenShot(db: SQLiteDatabase, shotId: string): void {
  db.runSync(
    `UPDATE shots SET
      end_lat = NULL, end_lng = NULL, end_accuracy_m = NULL, end_fix_quality = NULL,
      distance_yards = NULL, impossible_jump = 0, ended_at = NULL,
      fix_quality = start_fix_quality
     WHERE id = ?`,
    [shotId],
  );
}

export function deleteShot(db: SQLiteDatabase, shotId: string): void {
  db.runSync('DELETE FROM shots WHERE id = ?', [shotId]);
}

/**
 * Delete any shot on the hole (live or Placed). Neighbors keep pins.
 * Yards rewrite only when that shot's own distance actually changed.
 * Does not reopen a neighbor. Averages recompute on the next listClubAverages().
 */
export function deleteShotOnHole(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number; shotId: string; confirmed: boolean },
): { status: 'cancel' } | { status: 'missing' } | { status: 'commit' } {
  if (!args.confirmed) return { status: 'cancel' };
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) return { status: 'missing' };
  const plan = planDeleteShot(listShotsForHole(db, hole.id), args.shotId);
  if (!plan.ok) return { status: 'missing' };
  db.withTransactionSync(() => {
    deleteShot(db, plan.deleteShotId);
    for (const row of plan.renumber) {
      db.runSync('UPDATE shots SET seq = ? WHERE id = ?', [row.seq, row.id]);
    }
    for (const row of plan.yardsUpdates) {
      db.runSync('UPDATE shots SET distance_yards = ? WHERE id = ?', [row.distanceYards, row.id]);
    }
    setRoundLastClub(db, args.roundId, plan.nextLastClubId);
  });
  return { status: 'commit' };
}

export function undoLastShot(
  db: SQLiteDatabase,
  roundId: string,
  holeNumber: number,
): { ok: true } | { ok: false; reason: 'empty' } {
  const hole = getHole(db, roundId, holeNumber);
  if (!hole) return { ok: false, reason: 'empty' };
  const plan = planUndoLastShot(listShotsForHole(db, hole.id));
  if (!plan) return { ok: false, reason: 'empty' };
  db.withTransactionSync(() => {
    deleteShot(db, plan.deleteShotId);
    if (plan.reopenShotId) {
      reopenShot(db, plan.reopenShotId);
    }
    setRoundLastClub(db, roundId, plan.nextLastClubId);
  });
  return { ok: true };
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

/** Forgotten swing: not a GPS distance shot. Never calls acceptFix/haversine. */
export function insertNoGpsShot(
  db: SQLiteDatabase,
  args: { holeId: string; clubId: string; seq: number; typedYards?: number | null },
): string {
  const id = newId();
  const plan = planNoGpsShot(args.typedYards ?? null);
  const now = new Date().toISOString();
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq,
      start_lat, start_lng, start_accuracy_m, start_fix_quality,
      end_lat, end_lng, end_accuracy_m, end_fix_quality,
      distance_yards, typed_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      args.holeId,
      args.clubId,
      args.seq,
      plan.startLat,
      plan.startLng,
      plan.startFixQuality,
      plan.endLat,
      plan.endLng,
      plan.endFixQuality,
      plan.distanceYards,
      plan.typedYards,
      plan.fixQuality,
      now,
      now,
      plan.source,
    ],
  );
  return id;
}

/** Catch-up Add shot: two player map points. Haversine yards immediately. Never acceptFix. */
export function insertPlacedShot(
  db: SQLiteDatabase,
  args: {
    holeId: string;
    clubId: string;
    seq: number;
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  },
): string | null {
  const plan = planPlacedShot(args.from, args.to);
  if (!plan.ok) return null;
  const id = newId();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq,
      start_lat, start_lng, start_accuracy_m, start_fix_quality,
      end_lat, end_lng, end_accuracy_m, end_fix_quality,
      distance_yards, typed_yards, fix_quality, impossible_jump, started_at, ended_at, source,
      average_eligible_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
    [
      id,
      args.holeId,
      args.clubId,
      args.seq,
      plan.startLat,
      plan.startLng,
      plan.endLat,
      plan.endLng,
      plan.distanceYards,
      plan.impossibleJump ? 1 : 0,
      now,
      now,
      plan.source,
      confirmUndoAverageEligibleAt(nowMs),
    ],
  );
  return id;
}

/** Insert or append a Placed shot at `seq`. Renumbers later shots. Neighbors keep pins. */
export function insertPlacedShotAtSeq(
  db: SQLiteDatabase,
  args: {
    holeId: string;
    clubId: string;
    seq: number;
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  },
): string | null {
  const shots = listShotsForHole(db, args.holeId);
  const planned = planInsertPlacedShot({
    shots,
    seq: args.seq,
    from: args.from,
    to: args.to,
    clubId: args.clubId,
  });
  if (!planned.ok) return null;
  let id: string | null = null;
  db.withTransactionSync(() => {
    for (const row of planned.renumber) {
      db.runSync('UPDATE shots SET seq = ? WHERE id = ?', [row.seq, row.id]);
    }
    id = insertPlacedShot(db, {
      holeId: args.holeId,
      clubId: args.clubId,
      seq: planned.seq,
      from: args.from,
      to: args.to,
    });
  });
  return id;
}

export function listPenaltiesForHole(db: SQLiteDatabase, holeId: string): HolePenalty[] {
  return db
    .getAllSync<PenaltyRow>(
      'SELECT * FROM hole_penalties WHERE hole_id = ? ORDER BY created_at ASC',
      [holeId],
    )
    .map(mapPenalty);
}

/** Score-only event. Never calls acceptFix, haversine, or club-average inserts. */
export function insertPenalty(
  db: SQLiteDatabase,
  args: {
    holeId: string;
    par: number | null;
    currentScore: number | null;
    strokes: number;
    reason: PenaltyReason;
    note: string | null;
    kind?: PenaltyKind;
    lat?: number | null;
    lng?: number | null;
  },
): { penalty: HolePenalty; score: number } {
  const strokes = clampPenaltyStrokes(args.strokes);
  const score = scoreAfterPenalty(args.currentScore, args.par, strokes);
  const penalty: HolePenalty = {
    id: newId(),
    holeId: args.holeId,
    strokes,
    reason: args.reason,
    note: args.note?.trim() || null,
    createdAt: new Date().toISOString(),
    kind: args.kind ?? 'penalty',
    lat: args.lat ?? null,
    lng: args.lng ?? null,
  };
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        penalty.id,
        penalty.holeId,
        penalty.strokes,
        penalty.reason,
        penalty.note,
        penalty.createdAt,
        penalty.kind,
        penalty.lat,
        penalty.lng,
      ],
    );
    db.runSync('UPDATE holes SET score = ? WHERE id = ?', [score, args.holeId]);
  });
  return { penalty, score };
}

export type ClubAverageRow = ClubAverage & {
  club: Club;
  typicalCarryYards: number | null;
  carrySource: CarrySource;
};

export function listClubAverages(db: SQLiteDatabase): ClubAverageRow[] {
  const clubs = listClubs(db, false).filter((club) => !isPutterClubId(club.id));
  const filled = fillEstimatedCarries(clubs);
  const nowMs = Date.now();
  const shots = db.getAllSync<{
    club_id: string;
    distance_yards: number;
    fix_quality: string;
    source: string | null;
    average_eligible_at: string | null;
  }>(
    `SELECT club_id, distance_yards, fix_quality, source, average_eligible_at
     FROM shots
     WHERE distance_yards IS NOT NULL AND club_id IS NOT NULL
       AND (
         (IFNULL(source, 'gps') = 'gps' AND fix_quality IN ('good', 'soft', 'forced'))
         OR IFNULL(source, 'gps') = 'placed'
       )
     ORDER BY started_at ASC`,
  );
  return clubs.map((club) => {
    const forClub = shots
      .filter(
        (s) =>
          s.club_id === club.id &&
          includeInDistanceAverages({
            source:
              s.source === 'no_gps' ? 'no_gps' : s.source === 'placed' ? 'placed' : 'gps',
            distanceYards: s.distance_yards,
            clubId: s.club_id,
            fixQuality:
              s.source === 'placed'
                ? null
                : s.fix_quality === 'none'
                  ? 'none'
                  : s.fix_quality === 'soft' || s.fix_quality === 'forced' || s.fix_quality === 'good'
                    ? s.fix_quality
                    : 'good',
          }) &&
          confirmUndoShotEntersAverage(s.average_eligible_at, nowMs),
      )
      .map((s) => {
        const quality: FixQuality | null =
          s.source === 'placed'
            ? null
            : s.fix_quality === 'soft' || s.fix_quality === 'forced' || s.fix_quality === 'good'
              ? s.fix_quality
              : null;
        return { yards: s.distance_yards, fixQuality: quality };
      });
    const fill = filled.get(club.id);
    return {
      club,
      typicalCarryYards: filled.get(club.id)?.yards ?? null,
      carrySource: filled.get(club.id)?.source ?? null,
      ...clubAverageFromShots(forClub, {
        typedCarryYards: fill?.source === 'typed' ? fill.yards : null,
        estimatedCarryYards: fill?.source === 'estimated' ? fill.yards : null,
      }),
    };
  });
}

export function getClubMap(db: SQLiteDatabase): Record<string, Club> {
  const map: Record<string, Club> = {};
  for (const club of listClubs(db)) {
    map[club.id] = club;
  }
  return map;
}

export function getSetting(db: SQLiteDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export function setSetting(db: SQLiteDatabase, key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

export function getCourseDistanceUnit(db: SQLiteDatabase): CourseDistanceUnit {
  return parseCourseDistanceUnit(getSetting(db, COURSE_DISTANCE_SETTING_KEY));
}

export function setCourseDistanceUnit(db: SQLiteDatabase, unit: CourseDistanceUnit): void {
  setSetting(db, COURSE_DISTANCE_SETTING_KEY, unit);
}

export function getColorTheme(db: SQLiteDatabase): ColorThemeId {
  return parseColorThemeId(getSetting(db, COLOR_THEME_SETTING_KEY));
}

export function setColorTheme(db: SQLiteDatabase, theme: ColorThemeId): void {
  setSetting(db, COLOR_THEME_SETTING_KEY, parseColorThemeId(theme));
}

export function hasSeenBagCustomize(db: SQLiteDatabase): boolean {
  return !shouldPromptBagCustomize(getSetting(db, BAG_CUSTOMIZE_SETTING_KEY));
}

export function markBagCustomizeSeen(db: SQLiteDatabase): void {
  setSetting(db, BAG_CUSTOMIZE_SETTING_KEY, bagCustomizeSeenValue());
}
