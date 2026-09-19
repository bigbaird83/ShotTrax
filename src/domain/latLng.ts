export type LatLng = { lat: number; lng: number };

/** Placeholder / Null Island neighborhood. No real course sits here. */
const NEAR_ZERO_DEG = 0.01;

/**
 * Real geographic coordinates only. Rejects missing, non-finite, out-of-range,
 * and 0,0 (a common placeholder). ShotTraxx never invents a pin.
 */
export function isValidLatLng(point: LatLng | null | undefined): point is LatLng {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Exact or ~0,0 — API placeholders that must not seed a MapView. */
export function isNearZeroLatLng(point: LatLng | null | undefined): boolean {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return Math.abs(lat) < NEAR_ZERO_DEG && Math.abs(lng) < NEAR_ZERO_DEG;
}

/**
 * Course-card tee/green. Same as isValidLatLng plus ~0,0 rejection
 * so a green void never mounts on a placeholder pin.
 */
export function isCourseCardLatLng(point: LatLng | null | undefined): point is LatLng {
  return isValidLatLng(point) && !isNearZeroLatLng(point);
}
