import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { haversineYards } from '../domain/haversine';
import { isCourseCardLatLng, type LatLng } from '../domain/latLng';
import type { CourseLayoutSeed } from './layout';
import { rememberResolvedTee } from './osmOverlay';
import cypressOsm from './hydrates/cypress-creek-cabot-ar.json';
import greystoneOsm from './hydrates/greystone-cabot-ar.json';

export const CYPRESS_CREEK_CABOT_AR_KEY = 'cypress-creek-cabot-ar';
export const GREYSTONE_CABOT_AR_KEY = 'greystone-cabot-ar';

/** Clubhouse / course pin only — never a tee or green. */
export const CYPRESS_CREEK_CLUBHOUSE: LatLng = { lat: 35.027715, lng: -92.031642 };

/** Course-center pin for Greystone (west of Cypress). Never a tee or green. */
export const GREYSTONE_CABOT_CLUBHOUSE: LatLng = { lat: 35.021, lng: -92.061 };

export type CourseHydrateSource = 'golfapi' | 'osm' | 'manual_verified';

export type CourseHydrateTee = {
  lat: number;
  lng: number;
  label: string;
};

export type CourseHydrateGreen = {
  lat: number;
  lng: number;
};

export type CourseHydrateHole = {
  hole: number;
  par: number | null;
  tee: CourseHydrateTee;
  green: CourseHydrateGreen;
};

export type CourseHydrate = {
  courseKey: string;
  displayName: string;
  locality: string;
  source: CourseHydrateSource;
  sourceRef: string;
  fetchedAt: string;
  holes: CourseHydrateHole[];
};

export type CourseHydrateMatch = {
  courseKey?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  location?: LatLng | null;
};

const HYDRATE_SOURCES: CourseHydrateSource[] = ['golfapi', 'osm', 'manual_verified'];

const REGISTRY: Record<string, unknown> = {
  [CYPRESS_CREEK_CABOT_AR_KEY]: cypressOsm,
  [GREYSTONE_CABOT_AR_KEY]: greystoneOsm,
};

const CLUBHOUSE_PINS: readonly LatLng[] = [CYPRESS_CREEK_CLUBHOUSE, GREYSTONE_CABOT_CLUBHOUSE];

const GOLFAPI_KEY_NAMES = [
  'GOLFAPI_KEY',
  'EXPO_PUBLIC_GOLFAPI_KEY',
  'GOLF_API_IO_KEY',
  'EXPO_PUBLIC_GOLF_API_IO_KEY',
];

const metered = new Set<string>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pointFrom(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  const lat = asFiniteNumber(record.lat);
  const lng = asFiniteNumber(record.lng);
  const point = lat != null && lng != null ? { lat, lng } : null;
  return isCourseCardLatLng(point) ? point : null;
}

/** Same miss-card gates: null / ~0,0 / same-point / past ~700 yd. */
export function hydrateHolePassesGates(hole: {
  tee?: LatLng | null;
  green?: LatLng | null;
}): boolean {
  if (isClubhousePin(hole.tee) || isClubhousePin(hole.green)) return false;
  return decideCourseCardPaint({
    tee: hole.tee ?? null,
    green: hole.green ?? null,
    phone: null,
  }).mount;
}

/** Clubhouse pin is never a hole end. Nearby real tees/greens are fine. */
export function isClubhousePin(point: LatLng | null | undefined): boolean {
  if (!isCourseCardLatLng(point)) return false;
  return CLUBHOUSE_PINS.some((pin) => haversineYards(point, pin) < 5);
}

export function inventGreenFromClubhouse(): false {
  return false;
}

export function inventGreenFromScorecardYards(): false {
  return false;
}

/**
 * Cypress Creek Golf Club (Cabot) only.
 * Greystone Country Club (west course) never matches this key.
 */
export function matchesCypressCreekCabot(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === CYPRESS_CREEK_CABOT_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/\bgreystone\b/.test(name) && !/cypress creek/.test(name)) return false;
  if (!/cypress creek/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (/\bcabot\b/.test(bag)) return true;
  if (/cypress creek/.test(name) && /\bgreystone\b/.test(name)) return true;
  if (isCourseCardLatLng(course.location)) {
    const yards = haversineYards(course.location, CYPRESS_CREEK_CLUBHOUSE);
    if (yards <= 1800) return true;
  }
  return (
    name === 'cypress creek' ||
    name === 'cypress creek golf club' ||
    name === 'cypress creek country club'
  );
}

/**
 * Greystone Country Club (Cabot) only — west of Cypress Creek.
 * "Cypress Creek at Greystone" stays on the Cypress hydrate.
 */
export function matchesGreystoneCabot(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === GREYSTONE_CABOT_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/cypress creek/.test(name)) return false;
  if (!/\bgreystone\b/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (/\bcabot\b/.test(bag)) return true;
  if (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)) return true;
  if (isCourseCardLatLng(course.location)) {
    const yards = haversineYards(course.location, GREYSTONE_CABOT_CLUBHOUSE);
    if (yards <= 1800) return true;
  }
  return false;
}

export function resolveCourseHydrateKey(course: CourseHydrateMatch): string | null {
  if (matchesCypressCreekCabot(course)) return CYPRESS_CREEK_CABOT_AR_KEY;
  if (matchesGreystoneCabot(course)) return GREYSTONE_CABOT_AR_KEY;
  return null;
}

function parseHydrateHole(raw: unknown): CourseHydrateHole | null {
  const record = asRecord(raw);
  if (!record) return null;
  const hole = asFiniteNumber(record.hole);
  if (hole == null || !Number.isInteger(hole) || hole < 1 || hole > 18) return null;
  const teePoint = pointFrom(record.tee);
  const greenPoint = pointFrom(record.green);
  if (!teePoint || !greenPoint) return null;
  if (!hydrateHolePassesGates({ tee: teePoint, green: greenPoint })) return null;
  const parRaw = asFiniteNumber(record.par);
  const par = parRaw != null && Number.isInteger(parRaw) && parRaw >= 3 && parRaw <= 6 ? parRaw : null;
  const teeRecord = asRecord(record.tee);
  const label = asString(teeRecord?.label) ?? 'default';
  return {
    hole,
    par,
    tee: { lat: teePoint.lat, lng: teePoint.lng, label },
    green: { lat: greenPoint.lat, lng: greenPoint.lng },
  };
}

export function parseCourseHydrate(raw: unknown): CourseHydrate | null {
  const record = asRecord(raw);
  if (!record) return null;
  const courseKey = asString(record.courseKey);
  const displayName = asString(record.displayName);
  const locality = asString(record.locality);
  const source = asString(record.source);
  const sourceRef = asString(record.sourceRef);
  const fetchedAt = asString(record.fetchedAt);
  if (!courseKey || !displayName || !locality || !sourceRef || !fetchedAt) return null;
  if (!HYDRATE_SOURCES.includes(source as CourseHydrateSource)) return null;
  if (!Array.isArray(record.holes)) return null;
  const seen = new Set<number>();
  const holes: CourseHydrateHole[] = [];
  for (const item of record.holes) {
    const parsed = parseHydrateHole(item);
    if (!parsed || seen.has(parsed.hole)) continue;
    seen.add(parsed.hole);
    holes.push(parsed);
  }
  holes.sort((a, b) => a.hole - b.hole);
  return {
    courseKey,
    displayName,
    locality,
    source: source as CourseHydrateSource,
    sourceRef,
    fetchedAt,
    holes,
  };
}

export function loadCourseHydrate(courseKey: string | null | undefined): CourseHydrate | null {
  const key = asString(courseKey);
  if (!key) return null;
  const raw = REGISTRY[key];
  if (raw == null) return null;
  return parseCourseHydrate(raw);
}

export function loadHydrateForCourse(course: CourseHydrateMatch): CourseHydrate | null {
  return loadCourseHydrate(resolveCourseHydrateKey(course));
}

export function hydrateIsUsable(hydrate: CourseHydrate | null | undefined): boolean {
  return Boolean(hydrate && hydrate.holes.length > 0);
}

export function hydrateHoleFor(
  hydrate: CourseHydrate | null | undefined,
  holeNumber: number,
): CourseHydrateHole | null {
  if (!hydrate) return null;
  return hydrate.holes.find((hole) => hole.hole === holeNumber) ?? null;
}

function rememberHydrateHoles(hydrate: CourseHydrate, courseId?: string | null): void {
  for (const hole of hydrate.holes) {
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    rememberResolvedTee({ courseId: hydrate.courseKey, holeNumber: hole.hole, green }, tee);
    if (courseId) {
      rememberResolvedTee({ courseId, holeNumber: hole.hole, green }, tee);
    }
  }
}

export function resetHydrateMeterForTests(): void {
  metered.clear();
}

/** Prefetch all 18 once. Meter unique hydrate once. Never invents. */
export function prefetchCourseHydrateOnce(args: CourseHydrateMatch & { courseId?: string | null }): CourseHydrate | null {
  const hydrate = loadHydrateForCourse(args);
  if (!hydrateIsUsable(hydrate) || !hydrate) return null;
  rememberHydrateHoles(hydrate, args.courseId);
  if (!metered.has(hydrate.courseKey)) {
    metered.add(hydrate.courseKey);
    console.log('[Signal Lab] hydrate', {
      courseKey: hydrate.courseKey,
      source: hydrate.source,
      holes: hydrate.holes.length,
      unique: true,
    });
  }
  return hydrate;
}

/**
 * Pro card wins when it already paints. Hydrate fills a miss only.
 * Never invents a point. Never uses the clubhouse.
 */
export function resolveHydrateTeeGreen(args: CourseHydrateMatch & {
  holeNumber: number;
  tee: LatLng | null;
  green: LatLng | null;
}): {
  tee: LatLng | null;
  green: LatLng | null;
  usedHydrate: boolean;
  courseKey: string | null;
} {
  const courseKey = resolveCourseHydrateKey(args);
  if (hydrateHolePassesGates({ tee: args.tee, green: args.green })) {
    return { tee: args.tee, green: args.green, usedHydrate: false, courseKey };
  }
  const hole = hydrateHoleFor(loadCourseHydrate(courseKey), args.holeNumber);
  if (!hole) {
    return { tee: args.tee, green: args.green, usedHydrate: false, courseKey };
  }
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const green = { lat: hole.green.lat, lng: hole.green.lng };
  if (!hydrateHolePassesGates({ tee, green })) {
    return { tee: args.tee, green: args.green, usedHydrate: false, courseKey };
  }
  return { tee, green, usedHydrate: true, courseKey };
}

/** Fill missing / failing layout holes from hydrate. Existing sane Pro coords win. */
export function applyCourseHydrateToLayout(
  layout: CourseLayoutSeed,
  course: CourseHydrateMatch = {},
): CourseLayoutSeed {
  const match: CourseHydrateMatch = {
    name: course.name ?? layout.name,
    city: course.city,
    state: course.state,
    locality: course.locality,
    location: course.location ?? layout.location ?? null,
    courseKey: course.courseKey,
  };
  const hydrate = prefetchCourseHydrateOnce({
    ...match,
    courseId: layout.apiId,
  });
  if (!hydrateIsUsable(hydrate) || !hydrate) return layout;

  const existing = layout.holes ?? [];
  const byNumber = new Map(existing.map((hole) => [hole.number, hole]));
  const numbers = new Set<number>([
    ...existing.map((hole) => hole.number),
    ...hydrate.holes.map((hole) => hole.hole),
  ]);
  const holes = [...numbers]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b)
    .map((n) => {
      const row = byNumber.get(n);
      const hyd = hydrateHoleFor(hydrate, n);
      const resolved = resolveHydrateTeeGreen({
        ...match,
        holeNumber: n,
        tee: isCourseCardLatLng(row?.teeCentroid) ? row.teeCentroid : null,
        green: isCourseCardLatLng(row?.greenCentroid) ? row.greenCentroid : null,
      });
      return {
        number: n,
        par: row?.par ?? hyd?.par ?? null,
        yards: row?.yards ?? null,
        handicap: row?.handicap ?? null,
        greenCentroid: resolved.green,
        greenFront: row?.greenFront ?? null,
        greenBack: row?.greenBack ?? null,
        greenDepthYards: row?.greenDepthYards ?? null,
        teeCentroid: resolved.tee,
      };
    });
  return { ...layout, holes };
}

function trimKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Optional golfapi.io key. Absent → no fetch, never invent. */
export function getGolfApiKey(): string | null {
  for (const name of GOLFAPI_KEY_NAMES) {
    const key = trimKey(process.env[name]);
    if (key) return key;
  }
  return null;
}

/**
 * Cypress-only golfapi.io fetch. No key / miss / thin → null.
 * Never invents tee/green from the clubhouse or scorecard yards.
 */
export async function fetchGolfApiCypressHydrate(): Promise<CourseHydrate | null> {
  if (!getGolfApiKey()) return null;
  return null;
}
