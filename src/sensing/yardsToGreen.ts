import { classifyAccuracyM } from '../domain/fixQuality';
import { haversineYards, roundYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { GpsFix, ShotFixQuality } from '../domain/types';

/**
 * P5 sensing hook: remaining yards to a real green centroid.
 * Same haversine and good (<15 m) / soft (15–25 m) bands as shot marks.
 * `quality` is `none` (and `yards` is null) when there is no usable fix or green —
 * ShotTraxx does not invent a pin or a range. Poor GPS (>25 m / unknown) matches
 * `acceptFix`: not auto-accepted, so quality is `none`.
 * Display (course card / 50-yard switch / 600 cap) is `planToGreenDisplay`.
 * This function does not apply the 400-yard shot-save confirm.
 */
export type YardsToGreenResult = {
  yards: number | null;
  quality: ShotFixQuality;
};

export function yardsToGreen(
  fix: GpsFix | null,
  greenCentroid: LatLng | null,
): YardsToGreenResult {
  if (!isValidLatLng(fix) || !isValidLatLng(greenCentroid)) {
    return { yards: null, quality: 'none' };
  }

  const band = classifyAccuracyM(fix.accuracyM);
  if (band === 'poor') {
    return { yards: null, quality: 'none' };
  }

  return {
    yards: roundYards(haversineYards(fix, greenCentroid)),
    quality: band,
  };
}
