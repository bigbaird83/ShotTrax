import { classifyAccuracyM, type AccuracyClass } from './fixQuality';
import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

export type GreenPinSource = 'user_estimate' | 'course_centroid';

export type GreenPin = LatLng & { source: GreenPinSource };

export type YardsToGreenUnavailable = {
  available: false;
  yards: null;
  accuracyClass: null;
  reason: 'no_green' | 'no_gps';
};

export type YardsToGreenAvailable = {
  available: true;
  yards: number;
  accuracyClass: AccuracyClass;
  reason: null;
};

export type YardsToGreen = YardsToGreenUnavailable | YardsToGreenAvailable;

/**
 * Prefer a user-dropped/GPS estimate over a course centroid. Never invent.
 */
export function resolveGreenPin(args: {
  user: LatLng | null;
  course: LatLng | null;
  userSource?: GreenPinSource;
}): GreenPin | null {
  if (isValidLatLng(args.user)) {
    return { lat: args.user.lat, lng: args.user.lng, source: args.userSource ?? 'user_estimate' };
  }
  if (isValidLatLng(args.course)) {
    return { lat: args.course.lat, lng: args.course.lng, source: 'course_centroid' };
  }
  return null;
}

/**
 * Haversine phone GPS → green pin. Soft GPS (15–25 m) still yields a distance
 * and is classified `soft` for the badge — same accuracy window as marks.
 * Does not invent a green pin or apply MAX_SHOT_YD (remaining distance is not a shot).
 */
export function measureYardsToGreen(args: {
  from: LatLng | null;
  green: LatLng | null;
  accuracyM?: number | null;
}): YardsToGreen {
  if (!isValidLatLng(args.green)) {
    return { available: false, yards: null, accuracyClass: null, reason: 'no_green' };
  }
  if (!isValidLatLng(args.from)) {
    return { available: false, yards: null, accuracyClass: null, reason: 'no_gps' };
  }
  return {
    available: true,
    yards: roundYards(haversineYards(args.from, args.green)),
    accuracyClass: classifyAccuracyM(args.accuracyM),
    reason: null,
  };
}

export function yardsToGreenLabel(result: YardsToGreen): {
  heading: string;
  value: string;
  detail: string;
} {
  if (!result.available) {
    return {
      heading: 'yards to green',
      value: '—',
      detail:
        result.reason === 'no_green'
          ? 'unavailable — no course or green pin yet'
          : 'unavailable — waiting for GPS',
    };
  }
  const detail =
    result.accuracyClass === 'soft'
      ? 'SOFT GPS 15–25 m'
      : result.accuracyClass === 'poor'
        ? 'weak GPS (>25 m or unknown)'
        : 'to green pin';
  return {
    heading: 'yards to green',
    value: `${result.yards} yd`,
    detail,
  };
}
