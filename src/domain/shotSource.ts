import type { Shot, ShotSource } from './types';

export type NoGpsShotPlan = {
  source: 'no_gps';
  startLat: null;
  startLng: null;
  endLat: null;
  endLng: null;
  distanceYards: null;
  fixQuality: null;
  startFixQuality: null;
  endFixQuality: null;
};

/**
 * Forgotten swing / no GPS fix. Coordinates and yards stay null so we never
 * invent a location or a 0-yd average.
 */
export function planNoGpsShot(): NoGpsShotPlan {
  return {
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    distanceYards: null,
    fixQuality: null,
    startFixQuality: null,
    endFixQuality: null,
  };
}

export function isNoGpsShot(shot: { source: ShotSource }): boolean {
  return shot.source === 'no_gps';
}

/** Closed GPS shots with yards only. Penalties are not shots; `no_gps` is excluded. */
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
