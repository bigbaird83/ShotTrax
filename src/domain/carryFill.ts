import {
  isPutterClubId,
  MAX_TYPICAL_CARRY_YARDS,
  stockAvgCarryForSuggestion,
  typicalCarrySeedForClub,
} from './defaultBag';

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

type ScaleAnchor = {
  loft: number;
  scale: number;
};

function clampCarryYards(yards: number): number {
  return Math.max(1, Math.min(MAX_TYPICAL_CARRY_YARDS, Math.round(yards)));
}

/** Loft-ordered scale. Extrapolates short and long of the typed span. */
export function scaleAtLoft(loft: number, anchors: readonly ScaleAnchor[]): number | null {
  const sorted = [...anchors].sort((a, b) => a.loft - b.loft || a.scale - b.scale);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0].scale;
  const lerp = (a: ScaleAnchor, b: ScaleAnchor): number => {
    const span = b.loft - a.loft;
    if (span === 0) return a.scale;
    return a.scale + ((b.scale - a.scale) * (loft - a.loft)) / span;
  };
  if (loft <= sorted[0].loft) return lerp(sorted[0], sorted[1]);
  if (loft >= sorted[sorted.length - 1].loft) {
    return lerp(sorted[sorted.length - 2], sorted[sorted.length - 1]);
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (loft >= sorted[i].loft && loft <= sorted[i + 1].loft) {
      return lerp(sorted[i], sorted[i + 1]);
    }
  }
  return sorted[0].scale;
}

/**
 * After 3 typed carries, scale the whole bag off STOCK_AVG_CARRY
 * (Golfshot-style, loft-ordered). Typed always wins. Putter is never filled.
 * Skip / fewer than 3 typed → no estimates.
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
    .map((club) => ({ club, yards: typicalCarrySeedForClub(club) }))
    .filter((row): row is { club: CarryClub; yards: number } => row.yards != null);

  if (typed.length < MIN_TYPED_CLUBS_FOR_FILL) return result;

  const anchors: ScaleAnchor[] = [];
  for (const row of typed) {
    const stock = stockAvgCarryForSuggestion(row.club.id);
    if (stock == null || stock <= 0) continue;
    anchors.push({ loft: row.club.loftRank, scale: row.yards / stock });
  }
  if (anchors.length === 0) return result;

  for (const club of ordered) {
    if (typicalCarrySeedForClub(club) != null) continue;
    const stock = stockAvgCarryForSuggestion(club.id);
    if (stock == null) continue;
    const scale = scaleAtLoft(club.loftRank, anchors);
    if (scale == null || !Number.isFinite(scale) || scale <= 0) continue;
    result.set(club.id, { yards: clampCarryYards(stock * scale), source: 'estimated' });
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
