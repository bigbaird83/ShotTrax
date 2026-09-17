/** Nearby-course list distance. Separate from shot yards and putt buckets. */

export const COURSE_DISTANCE_UNITS = ['mi', 'km'] as const;
export type CourseDistanceUnit = (typeof COURSE_DISTANCE_UNITS)[number];

/** Miles is the default. Never invented from GPS — uses the nearby-search distance only. */
export const DEFAULT_COURSE_DISTANCE_UNIT: CourseDistanceUnit = 'mi';

export const COURSE_DISTANCE_SETTING_KEY = 'course_distance_unit';

export function isCourseDistanceUnit(value: string | null | undefined): value is CourseDistanceUnit {
  return value === 'mi' || value === 'km';
}

export function parseCourseDistanceUnit(raw: string | null | undefined): CourseDistanceUnit {
  return isCourseDistanceUnit(raw) ? raw : DEFAULT_COURSE_DISTANCE_UNIT;
}

/**
 * Format nearby-course distance for the list (e.g. 13.0 km → 8.1 mi).
 * Null when the search did not return a distance — never invent one from GPS.
 */
export function formatCourseDistance(
  meters: number | null,
  unit: CourseDistanceUnit = DEFAULT_COURSE_DISTANCE_UNIT,
): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (unit === 'km') {
    if (meters < 950) return '< 1 km';
    return `${(meters / 1000).toFixed(1)} km`;
  }
  const miles = meters / 1609.344;
  if (miles < 0.6) return '< 1 mi';
  return `${miles.toFixed(1)} mi`;
}
