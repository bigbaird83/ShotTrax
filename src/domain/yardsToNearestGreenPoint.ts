import { haversineYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

/**
 * Saved green points on the hole. Missing stays null — never invented, and
 * never an OSM outline (that outline is not stored with the round).
 * `center` is holes.green_lat / green_lng, the point To green uses.
 */
export type SavedGreenPoints = {
  front: LatLng | null;
  center: LatLng | null;
  back: LatLng | null;
};

/**
 * Yards from a shot's start to the nearest saved green point (front, center,
 * or back — whichever exist). Null when the start is missing or the hole has
 * none of those points, so the caller skips the check.
 */
export function yardsToNearestGreenPoint(
  start: LatLng | null | undefined,
  greens: SavedGreenPoints | null | undefined,
): number | null {
  if (!isValidLatLng(start) || greens == null) return null;
  const points = [greens.front, greens.center, greens.back].filter(isValidLatLng);
  if (points.length === 0) return null;
  let nearest = Infinity;
  for (const point of points) {
    const yards = haversineYards(start, point);
    if (yards < nearest) nearest = yards;
  }
  return Number.isFinite(nearest) ? nearest : null;
}
