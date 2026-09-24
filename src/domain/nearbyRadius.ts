/**
 * One nearby radius for phone Search nearby and Watch Search nearby.
 * 40 miles, sent to the Golf Courses API (via the share-sync Worker) in km and
 * used for every local catalog / result filter, so the two never disagree.
 */

export const METERS_PER_MILE = 1609.344;

export const NEARBY_RADIUS_MILES = 40;

/** 40 mi ≈ 64.4 km. Rounded to 0.1 km so the query string stays stable. */
export const NEARBY_RADIUS_KM = Math.round(((NEARBY_RADIUS_MILES * METERS_PER_MILE) / 1000) * 10) / 10;

/** The local filter uses the same km value the API is asked for. */
export const NEARBY_RADIUS_M = Math.round(NEARBY_RADIUS_KM * 1000);

export function milesToKm(miles: number): number {
  return (miles * METERS_PER_MILE) / 1000;
}

/**
 * Keep rows inside the radius. A row with no known distance stays — the API
 * already scoped it to the query radius and we never invent a distance.
 */
export function withinNearbyRadius<T extends { distanceMeters?: number | null }>(
  rows: readonly T[],
  radiusKm: number = NEARBY_RADIUS_KM,
): T[] {
  const maxM = Math.round(radiusKm * 1000);
  return rows.filter((row) => {
    const d = row.distanceMeters;
    if (d == null || !Number.isFinite(d)) return true;
    return d <= maxM;
  });
}
