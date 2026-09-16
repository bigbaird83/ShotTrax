import type { FixQuality } from './types';

export type AverageShot = {
  yards: number;
  fixQuality: FixQuality;
};

export type ClubAverage = {
  count: number;
  avgYards: number;
  includesSoft: boolean;
  includesForced: boolean;
};

/** Club averages include `soft` and `forced` shots; badges report that mix. */
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
