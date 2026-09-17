import { MAX_SHOT_YD } from '../config/sensing';
import { clubCountsTowardDistanceSamples } from './defaultBag';
import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import type { Shot, ShotFixQuality, ShotSource } from './types';

export type NoGpsShotPlan = {
  source: 'no_gps';
  startLat: null;
  startLng: null;
  endLat: null;
  endLng: null;
  /** GPS distance sample — always null. Typed yards live on `typedYards` only. */
  distanceYards: null;
  typedYards: number | null;
  fixQuality: 'none';
  startFixQuality: 'none';
  endFixQuality: 'none';
};

const MAX_TYPED_YARDS = 999;

/**
 * Optional yards typed by the player (blank allowed). Rejects non-integers and
 * values over 999. Score/UI note only — never a GPS distance and never invented coords.
 */
export function parseTypedYards(raw: string): { ok: true; yards: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, yards: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const yards = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(yards) || yards > MAX_TYPED_YARDS) return { ok: false };
  return { ok: true, yards };
}

/**
 * Forgotten swing / no GPS fix. Does not call acceptFix or haversine.
 * Coordinates stay null. `fixQuality` is `none`. Typed yards are UI-only.
 */
export function planNoGpsShot(typedYards: number | null = null): NoGpsShotPlan {
  return {
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    distanceYards: null,
    typedYards,
    fixQuality: 'none',
    startFixQuality: 'none',
    endFixQuality: 'none',
  };
}

export function isNoGpsShot(shot: { source: ShotSource; fixQuality?: ShotFixQuality | null }): boolean {
  return shot.source === 'no_gps' || shot.fixQuality === 'none';
}

export type PlacedShotPlan = {
  source: 'placed';
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAccuracyM: null;
  endAccuracyM: null;
  /** Placed shots have no GPS quality — never good/soft/forced/none. */
  startFixQuality: null;
  endFixQuality: null;
  distanceYards: number;
  typedYards: null;
  fixQuality: null;
  impossibleJump: boolean;
};

/**
 * Catch-up Add shot only (not live play): two player map taps — where you hit
 * from AND where it landed. Yards are haversine between those points, shown
 * immediately — never invented GPS, never typed yards, never acceptFix, no
 * soft/good quality. Live play is unchanged: club tap marks start; next mark
 * or green closes it.
 */
export function planPlacedShot(from: LatLng, to: LatLng): { ok: false } | ({ ok: true } & PlacedShotPlan) {
  if (!isValidLatLng(from) || !isValidLatLng(to)) return { ok: false };
  const yards = roundYards(haversineYards(from, to));
  if (!Number.isFinite(yards) || yards < 0) return { ok: false };
  return {
    ok: true,
    source: 'placed',
    startLat: from.lat,
    startLng: from.lng,
    endLat: to.lat,
    endLng: to.lng,
    startAccuracyM: null,
    endAccuracyM: null,
    startFixQuality: null,
    endFixQuality: null,
    distanceYards: yards,
    typedYards: null,
    fixQuality: null,
    impossibleJump: yards > MAX_SHOT_YD,
  };
}

/** Signal Lab: catch-up Placed shots never run acceptFix. Live GPS marks still do. */
export function placedShotRunsAcceptFix(): false {
  return false;
}

/**
 * 400-yard cap: ask before a silent save. Confirming still stores `placed`
 * with no GPS quality — never acceptFix / forceMark / forced.
 */
export function confirmPlacedShot(
  plan: { ok: true } & PlacedShotPlan,
  force: boolean,
): { status: 'commit' } | { status: 'needs_confirm'; yards: number } {
  if (plan.impossibleJump && !force) {
    return { status: 'needs_confirm', yards: plan.distanceYards };
  }
  return { status: 'commit' };
}

/**
 * Distance averages and top-3 samples: closed GPS shots with haversine yards,
 * plus catch-up **Placed** shots (player confirmed from and landing map points;
 * no GPS quality). `good` / `soft` / `forced` stay in. Penalties are not shots.
 * `none` / `no_gps` are excluded even if typed yards exist. Putter shots never
 * count — scoring / green play only. No include-typed-yards toggle in MVP.
 */
export function includeInDistanceAverages(shot: {
  source: ShotSource;
  distanceYards: number | null;
  fixQuality?: ShotFixQuality | null;
  clubId?: string | null;
}): boolean {
  if (shot.clubId != null && !clubCountsTowardDistanceSamples(shot.clubId)) return false;
  if (shot.source === 'placed') return shot.distanceYards != null;
  if (shot.source !== 'gps' || shot.fixQuality === 'none') return false;
  return shot.distanceYards != null;
}

/** Top-3 uses the same GPS and Placed samples as club averages. */
export function includeInTop3Samples(shot: {
  source: ShotSource;
  distanceYards: number | null;
  fixQuality?: ShotFixQuality | null;
  clubId?: string | null;
}): boolean {
  return includeInDistanceAverages(shot);
}

export function hasGpsStart<
  T extends {
    source?: ShotSource;
    fixQuality?: ShotFixQuality | null;
    startLat: number | null;
    startLng: number | null;
  },
>(shot: T): shot is T & { startLat: number; startLng: number } {
  if (shot.source === 'placed') return shot.startLat != null && shot.startLng != null;
  if (shot.source === 'no_gps' || shot.fixQuality === 'none') return false;
  return shot.startLat != null && shot.startLng != null;
}

/** Closed GPS or Placed trail eligible for a map polyline. Never true for `no_gps` / `none`. */
export function hasClosedGpsTrail<
  T extends {
    source?: ShotSource;
    fixQuality?: ShotFixQuality | null;
    startLat: number | null;
    startLng: number | null;
    endLat: number | null;
    endLng: number | null;
    endedAt?: string | null;
  },
>(shot: T): shot is T & { startLat: number; startLng: number; endLat: number; endLng: number } {
  if (shot.source === 'no_gps' || shot.fixQuality === 'none') return false;
  if (shot.source !== 'placed' && shot.source !== 'gps' && shot.source != null) return false;
  return (
    shot.startLat != null &&
    shot.startLng != null &&
    shot.endLat != null &&
    shot.endLng != null &&
    (shot.endedAt === undefined || shot.endedAt != null)
  );
}

export function closedGpsTrailShots<T extends Shot>(shots: T[]): T[] {
  return shots.filter(hasClosedGpsTrail);
}
