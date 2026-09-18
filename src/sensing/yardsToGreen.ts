import { classifyAccuracyM } from '../domain/fixQuality';
import { haversineYards, roundYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { displayableYardsToGreen } from '../domain/yardsToGreen';
import type { GpsFix, ShotFixQuality } from '../domain/types';

/**
 * P5 sensing hook: remaining yards to a real green centroid.
 * Same haversine and good (<15 m) / soft (15–25 m) bands as shot marks.
 * `quality` is `none` (and `yards` is null) when there is no usable fix or green —
 * ShotTraxx does not invent a pin or a range. Poor GPS (>25 m / unknown) matches
 * `acceptFix`: not auto-accepted, so quality is `none`.
 * Over 400 yards is not a shot distance (phone at home → course). Display — .
 * Saving a shot still uses the separate 400-yard confirm.
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

  const yards = displayableYardsToGreen(roundYards(haversineYards(fix, greenCentroid)));
  if (yards == null) {
    return { yards: null, quality: 'none' };
  }

  return {
    yards,
    quality: band,
  };
}
