import type { ShotFixQuality } from './types';
import { isValidLatLng, type LatLng } from './latLng';

export type GreenPinSource = 'user_estimate' | 'course_centroid';

export type GreenPin = LatLng & { source: GreenPinSource };

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

/** Copy for `yardsToGreen(fix, greenCentroid) → { yards, quality }`. */
export function yardsToGreenLabel(
  result: { yards: number | null; quality: ShotFixQuality },
  ctx: { hasFix?: boolean; hasGreen?: boolean } = {},
): {
  heading: string;
  value: string;
  detail: string;
} {
  const heading = 'yards to green';
  if (result.quality !== 'none' && result.yards != null) {
    return {
      heading,
      value: `${result.yards} yd`,
      detail: 'to green',
    };
  }
  let detail = 'Waiting on green location.';
  if (!ctx.hasGreen) detail = 'Waiting on green location.';
  else if (!ctx.hasFix) detail = 'Waiting on your location.';
  else detail = 'Waiting on green location.';
  return { heading, value: '—', detail };
}
