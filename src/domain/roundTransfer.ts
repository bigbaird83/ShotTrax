import { isClubhousePin } from '../course/hydrate';
import { haversineYards, roundYards } from './haversine';
import { isCourseCardLatLng, isValidLatLng, type LatLng } from './latLng';
import type { ShotFixQuality, ShotSource } from './types';

/**
 * Round history leaves the phone as JSON through the share sheet and comes
 * back the same way. No account. Import keeps real shot marks only.
 * Tee and green stay null when they are missing. Clubhouse never fills them.
 * Club averages are not in the file — they recompute from the imported shots.
 */

export const ROUND_HISTORY_EXPORT_KIND = 'shottrax.round-history';
export const ROUND_HISTORY_EXPORT_VERSION = 1;

export function roundTransferNeedsAccount(): false {
  return false;
}

export function roundImportInventsCoords(): false {
  return false;
}

export function roundImportFillsTeeGreenFromClubhouse(): false {
  return false;
}

export function roundImportAveragesFromShotsOnly(): true {
  return true;
}

export function roundImportWritesStoredAverages(): false {
  return false;
}

export type RoundTransferShot = {
  clubId: string | null;
  seq: number;
  start: LatLng;
  end: LatLng;
  startAccuracyM: number | null;
  endAccuracyM: number | null;
  startFixQuality: ShotFixQuality | null;
  endFixQuality: ShotFixQuality | null;
  distanceYards: number;
  typedYards: number | null;
  fixQuality: ShotFixQuality | null;
  impossibleJump: boolean;
  startedAt: string;
  endedAt: string | null;
  source: 'gps' | 'placed';
  suggested: boolean;
  holeOut: boolean;
  averageEligibleAt: string | null;
};

export type RoundTransferHole = {
  number: number;
  par: number | null;
  parSource: 'course' | 'user' | null;
  score: number | null;
  yards: number | null;
  handicap: number | null;
  tee: LatLng | null;
  green: LatLng | null;
  greenSource: 'user_estimate' | 'course_centroid' | null;
  greenFront: LatLng | null;
  greenBack: LatLng | null;
  greenDepthYards: number | null;
  putts: number;
  puttLengths: string[];
  puttsDone: boolean;
  shots: RoundTransferShot[];
};

export type RoundTransferRound = {
  startedAt: string;
  finishedAt: string | null;
  courseName: string | null;
  holeCount: 9 | 18;
  courseApiId: string | null;
  courseLat: number | null;
  courseLng: number | null;
  courseCity: string | null;
  courseState: string | null;
  courseCountry: string | null;
  teeName: string | null;
  teeRating: number | null;
  teeSlope: number | null;
  teeTotalYards: number | null;
  holes: RoundTransferHole[];
};

export type RoundHistoryDocument = {
  kind: typeof ROUND_HISTORY_EXPORT_KIND;
  version: typeof ROUND_HISTORY_EXPORT_VERSION;
  exportedAt: string;
  rounds: RoundTransferRound[];
};

export type RoundHistoryImport =
  | {
      ok: true;
      rounds: RoundTransferRound[];
      shots: number;
      rejectedShots: number;
      ignoredAverages: true;
    }
  | { ok: false; reason: 'not_shottrax' | 'empty' };

type ExportShotInput = {
  clubId: string | null;
  seq: number;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  startAccuracyM: number | null;
  endAccuracyM: number | null;
  startFixQuality: ShotFixQuality | null;
  endFixQuality: ShotFixQuality | null;
  distanceYards: number | null;
  typedYards: number | null;
  fixQuality: ShotFixQuality | null;
  impossibleJump: boolean;
  startedAt: string;
  endedAt: string | null;
  source: ShotSource;
  suggested: boolean;
  holeOut: boolean;
  averageEligibleAt?: string | null;
};

type ExportHoleInput = {
  number: number;
  par: number | null;
  parSource: 'course' | 'user' | null;
  score: number | null;
  yards: number | null;
  handicap: number | null;
  teeLat: number | null;
  teeLng: number | null;
  greenLat: number | null;
  greenLng: number | null;
  greenSource: 'user_estimate' | 'course_centroid' | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
  greenDepthYards: number | null;
  putts: number;
  puttLengths: string[];
  puttsDone: boolean;
  shots: ExportShotInput[];
};

type ExportRoundInput = {
  startedAt: string;
  finishedAt: string | null;
  courseName: string | null;
  holeCount: number;
  courseApiId: string | null;
  courseLat: number | null;
  courseLng: number | null;
  courseCity?: string | null;
  courseState?: string | null;
  courseCountry?: string | null;
  teeName: string | null;
  teeRating: number | null;
  teeSlope: number | null;
  teeTotalYards: number | null;
  holes: ExportHoleInput[];
};

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pair(lat: number | null, lng: number | null): LatLng | null {
  if (lat == null || lng == null) return null;
  const point = { lat, lng };
  return isValidLatLng(point) ? point : null;
}

/** Stored tee/green only. Clubhouse and missing coords stay null. Course location is not a fill. */
export function acceptedTransferPaint(point: LatLng | null | undefined): LatLng | null {
  if (roundImportFillsTeeGreenFromClubhouse()) return null;
  if (!isCourseCardLatLng(point) || isClubhousePin(point)) return null;
  return { lat: point.lat, lng: point.lng };
}

function readPoint(value: unknown): LatLng | null {
  const record = asRecord(value);
  if (!record) return null;
  return pair(finite(record.lat), finite(record.lng));
}

function fixQuality(value: unknown, source: 'gps' | 'placed'): ShotFixQuality | null {
  if (source === 'placed') return null;
  if (value === 'good' || value === 'soft' || value === 'forced' || value === 'none') return value;
  return null;
}

function sourceOf(value: unknown): 'gps' | 'placed' | null {
  if (value === 'gps' || value === 'placed') return value;
  return null;
}

/**
 * A shot imports only with two real marks. Missing, placeholder, or flagged
 * invented coordinates are dropped. Yards are haversine of those marks.
 */
export function acceptTransferShot(raw: unknown): RoundTransferShot | null {
  if (roundImportInventsCoords()) return null;
  const record = asRecord(raw);
  if (!record || record.invented === true) return null;
  const source = sourceOf(record.source);
  if (!source) return null;
  const start = readPoint(record.start);
  const end = readPoint(record.end);
  if (!isValidLatLng(start) || !isValidLatLng(end)) return null;
  const yards = roundYards(haversineYards(start, end));
  if (!Number.isFinite(yards) || yards <= 0) return null;
  const seq = finite(record.seq);
  const startedAt = text(record.startedAt);
  if (seq == null || seq < 1 || !startedAt) return null;
  const startFix = fixQuality(record.startFixQuality, source);
  const endFix = fixQuality(record.endFixQuality, source);
  return {
    clubId: text(record.clubId),
    seq,
    start,
    end,
    startAccuracyM: finite(record.startAccuracyM),
    endAccuracyM: finite(record.endAccuracyM),
    startFixQuality: startFix,
    endFixQuality: endFix,
    distanceYards: yards,
    typedYards: finite(record.typedYards),
    fixQuality: fixQuality(record.fixQuality, source) ?? (source === 'gps' ? startFix : null),
    impossibleJump: record.impossibleJump === true,
    startedAt,
    endedAt: text(record.endedAt),
    source,
    suggested: record.suggested === true,
    holeOut: record.holeOut === true,
    averageEligibleAt: text(record.averageEligibleAt),
  };
}

function acceptHole(raw: unknown): { hole: RoundTransferHole; rejectedShots: number } | null {
  const record = asRecord(raw);
  if (!record) return null;
  const number = finite(record.number);
  if (number == null || !Number.isInteger(number) || number < 1 || number > 18) return null;
  const shotsRaw = Array.isArray(record.shots) ? record.shots : [];
  const shots: RoundTransferShot[] = [];
  let rejectedShots = 0;
  for (const shot of shotsRaw) {
    const accepted = acceptTransferShot(shot);
    if (accepted) shots.push(accepted);
    else rejectedShots += 1;
  }
  shots.sort((a, b) => a.seq - b.seq);
  const parSource = record.parSource === 'course' || record.parSource === 'user' ? record.parSource : null;
  const greenSource =
    record.greenSource === 'user_estimate' || record.greenSource === 'course_centroid'
      ? record.greenSource
      : null;
  const putts = finite(record.putts);
  return {
    rejectedShots,
    hole: {
      number,
      par: finite(record.par),
      parSource,
      score: finite(record.score),
      yards: finite(record.yards),
      handicap: finite(record.handicap),
      tee: acceptedTransferPaint(readPoint(record.tee)),
      green: acceptedTransferPaint(readPoint(record.green)),
      greenSource: acceptedTransferPaint(readPoint(record.green)) ? greenSource : null,
      greenFront: acceptedTransferPaint(readPoint(record.greenFront)),
      greenBack: acceptedTransferPaint(readPoint(record.greenBack)),
      greenDepthYards: finite(record.greenDepthYards),
      putts: putts != null && putts >= 0 ? Math.min(5, Math.round(putts)) : 0,
      puttLengths: Array.isArray(record.puttLengths)
        ? record.puttLengths.filter((item): item is string => typeof item === 'string')
        : [],
      puttsDone: record.puttsDone === true,
      shots,
    },
  };
}

function shotFromExport(shot: ExportShotInput): RoundTransferShot | null {
  return acceptTransferShot({
    clubId: shot.clubId,
    seq: shot.seq,
    start: pair(shot.startLat, shot.startLng),
    end: pair(shot.endLat, shot.endLng),
    startAccuracyM: shot.startAccuracyM,
    endAccuracyM: shot.endAccuracyM,
    startFixQuality: shot.startFixQuality,
    endFixQuality: shot.endFixQuality,
    distanceYards: shot.distanceYards,
    typedYards: shot.typedYards,
    fixQuality: shot.fixQuality,
    impossibleJump: shot.impossibleJump,
    startedAt: shot.startedAt,
    endedAt: shot.endedAt,
    source: shot.source,
    suggested: shot.suggested,
    holeOut: shot.holeOut,
    averageEligibleAt: shot.averageEligibleAt ?? null,
  });
}

export function buildRoundHistoryExport(args: {
  rounds: readonly ExportRoundInput[];
  exportedAt: string;
}): RoundHistoryDocument {
  const rounds: RoundTransferRound[] = [];
  for (const round of args.rounds) {
    const startedAt = text(round.startedAt);
    if (!startedAt) continue;
    const holeCount = round.holeCount === 9 ? 9 : round.holeCount === 18 ? 18 : null;
    if (!holeCount) continue;
    const holes: RoundTransferHole[] = [];
    for (const hole of round.holes) {
      const shots = hole.shots
        .map(shotFromExport)
        .filter((shot): shot is RoundTransferShot => shot != null);
      holes.push({
        number: hole.number,
        par: hole.par,
        parSource: hole.parSource,
        score: hole.score,
        yards: hole.yards,
        handicap: hole.handicap,
        tee: acceptedTransferPaint(pair(hole.teeLat, hole.teeLng)),
        green: acceptedTransferPaint(pair(hole.greenLat, hole.greenLng)),
        greenSource: acceptedTransferPaint(pair(hole.greenLat, hole.greenLng)) ? hole.greenSource : null,
        greenFront: acceptedTransferPaint(pair(hole.greenFrontLat, hole.greenFrontLng)),
        greenBack: acceptedTransferPaint(pair(hole.greenBackLat, hole.greenBackLng)),
        greenDepthYards: hole.greenDepthYards,
        putts: hole.putts,
        puttLengths: hole.puttLengths,
        puttsDone: hole.puttsDone,
        shots,
      });
    }
    rounds.push({
      startedAt,
      finishedAt: text(round.finishedAt),
      courseName: text(round.courseName),
      holeCount,
      courseApiId: text(round.courseApiId),
      courseLat: finite(round.courseLat),
      courseLng: finite(round.courseLng),
      courseCity: text(round.courseCity),
      courseState: text(round.courseState),
      courseCountry: text(round.courseCountry),
      teeName: text(round.teeName),
      teeRating: finite(round.teeRating),
      teeSlope: finite(round.teeSlope),
      teeTotalYards: finite(round.teeTotalYards),
      holes,
    });
  }
  return {
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: text(args.exportedAt) ?? new Date(0).toISOString(),
    rounds,
  };
}

export function serializeRoundHistory(doc: RoundHistoryDocument): string {
  return JSON.stringify(doc);
}

export function planRoundHistoryImport(raw: unknown): RoundHistoryImport {
  const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
  const record = asRecord(parsed);
  if (!record || record.kind !== ROUND_HISTORY_EXPORT_KIND || record.version !== ROUND_HISTORY_EXPORT_VERSION) {
    return { ok: false, reason: 'not_shottrax' };
  }
  if (roundImportWritesStoredAverages()) {
    return { ok: false, reason: 'not_shottrax' };
  }
  void record.averages;
  const roundsRaw = Array.isArray(record.rounds) ? record.rounds : [];
  const rounds: RoundTransferRound[] = [];
  let shots = 0;
  let rejectedShots = 0;
  for (const item of roundsRaw) {
    const row = asRecord(item);
    if (!row) continue;
    const startedAt = text(row.startedAt);
    const holeCount = row.holeCount === 9 ? 9 : row.holeCount === 18 ? 18 : null;
    if (!startedAt || !holeCount) continue;
    const holes: RoundTransferHole[] = [];
    const holeRows = Array.isArray(row.holes) ? row.holes : [];
    for (const holeRaw of holeRows) {
      const accepted = acceptHole(holeRaw);
      if (!accepted) continue;
      holes.push(accepted.hole);
      shots += accepted.hole.shots.length;
      rejectedShots += accepted.rejectedShots;
    }
    const courseLat = finite(row.courseLat);
    const courseLng = finite(row.courseLng);
    rounds.push({
      startedAt,
      finishedAt: text(row.finishedAt),
      courseName: text(row.courseName),
      holeCount,
      courseApiId: text(row.courseApiId),
      courseLat,
      courseLng,
      courseCity: text(row.courseCity),
      courseState: text(row.courseState),
      courseCountry: text(row.courseCountry),
      teeName: text(row.teeName),
      teeRating: finite(row.teeRating),
      teeSlope: finite(row.teeSlope),
      teeTotalYards: finite(row.teeTotalYards),
      holes,
    });
  }
  if (rounds.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, rounds, shots, rejectedShots, ignoredAverages: true };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function formatRestoreSummary(args: { rounds: number; shots: number; rejectedShots: number }): string {
  const rounds = `${args.rounds} round${args.rounds === 1 ? '' : 's'}`;
  const shots = `${args.shots} shot${args.shots === 1 ? '' : 's'}`;
  const skipped =
    args.rejectedShots > 0
      ? ` ${args.rejectedShots} shot${args.rejectedShots === 1 ? '' : 's'} skipped — no real marks.`
      : '';
  return `Restored ${rounds}, ${shots}.${skipped}`;
}

export function roundHistoryShareTitle(): 'ShotTraxx rounds' {
  return 'ShotTraxx rounds';
}
