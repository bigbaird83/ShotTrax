import {
  courseIsHardMiss,
  listFavorites,
  offlinePackFor,
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
  courseWideOsmOverlay,
  dropCourseOverlayMemory,
  fetchOsmOverlay,
  loadCachedOrFetchCourseOverlay,
} from './osmOverlay';
import { loadCourseOsmOverlay, saveCourseOsmOverlay } from './osmOverlayStore';
import { coursePaintCacheKeys, getSharedCoursePaintCache, type CoursePaintCache } from './paintCache';
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
    courseLocation: isValidLatLng(course.location) ? course.location : null,
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

/** One Overpass attempt per course for this process. A miss retries on the next launch. */
const backfillAttempted = new Set<string>();
let backfillChain: Promise<void> = Promise.resolve();

export type FavoriteOverlayBackfillDeps = OfflineDownloadDeps & {
  /** Open this favorite first when a round or hole screen names it. */
  courseId?: string | null;
  /** Query center. Default is the painted green centroid, else the favorite pin. */
  loadCenter?: (course: FavoriteCourse) => Promise<LatLng | null>;
};

export function resetFavoriteOverlayBackfillForTests(): void {
  backfillAttempted.clear();
  backfillChain = Promise.resolve();
}

async function defaultOverlayCenter(course: FavoriteCourse, cache: CoursePaintCache): Promise<LatLng | null> {
  for (const key of coursePaintCacheKeys({
    courseKey: course.id,
    name: course.name,
    city: course.city,
    state: course.state,
  })) {
    const record = await cache.get(key);
    if (!record) continue;
    let lat = 0;
    let lng = 0;
    let count = 0;
    for (const hole of record.holes) {
      if (!isValidLatLng(hole.green)) continue;
      lat += hole.green.lat;
      lng += hole.green.lng;
      count += 1;
    }
    if (count > 0) return { lat: lat / count, lng: lng / count };
  }
  return isValidLatLng(course.location) ? course.location : null;
}

function rememberBackfilledOverlay(courseId: string, overlay: OsmOverlay | null, fetchedAt: string): void {
  if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return;
  const saved = saveCourseOsmOverlay({
    courseId,
    fetchedAt,
    source: 'osm',
    features: overlay.features,
  });
  if (!saved) return;
  const stored = loadCourseOsmOverlay(courseId);
  if (!stored) return;
  adoptCourseOverlay(courseId, { source: 'osm', features: stored.features, geojson: null });
}

async function backfillOneFavorite(
  course: FavoriteCourse,
  store: JsonStore,
  deps: FavoriteOverlayBackfillDeps,
  now: () => string,
): Promise<void> {
  if (backfillAttempted.has(course.id)) return;
  if (isYardTestCourseId(course.id) || courseIsHardMiss(matchOf(course))) return;
  if (offlinePackFor(store, course.id)?.status !== 'ready') return;
  if (loadCourseOsmOverlay(course.id)) return;

  const loadCenter =
    deps.loadCenter ?? ((row: FavoriteCourse) => defaultOverlayCenter(row, deps.cache ?? getSharedCoursePaintCache()));
  const center = await loadCenter(course);
  if (!center) return;

  backfillAttempted.add(course.id);
  try {
    const fetchOverlay =
      deps.fetchOverlay ??
      ((query: OsmOverlayQuery) =>
        fetchOsmOverlay(query, { fetch: deps.fetch, retryDelayMs: deps.retryDelayMs }));
    const cached = courseWideOsmOverlay(course.id);
    const overlay =
      cached ??
      (await (async () => {
        await loadCachedOrFetchCourseOverlay(
          {
            courseId: course.id,
            holeNumber: 1,
            green: center,
            location: center,
            courseLocation: isValidLatLng(course.location) ? course.location : null,
          },
          { fetchOverlay },
        );
        return courseWideOsmOverlay(course.id);
      })());
    rememberBackfilledOverlay(course.id, overlay, now());
  } catch {
    // A failure stores nothing. The session attempt is already spent.
  }
}

async function runFavoriteOverlayBackfill(
  store: JsonStore,
  deps: FavoriteOverlayBackfillDeps,
): Promise<void> {
  const prefer = deps.courseId?.trim() ?? '';
  const favorites = listFavorites(store);
  const ordered = prefer
    ? [...favorites].sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : 0))
    : favorites;
  const now = deps.now ?? (() => new Date().toISOString());
  for (const course of ordered) {
    await backfillOneFavorite(course, store, deps, now);
  }
}

/**
 * Fill overlays for favorites saved before overlays were stored.
 * Ready packs with no stored overlay get one course-wide fetch. Sequential,
 * one attempt per course per app session. Pack status is never rewritten.
 */
export function backfillReadyFavoriteOverlays(
  store: JsonStore,
  deps: FavoriteOverlayBackfillDeps = {},
): Promise<void> {
  const job = backfillChain
    .then(() => runFavoriteOverlayBackfill(store, deps))
    .then(
      () => undefined,
      () => undefined,
    );
  backfillChain = job;
  return job;
}
