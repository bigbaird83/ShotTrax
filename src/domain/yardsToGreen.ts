import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import type { ShotFixQuality } from './types';

export type GreenPinSource = 'user_estimate' | 'course_centroid';

export type GreenPin = LatLng & { source: GreenPinSource };

/** Live to-green may read up to this. Over it, keep the course tee yardage or —. */
export const TO_GREEN_LIVE_MAX_YD = 600;
/** After a mark, use mark-to-green only when it differs from the card by more than this. */
export const TO_GREEN_COURSE_SWITCH_YD = 50;

export type ToGreenSource = 'course' | 'live' | 'none';

export type ToGreenDisplay = {
  yards: number | null;
  source: ToGreenSource;
  quality: 'good' | 'soft' | 'none';
};

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

export function courseTeeYards(yards: number | null | undefined): number | null {
  if (yards == null || !Number.isFinite(yards) || yards <= 0) return null;
  return Math.round(yards);
}

/** Live GPS / mark-to-green. Quality none or over 600 → not shown. Not the 400-yard shot-save cap. */
export function liveToGreenYards(
  yards: number | null | undefined,
  quality: string,
): number | null {
  if (quality === 'none') return null;
  if (yards == null || !Number.isFinite(yards) || yards > TO_GREEN_LIVE_MAX_YD) return null;
  return Math.round(yards);
}

/** Latest club mark on the hole (where they hit from). No coords → null, never invented. */
export function lastClubMark(
  shots: { seq: number; startLat: number | null; startLng: number | null }[],
): LatLng | null {
  const last = [...shots].sort((a, b) => a.seq - b.seq).at(-1);
  if (!last) return null;
  const mark = { lat: last.startLat ?? Number.NaN, lng: last.startLng ?? Number.NaN };
  return isValidLatLng(mark) ? mark : null;
}

export function markToGreen(
  mark: LatLng | null,
  green: LatLng | null,
): { yards: number | null; quality: ShotFixQuality } {
  if (!isValidLatLng(mark) || !isValidLatLng(green)) {
    return { yards: null, quality: 'none' };
  }
  return { yards: roundYards(haversineYards(mark, green)), quality: 'good' };
}

/**
 * To-green number for the hole header and picker remaining-yards line.
 *
 * Before any shot: course tee yardage (the card). Not the phone-to-green fix —
 * that is why home showed 14,167.
 * After a mark: mark-to-green only when it is more than 50 yards off the card.
 * Live may show up to 600. Over 600, keep the course number or —.
 * No course + live ≤ 600 → live. No green → —. Quality none → no live number.
 * The 400-yard shot-save confirm is a different gate and stays unchanged.
 */
export function planToGreenDisplay(args: {
  courseYards: number | null;
  liveYards: number | null;
  liveQuality: string;
  shotCount: number;
  hasGreen: boolean;
}): ToGreenDisplay {
  if (!args.hasGreen) return { yards: null, source: 'none', quality: 'none' };

  const course = courseTeeYards(args.courseYards);
  const live = liveToGreenYards(args.liveYards, args.liveQuality);
  const liveQuality = args.liveQuality === 'soft' ? 'soft' : 'good';

  if (args.shotCount <= 0) {
    if (course != null) return { yards: course, source: 'course', quality: 'good' };
    if (live != null) return { yards: live, source: 'live', quality: liveQuality };
    return { yards: null, source: 'none', quality: 'none' };
  }

  if (live != null && course != null) {
    if (Math.abs(live - course) > TO_GREEN_COURSE_SWITCH_YD) {
      return { yards: live, source: 'live', quality: liveQuality };
    }
    return { yards: course, source: 'course', quality: 'good' };
  }
  if (live != null) return { yards: live, source: 'live', quality: liveQuality };
  if (course != null) return { yards: course, source: 'course', quality: 'good' };
  return { yards: null, source: 'none', quality: 'none' };
}

/** Copy for a planned to-green result. Never invents a number. */
export function yardsToGreenLabel(
  result: { yards: number | null; quality: ShotFixQuality },
  ctx: { hasFix?: boolean; hasGreen?: boolean } = {},
): {
  heading: string;
  value: string;
  detail: string;
} {
  const heading = 'yards to green';
  if (result.quality !== 'none' && result.yards != null && Number.isFinite(result.yards)) {
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

export function toGreenDisplayFromHole(args: {
  courseYards: number | null;
  green: LatLng | null;
  shots: { seq: number; startLat: number | null; startLng: number | null }[];
  phone: { yards: number | null; quality: string };
}): ToGreenDisplay {
  const hasGreen = isValidLatLng(args.green);
  const marked = args.shots.length > 0;
  const live = marked ? markToGreen(lastClubMark(args.shots), args.green) : args.phone;
  return planToGreenDisplay({
    courseYards: args.courseYards,
    liveYards: live.yards,
    liveQuality: live.quality,
    shotCount: args.shots.length,
    hasGreen,
  });
}
