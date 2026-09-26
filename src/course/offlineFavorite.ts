import {
  courseIsHardMiss,
  offlineStatusAfterDownload,
  writeOfflinePack,
  type FavoriteCourse,
  type JsonStore,
  type OfflinePackStatus,
} from '../domain/favorites';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { loadGcaPaintCandidate } from './client';
import type { CourseHydrateMatch } from './hydrate';
import {
  adoptCourseOverlay,
  COURSE_OSM_OVERLAY_RADIUS_M,
  dropCourseOverlayMemory,
  fetchOsmOverlay,
} from './osmOverlay';
import { loadCourseOsmOverlay, saveCourseOsmOverlay } from './osmOverlayStore';
import { getSharedCoursePaintCache, type CoursePaintCache } from './paintCache';
import type { OsmOverlay, OsmOverlayQuery } from './types';
import {
  loadGolfApiPaintCandidate,
  loadOsmOpenGolfCandidate,
  resolveCoursePaint,
  type CoursePaintResult,
} from './waterfall';
import { isYardTestCourseId } from './yardTestCourse';

export type OfflineDownloadDeps = {
  now?: () => string;
  onStatus?: (status: OfflinePackStatus) => void;
  resolve?: (course: CourseHydrateMatch) => Promise<CoursePaintResult>;
  /** Same Worker base and fetch live paint uses for GCA Pro. */
  getBaseUrl?: () => string | null;
  fetch?: typeof fetch;
  cache?: CoursePaintCache;
  /** Course-wide Overpass read. Default is one real query. Failures are ignored. */
  fetchOverlay?: (query: OsmOverlayQuery) => Promise<OsmOverlay | null>;
  retryDelayMs?: number;
};

function matchOf(course: FavoriteCourse): CourseHydrateMatch {
  return {
    courseKey: course.id,
    name: course.name,
    city: course.city,
    state: course.state,
    location: course.location,
  };
}

async function resolveWithWaterfall(
  course: CourseHydrateMatch,
  deps: OfflineDownloadDeps,
): Promise<CoursePaintResult> {
  return resolveCoursePaint(course, {
    cache: deps.cache ?? getSharedCoursePaintCache(),
    loadOsm: async () => loadOsmOpenGolfCandidate(course),
    loadGca: async () => {
      const loaded = await loadGcaPaintCandidate(course.courseKey, {
        getBaseUrl: deps.getBaseUrl,
        fetch: deps.fetch,
      });
      return loaded?.candidate ?? null;
    },
    loadGolfApi: () => loadGolfApiPaintCandidate(course, { fetchImpl: deps.fetch }),
  });
}

function overlayQueryCenter(course: FavoriteCourse, painted: CoursePaintResult): LatLng | null {
  if (painted.ok) {
    let lat = 0;
    let lng = 0;
    let count = 0;
    for (const hole of painted.holes) {
      if (!isValidLatLng(hole.green)) continue;
      lat += hole.green.lat;
      lng += hole.green.lng;
      count += 1;
    }
    if (count > 0) return { lat: lat / count, lng: lng / count };
  }
  return isValidLatLng(course.location) ? course.location : null;
}

/**
 * One course-wide Overpass read after a Ready paint. A failure or an empty
 * course stores nothing and does not change the offline status already written.
 */
async function persistFavoriteOverlay(
  course: FavoriteCourse,
  painted: CoursePaintResult,
  deps: OfflineDownloadDeps,
  now: () => string,
): Promise<void> {
  if (isYardTestCourseId(course.id) || courseIsHardMiss(matchOf(course))) return;
  const location = overlayQueryCenter(course, painted);
  if (!location) return;
  const fetchOverlay =
    deps.fetchOverlay ??
    ((query: OsmOverlayQuery) =>
      fetchOsmOverlay(query, { fetch: deps.fetch, retryDelayMs: deps.retryDelayMs }));
  const overlay = await fetchOverlay({
    courseId: course.id,
    location,
    radiusM: COURSE_OSM_OVERLAY_RADIUS_M,
  });
  if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return;
  const saved = saveCourseOsmOverlay({
    courseId: course.id,
    fetchedAt: now(),
    source: 'osm',
    features: overlay.features,
  });
  if (!saved) return;
  const stored = loadCourseOsmOverlay(course.id);
  if (!stored) return;
  dropCourseOverlayMemory(course.id);
  adoptCourseOverlay(course.id, { source: 'osm', features: stored.features, geojson: null });
}

/**
 * Persist a full course card through the existing paint waterfall and its sanity gates.
 * HARD-MISS stays Miss and does not become Ready offline, even if a loader returned coordinates.
 * A course overlay is saved only after that paint is Ready. Overlay failure leaves the status alone.
 */
export async function downloadFavoriteForOffline(
  course: FavoriteCourse,
  store: JsonStore,
  deps: OfflineDownloadDeps = {},
): Promise<OfflinePackStatus> {
  if (isYardTestCourseId(course.id)) return 'miss';
  const now = deps.now ?? (() => new Date().toISOString());
  const identity = matchOf(course);
  if (courseIsHardMiss(identity)) {
    const status: OfflinePackStatus = 'miss';
    writeOfflinePack(store, { courseId: course.id, status, updatedAt: now() });
    deps.onStatus?.(status);
    return status;
  }

  const downloading: OfflinePackStatus = 'downloading';
  writeOfflinePack(store, { courseId: course.id, status: downloading, updatedAt: now() });
  deps.onStatus?.(downloading);

  const painted = await (deps.resolve ?? ((match) => resolveWithWaterfall(match, deps)))(identity);
  const status = offlineStatusAfterDownload(identity, painted.ok);
  writeOfflinePack(store, { courseId: course.id, status, updatedAt: now() });
  deps.onStatus?.(status);

  if (status === 'ready') {
    try {
      await persistFavoriteOverlay(course, painted, deps, now);
    } catch {
      // Overlay is optional. Ready stays Ready.
    }
  }
  return status;
}
