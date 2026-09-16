import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import type { FixQuality } from './types';

export type AccuracyClass = 'good' | 'soft' | 'poor';

/**
 * Classify horizontal accuracy in meters.
 * < 15 m → good; 15–25 m inclusive → soft; > 25 m (or unknown) → poor (needs Force).
 */
export function classifyAccuracyM(accuracyM: number | null | undefined): AccuracyClass {
  if (accuracyM == null || Number.isNaN(accuracyM) || accuracyM < 0) {
    return 'poor';
  }
  if (accuracyM < SOFT_GPS_MIN_M) return 'good';
  if (accuracyM <= SOFT_GPS_MAX_M) return 'soft';
  return 'poor';
}

export function qualityFromAccuracy(
  accuracyM: number | null | undefined,
  forced: boolean,
): FixQuality {
  const cls = classifyAccuracyM(accuracyM);
  if (forced || cls === 'poor') return 'forced';
  return cls;
}

const RANK: Record<FixQuality, number> = { good: 0, soft: 1, forced: 2 };

export function worstFixQuality(a: FixQuality, b: FixQuality): FixQuality {
  return RANK[a] >= RANK[b] ? a : b;
}
