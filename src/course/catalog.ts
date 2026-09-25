import { METERS_PER_YARD } from '../config/sensing';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import {
  CYPRESS_CREEK_CABOT_AR_KEY,
  CYPRESS_CREEK_CLUBHOUSE,
  GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE,
  GREYSTONE_CABOT_AR_KEY,
  GREYSTONE_CABOT_CLUBHOUSE,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
  PLEASANT_VALLEY_LR_AR_KEY,
  PLEASANT_VALLEY_LR_CLUBHOUSE,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  hydrateHoleFor,
  loadCourseHydrate,
} from './hydrate';
import {
  nearbyOpenGolfCatalog,
  openGolfCatalogEntryById,
  searchOpenGolfCatalog,
} from './opengolf';
import type { CourseDetail, CourseSummary, HoleCourseData } from './types';
import {
  isYardTestCourseId,
  yardTestCatalogEntry,
  yardTestCourseBuildAllowed,
  yardTestCourseDetail,
  yardTestCourseNearby,
  yardTestCourseSearchRow,
} from './yardTestCourse';

export const LOCAL_CATALOG_ID_PREFIX = 'local:';

export type CatalogHoleSourceStatus = 'hydrated' | 'hard-miss';

export type CatalogHoleSource = {
  hole: number;
  status: CatalogHoleSourceStatus;
  source: string;
  needsDocPinSheet: boolean;
};

export type LocalCourseCatalogEntry = {
  id: string;
  courseKey: string;
  name: string;
  club: string;
  city: string;
  state: string;
  country: string;
  locality: string;
  location: LatLng;
  /** Official hole count when known. Never invented geometry. */
  holeCount: number | null;
  aliases: readonly string[];
};

/**
 * Local searchable catalog for hydrate-backed courses.
 * Pro / Golf Courses API still wins when it returns the same club.
 * Clubhouse pins are never tees or greens.
 */
export const LOCAL_COURSE_CATALOG: readonly LocalCourseCatalogEntry[] = [
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    courseKey: THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
    name: 'Thunderbird Country Club',
    club: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    country: 'US',
    locality: 'Heber Springs, AR',
    location: THUNDERBIRD_HEBER_CLUBHOUSE,
    holeCount: 9,
    aliases: ['Thunderbird Golf Course', 'Thunderbird CC', 'Thunderbird'],
  },
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${GREENS_NORTH_HILLS_SHERWOOD_AR_KEY}`,
    courseKey: GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
    name: 'The Greens at North Hills',
    club: 'The Greens at North Hills',
    city: 'Sherwood',
    state: 'AR',
    country: 'US',
    locality: 'Sherwood, AR',
    location: GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE,
    holeCount: 18,
    aliases: ['Greens at North Hills', 'North Hills', 'The Greens At North Hills'],
  },
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY}`,
    courseKey: MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
    name: 'Mountain Ranch Golf Club',
    club: 'Mountain Ranch Golf Club',
    city: 'Fairfield Bay',
    state: 'AR',
    country: 'US',
    locality: 'Fairfield Bay, AR',
    location: MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
    holeCount: 18,
    aliases: ['Mountain Ranch', 'Mountain Ranch GC', 'Mountain Ranch Golf Club at Fairfield Bay'],
  },
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${CYPRESS_CREEK_CABOT_AR_KEY}`,
    courseKey: CYPRESS_CREEK_CABOT_AR_KEY,
    name: 'Cypress Creek Golf Club',
    club: 'Cypress Creek Golf Club',
    city: 'Cabot',
    state: 'AR',
    country: 'US',
    locality: 'Cabot, AR',
    location: CYPRESS_CREEK_CLUBHOUSE,
    holeCount: 18,
    aliases: ['Cypress Creek', 'Cypress Creek at Greystone', 'Cypress Creek CC'],
  },
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${GREYSTONE_CABOT_AR_KEY}`,
    courseKey: GREYSTONE_CABOT_AR_KEY,
    name: 'Greystone Country Club',
    club: 'Greystone Country Club',
    city: 'Cabot',
    state: 'AR',
    country: 'US',
    locality: 'Cabot, AR',
    location: GREYSTONE_CABOT_CLUBHOUSE,
    holeCount: 18,
    aliases: ['Greystone', 'Greystone CC', 'Greystone Cabot'],
  },
  {
    id: `${LOCAL_CATALOG_ID_PREFIX}${PLEASANT_VALLEY_LR_AR_KEY}`,
    courseKey: PLEASANT_VALLEY_LR_AR_KEY,
    name: 'Pleasant Valley Country Club',
    club: 'Pleasant Valley Country Club',
    city: 'Little Rock',
    state: 'AR',
    country: 'US',
    locality: 'Little Rock, AR',
    location: PLEASANT_VALLEY_LR_CLUBHOUSE,
    holeCount: 18,
    aliases: ['Pleasant Valley', 'Pleasant Valley CC'],
  },
];

export const THUNDERBIRD_HARD_MISS_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Poisoned golfapi seed never paints. OSM or a Doc pin-sheet may, later. */
export function thunderbirdHardMissUntilDocOrOsm(): true {
  return true;
}

export function thunderbirdHoleSources(): CatalogHoleSource[] {
  return THUNDERBIRD_HARD_MISS_HOLES.map((hole) => ({
    hole,
    status: 'hard-miss',
    source: 'HARD-MISS — poisoned golfapi seed blocked; OSM or Doc pin-sheet only',
    needsDocPinSheet: true,
  }));
}

export function thunderbirdCourseReport(): {
  searchableName: string;
  holeCount: 9;
  hydratedHoles: number[];
  hardMissHoles: number[];
  needsDocPinSheets: true;
  needsDocTeePins: true;
} {
  return {
    searchableName: 'Thunderbird Country Club',
    holeCount: 9,
    hydratedHoles: [],
    hardMissHoles: [...THUNDERBIRD_HARD_MISS_HOLES],
    needsDocPinSheets: true,
    needsDocTeePins: true,
  };
}

export const GREENS_NORTH_HILLS_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export function greensNorthHillsHoleSources(): CatalogHoleSource[] {
  return GREENS_NORTH_HILLS_HOLES.map((hole) => ({
    hole,
    status: 'hydrated',
    source: `golfapi.io tee + green hole ${hole}`,
    needsDocPinSheet: false,
  }));
}

export function greensNorthHillsCourseReport(): {
  searchableName: string;
  holeCount: 18;
  hydratedHoles: number[];
  hardMissHoles: number[];
  needsDocPinSheets: false;
} {
  return {
    searchableName: 'The Greens at North Hills',
    holeCount: 18,
    hydratedHoles: [...GREENS_NORTH_HILLS_HOLES],
    hardMissHoles: [],
    needsDocPinSheets: false,
  };
}

export const MOUNTAIN_RANCH_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export function mountainRanchHoleSources(): CatalogHoleSource[] {
  return MOUNTAIN_RANCH_HOLES.map((hole) => ({
    hole,
    status: 'hydrated',
    source: `golfapi.io tee + green hole ${hole}`,
    needsDocPinSheet: false,
  }));
}

export function mountainRanchCourseReport(): {
  searchableName: string;
  holeCount: 18;
  hydratedHoles: number[];
  hardMissHoles: number[];
  needsDocPinSheets: false;
} {
  return {
    searchableName: 'Mountain Ranch Golf Club',
    holeCount: 18,
    hydratedHoles: [...MOUNTAIN_RANCH_HOLES],
    hardMissHoles: [],
    needsDocPinSheets: false,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function catalogBag(entry: LocalCourseCatalogEntry): string {
  return [entry.name, entry.club, entry.city, entry.state, entry.locality, ...entry.aliases]
    .map((part) => normalize(part))
    .join(' ');
}

function queryTokens(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((token) => token.length > 0);
}

export function isLocalCatalogId(id: string | null | undefined): boolean {
  const value = id?.trim() ?? '';
  return value.startsWith(LOCAL_CATALOG_ID_PREFIX);
}

export function catalogEntryById(id: string | null | undefined): LocalCourseCatalogEntry | null {
  const value = id?.trim() ?? '';
  if (!value) return null;
  // TEMP yard test course: only when the build gate and geometry both pass.
  if (isYardTestCourseId(value)) return yardTestCourseBuildAllowed() ? yardTestCatalogEntry() : null;
  return (
    LOCAL_COURSE_CATALOG.find((entry) => entry.id === value || entry.courseKey === value) ??
    openGolfCatalogEntryById(value)
  );
}

export function catalogEntryToSummary(
  entry: LocalCourseCatalogEntry,
  distanceMeters: number | null = null,
): CourseSummary {
  return {
    id: entry.id,
    name: entry.name,
    club: entry.club,
    city: entry.city,
    state: entry.state,
    country: entry.country,
    location: entry.location,
    distanceMeters,
  };
}

export function searchLocalCatalog(query: string): CourseSummary[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const reserved = LOCAL_COURSE_CATALOG.filter((entry) => {
    const bag = catalogBag(entry);
    return tokens.every((token) => bag.includes(token));
  }).map((entry) => catalogEntryToSummary(entry));
  const yardEntry = yardTestCatalogEntry();
  const yard = yardTestCourseSearchRow();
  if (yard && yardEntry && tokens.every((token) => catalogBag(yardEntry).includes(token))) {
    reserved.unshift(yard);
  }
  return mergeCatalogSummaries(reserved, searchOpenGolfCatalog(query));
}

export function nearbyLocalCatalog(from: LatLng, radiusKm: number): CourseSummary[] {
  if (!isValidLatLng(from)) return [];
  const radiusM = Math.max(1000, radiusKm * 1000);
  const reserved: CourseSummary[] = [];
  const yard = yardTestCourseNearby(from);
  if (yard) reserved.push(yard);
  for (const entry of LOCAL_COURSE_CATALOG) {
    const yards = haversineYards(from, entry.location);
    const meters = yards * METERS_PER_YARD;
    if (meters <= radiusM) {
      reserved.push(catalogEntryToSummary(entry, Math.round(meters)));
    }
  }
  return mergeCatalogSummaries(reserved, nearbyOpenGolfCatalog(from, radiusKm));
}

function emptyHole(holeNumber: number): HoleCourseData {
  return {
    holeNumber,
    par: null,
    yards: null,
    handicap: null,
    greenCentroid: null,
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
    teeCentroid: null,
  };
}

/** Catalog detail. Hydrate fills real tee/green only. Missing stays null — never invented. */
export function catalogCourseDetail(id: string | null | undefined): CourseDetail | null {
  if (isYardTestCourseId(id)) return yardTestCourseDetail();
  const entry = catalogEntryById(id);
  if (!entry) return null;
  const hydrate = loadCourseHydrate(entry.courseKey);
  const count = entry.holeCount != null && Number.isInteger(entry.holeCount) ? entry.holeCount : 0;
  const holes: HoleCourseData[] = [];
  for (let n = 1; n <= count && n <= 18; n += 1) {
    const hyd = hydrateHoleFor(hydrate, n);
    if (!hyd) {
      holes.push(emptyHole(n));
      continue;
    }
    holes.push({
      holeNumber: n,
      par: hyd.par,
      yards: hyd.yards,
      handicap: null,
      greenCentroid: { lat: hyd.green.lat, lng: hyd.green.lng },
      greenFront: hyd.greenFront,
      greenBack: hyd.greenBack,
      greenDepthYards: hyd.greenDepthYards,
      teeCentroid: hyd.tee ? { lat: hyd.tee.lat, lng: hyd.tee.lng } : null,
    });
  }
  return {
    id: entry.id,
    name: entry.name,
    holeCount: entry.holeCount,
    location: entry.location,
    city: entry.city,
    state: entry.state,
    holes,
    tees: [],
    greenCentersAvailable: holes.some((hole) => hole.greenCentroid != null),
  };
}

function summaryKeys(course: CourseSummary): string[] {
  const id = course.id.trim().toLowerCase();
  const name = normalize(course.name);
  const city = normalize(course.city);
  const keys = [`id:${id}`];
  if (name) keys.push(`name:${name}|${city}`);
  return keys;
}

/** API rows first. Catalog fills a miss. Same id/name+city is not duplicated. */
export function mergeCatalogSummaries(
  primary: CourseSummary[],
  extra: CourseSummary[],
): CourseSummary[] {
  const seen = new Set<string>();
  const out: CourseSummary[] = [];
  for (const course of [...primary, ...extra]) {
    const keys = summaryKeys(course);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(course);
  }
  return out;
}
