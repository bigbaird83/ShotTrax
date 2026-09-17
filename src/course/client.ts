import { getGolfCoursesApiKey } from './config';
import { fetchOsmOverlay } from './osmOverlay';
import { parseCourseDetail, parseNearbyCourses } from './parse';
import type { CourseDataClient, CourseDetail, CourseSummary } from './types';
import type { LatLng } from '../domain/latLng';

export const GOLF_COURSES_API_BASE = 'https://golfcoursesapi.com/api/v1';
const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 100;

export type CourseDataDeps = {
  getKey?: () => string | null;
  fetch?: typeof fetch;
};

async function apiGet(
  path: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const res = await fetchImpl(`${GOLF_COURSES_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Golf Courses API key was rejected.');
  }
  if (!res.ok) {
    throw new Error(`Golf Courses API error (${res.status}).`);
  }
  return res.json();
}

/**
 * Thin Golf Courses API client (nearby courses, par, green centroid).
 * Disabled when no key is configured — does not invent course or green data.
 */
export function createCourseDataClient(deps: CourseDataDeps = {}): CourseDataClient {
  const getKey = deps.getKey ?? getGolfCoursesApiKey;
  const fetchImpl = deps.fetch ?? fetch;

  return {
    isConfigured(): boolean {
      return getKey() != null;
    },

    async nearbyCourses(from: LatLng, radiusKm = DEFAULT_RADIUS_KM): Promise<CourseSummary[]> {
      const key = getKey();
      if (!key) return [];
      const radius = Math.min(MAX_RADIUS_KM, Math.max(1, radiusKm));
      const query = new URLSearchParams({
        lat: String(from.lat),
        lng: String(from.lng),
        radius: String(radius),
      });
      const json = await apiGet(`/courses?${query.toString()}`, key, fetchImpl);
      return parseNearbyCourses(json);
    },

    async getCourse(id: string): Promise<CourseDetail | null> {
      const key = getKey();
      if (!key || !id.trim()) return null;
      const json = await apiGet(`/courses/${encodeURIComponent(id)}`, key, fetchImpl);
      return parseCourseDetail(json);
    },

    fetchOsmOverlay,
  };
}

let singleton: CourseDataClient | null = null;

export function getCourseDataClient(): CourseDataClient {
  if (!singleton) singleton = createCourseDataClient();
  return singleton;
}

export function resetCourseDataClient(): void {
  singleton = null;
}
