/**
 * Handicap index (World Handicap System style) from saved rounds only.
 *
 * - Score differential = (113 / slope) × (adjusted gross score − course rating). PCC = 0.
 * - Adjusted gross score caps each hole at net double bogey (par + 2 + strokes received),
 *   using the index from the rounds before it. With no index yet the cap is par + 5.
 * - Two 9-hole rounds combine into one 18-hole score (oldest first).
 * - Index = average of the lowest N of the most recent 20 differentials (WHS table),
 *   rounded to the nearest tenth, max 54.0.
 *
 * Not modeled: playing conditions (PCC), soft/hard caps, exceptional-score reduction.
 * A round with missing rating, slope, par, or any hole score never counts — nothing invented.
 */

export const HANDICAP_MAX_INDEX = 54;
export const HANDICAP_WINDOW = 20;
export const HANDICAP_MIN_SCORES = 3;
const STANDARD_SLOPE = 113;

export type HandicapHoleIn = {
  number: number;
  par: number | null;
  score: number | null;
  /** Stroke index 1–18 from course data. Null → strokes go to holes with an index first. */
  strokeIndex: number | null;
};

export type HandicapRoundIn = {
  id: string;
  courseName: string | null;
  startedAt: string;
  finishedAt: string | null;
  holeCount: number;
  teeRating: number | null;
  teeSlope: number | null;
  holes: HandicapHoleIn[];
};

export type HandicapEntry = {
  /** One id for an 18-hole round, two for a combined pair of 9s. */
  roundIds: string[];
  courseName: string;
  playedAt: string;
  adjustedScore: number;
  rating: number;
  slope: number;
  differential: number;
  nine: boolean;
  /** Counted in the current index (lowest N of the last 20). */
  used: boolean;
};

export type HandicapPlan = {
  index: number | null;
  /** Newest first. */
  entries: HandicapEntry[];
  /** Differentials in the last-20 window. */
  counted: number;
  /** How many of them the index averages. 0 before three scores. */
  usedCount: number;
  /** Scores still needed before an index exists. 0 once there is one. */
  scoresToIndex: number;
  /** A finished 9-hole round is waiting for a second 9 to pair with. */
  pendingNine: boolean;
};

export type HandicapSkipReason = 'unfinished' | 'no_rating' | 'no_slope' | 'missing_par' | 'missing_score';

function validPar(par: number | null): par is number {
  return par != null && Number.isInteger(par) && par >= 3 && par <= 6;
}

function validScore(score: number | null): score is number {
  return score != null && Number.isInteger(score) && score >= 1;
}

function roundTenth(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** Why a round can't count, or null when it can. */
export function handicapSkipReason(round: HandicapRoundIn): HandicapSkipReason | null {
  if (round.finishedAt == null) return 'unfinished';
  if (round.teeRating == null || !Number.isFinite(round.teeRating) || round.teeRating <= 0) return 'no_rating';
  if (
    round.teeSlope == null ||
    !Number.isInteger(round.teeSlope) ||
    round.teeSlope < 55 ||
    round.teeSlope > 155
  ) {
    return 'no_slope';
  }
  const holes = playedHoles(round);
  if (holes.length < round.holeCount) return 'missing_score';
  if (holes.some((hole) => !validPar(hole.par))) return 'missing_par';
  if (holes.some((hole) => !validScore(hole.score))) return 'missing_score';
  return null;
}

function playedHoles(round: HandicapRoundIn): HandicapHoleIn[] {
  return round.holes
    .filter((hole) => hole.number >= 1 && hole.number <= round.holeCount)
    .sort((a, b) => a.number - b.number);
}

/**
 * Rating for the holes played. A 9-hole round on an 18-hole tee (rating above 50)
 * uses half the 18-hole rating; a true 9-hole rating is used as-is.
 */
export function ratingForRound(holeCount: number, teeRating: number): number {
  if (holeCount === 9 && teeRating > 50) return roundTenth(teeRating / 2);
  return teeRating;
}

/**
 * Course handicap = index × slope / 113 + (rating − par), rounded.
 * 9 holes use half the index. Null index → null.
 */
export function courseHandicap(args: {
  index: number | null;
  slope: number;
  rating: number;
  par: number;
  holeCount: number;
}): number | null {
  if (args.index == null || !Number.isFinite(args.index)) return null;
  const index = args.holeCount === 9 ? args.index / 2 : args.index;
  return Math.round(index * (args.slope / STANDARD_SLOPE) + (args.rating - args.par));
}

/**
 * Strokes received per hole. Holes ranked by stroke index (lowest = hardest);
 * holes with no index take strokes after those with one, in hole order.
 * Plus handicaps (≤ 0) receive none.
 */
export function strokesReceived(holes: readonly HandicapHoleIn[], courseHcp: number | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const hole of holes) out.set(hole.number, 0);
  if (courseHcp == null || courseHcp <= 0 || holes.length === 0) return out;
  const ranked = [...holes].sort((a, b) => {
    const sa = a.strokeIndex ?? Number.MAX_SAFE_INTEGER;
    const sb = b.strokeIndex ?? Number.MAX_SAFE_INTEGER;
    return sa - sb || a.number - b.number;
  });
  const base = Math.floor(courseHcp / holes.length);
  const extra = courseHcp % holes.length;
  ranked.forEach((hole, rank) => out.set(hole.number, base + (rank < extra ? 1 : 0)));
  return out;
}

/** Hole scores capped at net double bogey, or par + 5 with no index yet. */
export function adjustedGrossScore(
  holes: readonly HandicapHoleIn[],
  courseHcp: number | null,
): number {
  const strokes = strokesReceived(holes, courseHcp);
  return holes.reduce((sum, hole) => {
    const par = hole.par as number;
    const score = hole.score as number;
    const cap = courseHcp == null ? par + 5 : par + 2 + (strokes.get(hole.number) ?? 0);
    return sum + Math.min(score, cap);
  }, 0);
}

export function scoreDifferential(adjustedScore: number, rating: number, slope: number): number {
  return roundTenth((STANDARD_SLOPE / slope) * (adjustedScore - rating));
}

/** WHS table: how many of the lowest differentials to average, and the adjustment. */
export function differentialsToUse(count: number): { use: number; adjust: number } {
  if (count < 3) return { use: 0, adjust: 0 };
  if (count === 3) return { use: 1, adjust: -2 };
  if (count === 4) return { use: 1, adjust: -1 };
  if (count === 5) return { use: 1, adjust: 0 };
  if (count === 6) return { use: 2, adjust: -1 };
  if (count <= 8) return { use: 2, adjust: 0 };
  if (count <= 11) return { use: 3, adjust: 0 };
  if (count <= 14) return { use: 4, adjust: 0 };
  if (count <= 16) return { use: 5, adjust: 0 };
  if (count <= 18) return { use: 6, adjust: 0 };
  if (count === 19) return { use: 7, adjust: 0 };
  return { use: 8, adjust: 0 };
}

/**
 * Index from differentials, oldest first. Returns the index and which positions
 * (in the input) were averaged.
 */
export function indexFromDifferentials(differentials: readonly number[]): {
  index: number | null;
  usedPositions: Set<number>;
} {
  const start = Math.max(0, differentials.length - HANDICAP_WINDOW);
  const window = differentials.slice(start).map((value, i) => ({ value, pos: start + i }));
  const { use, adjust } = differentialsToUse(window.length);
  if (use === 0) return { index: null, usedPositions: new Set() };
  const lowest = [...window].sort((a, b) => a.value - b.value || b.pos - a.pos).slice(0, use);
  const avg = lowest.reduce((sum, row) => sum + row.value, 0) / use;
  const index = Math.min(HANDICAP_MAX_INDEX, roundTenth(avg + adjust));
  return { index, usedPositions: new Set(lowest.map((row) => row.pos)) };
}

function playedAt(round: HandicapRoundIn): string {
  return round.finishedAt ?? round.startedAt;
}

function timeKey(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function planHandicap(rounds: readonly HandicapRoundIn[]): HandicapPlan {
  const eligible = rounds
    .filter((round) => (round.holeCount === 9 || round.holeCount === 18) && handicapSkipReason(round) == null)
    .slice()
    .sort((a, b) => timeKey(playedAt(a)) - timeKey(playedAt(b)));

  const chronological: Omit<HandicapEntry, 'used'>[] = [];
  let pendingNine: { round: HandicapRoundIn; adjusted: number; rating: number } | null = null;

  for (const round of eligible) {
    const holes = playedHoles(round);
    const rating = ratingForRound(round.holeCount, round.teeRating as number);
    const slope = round.teeSlope as number;
    const par = holes.reduce((sum, hole) => sum + (hole.par as number), 0);
    const running = indexFromDifferentials(chronological.map((row) => row.differential)).index;
    const hcp = courseHandicap({ index: running, slope, rating, par, holeCount: round.holeCount });
    const adjusted = adjustedGrossScore(holes, hcp);

    if (round.holeCount === 18) {
      chronological.push({
        roundIds: [round.id],
        courseName: round.courseName?.trim() || 'Round',
        playedAt: playedAt(round),
        adjustedScore: adjusted,
        rating,
        slope,
        differential: scoreDifferential(adjusted, rating, slope),
        nine: false,
      });
      continue;
    }

    if (!pendingNine) {
      pendingNine = { round, adjusted, rating };
      continue;
    }
    const first = pendingNine;
    pendingNine = null;
    const comboRating = roundTenth(first.rating + rating);
    const comboSlope = Math.round(((first.round.teeSlope as number) + slope) / 2);
    const comboScore = first.adjusted + adjusted;
    const firstName = first.round.courseName?.trim() || 'Round';
    const secondName = round.courseName?.trim() || 'Round';
    chronological.push({
      roundIds: [first.round.id, round.id],
      courseName: firstName === secondName ? `${firstName} · 9 + 9` : `${firstName} + ${secondName}`,
      playedAt: playedAt(round),
      adjustedScore: comboScore,
      rating: comboRating,
      slope: comboSlope,
      differential: scoreDifferential(comboScore, comboRating, comboSlope),
      nine: true,
    });
  }

  const { index, usedPositions } = indexFromDifferentials(chronological.map((row) => row.differential));
  const counted = Math.min(HANDICAP_WINDOW, chronological.length);
  const entries = chronological
    .map((row, pos) => ({ ...row, used: usedPositions.has(pos) }))
    .reverse();
  return {
    index,
    entries,
    counted,
    usedCount: usedPositions.size,
    scoresToIndex: Math.max(0, HANDICAP_MIN_SCORES - chronological.length),
    pendingNine: pendingNine != null,
  };
}

/** `12.4`, plus index as `+1.2`. No index → `—`. */
export function formatHandicapIndex(index: number | null): string {
  if (index == null) return '—';
  if (index < 0) return `+${Math.abs(index).toFixed(1)}`;
  return index.toFixed(1);
}

export function formatDifferential(value: number): string {
  if (value < 0) return `+${Math.abs(value).toFixed(1)}`;
  return value.toFixed(1);
}

/** Short line under the index: how it was built, or how many scores are still needed. */
export function handicapSummaryLine(plan: HandicapPlan): string {
  if (plan.index == null) {
    const n = plan.scoresToIndex;
    return `Play ${n} more scored round${n === 1 ? '' : 's'} with a rated tee to get an index.`;
  }
  return `Best ${plan.usedCount} of your last ${plan.counted} score${plan.counted === 1 ? '' : 's'}.`;
}

/** The differential a saved round contributed, if it counts. */
export function roundDifferential(plan: HandicapPlan, roundId: string): HandicapEntry | null {
  return plan.entries.find((row) => row.roundIds.includes(roundId)) ?? null;
}
