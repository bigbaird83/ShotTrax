import type { CarrySource } from './carryFill';
import { isPutterClubId } from './defaultBag';
import { scorecardMark, type ScorecardMark } from './scorecard';

export type ClubBookKind = 'live' | 'typed' | 'estimated' | null;

export type ClubBookCarry = {
  yards: number | null;
  kind: ClubBookKind;
  count: number;
};

/** Same row the club book / Averages tab feeds `clubBookCarry`. */
export type ClubBookRow = {
  id: string;
  name: string;
  shortName: string;
  count: number;
  avgYards: number;
  typicalCarryYards: number | null;
  carrySource: CarrySource;
};

export type NerdOutClub = ClubBookCarry & {
  id: string;
  name: string;
  shortName: string;
};

export type NerdOutMarks = Record<Exclude<ScorecardMark, null>, number>;

export type NerdOutLifetime = {
  finishedRounds: number;
  puttsPerRound: number | null;
  scoredHoles: number;
};

/**
 * Same number the club book / Averages tab shows.
 * Live average only after real GPS or Placed shots (`count > 0`).
 * A seed is never labeled live. Estimated fill keeps the estimated badge.
 */
export function clubBookCarry(args: {
  count: number;
  avgYards: number;
  typicalCarryYards: number | null;
  carrySource: CarrySource;
}): ClubBookCarry {
  if (args.count > 0 && Number.isFinite(args.avgYards)) {
    return { yards: Math.round(args.avgYards), kind: 'live', count: args.count };
  }
  if (args.carrySource === 'estimated' && args.typicalCarryYards != null) {
    return { yards: Math.round(args.typicalCarryYards), kind: 'estimated', count: 0 };
  }
  if (args.carrySource === 'typed' && args.typicalCarryYards != null) {
    return { yards: Math.round(args.typicalCarryYards), kind: 'typed', count: 0 };
  }
  return { yards: null, kind: null, count: 0 };
}

function emptyMarks(): NerdOutMarks {
  return { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
}

/**
 * End-of-round stats from stored hole scores / putts and the club book.
 * Club carries are `clubBookCarry` on those same rows — nothing invented.
 * Putter is omitted. No GIR. No strokes gained. Vs par only when both exist.
 */
export function planNerdOut(args: {
  holeScores: (number | null)[];
  holePutts: number[];
  holePars?: (number | null)[];
  clubs: ClubBookRow[];
}): {
  score: number | null;
  toPar: number | null;
  putts: number;
  puttsPerHole: number | null;
  holesScored: number;
  marks: NerdOutMarks;
  clubs: NerdOutClub[];
} {
  const scored = args.holeScores.filter((score): score is number => score != null);
  const score = scored.length === 0 ? null : scored.reduce((sum, n) => sum + n, 0);
  const putts = args.holePutts.reduce((sum, n) => sum + n, 0);
  const pars = args.holePars ?? [];
  let toParSum = 0;
  let toParN = 0;
  const marks = emptyMarks();
  args.holeScores.forEach((holeScore, index) => {
    const mark = scorecardMark(holeScore, pars[index] ?? null);
    if (mark) marks[mark] += 1;
    if (holeScore == null || pars[index] == null) return;
    const par = pars[index];
    if (par == null || scorecardMark(holeScore, par) == null) return;
    toParSum += holeScore - par;
    toParN += 1;
  });
  const clubs: NerdOutClub[] = args.clubs
    .filter((club) => !isPutterClubId(club.id))
    .map((club) => ({
      id: club.id,
      name: club.name,
      shortName: club.shortName,
      ...clubBookCarry(club),
    }));
  return {
    score,
    toPar: toParN === 0 ? null : toParSum,
    putts,
    puttsPerHole: scored.length === 0 ? null : Math.round((putts / scored.length) * 10) / 10,
    holesScored: scored.length,
    marks,
    clubs,
  };
}

/** Finished-round rollup from stored scores/putts only. */
export function planNerdOutLifetime(
  rounds: { finished: boolean; holePutts: number[]; holeScores: (number | null)[] }[],
): NerdOutLifetime {
  const finished = rounds.filter((round) => round.finished);
  const putts = finished.reduce((sum, round) => sum + round.holePutts.reduce((n, p) => n + p, 0), 0);
  const scoredHoles = rounds.reduce(
    (sum, round) => sum + round.holeScores.filter((score) => score != null).length,
    0,
  );
  return {
    finishedRounds: finished.length,
    puttsPerRound: finished.length === 0 ? null : Math.round((putts / finished.length) * 10) / 10,
    scoredHoles,
  };
}

export function nerdOutShowsGir(): false {
  return false;
}

export function nerdOutShowsStrokesGained(): false {
  return false;
}

/** End-of-round Nerd out includes the hole trail maps. */
export function nerdOutShowsTrail(): true {
  return true;
}

/** Those trails use the same tee-to-green lock as play / Add shot / edit. */
export function nerdOutTrailUsesHoleCamera(): true {
  return true;
}
