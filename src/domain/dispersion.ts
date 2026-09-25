import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import { isValidLatLng, type LatLng } from './latLng';
import { includeInDistanceAverages } from './shotSource';
import type { ShotFixQuality, ShotSource } from './types';

/**
 * Club dispersion from saved shots. Each shot is measured against the line from
 * where it was hit to the hole's green pin: `along` = yards toward the green,
 * `lateral` = yards off that line (right +, left −).
 *
 * Only real GPS / Placed distance samples (same rule as club averages) with a
 * start, an end, and a saved green pin count. No green → the shot is skipped;
 * a target line is never guessed. A start within MIN_AIM_YARDS of the green has
 * no stable line and is skipped too.
 */

export const MIN_AIM_YARDS = 20;
/** "On line" band: within this share of the shot's length, never tighter than ON_LINE_MIN_YARDS. */
export const ON_LINE_SHARE = 0.05;
export const ON_LINE_MIN_YARDS = 3;

export type DispersionShotIn = {
  shotId: string;
  clubId: string | null;
  source: ShotSource;
  fixQuality: ShotFixQuality | null;
  distanceYards: number | null;
  impossibleJump: boolean;
  start: LatLng | null;
  end: LatLng | null;
  green: LatLng | null;
  playedAt: string;
  courseName: string | null;
  holeNumber: number;
};

export type DispersionPoint = {
  shotId: string;
  along: number;
  lateral: number;
  playedAt: string;
  courseName: string;
  holeNumber: number;
};

export type DispersionPlan = {
  points: DispersionPoint[];
  count: number;
  avgAlong: number | null;
  avgLateral: number | null;
  /** Middle 80% of distances (all of them under 5 shots). */
  alongRange: { low: number; high: number } | null;
  /** Middle 80% of left/right misses. */
  lateralRange: { low: number; high: number } | null;
  left: number;
  onLine: number;
  right: number;
};

/** Local flat-earth yards from `origin` — fine at golf-shot scale. */
function toYards(origin: LatLng, point: LatLng): { x: number; y: number } {
  const rad = Math.PI / 180;
  const metersPerDegLat = EARTH_RADIUS_M * rad;
  const metersPerDegLng = metersPerDegLat * Math.cos(origin.lat * rad);
  return {
    x: ((point.lng - origin.lng) * metersPerDegLng) / METERS_PER_YARD,
    y: ((point.lat - origin.lat) * metersPerDegLat) / METERS_PER_YARD,
  };
}

/** Along / lateral yards for one shot, or null when it can't be measured honestly. */
export function measureShot(shot: DispersionShotIn): { along: number; lateral: number } | null {
  if (shot.impossibleJump) return null;
  if (!includeInDistanceAverages(shot)) return null;
  if (!isValidLatLng(shot.start) || !isValidLatLng(shot.end) || !isValidLatLng(shot.green)) return null;
  const aim = toYards(shot.start, shot.green);
  const aimLength = Math.hypot(aim.x, aim.y);
  if (aimLength < MIN_AIM_YARDS) return null;
  const ux = aim.x / aimLength;
  const uy = aim.y / aimLength;
  const ball = toYards(shot.start, shot.end);
  const along = ball.x * ux + ball.y * uy;
  // Cross product sign: positive when the ball finished right of the aim line.
  const lateral = ball.x * uy - ball.y * ux;
  return { along: Math.round(along), lateral: Math.round(lateral) };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0] as number;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return Math.round(a + (b - a) * (pos - lo));
}

function middleRange(values: number[]): { low: number; high: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 5) return { low: sorted[0] as number, high: sorted[sorted.length - 1] as number };
  return { low: quantile(sorted, 0.1), high: quantile(sorted, 0.9) };
}

export function onLineBand(along: number): number {
  return Math.max(ON_LINE_MIN_YARDS, Math.abs(along) * ON_LINE_SHARE);
}

export function planDispersion(shots: readonly DispersionShotIn[], clubId: string): DispersionPlan {
  const points: DispersionPoint[] = [];
  for (const shot of shots) {
    if (shot.clubId !== clubId) continue;
    const measured = measureShot(shot);
    if (!measured) continue;
    points.push({
      shotId: shot.shotId,
      ...measured,
      playedAt: shot.playedAt,
      courseName: shot.courseName?.trim() || 'Round',
      holeNumber: shot.holeNumber,
    });
  }
  const count = points.length;
  const avg = (values: number[]) =>
    values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  let left = 0;
  let onLine = 0;
  let right = 0;
  for (const point of points) {
    const band = onLineBand(point.along);
    if (point.lateral > band) right += 1;
    else if (point.lateral < -band) left += 1;
    else onLine += 1;
  }
  return {
    points,
    count,
    avgAlong: avg(points.map((p) => p.along)),
    avgLateral: avg(points.map((p) => p.lateral)),
    alongRange: middleRange(points.map((p) => p.along)),
    lateralRange: middleRange(points.map((p) => p.lateral)),
    left,
    onLine,
    right,
  };
}

/** Clubs with at least one measurable shot, in bag order. Putter never appears. */
export function dispersionClubs(
  shots: readonly DispersionShotIn[],
  clubs: Record<string, { name: string; sortOrder: number }>,
): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const shot of shots) {
    if (!shot.clubId || !measureShot(shot)) continue;
    counts.set(shot.clubId, (counts.get(shot.clubId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      count,
      name: clubs[id]?.name ?? 'Club',
      sortOrder: clubs[id]?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ id, name, count }) => ({ id, name, count }));
}

/** `12 R`, `8 L`, `On line`. */
export function formatLateral(yards: number | null): string {
  if (yards == null) return '—';
  if (yards === 0) return 'On line';
  return `${Math.abs(yards)} ${yards > 0 ? 'R' : 'L'}`;
}

/** `45% right · 30% on line · 25% left` — shares of measured shots. */
export function formatMissShares(plan: DispersionPlan): string | null {
  if (plan.count === 0) return null;
  const pct = (n: number) => Math.round((n / plan.count) * 100);
  return `${pct(plan.left)}% left · ${pct(plan.onLine)}% on line · ${pct(plan.right)}% right`;
}
