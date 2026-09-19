import { isValidLatLng, type LatLng } from '../domain/latLng';
import { diagnoseCourseCardFrame, planCourseCardCamera } from '../domain/holeCamera';
import {
  cachedResolvedTee,
  fetchOsmOverlay,
  rememberOsmOverlay,
  rememberResolvedTee,
  resolveOverlayTee,
} from './osmOverlay';
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

function overlayFetch(deps?: PrefetchDeps) {
  return deps?.fetchOverlay ?? fetchOsmOverlay;
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
 * If this hole is not cached yet, fetch that hole only.
 * Never falls back to the phone for framing. Never bulk-warms satellite tiles.
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

  const overlay = await overlayFetch(deps)({
    courseId: args.courseId,
    location,
    holeNumber: args.holeNumber,
    radiusM: 1000,
  });
  if (overlay && green) {
    rememberOsmOverlay({ courseId: args.courseId, holeNumber: args.holeNumber, green }, overlay);
  }
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
  rememberLayoutHoles(layout);
  const holes = layout.holes ?? [];
  const out: PrefetchHoleFrame[] = [];
  for (const hole of holes) {
    const green = isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
    const tee = isValidLatLng(hole.teeCentroid) ? hole.teeCentroid : null;
    const frame = await ensureHoleTeeGreen(
      {
        courseId: layout.apiId,
        holeNumber: hole.number,
        tee,
        green,
        location: green ?? (isValidLatLng(layout.location) ? layout.location : null),
      },
      deps,
    );
    out.push(frame);
  }
  return out;
}

/** Fire-and-forget wrapper so Start Round never awaits the card. */
export function prefetchCourseCardInBackground(
  layout: CourseLayoutSeed,
  deps?: PrefetchDeps,
): void {
  void prefetchCourseCard(layout, deps).catch(() => {
    // Background only. Hole camera fetches the current hole if the cache is still empty.
  });
}
