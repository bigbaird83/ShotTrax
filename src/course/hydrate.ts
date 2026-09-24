import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { haversineYards } from '../domain/haversine';
import { isCourseCardLatLng, type LatLng } from '../domain/latLng';
import {
  thunderbirdInventTees,
  thunderbirdMirrorHole,
  thunderbirdPinHoleFor,
} from '../domain/thunderbirdPins';
import type { CourseLayoutSeed } from './layout';
import { rememberResolvedTee } from './osmOverlay';
import {
  fetchGolfApiHydrate,
  getGolfApiBase as readGolfApiBase,
  loadCachedGolfApiHydrate,
  loadCachedHydrate,
  resolveGolfApiHydrateKey,
  saveCachedHydrate,
  type GolfApiFetchDeps,
} from './golfapi';
import type { CourseDetail, HoleCourseData } from './types';
import { loadOpenGolfHydrate, resolveOpenGolfHydrateKey } from './opengolf';
import {
  THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID,
  isThunderbirdHeberSpringsIdentity,
  thunderbirdGolfApiPaintBlocked,
} from './thunderbirdLock';
import cypressOsm from './hydrates/cypress-creek-cabot-ar.json';
import greystoneOsm from './hydrates/greystone-cabot-ar.json';
import pleasantValleyOsm from './hydrates/pleasant-valley-lr-ar.json';
import thunderbirdOsm from './hydrates/thunderbird-heber-springs-ar.json';
import mountainRanchOsm from './hydrates/mountain-ranch-fairfield-bay-ar.json';
import greensNorthHillsGolfApi from './hydrates/greens-north-hills-sherwood-ar.json';

export const CYPRESS_CREEK_CABOT_AR_KEY = 'cypress-creek-cabot-ar';
export const GREYSTONE_CABOT_AR_KEY = 'greystone-cabot-ar';
export const PLEASANT_VALLEY_LR_AR_KEY = 'pleasant-valley-lr-ar';
export const THUNDERBIRD_HEBER_SPRINGS_AR_KEY = 'thunderbird-heber-springs-ar';
export const MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY = 'mountain-ranch-fairfield-bay-ar';
export const GREENS_NORTH_HILLS_SHERWOOD_AR_KEY = 'greens-north-hills-sherwood-ar';

/** Clubhouse / course pin only — never a tee or green. */
export const CYPRESS_CREEK_CLUBHOUSE: LatLng = { lat: 35.027715, lng: -92.031642 };

/** Course-center pin for Greystone (west of Cypress). Never a tee or green. */
export const GREYSTONE_CABOT_CLUBHOUSE: LatLng = { lat: 35.021, lng: -92.061 };

/** Course-center pin for Pleasant Valley (Little Rock). Never a tee or green. */
export const PLEASANT_VALLEY_LR_CLUBHOUSE: LatLng = { lat: 34.78, lng: -92.411 };

/** OSM Nominatim pin for Thunderbird Golf Course (way/296944937). Never a tee or green. */
export const THUNDERBIRD_HEBER_CLUBHOUSE: LatLng = { lat: 35.525292, lng: -92.038355 };

/** Course-center pin for Mountain Ranch (Fairfield Bay). Never a tee or green. */
export const MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE: LatLng = { lat: 35.611, lng: -92.29 };

/** golfapi.io course pin for The Greens at North Hills (Sherwood). Never a tee or green. */
export const GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE: LatLng = { lat: 34.821934, lng: -92.231331 };

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
  yards: number | null;
  /** Null when Doc has not dropped tee pins — never invented. */
  tee: CourseHydrateTee | null;
  green: CourseHydrateGreen;
  greenFront: CourseHydrateGreen | null;
  greenBack: CourseHydrateGreen | null;
  greenDepthYards: number | null;
  greenWidthYards: number | null;
};

export type CourseHydrate = {
  courseKey: string;
  displayName: string;
  locality: string;
  source: CourseHydrateSource;
  sourceRef: string;
  fetchedAt: string;
  /** 9 or 18 when the source says so. Absent → unknown. Never invented. */
  numHoles?: number | null;
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
  [PLEASANT_VALLEY_LR_AR_KEY]: pleasantValleyOsm,
  [THUNDERBIRD_HEBER_SPRINGS_AR_KEY]: thunderbirdOsm,
  [MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY]: mountainRanchOsm,
  [GREENS_NORTH_HILLS_SHERWOOD_AR_KEY]: greensNorthHillsGolfApi,
};

const CLUBHOUSE_PINS: readonly LatLng[] = [
  CYPRESS_CREEK_CLUBHOUSE,
  GREYSTONE_CABOT_CLUBHOUSE,
  PLEASANT_VALLEY_LR_CLUBHOUSE,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
  GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE,
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

/**
 * Pleasant Valley Country Club (Little Rock) only.
 * Cypress Creek and Greystone (Cabot) never match this key.
 */
export function matchesPleasantValleyLR(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === PLEASANT_VALLEY_LR_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/cypress creek/.test(name)) return false;
  if (/\bgreystone\b/.test(name)) return false;
  if (!/pleasant valley/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (/\bcabot\b/.test(bag) && !/little rock/.test(bag)) return false;
  if (/little rock/.test(bag)) return true;
  if (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)) return true;
  if (isCourseCardLatLng(course.location)) {
    const yards = haversineYards(course.location, PLEASANT_VALLEY_LR_CLUBHOUSE);
    if (yards <= 1800) return true;
  }
  return false;
}

/**
 * Thunderbird Country Club (Heber Springs) only.
 * Cypress, Greystone, Pleasant Valley, and other Thunderbird clubs never match.
 */
export function matchesThunderbirdHeberSprings(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === THUNDERBIRD_HEBER_SPRINGS_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/cypress creek/.test(name)) return false;
  if (/\bgreystone\b/.test(name)) return false;
  if (/pleasant valley/.test(name)) return false;
  if (/mountain ranch/.test(name)) return false;
  if (/north hills/.test(name)) return false;
  if (!/\bthunderbird\b/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (/\bcabot\b/.test(bag) || /little rock/.test(bag) || /fairfield/.test(bag)) return false;
  if (/heber springs/.test(bag) || (/\bheber\b/.test(bag) && (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)))) {
    return true;
  }
  if (isCourseCardLatLng(course.location)) {
    const yards = haversineYards(course.location, THUNDERBIRD_HEBER_CLUBHOUSE);
    if (yards <= 1800) return true;
  }
  return false;
}

/**
 * Mountain Ranch Golf Club (Fairfield Bay) only.
 * Thunderbird, Cypress, Greystone, and Pleasant Valley never match.
 */
export function matchesMountainRanchFairfieldBay(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/cypress creek/.test(name)) return false;
  if (/\bgreystone\b/.test(name)) return false;
  if (/pleasant valley/.test(name)) return false;
  if (/\bthunderbird\b/.test(name)) return false;
  if (/north hills/.test(name)) return false;
  if (!/mountain ranch/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (/\bcabot\b/.test(bag) || /little rock/.test(bag) || /heber/.test(bag)) return false;
  if (/fairfield bay/.test(bag) || /\bfairfield\b/.test(bag)) return true;
  if (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)) return true;
  if (isCourseCardLatLng(course.location)) {
    const yards = haversineYards(course.location, MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE);
    if (yards <= 1800) return true;
  }
  return false;
}

/**
 * The Greens at North Hills (Sherwood, AR) only.
 * Name + locality/city — never GPS, never other North Hills clubs.
 */
export function matchesGreensNorthHillsSherwood(course: CourseHydrateMatch): boolean {
  if (asString(course.courseKey) === GREENS_NORTH_HILLS_SHERWOOD_AR_KEY) return true;
  const name = normalizeName(course.name);
  if (!name) return false;
  if (/cypress creek/.test(name)) return false;
  if (/\bgreystone\b/.test(name)) return false;
  if (/pleasant valley/.test(name)) return false;
  if (/\bthunderbird\b/.test(name)) return false;
  if (/mountain ranch/.test(name)) return false;
  if (!/north hills/.test(name)) return false;
  const bag = [
    name,
    normalizeName(course.city),
    normalizeName(course.state),
    normalizeName(course.locality),
  ].join(' ');
  if (!/\bsherwood\b/.test(bag)) return false;
  if (/\bcabot\b/.test(bag) || /little rock/.test(bag) || /heber/.test(bag) || /fairfield/.test(bag)) {
    return false;
  }
  return true;
}

export function resolveCourseHydrateKey(course: CourseHydrateMatch): string | null {
  if (matchesCypressCreekCabot(course)) return CYPRESS_CREEK_CABOT_AR_KEY;
  if (matchesGreystoneCabot(course)) return GREYSTONE_CABOT_AR_KEY;
  if (matchesPleasantValleyLR(course)) return PLEASANT_VALLEY_LR_AR_KEY;
  if (matchesThunderbirdHeberSprings(course)) return THUNDERBIRD_HEBER_SPRINGS_AR_KEY;
  if (matchesMountainRanchFairfieldBay(course)) return MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY;
  if (matchesGreensNorthHillsSherwood(course)) return GREENS_NORTH_HILLS_SHERWOOD_AR_KEY;
  return resolveGolfApiHydrateKey(course) ?? resolveOpenGolfHydrateKey(course);
}

function parsePar(value: unknown): number | null {
  const parRaw = asFiniteNumber(value);
  return parRaw != null && Number.isInteger(parRaw) && parRaw >= 3 && parRaw <= 6 ? parRaw : null;
}

function parseHydrateHole(raw: unknown): CourseHydrateHole | null {
  const record = asRecord(raw);
  if (!record) return null;
  const hole = asFiniteNumber(record.hole);
  if (hole == null || !Number.isInteger(hole) || hole < 1 || hole > 18) return null;
  const teeRecord = asRecord(record.tee);
  const teePoint = pointFrom(record.tee);
  const greenPoint = pointFrom(record.green);
  if (!greenPoint || isClubhousePin(greenPoint)) return null;
  // Provided tee must pass gates. Omitted tee is allowed (Thunderbird greens).
  if (teeRecord) {
    if (!teePoint || isClubhousePin(teePoint)) return null;
    if (!hydrateHolePassesGates({ tee: teePoint, green: greenPoint })) return null;
  }
  const label = asString(teeRecord?.label) ?? 'default';
  return {
    hole,
    par: parsePar(record.par),
    yards: asFiniteNumber(record.yards),
    tee: teePoint ? { lat: teePoint.lat, lng: teePoint.lng, label } : null,
    green: { lat: greenPoint.lat, lng: greenPoint.lng },
    greenFront: pointFrom(record.greenFront),
    greenBack: pointFrom(record.greenBack),
    greenDepthYards: asFiniteNumber(record.greenDepthYards),
    greenWidthYards: asFiniteNumber(record.greenWidthYards),
  };
}

function pinSheetExtras(holeNumber: number): {
  par: number | null;
  yards: number | null;
  greenFront: CourseHydrateGreen | null;
  greenBack: CourseHydrateGreen | null;
  greenDepthYards: number | null;
  greenWidthYards: number | null;
} | null {
  const pin = thunderbirdPinHoleFor(holeNumber);
  if (!pin) return null;
  return {
    par: parsePar(pin.par),
    yards: pin.whiteYards,
    greenFront: pin.greenFront && isCourseCardLatLng(pin.greenFront) ? pin.greenFront : null,
    greenBack: pin.greenBack && isCourseCardLatLng(pin.greenBack) ? pin.greenBack : null,
    greenDepthYards: pin.greenDepthYards,
    greenWidthYards: pin.greenWidthYards,
  };
}

/**
 * Daily A–D pin-sheet fields fold onto a green that already exists.
 * The poisoned golfapi seed is dropped. Pin sheets never invent a green or a tee.
 */
export function foldThunderbirdPinSheets(hydrate: CourseHydrate): CourseHydrate {
  if (hydrate.courseKey !== THUNDERBIRD_HEBER_SPRINGS_AR_KEY) return hydrate;
  if (thunderbirdInventTees()) return hydrate;
  if (thunderbirdGolfApiPaintBlocked() && hydrate.source === 'golfapi') {
    return { ...hydrate, holes: [] };
  }
  return {
    ...hydrate,
    holes: hydrate.holes.map((hole) => {
      if (!isCourseCardLatLng(hole.green) || isClubhousePin(hole.green)) return hole;
      const extra = pinSheetExtras(hole.hole);
      if (!extra) return hole;
      return {
        ...hole,
        par: hole.par ?? extra.par,
        yards: hole.yards ?? extra.yards,
        greenFront: hole.greenFront ?? extra.greenFront,
        greenBack: hole.greenBack ?? extra.greenBack,
        greenDepthYards: hole.greenDepthYards ?? extra.greenDepthYards,
        greenWidthYards: hole.greenWidthYards ?? extra.greenWidthYards,
      };
    }),
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
  const numHolesRaw = asFiniteNumber(record.numHoles);
  const numHoles = numHolesRaw === 9 || numHolesRaw === 18 ? numHolesRaw : null;
  return {
    courseKey,
    displayName,
    locality,
    source: source as CourseHydrateSource,
    sourceRef,
    fetchedAt,
    numHoles,
    holes,
  };
}

export function loadCourseHydrate(courseKey: string | null | undefined): CourseHydrate | null {
  const key = asString(courseKey);
  if (!key) return null;
  const thunderbirdKey =
    key === THUNDERBIRD_HEBER_SPRINGS_AR_KEY ||
    isThunderbirdHeberSpringsIdentity({ courseKey: key });
  const raw = REGISTRY[key];
  if (raw != null) {
    const parsed = parseCourseHydrate(raw);
    if (!parsed) return null;
    if (thunderbirdKey && thunderbirdGolfApiPaintBlocked()) {
      const poisoned =
        parsed.source === 'golfapi' ||
        parsed.sourceRef.includes(THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID);
      if (poisoned) return null;
      if (parsed.source === 'osm' || parsed.source === 'manual_verified') {
        return foldThunderbirdPinSheets(parsed);
      }
      return null;
    }
    if (key === THUNDERBIRD_HEBER_SPRINGS_AR_KEY) return foldThunderbirdPinSheets(parsed);
    return parsed;
  }
  if (thunderbirdKey && thunderbirdGolfApiPaintBlocked()) return null;
  return loadCachedGolfApiHydrate(key) ?? loadOpenGolfHydrate(key);
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
  const found = hydrate.holes.find((hole) => hole.hole === holeNumber);
  if (found) return found;
  if (hydrate.courseKey !== THUNDERBIRD_HEBER_SPRINGS_AR_KEY) return null;
  const mirror = thunderbirdMirrorHole(holeNumber);
  if (mirror === holeNumber) return null;
  return hydrate.holes.find((hole) => hole.hole === mirror) ?? null;
}

function rememberHydrateHoles(hydrate: CourseHydrate, courseId?: string | null): void {
  for (const hole of hydrate.holes) {
    if (!hole.tee) continue;
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
  const green = { lat: hole.green.lat, lng: hole.green.lng };
  if (!isCourseCardLatLng(green) || isClubhousePin(green)) {
    return { tee: args.tee, green: args.green, usedHydrate: false, courseKey };
  }
  if (hole.tee) {
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    if (hydrateHolePassesGates({ tee, green })) {
      return { tee, green, usedHydrate: true, courseKey };
    }
  }
  return { tee: args.tee, green, usedHydrate: true, courseKey };
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
        yards: row?.yards ?? hyd?.yards ?? null,
        handicap: row?.handicap ?? null,
        greenCentroid: resolved.green,
        greenFront: row?.greenFront ?? hyd?.greenFront ?? null,
        greenBack: row?.greenBack ?? hyd?.greenBack ?? null,
        greenDepthYards: row?.greenDepthYards ?? hyd?.greenDepthYards ?? null,
        teeCentroid: resolved.tee,
      };
    });
  return { ...layout, holes };
}

/** golfapi.io base through the share-sync Worker. Absent → no fetch, never invent. */
export function getGolfApiBase(): string | null {
  return readGolfApiBase();
}

function emptyCourseHole(holeNumber: number): HoleCourseData {
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

function applyHydrateToCourseHole(
  hole: HoleCourseData,
  hydrate: CourseHydrate,
  match: CourseHydrateMatch,
): HoleCourseData {
  const hyd = hydrateHoleFor(hydrate, hole.holeNumber);
  const resolved = resolveHydrateTeeGreen({
    ...match,
    holeNumber: hole.holeNumber,
    tee: isCourseCardLatLng(hole.teeCentroid) ? hole.teeCentroid : null,
    green: isCourseCardLatLng(hole.greenCentroid) ? hole.greenCentroid : null,
  });
  return {
    ...hole,
    par: hole.par ?? hyd?.par ?? null,
    yards: hole.yards ?? hyd?.yards ?? null,
    greenCentroid: resolved.green,
    greenFront: hole.greenFront ?? hyd?.greenFront ?? null,
    greenBack: hole.greenBack ?? hyd?.greenBack ?? null,
    greenDepthYards: hole.greenDepthYards ?? hyd?.greenDepthYards ?? null,
    teeCentroid: resolved.tee,
  };
}

/** True when any hole is missing a gated tee+green pair. */
export function courseDetailNeedsHydrate(detail: CourseDetail): boolean {
  if (detail.holes.length === 0) return true;
  return detail.holes.some(
    (hole) =>
      !hydrateHolePassesGates({
        tee: hole.teeCentroid,
        green: hole.greenCentroid,
      }),
  );
}

/**
 * Fill a miss-card CourseDetail from bundled / cached / runtime golfapi.
 * Existing sane Pro coords win. No key / thin GPS → unchanged. Never invents.
 */
export async function fillCourseDetailFromGolfApi(
  detail: CourseDetail | null,
  match: CourseHydrateMatch = {},
  deps: GolfApiFetchDeps = {},
): Promise<CourseDetail | null> {
  if (!detail) return null;
  const resolvedMatch: CourseHydrateMatch = {
    name: match.name ?? detail.name,
    city: match.city ?? detail.city,
    state: match.state ?? detail.state,
    locality: match.locality,
    location: match.location ?? detail.location,
    courseKey: match.courseKey ?? detail.id,
  };
  let hydrate = loadHydrateForCourse(resolvedMatch);
  if (!hydrateIsUsable(hydrate) && courseDetailNeedsHydrate(detail) && readGolfApiBase()) {
    hydrate = await fetchGolfApiHydrate(resolvedMatch, deps);
  }
  if (!hydrateIsUsable(hydrate) || !hydrate) return detail;
  prefetchCourseHydrateOnce({ ...resolvedMatch, courseId: detail.id });

  const existing = detail.holes;
  const byNumber = new Map(existing.map((hole) => [hole.holeNumber, hole]));
  const numbers = new Set<number>([
    ...existing.map((hole) => hole.holeNumber),
    ...hydrate.holes.map((hole) => hole.hole),
  ]);
  const holes = [...numbers]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b)
    .map((n) => applyHydrateToCourseHole(byNumber.get(n) ?? emptyCourseHole(n), hydrate, resolvedMatch));
  const tees = detail.tees.map((tee) => ({
    ...tee,
    holes: tee.holes.map((hole) => applyHydrateToCourseHole(hole, hydrate, resolvedMatch)),
  }));
  return { ...detail, holes, tees };
}

/**
 * Runtime golfapi.io fetch (via the Worker) for a miss card. No Worker → null.
 * Bundled Cypress wins (no network) when the Worker is set. Never invents.
 */
export async function fetchGolfApiCypressHydrate(): Promise<CourseHydrate | null> {
  if (!readGolfApiBase()) return null;
  const bundled = loadCourseHydrate(CYPRESS_CREEK_CABOT_AR_KEY);
  if (hydrateIsUsable(bundled)) return bundled;
  return fetchGolfApiHydrate({ name: 'Cypress Creek Golf Club', city: 'Cabot', state: 'AR' });
}

export { fetchGolfApiHydrate, loadCachedHydrate, saveCachedHydrate };
