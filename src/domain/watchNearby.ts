/** Watch starts the round from a short nearby-course list.
 * The list uses a fresh phone fix only. Wake the phone for that fix.
 * Watch GPS never chooses a course. Finding a course skips the 15 m / 25 m
 * mark gates. No search box. No fresh phone fix, or an empty list → open the phone.
 */

import { COPY } from './playerCopy';
import { isValidLatLng, type LatLng } from './latLng';
import type { GpsFix } from './types';

export const NEARBY_COURSE_FIX_MAX_AGE_MS = 30_000;
export const NEARBY_COURSE_LIST_MAX = 8;
export const OPEN_PHONE = COPY.openPhone;
export const SELECT_COURSE = COPY.selectCourse;

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

export function liveRoundOpensThatHole(): true {
  return true;
}

export function watchOpenCoversLiveHoleWithCourses(): false {
  return false;
}

export function startDifferentRoundLivesUnderHome(): true {
  return true;
}

export function liveRoundReplacedByWatchCoursePick(): false {
  return false;
}

export function watchCoursePickSetsPhoneCourse(): true {
  return true;
}

/** A stale or missing phone fix does not reuse a list the Watch or phone built. */
export function watchStartsFromBuiltListWithoutPhoneFix(): false {
  return false;
}

export function planWatchCoursePick(args: {
  hasLiveRound: boolean;
  replaceAllowed?: boolean;
}): 'keep_live_round' | 'set_phone_course' {
  if (args.hasLiveRound && !args.replaceAllowed) return 'keep_live_round';
  return 'set_phone_course';
}

export type WatchOpenFace = 'hole' | 'select_course' | 'nearby' | 'hole_count' | 'tees';

/** Nav after a course pick — never leave “Courses near you” on holes/tees. */
export type WatchNearbyNavTitle = 'Courses near you' | 'Holes' | 'Tees';

export function watchNearbyNavTitle(args: {
  courseId?: string | null;
  holeCount?: 9 | 18 | null;
  hasTees?: boolean;
}): WatchNearbyNavTitle {
  if (!args.courseId) return 'Courses near you';
  if ((args.holeCount === 9 || args.holeCount === 18) && args.hasTees) return 'Tees';
  return 'Holes';
}

/** Picked course is one cream name through holes → tees. */
export function watchCoursePickShowsOneName(): true {
  return true;
}

export function watchCoursePickRepeatsNameAsRow(): false {
  return false;
}

/** Phone pick reply echoes the course name — hide that orange duplicate. */
export function watchNearbyHidesCourseNameFeedback(args: {
  feedback: string;
  courseName?: string | null;
}): boolean {
  return Boolean(args.courseName && args.feedback === args.courseName);
}

export function watchFirstScreenIsSelectCourse(): true {
  return true;
}

export function watchNineIsHoles1Through9(): true {
  return true;
}

export function watchNineIsFrontOrBack(): false {
  return false;
}

export function watchEighteenIsFullCard(): true {
  return true;
}

/** 9 is holes 1–9. 18 is the full card. Never a front-or-back nine picker. */
export function holesForWatchRound(holeCount: 9 | 18): number[] {
  const count = holeCount === 9 ? 9 : 18;
  return Array.from({ length: count }, (_, i) => i + 1);
}

/**
 * A live round opens that hole. No course and no round starts on Select course,
 * not the list. After that: nearby → course → 9 or 18 → tees.
 */
export function planWatchOpenFace(args: {
  hasLiveRound: boolean;
  openedFromHome?: boolean;
  selectCourseTapped?: boolean;
  courseId?: string | null;
  holeCount?: 9 | 18 | null;
  hasTees?: boolean;
}): WatchOpenFace {
  if (args.hasLiveRound && !args.openedFromHome) return 'hole';
  if (!args.selectCourseTapped) return 'select_course';
  if (!args.courseId) return 'nearby';
  if (args.holeCount !== 9 && args.holeCount !== 18) return 'hole_count';
  if (args.hasTees) return 'tees';
  return 'hole';
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

function normalizeNearbyCourses(courses: WatchNearbyCourse[]): WatchNearbyCourse[] {
  return courses
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
}

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
  const courses = normalizeNearbyCourses(args.courses);
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
