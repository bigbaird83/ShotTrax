import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import { holeCameraHeading } from './holeCamera';
import { isValidLatLng, type LatLng } from './latLng';

/**
 * Fixed yard bands on the phone hole map.
 * Club-average rings are not used: on-device averages mix logged shots with
 * stock typicals and filled carries, so a ring from those numbers would not
 * be a live distance.
 */
export const DISTANCE_RING_YARDS = [100, 150, 200] as const;

/** Degrees either side of the player → green bearing. */
export const DISTANCE_RING_ARC_HALF_DEG = 50;
export const DISTANCE_RING_ARC_STEP_DEG = 5;

export type TrustedYardsToGreen = {
  yards: number | null;
  quality: string;
};

export type DistanceRing = {
  yards: (typeof DISTANCE_RING_YARDS)[number];
  points: LatLng[];
  /** Arc point on the player → green bearing. The band number, not a measured yardage. */
  labelAt: LatLng;
};

/** Good or soft, with a real positive yard number. Forced / none / missing → not trusted. */
export function yardsToGreenIsTrusted(result: TrustedYardsToGreen | null | undefined): boolean {
  if (!result) return false;
  if (result.quality !== 'good' && result.quality !== 'soft') return false;
  return result.yards != null && Number.isFinite(result.yards) && result.yards > 0;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Point `yards` away along the great circle. Same earth radius and yards
 * constant as haversine. Null when the result is not a real coordinate.
 */
export function pointYardsFrom(origin: LatLng, bearingDeg: number, yards: number): LatLng | null {
  if (!isValidLatLng(origin) || !Number.isFinite(bearingDeg) || !Number.isFinite(yards) || yards <= 0) {
    return null;
  }
  const angular = (yards * METERS_PER_YARD) / EARTH_RADIUS_M;
  const theta = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);
  const sinLat2 = Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta);
  if (sinLat2 > 1 || sinLat2 < -1) return null;
  const lat2 = Math.asin(sinLat2);
  const y = Math.sin(theta) * Math.sin(angular) * Math.cos(lat1);
  const x = Math.cos(angular) - Math.sin(lat1) * sinLat2;
  const lng2 = lng1 + Math.atan2(y, x);
  const point = {
    lat: toDeg(lat2),
    lng: ((toDeg(lng2) + 540) % 360) - 180,
  };
  return isValidLatLng(point) ? point : null;
}

function arcAt(center: LatLng, bearingDeg: number, yards: number): { points: LatLng[]; labelAt: LatLng } | null {
  const points: LatLng[] = [];
  let labelAt: LatLng | null = null;
  for (
    let offset = -DISTANCE_RING_ARC_HALF_DEG;
    offset <= DISTANCE_RING_ARC_HALF_DEG + 1e-9;
    offset += DISTANCE_RING_ARC_STEP_DEG
  ) {
    const point = pointYardsFrom(center, bearingDeg + offset, yards);
    if (!point) return null;
    points.push(point);
    if (offset === 0) labelAt = point;
  }
  if (!labelAt) return null;
  return { points, labelAt };
}

/**
 * 100 / 150 / 200 yard arcs for the phone hole map.
 * Center is the player fix that map already draws. The arc opens along the
 * same great-circle bearing the hole camera uses, toward the green that map
 * already has. Hidden unless yards-to-green is trusted and both the fix and
 * the green are real coordinates. Does not invent a fix, a green, or a yardage.
 */
export function planDistanceRings(args: {
  center: LatLng | null | undefined;
  green: LatLng | null | undefined;
  yardsToGreen: TrustedYardsToGreen | null | undefined;
}): DistanceRing[] {
  if (!yardsToGreenIsTrusted(args.yardsToGreen)) return [];
  if (!isValidLatLng(args.center) || !isValidLatLng(args.green)) return [];
  const bearing = holeCameraHeading(args.center, args.green);
  if (bearing == null) return [];

  const rings: DistanceRing[] = [];
  for (const yards of DISTANCE_RING_YARDS) {
    const arc = arcAt(args.center, bearing, yards);
    if (!arc) continue;
    rings.push({ yards, points: arc.points, labelAt: arc.labelAt });
  }
  return rings;
}
