import { classifyAccuracyM } from './fixQuality';
import type { ShotSource } from './types';

/**
 * Player cue on a GPS club mark (the shot-start pin).
 *
 * Mapped only from the horizontal accuracy already stored on that mark
 * (`shots.start_accuracy_m` ← Expo `coords.accuracy` or Watch
 * `horizontalAccuracy`, meters). Same bands as `classifyAccuracyM`:
 *
 * - good: accuracy under 15 m
 * - ok:   15–25 m inclusive (the soft-GPS band)
 * - weak: accuracy over 25 m
 *
 * Missing, non-finite, or negative accuracy returns null — no chip.
 * This does not move the mark and does not invent a coordinate.
 */
export type GpsConfidence = 'good' | 'ok' | 'weak';

export function gpsConfidenceFromAccuracyM(
  accuracyM: number | null | undefined,
): GpsConfidence | null {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return null;
  }
  const band = classifyAccuracyM(accuracyM);
  if (band === 'good') return 'good';
  if (band === 'soft') return 'ok';
  return 'weak';
}

/** GPS club marks only. Placed and no-GPS rows have no location-fix accuracy. */
export function clubMarkGpsConfidence(shot: {
  source?: ShotSource | null;
  startAccuracyM?: number | null;
}): GpsConfidence | null {
  if (shot.source !== 'gps') return null;
  return gpsConfidenceFromAccuracyM(shot.startAccuracyM);
}
