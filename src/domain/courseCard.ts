import { formatCourseDistance, type CourseDistanceUnit } from './courseDistance';
import { formatHistoryRelativeDay } from './roundHistory';

export function courseCardShowsName(): true {
  return true;
}

export function courseCardShowsDistance(): true {
  return true;
}

export function courseCardShowsLastPlayed(): true {
  return true;
}

export function courseCardMinTap(): 72 {
  return 72;
}

export type CourseLastPlayedRound = {
  courseApiId?: string | null;
  courseName?: string | null;
  startedAt: string;
};

export function lastPlayedAtForCourse(
  rounds: CourseLastPlayedRound[],
  course: { id?: string | null; name?: string | null },
): string | null {
  const id = course.id?.trim();
  const name = course.name?.trim().toLowerCase();
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const round of rounds) {
    const matchId = id != null && id.length > 0 && round.courseApiId === id;
    const matchName =
      name != null && name.length > 0 && (round.courseName ?? '').trim().toLowerCase() === name;
    if (!matchId && !matchName) continue;
    const ms = Date.parse(round.startedAt);
    if (!Number.isFinite(ms) || ms < latestMs) continue;
    latestMs = ms;
    latest = round.startedAt;
  }
  return latest;
}

export function formatLastPlayedChip(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const relative = formatHistoryRelativeDay(iso, nowMs);
  if (relative === '—') return null;
  return `Played · ${relative}`;
}

export type CourseCardPlan = {
  name: string;
  distance: string | null;
  lastPlayed: string | null;
  /** Quiet waterfall label. Null until paint has recorded a winner. */
  paintSource: string | null;
};

/**
 * Labels TF/QA can read on the course card. Unknown or unset stays blank —
 * never a guessed source.
 *
 * cache / OSM / GCA / golfapi / miss
 */
export function formatPaintSourceChip(step: string | null | undefined): string | null {
  if (step === 'cache') return 'cache';
  if (step === 'osm') return 'OSM';
  if (step === 'gca') return 'GCA';
  if (step === 'golfapi') return 'golfapi';
  if (step === 'miss') return 'miss';
  return null;
}

export function planCourseCard(args: {
  name: string;
  distanceMeters?: number | null;
  unit?: CourseDistanceUnit;
  lastPlayedAt?: string | null;
  nowMs?: number;
  paintSource?: string | null;
}): CourseCardPlan {
  const name = args.name.trim() || 'Course';
  return {
    name,
    distance: formatCourseDistance(args.distanceMeters ?? null, args.unit ?? 'mi'),
    lastPlayed: formatLastPlayedChip(args.lastPlayedAt, args.nowMs),
    paintSource: formatPaintSourceChip(args.paintSource),
  };
}
