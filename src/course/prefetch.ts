import { isValidLatLng, type LatLng } from '../domain/latLng';
import { diagnoseCourseCardFrame, planCourseCardCamera } from '../domain/holeCamera';
import {
  cachedResolvedTee,
  loadCachedOrFetchCourseOverlay,
  rememberResolvedTee,
  resolveOverlayTee,
} from './osmOverlay';
import { applyCourseHydrateToLayout, prefetchCourseHydrateOnce } from './hydrate';
import { getSharedCoursePaintCache } from './paintCache';
import {
  applyCoursePaintToLayout,
  layoutStillHardMiss,
  loadGolfApiPaintCandidate,
  loadOsmOpenGolfCandidate,
  resolveCoursePaint,
} from './waterfall';
import { layoutForPlayedHoles } from '../domain/nineByTwo';
import { backgroundHoleNumbers } from './startRoundEntry';
import type { CourseLayoutSeed } from './layout';
import type { OsmOverlay, OsmOverlayQuery } from './types';

export type PrefetchHoleFrame = {
  holeNumber: number;
  tee: LatLng | null;
  green: LatLng | null;
  fromCache: boolean;
  fetched: boolean;
};

export type PrefetchDeps = {
  fetchOverlay?: (query: OsmOverlayQuery) => Promise<OsmOverlay | null>;
  /** Round length. Background cache is holes 2 through this count. */
  holeCount?: 9 | 18;
  /** Course card hole count. 9 + an 18-hole round mirrors real front paint. */
  courseNumHoles?: number | null;
  /** Persist a painted layout onto the open round. Never blocks Start. */
  applyLayout?: (layout: CourseLayoutSeed) => void;
};

/** Start Round must open hole 1 immediately. Whole-card OSM is background only. */
export function startRoundBlocksOnCardPrefetch(): false {
  return false;
}

/** Camera reads cached tee + green only. Phone never frames. */
export function cameraReadsCachedTeeGreenOnly(): true {
  return true;
}

export function cameraFallsBackToPhoneForFraming(): false {
  return false;
}

/** Apple satellite tiles warm per hole. They cannot be bulk-downloaded. */
export function satelliteTilesWarmPerHole(): true {
  return true;
}

export function satelliteTilesBulkDownload(): false {
  return false;
}

/**
 * Bunkers, water, and cart paths for a hole that already has a real green.
 * Uses the stored course overlay, or one course-wide query (~1800 m) shared
 * by later holes. A failed or empty response stays null.
 * Does not invent tee, green, or geometry.
 */
async function rememberOverlayAroundGreen(
  args: { courseId?: string | null; holeNumber: number; green: LatLng },
  deps?: PrefetchDeps,
): Promise<void> {
  if (!isValidLatLng(args.green)) return;
  await loadCachedOrFetchCourseOverlay(
    {
      courseId: args.courseId,
      holeNumber: args.holeNumber,
      green: args.green,
      location: args.green,
    },
    { fetchOverlay: deps?.fetchOverlay },
  );
}

/** Cache API / OSM tees and greens so hole 1 can frame without waiting on the rest. */
export function rememberLayoutHoles(layout: CourseLayoutSeed): void {
  for (const hole of layout.holes ?? []) {
    const green = isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
    const tee = isValidLatLng(hole.teeCentroid) ? hole.teeCentroid : null;
    if (tee && green) {
      rememberResolvedTee({ courseId: layout.apiId, holeNumber: hole.number, green }, tee);
    }
  }
}

function cachedTeeGreen(args: {
  courseId?: string | null;
  holeNumber: number;
  tee: LatLng | null;
  green: LatLng | null;
}): { tee: LatLng | null; green: LatLng | null } {
  const green = isValidLatLng(args.green) ? args.green : null;
  const courseTee = isValidLatLng(args.tee) ? args.tee : null;
  const cachedTee = cachedResolvedTee({
    courseId: args.courseId,
    holeNumber: args.holeNumber,
    green,
  });
  return {
    tee: courseTee ?? cachedTee,
    green,
  };
}

/**
 * Camera frame for one hole: cached tee + green only.
 * Missing either → not a frame. Phone is ignored. Never invents a point.
 */
export function cameraFrameFromCache(args: {
  courseId?: string | null;
  holeNumber: number;
  tee: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): ReturnType<typeof planCourseCardCamera> {
  void args.phone;
  const cached = cachedTeeGreen(args);
  return planCourseCardCamera({ tee: cached.tee, green: cached.green, phone: null });
}

/**
 * If this hole is not cached yet, use the stored course overlay or one
 * course-wide query shared for the session.
 * Tee + green already on the card still load that overlay before returning,
 * so the hole screen can read bunkers, water, and cart paths from cache.
 * Never falls back to the phone for framing. Never bulk-warms satellite tiles.
 * Never invents a tee, green, or overlay geometry.
 */
export async function ensureHoleTeeGreen(
  args: {
    courseId?: string | null;
    holeNumber: number;
    tee: LatLng | null;
    green: LatLng | null;
    location?: LatLng | null;
  },
  deps?: PrefetchDeps,
): Promise<PrefetchHoleFrame> {
  const green = isValidLatLng(args.green) ? args.green : null;
  const courseTee = isValidLatLng(args.tee) ? args.tee : null;
  const cached = cachedTeeGreen({
    courseId: args.courseId,
    holeNumber: args.holeNumber,
    tee: courseTee,
    green,
  });
  const diagnosis = diagnoseCourseCardFrame({ tee: cached.tee, green: cached.green, phone: null });
  if (diagnosis.ok) {
    rememberResolvedTee(
      { courseId: args.courseId, holeNumber: args.holeNumber, green: diagnosis.green },
      diagnosis.tee,
    );
    // Await so hole/[number].tsx can read cachedOsmOverlay when this resolves.
    // Tee and green stay the card values. Start Round does not await this.
    await rememberOverlayAroundGreen(
      { courseId: args.courseId, holeNumber: args.holeNumber, green: diagnosis.green },
      deps,
    );
    return {
      holeNumber: args.holeNumber,
      tee: diagnosis.tee,
      green: diagnosis.green,
      fromCache: true,
      fetched: false,
    };
  }

  const location = isValidLatLng(args.location)
    ? args.location
    : green ?? (isValidLatLng(courseTee) ? courseTee : null);
  if (!location) {
    return {
      holeNumber: args.holeNumber,
      tee: cached.tee,
      green: cached.green,
      fromCache: false,
      fetched: false,
    };
  }

  const overlay = await loadCachedOrFetchCourseOverlay(
    {
      courseId: args.courseId,
      holeNumber: args.holeNumber,
      green,
      location,
    },
    { fetchOverlay: deps?.fetchOverlay },
  );
  const overlayTee = resolveOverlayTee(overlay, args.holeNumber, green);
  const tee = courseTee ?? overlayTee ?? cached.tee;
  if (tee && green) {
    rememberResolvedTee({ courseId: args.courseId, holeNumber: args.holeNumber, green }, tee);
  }
  return {
    holeNumber: args.holeNumber,
    tee: isValidLatLng(tee) ? tee : null,
    green,
    fromCache: false,
    fetched: true,
  };
}

/**
 * After Start, warm tees / greens / layouts for the whole card.
 * Does not wait on hole 1. Does not download satellite tiles.
 */
export async function prefetchCourseCard(
  layout: CourseLayoutSeed,
  deps?: PrefetchDeps,
): Promise<PrefetchHoleFrame[]> {
  let hydrated = applyCourseHydrateToLayout(layout, {
    name: layout.name,
    location: layout.location ?? null,
    courseKey: layout.apiId,
  });
  if (layoutStillHardMiss(hydrated)) {
    const match = {
      name: layout.name,
      location: layout.location ?? null,
      courseKey: layout.apiId,
    };
    const painted = await resolveCoursePaint(match, {
      loadOsm: async () => loadOsmOpenGolfCandidate(match),
      loadGca: async () => null,
      loadGolfApi: () => loadGolfApiPaintCandidate(match),
      cache: getSharedCoursePaintCache(),
    });
    if (painted.ok) hydrated = applyCoursePaintToLayout(hydrated, painted);
  }
  rememberLayoutHoles(hydrated);
  prefetchCourseHydrateOnce({
    name: hydrated.name,
    location: hydrated.location ?? null,
    courseId: hydrated.apiId,
  });
  const holes = hydrated.holes ?? [];
  const out: PrefetchHoleFrame[] = [];
  for (const hole of holes) {
    const green = isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
    const tee = isValidLatLng(hole.teeCentroid) ? hole.teeCentroid : null;
    const frame = await ensureHoleTeeGreen(
      {
        courseId: hydrated.apiId,
        holeNumber: hole.number,
        tee,
        green,
        location: green ?? (isValidLatLng(hydrated.location) ? hydrated.location : null),
      },
      deps,
    );
    out.push(frame);
  }
  return out;
}

/**
 * After hole 1 has entered (paint or miss card), warm holes 2–18.
 * Hole 1 is not fetched here. Local paint is already on the round.
 */
export async function cacheHolesAfterFirst(
  layout: CourseLayoutSeed,
  deps?: PrefetchDeps,
): Promise<PrefetchHoleFrame[]> {
  let hydrated = applyCourseHydrateToLayout(layout, {
    name: layout.name,
    location: layout.location ?? null,
    courseKey: layout.apiId,
  });
  if (layoutStillHardMiss(hydrated)) {
    const match = {
      name: layout.name,
      location: layout.location ?? null,
      courseKey: layout.apiId,
    };
    const painted = await resolveCoursePaint(match, {
      loadOsm: async () => loadOsmOpenGolfCandidate(match),
      loadGca: async () => null,
      loadGolfApi: () => loadGolfApiPaintCandidate(match),
      cache: getSharedCoursePaintCache(),
    });
    if (painted.ok) hydrated = applyCoursePaintToLayout(hydrated, painted);
  }
  const playHoleCount = deps?.holeCount === 9 ? 9 : 18;
  hydrated = layoutForPlayedHoles(hydrated, {
    numHoles: deps?.courseNumHoles ?? null,
    playHoleCount,
  });
  rememberLayoutHoles(hydrated);
  deps?.applyLayout?.(hydrated);
  const limit = deps?.holeCount === 9 ? 9 : 18;
  const byNumber = new Map((hydrated.holes ?? []).map((hole) => [hole.number, hole]));
  const out: PrefetchHoleFrame[] = [];
  for (const holeNumber of backgroundHoleNumbers(limit)) {
    const hole = byNumber.get(holeNumber);
    const green = hole && isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
    const tee = hole && isValidLatLng(hole.teeCentroid) ? hole.teeCentroid : null;
    const frame = await ensureHoleTeeGreen(
      {
        courseId: hydrated.apiId,
        holeNumber,
        tee,
        green,
        location: green ?? (isValidLatLng(hydrated.location) ? hydrated.location : null),
      },
      deps,
    );
    out.push(frame);
  }
  return out;
}

/** Fire-and-forget wrapper so Start Round never awaits holes 2–18. */
export function prefetchCourseCardInBackground(
  layout: CourseLayoutSeed,
  deps?: PrefetchDeps,
): void {
  void cacheHolesAfterFirst(layout, deps).catch(() => {
    // Background only. The open hole fetches itself if its cache is still empty.
  });
}
