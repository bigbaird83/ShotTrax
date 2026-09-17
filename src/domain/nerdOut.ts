import { fillEstimatedCarries, type CarrySource } from './carryFill';
import { isPutterClubId } from './defaultBag';

export type ClubBookKind = 'live' | 'typed' | 'estimated' | null;

export type ClubBookCarry = {
  yards: number | null;
  kind: ClubBookKind;
  count: number;
};

export type NerdOutClub = ClubBookCarry & {
  id: string;
  name: string;
  shortName: string;
};

/**
 * Same number the club book / Averages tab shows.
 * Live average after real GPS or Placed shots. A seed is never labeled live.
 * Estimated fill keeps the estimated badge. Putter is not a row.
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

export function planNerdOut(args: {
  holeScores: (number | null)[];
  holePutts: number[];
  clubs: { id: string; name: string; shortName: string; loftRank: number; typicalCarryYards?: number | null }[];
  averages: { clubId: string; count: number; avgYards: number }[];
}): {
  score: number | null;
  putts: number;
  clubs: NerdOutClub[];
} {
  const scored = args.holeScores.filter((score): score is number => score != null);
  const score = scored.length === 0 ? null : scored.reduce((sum, n) => sum + n, 0);
  const putts = args.holePutts.reduce((sum, n) => sum + n, 0);
  const filled = fillEstimatedCarries(args.clubs.filter((club) => !isPutterClubId(club.id)));
  const avgById = new Map(args.averages.map((row) => [row.clubId, row]));
  const clubs: NerdOutClub[] = args.clubs
    .filter((club) => !isPutterClubId(club.id))
    .map((club) => {
      const fill = filled.get(club.id);
      const avg = avgById.get(club.id);
      const book = clubBookCarry({
        count: avg?.count ?? 0,
        avgYards: avg?.avgYards ?? 0,
        typicalCarryYards: fill?.yards ?? null,
        carrySource: fill?.source ?? null,
      });
      return {
        id: club.id,
        name: club.name,
        shortName: club.shortName,
        ...book,
      };
    });
  return { score, putts, clubs };
}

export function nerdOutShowsGir(): false {
  return false;
}

export function nerdOutShowsStrokesGained(): false {
  return false;
}
