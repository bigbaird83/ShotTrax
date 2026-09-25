import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import type { LatLng } from './latLng';

/** Local flat-earth yards from `origin` (x east, y north) — fine at golf-hole scale. */
export function yardsFrom(origin: LatLng, point: LatLng): { x: number; y: number } {
  const rad = Math.PI / 180;
  const metersPerDegLat = EARTH_RADIUS_M * rad;
  const metersPerDegLng = metersPerDegLat * Math.cos(origin.lat * rad);
  return {
    x: ((point.lng - origin.lng) * metersPerDegLng) / METERS_PER_YARD,
    y: ((point.lat - origin.lat) * metersPerDegLat) / METERS_PER_YARD,
  };
}

export type LineFrame = {
  /** Yards from origin to target. */
  length: number;
  /** `along` = yards toward the target; `lateral` = yards off the line (right +, left −). */
  measure: (point: LatLng) => { along: number; lateral: number };
};

/** A frame on the origin → target line. Null when the two points are on top of each other. */
export function lineFrame(origin: LatLng, target: LatLng): LineFrame | null {
  const aim = yardsFrom(origin, target);
  const length = Math.hypot(aim.x, aim.y);
  if (!Number.isFinite(length) || length < 1) return null;
  const ux = aim.x / length;
  const uy = aim.y / length;
  return {
    length,
    measure: (point) => {
      const p = yardsFrom(origin, point);
      return { along: p.x * ux + p.y * uy, lateral: p.x * uy - p.y * ux };
    },
  };
}
