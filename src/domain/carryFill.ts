import { isPutterClubId, typicalCarrySeedForClub } from './defaultBag';

export const MIN_TYPED_CLUBS_FOR_FILL = 3;

export type CarrySource = 'typed' | 'estimated' | null;

export type CarryClub = {
  id: string;
  loftRank: number;
  sortOrder?: number;
  typicalCarryYards?: number | null;
};

export type CarryFill = {
  yards: number | null;
  source: CarrySource;
};

/**
 * Estimated fill stays off until at least 3 clubs have a typed number.
 * Then interpolate only between the typed clubs, in loft order.
 * Typed always wins. Outside that span stays blank. Putter is never filled.
 * Enter nothing and guess nothing — skip means no fake average.
 */
export function fillEstimatedCarries(clubs: CarryClub[]): Map<string, CarryFill> {
  const result = new Map<string, CarryFill>();
  for (const club of clubs) {
    if (isPutterClubId(club.id)) {
      result.set(club.id, { yards: null, source: null });
      continue;
    }
    const typed = typicalCarrySeedForClub(club);
    result.set(club.id, { yards: typed, source: typed != null ? 'typed' : null });
  }

  const ordered = [...clubs]
    .filter((club) => !isPutterClubId(club.id))
    .sort((a, b) => {
      if (a.loftRank !== b.loftRank) return a.loftRank - b.loftRank;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

  const typed = ordered
    .map((club, index) => ({ index, club, yards: typicalCarrySeedForClub(club) }))
    .filter((row): row is { index: number; club: CarryClub; yards: number } => row.yards != null);

  if (typed.length < MIN_TYPED_CLUBS_FOR_FILL) return result;

  for (let t = 0; t < typed.length - 1; t += 1) {
    const a = typed[t];
    const b = typed[t + 1];
    const span = b.index - a.index;
    if (span <= 1) continue;
    for (let k = a.index + 1; k < b.index; k += 1) {
      const club = ordered[k];
      if (typicalCarrySeedForClub(club) != null) continue;
      const yards = Math.round(a.yards + ((b.yards - a.yards) * (k - a.index)) / span);
      result.set(club.id, { yards, source: 'estimated' });
    }
  }

  return result;
}

export function carryYardsForClub(clubs: CarryClub[], clubId: string): number | null {
  return fillEstimatedCarries(clubs).get(clubId)?.yards ?? null;
}

export function applyCarryFill<T extends CarryClub>(clubs: T[]): (T & { typicalCarryYards: number | null })[] {
  const filled = fillEstimatedCarries(clubs);
  return clubs.map((club) => ({
    ...club,
    typicalCarryYards: isPutterClubId(club.id) ? null : (filled.get(club.id)?.yards ?? null),
  }));
}
