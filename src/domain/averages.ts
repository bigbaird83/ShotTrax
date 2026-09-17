import type { FixQuality } from './types';

export type AverageShot = {
  yards: number;
  /** GPS quality. Null for catch-up Placed shots (no soft/good quality). */
  fixQuality: FixQuality | null;
};

export type ClubAverage = {
  count: number;
  avgYards: number;
  includesSoft: boolean;
  includesForced: boolean;
};

/**
 * Club averages include `soft` and `forced` GPS shots; badges report that mix.
 * Callers must pass only shots that `includeInDistanceAverages` accepts —
 * `fixQuality: none`, `no_gps`, typed yards, hole penalties, and putter shots
 * never belong here. Catch-up Placed shots pass `fixQuality: null` and still count.
 */
export function averageWithBadges(shots: AverageShot[]): ClubAverage {
  if (shots.length === 0) {
    return { count: 0, avgYards: 0, includesSoft: false, includesForced: false };
  }
  const sum = shots.reduce((acc, s) => acc + s.yards, 0);
  return {
    count: shots.length,
    avgYards: sum / shots.length,
    includesSoft: shots.some((s) => s.fixQuality === 'soft'),
    includesForced: shots.some((s) => s.fixQuality === 'forced'),
  };
}
