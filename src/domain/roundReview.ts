import { isPutterClubId } from './defaultBag';
import { planFairwayGir, type FairwayGirTotals, type FairwayResult } from './fairwayGir';
import { formatHoleTimeSpan } from './livePace';
import { planNerdOut, type NerdOutMarks } from './nerdOut';
import { formatHistoryCourse, formatHistoryDate } from './roundHistory';
import { includeInDistanceAverages } from './shotSource';
import type { ShotFixQuality, ShotSource } from './types';

/**
 * Review previous rounds — list and one-round stats.
 * Everything here comes from saved rows (rounds / holes / shots / penalties).
 * No live GPS, no club book seeds, nothing invented. Fairways are player taps; GIR is from closed holes.
 */

export type ReviewRoundIn = {
  id: string;
  courseName: string | null;
  startedAt: string;
  finishedAt: string | null;
  holes: { score: number | null; par: number | null }[];
};

export type ReviewRoundRow = {
  id: string;
  courseName: string;
  date: string;
  score: number | null;
  toPar: number | null;
};

/** Finished rounds only, newest first. Score / vs par from stored hole scores. */
export function planReviewRounds(rounds: ReviewRoundIn[]): ReviewRoundRow[] {
  return rounds
    .filter((round) => round.finishedAt != null)
    .slice()
    .sort((a, b) => sortKey(b) - sortKey(a))
    .map((round) => {
      const totals = planNerdOut({
        holeScores: round.holes.map((hole) => hole.score),
        holePutts: round.holes.map(() => 0),
        holePars: round.holes.map((hole) => hole.par),
      });
      return {
        id: round.id,
        courseName: formatHistoryCourse(round.courseName),
        date: formatHistoryDate(round.finishedAt ?? round.startedAt),
        score: totals.score,
        toPar: totals.toPar,
      };
    });
}

function sortKey(round: ReviewRoundIn): number {
  const ms = Date.parse(round.finishedAt ?? round.startedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export type ReviewShotIn = {
  clubId: string | null;
  source: ShotSource;
  distanceYards: number | null;
  fixQuality: ShotFixQuality | null;
  impossibleJump?: boolean;
};

export type ReviewHoleIn = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
  startedAt: string | null;
  completedAt: string | null;
  shots: ReviewShotIn[];
  penaltyStrokes: number;
  /** Made it / Hole Out ran. GIR needs it. Older callers omit → no GIR. */
  puttsDone?: boolean;
  fairway?: FairwayResult | null;
};

export type ReviewClub = { id: string; name: string; sortOrder: number };

export type ReviewShotPick = { yards: number; clubId: string | null; clubName: string | null };

export type ReviewRoundStats = {
  score: number | null;
  toPar: number | null;
  holesPlayed: number;
  marks: NerdOutMarks;
  putts: number;
  puttsPerHole: number | null;
  longest: ReviewShotPick | null;
  shortestFullSwing: ReviewShotPick | null;
  clubAverages: { id: string; name: string; count: number; avgYards: number }[];
  parAverages: { par: 3 | 4 | 5; holes: number; avg: number }[];
  holeTimes: { number: number; span: string }[];
  penaltyStrokes: number;
  fairwayGir: FairwayGirTotals;
};

/** One saved round's stats. Shot yards use the same samples as club averages; putter is never a full swing. */
export function planRoundStats(args: {
  holes: ReviewHoleIn[];
  clubs: Record<string, ReviewClub>;
}): ReviewRoundStats {
  const totals = planNerdOut({
    holeScores: args.holes.map((hole) => hole.score),
    holePutts: args.holes.map((hole) => hole.putts),
    holePars: args.holes.map((hole) => hole.par),
  });

  const samples = args.holes
    .flatMap((hole) => hole.shots)
    .filter(
      (shot) =>
        !shot.impossibleJump &&
        !isPutterClubId(shot.clubId) &&
        includeInDistanceAverages(shot) &&
        shot.distanceYards != null &&
        Number.isFinite(shot.distanceYards) &&
        shot.distanceYards > 0,
    )
    .map((shot) => ({ yards: Math.round(shot.distanceYards as number), clubId: shot.clubId }));

  const pick = (row: { yards: number; clubId: string | null } | undefined): ReviewShotPick | null =>
    row
      ? {
          yards: row.yards,
          clubId: row.clubId,
          clubName: row.clubId ? (args.clubs[row.clubId]?.name ?? null) : null,
        }
      : null;
  const longest = pick(samples.reduce<(typeof samples)[number] | undefined>(
    (best, row) => (best == null || row.yards > best.yards ? row : best),
    undefined,
  ));
  const shortest = pick(samples.reduce<(typeof samples)[number] | undefined>(
    (best, row) => (best == null || row.yards < best.yards ? row : best),
    undefined,
  ));

  const byClub = new Map<string, number[]>();
  for (const row of samples) {
    if (!row.clubId) continue;
    const list = byClub.get(row.clubId) ?? [];
    list.push(row.yards);
    byClub.set(row.clubId, list);
  }
  const clubAverages = [...byClub.entries()]
    .map(([id, yards]) => ({
      id,
      name: args.clubs[id]?.name ?? 'Club',
      sortOrder: args.clubs[id]?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      count: yards.length,
      avgYards: Math.round(yards.reduce((sum, n) => sum + n, 0) / yards.length),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ sortOrder: _sortOrder, ...row }) => row);

  const parAverages = ([3, 4, 5] as const)
    .map((par) => {
      const scores = args.holes
        .filter((hole) => hole.par === par && hole.score != null)
        .map((hole) => hole.score as number);
      if (scores.length === 0) return null;
      const avg = Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 100) / 100;
      return { par, holes: scores.length, avg };
    })
    .filter((row): row is { par: 3 | 4 | 5; holes: number; avg: number } => row != null);

  const holeTimes = args.holes
    .map((hole) => ({ number: hole.number, span: formatHoleTimeSpan(hole) }))
    .filter((row): row is { number: number; span: string } => row.span != null);

  return {
    score: totals.score,
    toPar: totals.toPar,
    holesPlayed: totals.holesScored,
    marks: totals.marks,
    putts: totals.putts,
    puttsPerHole: totals.puttsPerHole,
    longest,
    shortestFullSwing: shortest,
    clubAverages,
    parAverages,
    holeTimes,
    penaltyStrokes: args.holes.reduce((sum, hole) => sum + hole.penaltyStrokes, 0),
    fairwayGir: planFairwayGir(
      args.holes.map((hole) => ({
        par: hole.par,
        score: hole.score,
        putts: hole.putts,
        puttsDone: hole.puttsDone === true,
        fairway: hole.fairway ?? null,
        shotCount: hole.shots.length,
        penaltyStrokes: hole.penaltyStrokes,
      })),
    ),
  };
}

/** Round stats show fairways (player taps) and greens in regulation (closed holes). */
export function roundStatsShowsFirGir(): true {
  return true;
}
