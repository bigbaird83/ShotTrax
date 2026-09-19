import type { CourseSummary } from '../course/types';

/** Start 9/18 always needs a real picked course. Typed names do not start a round. */
export function courseNameIsOptional(): false {
  return false;
}

export function canStartWithoutCourse(): false {
  return false;
}

export function freeTextCourseStartAllowed(): false {
  return false;
}

/** When the course lists tees, a tee is required. */
export function canStartWithoutTeeWhenCourseHasTees(): false {
  return false;
}

export const COURSE_SEARCH_PLACEHOLDER = 'Search by name, city, state, or zip';

export function courseSearchPlaceholder(): typeof COURSE_SEARCH_PLACEHOLDER {
  return COURSE_SEARCH_PLACEHOLDER;
}

/** Golf Courses API text search. Name, city, state, and zip all go through `q`. */
export function courseSearchQueryParam(): 'q' {
  return 'q';
}

export function parseCourseSearchQuery(raw: string | null | undefined): string | null {
  const q = raw?.trim() ?? '';
  return q.length > 0 ? q : null;
}

export function planCourseSearchParams(raw: string | null | undefined): { q: string } | null {
  const q = parseCourseSearchQuery(raw);
  return q ? { q } : null;
}

export function canStartRound(args: {
  picked?: { id?: string | null } | null;
  teeCount?: number | null;
  pickedTee?: { name?: string | null } | null;
}): boolean {
  const id = args.picked?.id?.trim();
  if (!id) return false;
  if (args.teeCount == null) return false;
  if (args.teeCount > 0 && !args.pickedTee?.name?.trim()) return false;
  return true;
}

function playedAt(
  course: { id?: string | null; name?: string | null },
  lastPlayedAtByCourse?: Record<string, string | null | undefined>,
): string | null {
  if (!lastPlayedAtByCourse) return null;
  const id = course.id?.trim();
  const name = course.name?.trim();
  const raw = (id ? lastPlayedAtByCourse[id] : null) ?? (name ? lastPlayedAtByCourse[name] : null);
  return raw?.trim() ? raw : null;
}

/** One list: current results, played courses first (most recent), then the rest. */
export function planCourseList<T extends { id?: string | null; name?: string | null }>(args: {
  courses: T[];
  lastPlayedAtByCourse?: Record<string, string | null | undefined>;
}): T[] {
  return args.courses
    .map((course, index) => ({ course, index, played: playedAt(course, args.lastPlayedAtByCourse) }))
    .sort((a, b) => {
      if (a.played && b.played) {
        const byDate = Date.parse(b.played) - Date.parse(a.played);
        if (byDate !== 0) return byDate;
        return a.index - b.index;
      }
      if (a.played) return -1;
      if (b.played) return 1;
      return a.index - b.index;
    })
    .map((row) => row.course);
}

export function courseListPutsPlayedOnTop(): true {
  return true;
}

export function courseSearchSharesNearbyList(): true {
  return true;
}

/** Text / place search. Never Watch GPS and never the 15 m / 25 m mark gates. */
export function courseSearchUsesWatchGps(): false {
  return false;
}

export function courseSearchUsesPhoneFix(): false {
  return false;
}

export function courseSearchUsesMarkGates(): false {
  return false;
}

export type CourseSummaryList = CourseSummary[];
