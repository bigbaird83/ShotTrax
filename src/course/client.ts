import { getGolfCoursesApiKey } from './config';
import { fetchOsmOverlay } from './osmOverlay';
import {
  mergeGreenCenters,
  parseCourseDetail,
  parseGreenCenters,
  parseNearbyCourses,
} from './parse';
import type { CourseDataClient, CourseDetail, CourseSummary, OsmOverlayQuery } from './types';
import type { LatLng } from '../domain/latLng';

export const GOLF_COURSES_API_BASE = 'https://golfcoursesapi.com/api/v1';
const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 100;

export type CourseDataDeps = {
  getKey?: () => string | null;
  fetch?: typeof fetch;
};

export class GolfCoursesApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GolfCoursesApiError';
    this.status = status;
  }
}

function networkHint(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/tls|ssl|cert|network request failed|failed to fetch|econnreset|enotfound/i.test(raw)) {
    return 'Golf Courses API could not be reached (TLS/network). Try on a device or EAS build — golfcoursesapi.com has TLS issues on some boxes.';
  }
  return raw || 'Golf Courses API request failed.';
}

async function apiGet(
  path: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(`${GOLF_COURSES_API_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
    });
  } catch (err) {
    throw new GolfCoursesApiError(networkHint(err));
  }
  if (res.status === 401) {
    throw new GolfCoursesApiError('Golf Courses API key was rejected.', 401);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/**
 * Golf Courses API client (nearby courses, scorecard par, Pro green centroids).
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
      const { status, json } = await apiGet(`/courses?${query.toString()}`, key, fetchImpl);
      if (status === 403) {
        throw new GolfCoursesApiError('Golf Courses API denied nearby search.', 403);
      }
      if (status < 200 || status >= 300) {
        throw new GolfCoursesApiError(`Golf Courses API error (${status}).`, status);
      }
      return parseNearbyCourses(json);
    },

    async getCourse(id: string): Promise<CourseDetail | null> {
      const key = getKey();
      if (!key || !id.trim()) return null;
      const encoded = encodeURIComponent(id);
      const detailRes = await apiGet(`/courses/${encoded}`, key, fetchImpl);
      if (detailRes.status === 404) return null;
      if (detailRes.status < 200 || detailRes.status >= 300) {
        throw new GolfCoursesApiError(`Golf Courses API error (${detailRes.status}).`, detailRes.status);
      }
      const detail = parseCourseDetail(detailRes.json);
      if (!detail) return null;

      const greensRes = await apiGet(`/courses/${encoded}/green-centers`, key, fetchImpl);
      if (greensRes.status === 403 || greensRes.status === 404) {
        return detail;
      }
      if (greensRes.status < 200 || greensRes.status >= 300) {
        return detail;
      }
      const greens = parseGreenCenters(greensRes.json);
      return {
        ...detail,
        holes: mergeGreenCenters(detail.holes, greens),
      };
    },

    fetchOsmOverlay(query: OsmOverlayQuery) {
      return fetchOsmOverlay(query, { fetch: fetchImpl });
    },
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
