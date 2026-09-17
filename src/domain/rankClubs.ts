import type { Club, ShotFixQuality } from './types';

/** A club is rankable only after this many closed shots with yards. */
export const MIN_CLOSED_SHOTS_FOR_RANK = 5;

export type RankClubInput = {
  id: string;
  name: string;
  shortName: string;
  loftRank: number;
  avgYards: number;
  count: number;
};

export type DistanceTarget = {
  source: 'yards_to_green' | 'last_closed_shot';
  dYards: number;
};

export type RankedClub = RankClubInput & {
  /** |avgYards − D| */
  deltaYards: number;
};

export function clubToRankInput(
  club: Club,
  avg: { avgYards: number; count: number },
): RankClubInput {
  return {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    loftRank: club.loftRank,
    avgYards: avg.avgYards,
    count: avg.count,
  };
}

/**
 * D for top-3 ranking:
 * 1. yards-to-green from `yardsToGreen(fix, greenCentroid)` only when `quality !== none`
 * 2. else last closed shot distance on this hole
 * 3. else null → caller shows the full bag
 */
export function resolveDistanceTarget(args: {
  toGreen: { yards: number | null; quality: ShotFixQuality };
  lastClosedYards: number | null;
}): DistanceTarget | null {
  if (
    args.toGreen.quality !== 'none' &&
    args.toGreen.yards != null &&
    Number.isFinite(args.toGreen.yards)
  ) {
    return {
      source: 'yards_to_green',
      dYards: args.toGreen.yards,
    };
  }
  if (args.lastClosedYards != null && Number.isFinite(args.lastClosedYards)) {
    return { source: 'last_closed_shot', dYards: Math.round(args.lastClosedYards) };
  }
  return null;
}

/** Most recent closed GPS shot with haversine yards. `no_gps` / `none` never rank. */
export function lastClosedShotYards(
  shots: {
    endedAt: string | null;
    distanceYards: number | null;
    source?: 'gps' | 'no_gps';
    fixQuality?: 'good' | 'soft' | 'forced' | 'none' | null;
  }[],
): number | null {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    if (shot.source === 'no_gps' || shot.fixQuality === 'none') continue;
    if (shot.endedAt != null && shot.distanceYards != null) {
      return shot.distanceYards;
    }
  }
  return null;
}

/**
 * Surface up to 3 clubs with the lowest |avgYards − D|.
 * Only clubs with ≥5 closed shots with yards are eligible.
 * Ties prefer the shorter club (higher loftRank).
 * Returns [] when there is no D or no eligible clubs (full bag fallback).
 */
export function rankTopClubs(
  clubs: RankClubInput[],
  target: DistanceTarget | null,
  limit = 3,
): RankedClub[] {
  if (!target || !Number.isFinite(target.dYards)) return [];
  const D = target.dYards;
  return clubs
    .filter((club) => club.count >= MIN_CLOSED_SHOTS_FOR_RANK)
    .map((club) => ({ ...club, deltaYards: Math.abs(club.avgYards - D) }))
    .sort((a, b) => {
      if (a.deltaYards !== b.deltaYards) return a.deltaYards - b.deltaYards;
      if (a.loftRank !== b.loftRank) return b.loftRank - a.loftRank;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
