import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';

export type LatLng = { lat: number; lng: number };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in yards. */
export function haversineYards(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters / METERS_PER_YARD;
}

export function roundYards(yards: number): number {
  return Math.round(yards);
}
