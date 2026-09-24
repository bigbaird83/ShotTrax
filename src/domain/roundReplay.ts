import { isCourseCardLatLng, isValidLatLng, type LatLng } from './latLng';
import { COPY } from './playerCopy';

/**
 * Round replay P1. A closed shot keeps the lat/lng and distance it already
 * has. The hole map draws those as static pins. A shot with no coordinates
 * stays a missing pin — nothing is invented, and the camera does not fly.
 */

export function replayPinsAreStatic(): true {
  return true;
}

export function replayAnimates(): false {
  return false;
}

export function replayFliesCamera(): false {
  return false;
}

/** Replay pins do not track view changes. */
export function replayPinTracksViewChanges(): false {
  return false;
}

export type ReplayPinRole = 'start' | 'end';

export type ReplayPin = {
  key: string;
  seq: number;
  role: ReplayPinRole;
  lat: number;
  lng: number;
};

export type ReplayMissing = {
  seq: number;
};

export type ReplayPlan = {
  pins: ReplayPin[];
  missing: ReplayMissing[];
  staticPins: true;
  animates: false;
  fliesCamera: false;
};

export type ClosedShotPointInput = {
  seq: number;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  distanceYards: number | null;
  endedAt: string | null;
};

export type DurableClosedShot = {
  seq: number;
  points: { role: ReplayPinRole; lat: number; lng: number }[];
  /** Stored pin-to-pin yards only when both pins are real. Never filled in. */
  distanceYards: number | null;
  missing: boolean;
};

function pointOrNull(lat: number | null, lng: number | null): LatLng | null {
  if (lat == null || lng == null) return null;
  const point = { lat, lng };
  return isValidLatLng(point) ? { lat: point.lat, lng: point.lng } : null;
}

function storedYards(value: number | null, bothPins: boolean): number | null {
  if (!bothPins) return null;
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Closed shots only. An open mark is not a replay point. */
export function durableClosedShot(shot: ClosedShotPointInput): DurableClosedShot | null {
  if (shot.endedAt == null || shot.endedAt.trim() === '') return null;
  const start = pointOrNull(shot.startLat, shot.startLng);
  const end = pointOrNull(shot.endLat, shot.endLng);
  const points = [
    start ? { role: 'start' as const, lat: start.lat, lng: start.lng } : null,
    end ? { role: 'end' as const, lat: end.lat, lng: end.lng } : null,
  ].filter((point): point is { role: ReplayPinRole; lat: number; lng: number } => point != null);
  return {
    seq: shot.seq,
    points,
    distanceYards: storedYards(shot.distanceYards, start != null && end != null),
    missing: points.length === 0,
  };
}

export function planReplay(shots: readonly ClosedShotPointInput[]): ReplayPlan {
  const pins: ReplayPin[] = [];
  const missing: ReplayMissing[] = [];
  for (const shot of shots) {
    const durable = durableClosedShot(shot);
    if (!durable) continue;
    if (durable.missing) {
      missing.push({ seq: durable.seq });
      continue;
    }
    for (const point of durable.points) {
      pins.push({
        key: `${durable.seq}-${point.role}`,
        seq: durable.seq,
        role: point.role,
        lat: point.lat,
        lng: point.lng,
      });
    }
  }
  return {
    pins,
    missing,
    staticPins: replayPinsAreStatic(),
    animates: replayAnimates(),
    fliesCamera: replayFliesCamera(),
  };
}

export function formatReplayMissingLine(seq: number): string {
  return `Shot ${seq} · ${COPY.replayNoPin}`;
}

export function replayReviewRequested(review: string | string[] | null | undefined): boolean {
  const value = Array.isArray(review) ? review[0] : review;
  return value === '1';
}

/** History opens this hole for review. Pins stay static. */
export function replayHoleHref(roundId: string, holeNumber: number): string {
  return `/round/${roundId}/hole/${holeNumber}?review=1`;
}

/**
 * One static frame. Real tee + green when the card has them, plus any replay
 * pins. Pin-only when the card has no tee/green and at least two real pins
 * exist. Never the phone, and never a made-up point.
 */
export function planReplayFramePoints(args: {
  tee: LatLng | null | undefined;
  green: LatLng | null | undefined;
  pins: readonly { lat: number; lng: number }[];
}): LatLng[] | null {
  const points: LatLng[] = [];
  if (isCourseCardLatLng(args.tee)) points.push({ lat: args.tee.lat, lng: args.tee.lng });
  if (isCourseCardLatLng(args.green)) points.push({ lat: args.green.lat, lng: args.green.lng });
  for (const pin of args.pins) {
    if (!isValidLatLng(pin)) continue;
    points.push({ lat: pin.lat, lng: pin.lng });
  }
  return points.length >= 2 ? points : null;
}
