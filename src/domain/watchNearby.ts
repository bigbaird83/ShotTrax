/** Watch starts the round from a short nearby-course list.
 * The list uses the phone fix only. Watch GPS never chooses a course.
 * Finding a course skips the 15 m / 25 m mark gates. No search box.
 * No fresh phone fix, or an empty list → one line: open the phone.
 */

import { COPY } from './playerCopy';
import { isValidLatLng, type LatLng } from './latLng';
import type { GpsFix } from './types';

export const NEARBY_COURSE_FIX_MAX_AGE_MS = 30_000;
export const NEARBY_COURSE_LIST_MAX = 8;
export const OPEN_PHONE = COPY.openPhone;

export function nearbyCoursesUsesPhoneFixOnly(): true {
  return true;
}

export function nearbyCoursesUsesWatchFix(): false {
  return false;
}

export function nearbyCoursesUsesMarkGates(): false {
  return false;
}

export function nearbyCoursesGuessesFromWatch(): false {
  return false;
}

export function nearbyCoursesHasSearchBox(): false {
  return false;
}

export function watchShowsBag(): false {
  return false;
}

export function watchShowsSettings(): false {
  return false;
}

export function watchShowsScoring(): false {
  return false;
}

export function nearbyCourseFixMaxAgeMs(): typeof NEARBY_COURSE_FIX_MAX_AGE_MS {
  return NEARBY_COURSE_FIX_MAX_AGE_MS;
}

/** Poor GPS still finds a course. 15 m / 25 m are shot-mark gates only. */
export function nearbyCourseFixPassesMarkGates(_accuracyM: number | null | undefined): true {
  void _accuracyM;
  return true;
}

export function nearbyCourseFixIsFresh(
  fix: { timestamp: number } | null | undefined,
  nowMs: number,
): boolean {
  if (!fix || !Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return false;
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - fix.timestamp <= NEARBY_COURSE_FIX_MAX_AGE_MS;
}

/**
 * Phone fix only. Watch coordinate is ignored even when it is fresher.
 * Accuracy is not gated. Invalid / stale / missing phone → null.
 */
export function phoneFixForNearbyCourses(args: {
  phoneFix: GpsFix | null | undefined;
  watchFix?: GpsFix | null;
  nowMs: number;
}): LatLng | null {
  void args.watchFix;
  if (!isValidLatLng(args.phoneFix)) return null;
  if (!nearbyCourseFixIsFresh(args.phoneFix, args.nowMs)) return null;
  return { lat: args.phoneFix.lat, lng: args.phoneFix.lng };
}

export type WatchNearbyCourse = {
  id: string;
  name: string;
  distanceMeters: number | null;
};

export type WatchNearbyTee = {
  name: string;
  rating: number | null;
  slope: number | null;
  totalYards: number | null;
};

export type NearbyCoursesPlan =
  | { status: 'ok'; line: null; courses: WatchNearbyCourse[] }
  | { status: 'open_phone'; line: typeof OPEN_PHONE; courses: [] };

export function planNearbyCourses(args: {
  phoneFix: GpsFix | null | undefined;
  watchFix?: GpsFix | null;
  courses: WatchNearbyCourse[];
  nowMs: number;
}): NearbyCoursesPlan {
  const phone = phoneFixForNearbyCourses(args);
  if (!phone) {
    return { status: 'open_phone', line: OPEN_PHONE, courses: [] };
  }
  const courses = args.courses
    .filter((course) => typeof course.id === 'string' && course.id.trim() && course.name.trim())
    .slice(0, NEARBY_COURSE_LIST_MAX)
    .map((course) => ({
      id: course.id,
      name: course.name,
      distanceMeters:
        course.distanceMeters != null && Number.isFinite(course.distanceMeters)
          ? course.distanceMeters
          : null,
    }));
  if (courses.length === 0) {
    return { status: 'open_phone', line: OPEN_PHONE, courses: [] };
  }
  return { status: 'ok', line: null, courses };
}

/** Never invent a course when the list is empty or the phone has no fix. */
export function guessNearbyCourse(plan: NearbyCoursesPlan): null {
  void plan;
  return null;
}

export function nearbyCoursesPayload(plan: NearbyCoursesPlan): {
  type: 'nearbyCourses';
  status: NearbyCoursesPlan['status'];
  line: string | null;
  courses: WatchNearbyCourse[];
} {
  return {
    type: 'nearbyCourses',
    status: plan.status,
    line: plan.status === 'open_phone' ? OPEN_PHONE : null,
    courses: plan.courses,
  };
}

export function nearbyTeesPayload(args: {
  courseId: string;
  courseName: string;
  tees: WatchNearbyTee[];
}): {
  type: 'nearbyTees';
  courseId: string;
  courseName: string;
  tees: WatchNearbyTee[];
} {
  return {
    type: 'nearbyTees',
    courseId: args.courseId,
    courseName: args.courseName,
    tees: args.tees.map((tee) => ({
      name: tee.name,
      rating: tee.rating,
      slope: tee.slope,
      totalYards: tee.totalYards,
    })),
  };
}
