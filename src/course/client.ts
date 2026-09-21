import { getGolfCoursesApiKey } from './config';
import {
  catalogCourseDetail,
  isLocalCatalogId,
  mergeCatalogSummaries,
  nearbyLocalCatalog,
  searchLocalCatalog,
} from './catalog';
import { fillCourseDetailFromGolfApi } from './hydrate';
import { fetchOsmOverlay } from './osmOverlay';
import {
  mergeGreenCenters,
  parseCourseDetail,
  parseGreenCenters,
  parseNearbyCourses,
} from './parse';
import type { CourseDataClient, CourseDetail, CourseSummary, OsmOverlayQuery } from './types';
import type { LatLng } from '../domain/latLng';
import { planCourseSearchParams } from '../domain/coursePick';

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
    return 'Couldn’t reach courses nearby. Try again.';
  }
  return raw || 'Couldn’t load courses.';
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
    throw new GolfCoursesApiError('Couldn’t sign in to courses.', 401);
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
      const radius = Math.min(MAX_RADIUS_KM, Math.max(1, radiusKm));
      const local = nearbyLocalCatalog(from, radius);
      if (!key) return local;
      const query = new URLSearchParams({
        lat: String(from.lat),
        lng: String(from.lng),
        radius: String(radius),
      });
      const { status, json } = await apiGet(`/courses?${query.toString()}`, key, fetchImpl);
      if (status === 403) {
        throw new GolfCoursesApiError('Courses near you aren’t available.', 403);
      }
      if (status < 200 || status >= 300) {
        throw new GolfCoursesApiError('Couldn’t load courses nearby.', status);
      }
      return mergeCatalogSummaries(parseNearbyCourses(json), local);
    },

    async searchCourses(query: string): Promise<CourseSummary[]> {
      const key = getKey();
      const params = planCourseSearchParams(query);
      if (!params) return [];
      const local = searchLocalCatalog(params.q);
      if (!key) return local;
      const search = new URLSearchParams({ q: params.q });
      const { status, json } = await apiGet(`/courses?${search.toString()}`, key, fetchImpl);
      if (status === 403) {
        throw new GolfCoursesApiError('Courses aren’t available right now.', 403);
      }
      if (status < 200 || status >= 300) {
        throw new GolfCoursesApiError('Couldn’t find that course.', status);
      }
      return mergeCatalogSummaries(parseNearbyCourses(json), local);
    },

    async getCourse(id: string): Promise<CourseDetail | null> {
      if (!id.trim()) return null;
      if (isLocalCatalogId(id)) return catalogCourseDetail(id);
      const key = getKey();
      if (!key) return catalogCourseDetail(id);
      const encoded = encodeURIComponent(id);
      const detailRes = await apiGet(`/courses/${encoded}`, key, fetchImpl);
      if (detailRes.status === 404) return null;
      if (detailRes.status < 200 || detailRes.status >= 300) {
        throw new GolfCoursesApiError('Couldn’t load that course.', detailRes.status);
      }
      const detail = parseCourseDetail(detailRes.json);
      if (!detail) return null;

      const greensRes = await apiGet(`/courses/${encoded}/green-centers`, key, fetchImpl);
      if (greensRes.status === 403 || greensRes.status === 404) {
        return fillCourseDetailFromGolfApi(detail, {
          name: detail.name,
          city: detail.city,
          state: detail.state,
          location: detail.location,
          courseKey: detail.id,
        });
      }
      if (greensRes.status < 200 || greensRes.status >= 300) {
        return fillCourseDetailFromGolfApi(detail, {
          name: detail.name,
          city: detail.city,
          state: detail.state,
          location: detail.location,
          courseKey: detail.id,
        });
      }
      const greens = parseGreenCenters(greensRes.json);
      const holes = mergeGreenCenters(detail.holes, greens);
      const tees = detail.tees.map((tee) => ({
        ...tee,
        holes: mergeGreenCenters(tee.holes, greens),
      }));
      return fillCourseDetailFromGolfApi(
        {
          ...detail,
          holes,
          tees,
        },
        {
          name: detail.name,
          city: detail.city,
          state: detail.state,
          location: detail.location,
          courseKey: detail.id,
        },
      );
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
