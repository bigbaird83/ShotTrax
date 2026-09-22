import type { CourseHydrateMatch } from './hydrate';
import { getSharedCoursePaintCache } from './paintCache';
import {
  loadGolfApiPaintCandidate,
  loadOsmOpenGolfCandidate,
  resolveCoursePaint,
  type CoursePaintResult,
} from './waterfall';
import {
  courseIsHardMiss,
  offlineStatusAfterDownload,
  writeOfflinePack,
  type FavoriteCourse,
  type JsonStore,
  type OfflinePackStatus,
} from '../domain/favorites';

export type OfflineDownloadDeps = {
  now?: () => string;
  onStatus?: (status: OfflinePackStatus) => void;
  resolve?: (course: CourseHydrateMatch) => Promise<CoursePaintResult>;
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

async function resolveWithWaterfall(course: CourseHydrateMatch): Promise<CoursePaintResult> {
  return resolveCoursePaint(course, {
    cache: getSharedCoursePaintCache(),
    loadOsm: async () => loadOsmOpenGolfCandidate(course),
    loadGca: async () => null,
    loadGolfApi: () => loadGolfApiPaintCandidate(course),
  });
}

/**
 * Persist a full course card through the existing paint waterfall and its sanity gates.
 * HARD-MISS stays Miss and does not become Ready offline, even if a loader returned coordinates.
 */
export async function downloadFavoriteForOffline(
  course: FavoriteCourse,
  store: JsonStore,
  deps: OfflineDownloadDeps = {},
): Promise<OfflinePackStatus> {
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

  const painted = await (deps.resolve ?? resolveWithWaterfall)(identity);
  const status = offlineStatusAfterDownload(identity, painted.ok);
  writeOfflinePack(store, { courseId: course.id, status, updatedAt: now() });
  deps.onStatus?.(status);
  return status;
}
