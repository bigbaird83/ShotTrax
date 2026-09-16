import type { Shot, ShotSource } from './types';

export type NoGpsShotPlan = {
  source: 'no_gps';
  startLat: null;
  startLng: null;
  endLat: null;
  endLng: null;
  /** User-typed yards, or null if left blank. Never computed from GPS. */
  distanceYards: number | null;
  fixQuality: null;
  startFixQuality: null;
  endFixQuality: null;
};

const MAX_TYPED_YARDS = 999;

/**
 * Optional yards typed by the player (blank allowed). Rejects non-integers and
 * values over 999. This is not a GPS distance and never invents a coordinate.
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
 * Forgotten swing / no GPS fix. Coordinates stay null so we never invent a
 * location. Yards are only stored if the user typed them; they still do not
 * enter club averages (see `includeInDistanceAverages`).
 */
export function planNoGpsShot(typedYards: number | null = null): NoGpsShotPlan {
  return {
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    distanceYards: typedYards,
    fixQuality: null,
    startFixQuality: null,
    endFixQuality: null,
  };
}

export function isNoGpsShot(shot: { source: ShotSource }): boolean {
  return shot.source === 'no_gps';
}

/** Closed GPS shots with yards only. Penalties are not shots; `no_gps` is excluded even if yards were typed. */
export function includeInDistanceAverages(shot: {
  source: ShotSource;
  distanceYards: number | null;
}): boolean {
  return shot.source === 'gps' && shot.distanceYards != null;
}

export function hasGpsStart<
  T extends {
    source?: ShotSource;
    startLat: number | null;
    startLng: number | null;
  },
>(shot: T): shot is T & { startLat: number; startLng: number } {
  if (shot.source === 'no_gps') return false;
  return shot.startLat != null && shot.startLng != null;
}

/** Closed GPS trail eligible for a map polyline. Never true for `no_gps`. */
export function hasClosedGpsTrail<
  T extends {
    source?: ShotSource;
    startLat: number | null;
    startLng: number | null;
    endLat: number | null;
    endLng: number | null;
    endedAt?: string | null;
  },
>(shot: T): shot is T & { startLat: number; startLng: number; endLat: number; endLng: number } {
  if (shot.source === 'no_gps') return false;
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
