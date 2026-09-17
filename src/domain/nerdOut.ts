import type { CarrySource } from './carryFill';
import { isPutterClubId } from './defaultBag';

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

/**
 * End-of-round stats from stored hole scores / putts and the club book.
 * Club carries are `clubBookCarry` on those same rows — nothing invented.
 * Putter is omitted. No GIR. No strokes gained.
 */
export function planNerdOut(args: {
  holeScores: (number | null)[];
  holePutts: number[];
  clubs: ClubBookRow[];
}): {
  score: number | null;
  putts: number;
  clubs: NerdOutClub[];
} {
  const scored = args.holeScores.filter((score): score is number => score != null);
  const score = scored.length === 0 ? null : scored.reduce((sum, n) => sum + n, 0);
  const putts = args.holePutts.reduce((sum, n) => sum + n, 0);
  const clubs: NerdOutClub[] = args.clubs
    .filter((club) => !isPutterClubId(club.id))
    .map((club) => ({
      id: club.id,
      name: club.name,
      shortName: club.shortName,
      ...clubBookCarry(club),
    }));
  return { score, putts, clubs };
}

export function nerdOutShowsGir(): false {
  return false;
}

export function nerdOutShowsStrokesGained(): false {
  return false;
}
