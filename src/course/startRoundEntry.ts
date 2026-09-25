import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { normalizeCourseDataSource } from '../domain/courseDataSource';
import type { FavoriteCourse } from '../domain/favorites';
import { catalogEntryById } from './catalog';
import { applyCourseHydrateToLayout, loadHydrateForCourse } from './hydrate';
import type { CourseLayoutSeed } from './layout';

/**
 * Start Round enters on hole 1 immediately.
 * Local tee+green paints. Anything else is the miss card.
 * Holes 2–18 warm after navigation. Apple basemap tiles are not required.
 */

export function startRoundBlocksOnRemainingHoles(): false {
  return false;
}

export function appleBasemapTilesBestEffortOnly(): true {
  return true;
}

/** Marks and yards read the phone GPS and saved tee/green. Tiles are not an input. */
export function appleBasemapTilesRequiredForMarksOrYards(): false {
  return false;
}

export function offlineMarksUseLocalGps(): true {
  return true;
}

export function offlineYardsUseLocalPaint(): true {
  return true;
}

export type Hole1Entry = 'paint' | 'miss';

/** Local card only. No network. Miss when hole 1 cannot paint. */
export function hole1EntryFromLayout(layout: CourseLayoutSeed): Hole1Entry {
  const hole = layout.holes?.find((row) => row.number === 1) ?? null;
  const decision = decideCourseCardPaint({
    tee: hole?.teeCentroid ?? null,
    green: hole?.greenCentroid ?? null,
    phone: null,
  });
  return decision.mount ? 'paint' : 'miss';
}

/** Background cache. Hole 1 is the entry, never this list. */
export function backgroundHoleNumbers(holeCount: 9 | 18): number[] {
  const out: number[] = [];
  for (let n = 2; n <= holeCount; n += 1) out.push(n);
  return out;
}

export function planStartRound(
  layout: CourseLayoutSeed,
  holeCount: 9 | 18,
): { blocks: false; hole1: Hole1Entry; backgroundHoles: number[] } {
  return {
    blocks: false,
    hole1: hole1EntryFromLayout(layout),
    backgroundHoles: backgroundHoleNumbers(holeCount),
  };
}

/** Catalog 9 stays 9. Anything else uses the Start 18 path. Never invented. */
export function favoriteStartHoleCount(course: { id: string }): 9 | 18 {
  return catalogEntryById(course.id)?.holeCount === 9 ? 9 : 18;
}

/** Same hydrate fill Start Round uses. Missing tee/green stays missing. */
export function layoutForFavoriteStart(course: FavoriteCourse): CourseLayoutSeed {
  const match = {
    name: course.name,
    city: course.city,
    state: course.state,
    location: course.location,
    courseKey: course.id,
  };
  const layout = applyCourseHydrateToLayout(
    {
      apiId: course.id,
      name: course.name,
      location: course.location,
      city: course.city,
      state: course.state,
      teeName: null,
      teeRating: null,
      teeSlope: null,
      teeTotalYards: null,
      holes: [],
    },
    match,
  );
  const painted = (layout.holes ?? []).some((hole) => hole.teeCentroid != null || hole.greenCentroid != null);
  return {
    ...layout,
    city: course.city,
    state: course.state,
    courseDataSource: painted ? normalizeCourseDataSource(loadHydrateForCourse(match)?.source) : null,
  };
}
