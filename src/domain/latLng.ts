export type LatLng = { lat: number; lng: number };

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
