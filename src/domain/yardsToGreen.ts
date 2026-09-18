import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import type { ShotFixQuality, ShotSource } from './types';

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

/** Start-to-green. Quality none or over 600 → not shown. Not the 400-yard shot-save cap. */
export function liveToGreenYards(
  yards: number | null | undefined,
  quality: string,
): number | null {
  if (quality === 'none') return null;
  if (yards == null || !Number.isFinite(yards) || yards > TO_GREEN_LIVE_MAX_YD) return null;
  return Math.round(yards);
}

export type ClubStartShot = {
  seq: number;
  startLat: number | null;
  startLng: number | null;
  fixQuality?: ShotFixQuality | null;
};

/** Latest shot start (where they hit from). Never the phone. Never invented. */
export function lastClubMark(shots: ClubStartShot[]): LatLng | null {
  const last = [...shots].sort((a, b) => a.seq - b.seq).at(-1);
  if (!last) return null;
  const mark = { lat: last.startLat ?? Number.NaN, lng: last.startLng ?? Number.NaN };
  return isValidLatLng(mark) ? mark : null;
}

export function lastClubStartQuality(shots: ClubStartShot[]): ShotFixQuality {
  const last = [...shots].sort((a, b) => a.seq - b.seq).at(-1);
  return last?.fixQuality === 'none' ? 'none' : last?.fixQuality === 'soft' ? 'soft' : 'good';
}

export type ClubLandingShot = {
  seq: number;
  endLat: number | null;
  endLng: number | null;
  endedAt?: string | null;
  source?: ShotSource;
  fixQuality?: ShotFixQuality | null;
};

/**
 * Latest closed landing (where the ball finished). Never the tee, never the
 * phone, never invented. `no_gps` / quality none / open shots do not count.
 */
export function lastLandingMark(shots: ClubLandingShot[]): LatLng | null {
  const last = [...shots]
    .filter((shot) => {
      if (shot.endedAt === null) return false;
      if (shot.source === 'no_gps' || shot.fixQuality === 'none') return false;
      return true;
    })
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (!last) return null;
  const mark = { lat: last.endLat ?? Number.NaN, lng: last.endLng ?? Number.NaN };
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
 * Before any mark: course tee yardage only. Never the phone's distance home.
 * After a mark: haversine from that shot's start to the green — never the
 * phone's current location. Switch only if that number is more than 50 yards
 * off the card AND 600 or under. Over 600 or quality none → keep the course
 * number. No course + start-to-green ≤ 600 → live. No green → —. Never invent.
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
    return { yards: null, source: 'none', quality: 'none' };
  }

  if (live != null && course != null && Math.abs(live - course) > TO_GREEN_COURSE_SWITCH_YD) {
    return { yards: live, source: 'live', quality: liveQuality };
  }
  if (course != null) return { yards: course, source: 'course', quality: 'good' };
  if (live != null) return { yards: live, source: 'live', quality: liveQuality };
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

/**
 * Play header yards. Same 600-yard check as live to-green / home club tap.
 * Couch (phone more than 600 from the green and the tee) → course
 * tee-to-center. Never the phone-to-green number (14,000).
 * On the course (within 600 of green or tee) → live remaining.
 * No green, or no course yardage and live over 600 → —.
 */
export function planPlayHeaderYards(args: {
  phone: LatLng | null | undefined;
  green: LatLng | null | undefined;
  tee: LatLng | null | undefined;
  courseYards: number | null;
}): ToGreenDisplay {
  const hasGreen = isValidLatLng(args.green);
  const course = courseTeeYards(args.courseYards);
  const distGreen =
    isValidLatLng(args.phone) && isValidLatLng(args.green)
      ? haversineYards(args.phone, args.green)
      : null;
  const distTee =
    isValidLatLng(args.phone) && isValidLatLng(args.tee)
      ? haversineYards(args.phone, args.tee)
      : null;
  const onCourse =
    (distGreen != null && distGreen <= TO_GREEN_LIVE_MAX_YD) ||
    (distTee != null && distTee <= TO_GREEN_LIVE_MAX_YD);

  if (!hasGreen) return { yards: null, source: 'none', quality: 'none' };

  if (onCourse) {
    const live = liveToGreenYards(distGreen, 'good');
    if (live != null) return { yards: live, source: 'live', quality: 'good' };
    if (course != null) return { yards: course, source: 'course', quality: 'good' };
    return { yards: null, source: 'none', quality: 'none' };
  }

  if (course != null) return { yards: course, source: 'course', quality: 'good' };
  if (distGreen != null && distGreen > TO_GREEN_LIVE_MAX_YD) {
    return { yards: null, source: 'none', quality: 'none' };
  }
  return { yards: null, source: 'none', quality: 'none' };
}

export function toGreenDisplayFromHole(args: {
  courseYards: number | null;
  green: LatLng | null;
  shots: ClubStartShot[];
}): ToGreenDisplay {
  const hasGreen = isValidLatLng(args.green);
  if (args.shots.length === 0) {
    return planToGreenDisplay({
      courseYards: args.courseYards,
      liveYards: null,
      liveQuality: 'none',
      shotCount: 0,
      hasGreen,
    });
  }
  const start = lastClubMark(args.shots);
  const live = markToGreen(start, args.green);
  const quality = lastClubStartQuality(args.shots);
  return planToGreenDisplay({
    courseYards: args.courseYards,
    liveYards: live.yards,
    liveQuality: quality === 'none' ? 'none' : live.quality,
    shotCount: args.shots.length,
    hasGreen,
  });
}
