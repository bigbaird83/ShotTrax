import { isPutterClubId, typicalCarrySeedForClub } from './defaultBag';
import type { Club, ShotFixQuality } from './types';

/** Live average replaces the typical-carry seed after this many closed shots. */
export const MIN_CLOSED_SHOTS_FOR_RANK = 5;

export type RankClubInput = {
  id: string;
  name: string;
  shortName: string;
  loftRank: number;
  avgYards: number;
  count: number;
  /** Bag typical-carry seed (stock or edited). Putter and cleared clubs omit this. */
  typicalCarryYards?: number | null;
};

export type DistanceTarget = {
  source: 'yards_to_green' | 'last_closed_shot' | 'shot_yards';
  dYards: number;
};

/**
 * Catch-up / edit club picker D: this shot's haversine yards, never yards-to-green.
 * Live play uses `resolveNextShotDistanceTarget` (landing → green).
 */
export function shotYardsDistanceTarget(dYards: number | null | undefined): DistanceTarget | null {
  if (dYards == null || !Number.isFinite(dYards)) return null;
  return { source: 'shot_yards', dYards };
}

/**
 * Catch-up / edit club picker: top-3 vs **that shot’s yards**, never yards-to-green.
 * Same seed → ≥5 live rule as live Suggested. Putter is never eligible.
 * Empty → caller shows All clubs.
 */
export function rankCatchUpClubs(
  clubs: RankClubInput[],
  shotYards: number | null | undefined,
  limit = 3,
): RankedClub[] {
  return rankTopClubs(
    clubs.filter((club) => !isPutterClubId(club.id)),
    shotYardsDistanceTarget(shotYards),
    limit,
  );
}

export type RankedClub = RankClubInput & {
  /** |rank yards − D| (live average or typical-carry seed) */
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
    typicalCarryYards: typicalCarrySeedForClub(club),
  };
}

/**
 * Yards used for Suggested top-3.
 * Live average after ≥5 shots allowed into the average (20% filter) fully
 * replaces the seed (no blend); else typical-carry seed. Outliers do not count.
 * Putter is never rankable.
 */
export function rankDistanceYards(club: RankClubInput): number | null {
  if (isPutterClubId(club.id)) return null;
  if (club.count >= MIN_CLOSED_SHOTS_FOR_RANK && Number.isFinite(club.avgYards)) {
    return club.avgYards;
  }
  if (club.typicalCarryYards != null && Number.isFinite(club.typicalCarryYards)) {
    return club.typicalCarryYards;
  }
  return null;
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

/**
 * Next suggested club (big chip): remaining yards from the new landing to the
 * green. Not the card / tee number. No landing yet → existing tee / last-closed
 * fallback. The 20% rule still lives on `rankDistanceYards`.
 */
export function resolveNextShotDistanceTarget(args: {
  landingToGreen: { yards: number | null; quality: ShotFixQuality };
  courseToGreen: { yards: number | null; quality: ShotFixQuality };
  lastClosedYards: number | null;
}): DistanceTarget | null {
  if (
    args.landingToGreen.quality !== 'none' &&
    args.landingToGreen.yards != null &&
    Number.isFinite(args.landingToGreen.yards)
  ) {
    return {
      source: 'yards_to_green',
      dYards: args.landingToGreen.yards,
    };
  }
  return resolveDistanceTarget({
    toGreen: args.courseToGreen,
    lastClosedYards: args.lastClosedYards,
  });
}

/** Most recent closed GPS or Placed shot with haversine yards. `no_gps` / `none` / putter never rank. */
export function lastClosedShotYards(
  shots: {
    endedAt: string | null;
    distanceYards: number | null;
    clubId?: string | null;
    source?: 'gps' | 'no_gps' | 'placed';
    fixQuality?: 'good' | 'soft' | 'forced' | 'none' | null;
  }[],
): number | null {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    if (shot.source === 'no_gps' || shot.fixQuality === 'none') continue;
    if (isPutterClubId(shot.clubId)) continue;
    if (shot.endedAt != null && shot.distanceYards != null) {
      return shot.distanceYards;
    }
  }
  return null;
}

/**
 * Surface up to 3 clubs with the lowest |rank yards − D|.
 * Rank yards = live average after ≥5 closed shots (replaces seed, no blend),
 * else typical-carry seed. Putter is never eligible. Cleared / custom clubs
 * still need ≥5 live shots.
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
    .map((club) => {
      const yards = rankDistanceYards(club);
      if (yards == null) return null;
      return { ...club, deltaYards: Math.abs(yards - D) };
    })
    .filter((club): club is RankedClub => club != null)
    .sort((a, b) => {
      if (a.deltaYards !== b.deltaYards) return a.deltaYards - b.deltaYards;
      if (a.loftRank !== b.loftRank) return b.loftRank - a.loftRank;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
