import { isPutterClubId, stockAvgCarryForSuggestion, typicalCarrySeedForClub } from './defaultBag';
import { isValidLatLng, type LatLng } from './latLng';
import type { Club, ShotFixQuality } from './types';
import { markToGreen } from './yardsToGreen';

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
 * Edit / change-club picker D: this shot's haversine yards, never yards-to-green.
 * Add shot uses `resolveAddShotSuggestTarget` — the same remaining-yards D as the play wheel.
 * Live play uses `resolveNextShotDistanceTarget` (landing → green).
 */
export function shotYardsDistanceTarget(dYards: number | null | undefined): DistanceTarget | null {
  if (dYards == null || !Number.isFinite(dYards)) return null;
  return { source: 'shot_yards', dYards };
}

export type AddShotSuggestSource = 'tee' | 'from_pin';

/** Empty hole / tee shot → tee-to-pin. After a closed landing → that from-pin to the course pin. */
export function addShotSuggestSource(lastLanding: LatLng | null | undefined): AddShotSuggestSource {
  return isValidLatLng(lastLanding) ? 'from_pin' : 'tee';
}

export function addShotSuggestUsesPlayWheelTarget(): true {
  return true;
}

export function addShotSuggestRanksShotYards(): false {
  return false;
}

export function addShotEmptyHoleSuggestsFromTee(): true {
  return true;
}

export function addShotAfterMarksSuggestsFromLastLanding(): true {
  return true;
}

/** Same as the play wheel: putter sits at the end of the strip with null carry and is never in the suggested 3. */
export function addShotSuggestIncludesPutter(): false {
  return false;
}

export function addShotSuggestPutterHasCarry(): false {
  return false;
}

/**
 * Add-shot suggested clubs: same remaining-yards D as the play club wheel.
 * Empty hole / tee: tee → course pin (haversine), else card yards. After marks:
 * last landing → course pin. Never that shot's placed haversine, never phone
 * GPS, never last-closed-shot length, never an invented pin.
 */
export function resolveAddShotSuggestTarget(args: {
  lastLanding: LatLng | null;
  tee?: LatLng | null;
  green: LatLng | null;
  courseToGreen: { yards: number | null; quality: ShotFixQuality };
  lastClosedYards?: number | null;
}): DistanceTarget | null {
  return resolveNextShotDistanceTarget({
    landingToGreen: markToGreen(args.lastLanding, args.green),
    teeToGreen: markToGreen(args.tee ?? null, args.green),
    courseToGreen: args.courseToGreen,
    lastClosedYards: args.lastClosedYards ?? null,
  });
}

/** Yards-left input for the Add-shot club strip — same ranking D as the play wheel. */
export function addShotSuggestYardsLeft(args: {
  playTarget: DistanceTarget | null;
  courseYards: number | null | undefined;
}): number | null {
  if (args.playTarget && Number.isFinite(args.playTarget.dYards)) return args.playTarget.dYards;
  if (args.courseYards != null && Number.isFinite(args.courseYards)) return args.courseYards;
  return null;
}

/**
 * Edit / change-club picker: top-3 vs **that shot’s yards**, never yards-to-green.
 * Add shot uses `resolveAddShotSuggestTarget` instead. Same seed → ≥5 live rule.
 * Putter is never eligible. Empty → caller shows All clubs.
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
 * Live average after ≥5 kept closed shots (existing avg rules: soft counts
 * with badge, hard only if forced, 20% outliers out, putter never) fully
 * replaces the seed (no blend); else typed typical-carry; else STOCK_AVG_CARRY.
 * Estimated fills never enter ranking. Watch top-3 reads this same table.
 */
export function rankDistanceYards(club: RankClubInput): number | null {
  if (isPutterClubId(club.id)) return null;
  if (club.count >= MIN_CLOSED_SHOTS_FOR_RANK && Number.isFinite(club.avgYards)) {
    return club.avgYards;
  }
  if (club.typicalCarryYards != null && Number.isFinite(club.typicalCarryYards)) {
    return club.typicalCarryYards;
  }
  return stockAvgCarryForSuggestion(club.id);
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
 * Remaining pin yards for Suggested top-3 (play strip AND Add-shot strip).
 * 1. last landing → pin after marks
 * 2. else tee → pin on an empty hole (hydrate / course tee+green)
 * 3. else card / tee-box yards
 * Never phone GPS. Never last-closed-shot length (that is carry, not remaining).
 * Never invent a pin.
 */
export function resolveRemainingPinTarget(args: {
  landingToGreen: { yards: number | null; quality: ShotFixQuality };
  teeToGreen?: { yards: number | null; quality: ShotFixQuality } | null;
  courseToGreen: { yards: number | null; quality: ShotFixQuality };
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
  const tee = args.teeToGreen;
  if (
    tee &&
    tee.quality !== 'none' &&
    tee.yards != null &&
    Number.isFinite(tee.yards)
  ) {
    return {
      source: 'yards_to_green',
      dYards: tee.yards,
    };
  }
  return resolveDistanceTarget({
    toGreen: args.courseToGreen,
    lastClosedYards: null,
  });
}

export function remainingPinRanksLastClosedShot(): false {
  return false;
}

export function remainingPinUsesPhoneGps(): false {
  return false;
}

/**
 * Next suggested club: remaining pin yards. Empty hole is tee → pin (or card).
 * After a mark: landing → pin. lastClosedYards is ignored — shot length is not
 * remaining. The 20% rule still lives on `rankDistanceYards`.
 */
export function resolveNextShotDistanceTarget(args: {
  landingToGreen: { yards: number | null; quality: ShotFixQuality };
  teeToGreen?: { yards: number | null; quality: ShotFixQuality } | null;
  courseToGreen: { yards: number | null; quality: ShotFixQuality };
  lastClosedYards?: number | null;
}): DistanceTarget | null {
  void args.lastClosedYards;
  return resolveRemainingPinTarget({
    landingToGreen: args.landingToGreen,
    teeToGreen: args.teeToGreen,
    courseToGreen: args.courseToGreen,
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
