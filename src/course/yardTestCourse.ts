/**
 * TEMP: Yard Test — a private on-device QA course. Not a real course.
 *
 * REMOVE BEFORE APP STORE SUBMISSION
 * The production EAS profile enables this course only while eas.json sets
 * EXPO_PUBLIC_DEBUG_YARD_COURSE=1. Delete that one line and the course is
 * gone from the build: no Settings row, no nearby or search hit, no loading.
 *
 * Geometry is not in the repo. app.config.js copies EXPO_PUBLIC_YARD_TEST_COURSE
 * (JSON: center, tee, green, par) into expo.extra.yardTestCourse. Missing or
 * malformed JSON makes the course unavailable. There is no hard-coded pin,
 * par, or yardage to fall back on. The nearby radius stays 1 mile in code.
 * Yards are the haversine of the supplied tee and green. Holes 2–9 stay empty.
 *
 * Runtime: Settings "Yard test course" (default off), hidden until unlocked
 * except in __DEV__. Nearby and search list it only when the build allows it,
 * the geometry parsed, and the switch is on. A round already started on it
 * keeps resolving while the build still allows it, even after the switch is off.
 */
import { METERS_PER_YARD } from '../config/sensing';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { METERS_PER_MILE } from '../domain/nearbyRadius';
import type { CourseDetail, CourseSummary, HoleCourseData } from './types';

/** Unique id. Never the same key as any real club, including Magnolia Country Club. */
export const YARD_TEST_COURSE_KEY = 'yard-test';
/** Same `local:` prefix as the bundled catalog (see LOCAL_CATALOG_ID_PREFIX). */
export const YARD_TEST_COURSE_ID = `local:${YARD_TEST_COURSE_KEY}`;
export const YARD_TEST_COURSE_NAME = 'Yard Test';
export const YARD_TEST_COURSE_HOLE_COUNT = 9;

export const YARD_TEST_COURSE_SETTING_KEY = 'debug.yardTestCourse';
export const YARD_TEST_UNLOCK_SETTING_KEY = 'debug.yardTestCourseUnlocked';
export const YARD_TEST_COURSE_EXTRA_KEY = 'debugYardCourse';
export const YARD_TEST_GEOMETRY_EXTRA_KEY = 'yardTestCourse';

/** Seven taps on the Settings credits line, inside this window, unlock the row. */
export const YARD_TEST_UNLOCK_TAPS = 7;
export const YARD_TEST_UNLOCK_WINDOW_MS = 4000;

/** Nearby lists it only within ~1 mile of the center. The radius is not in the env JSON. */
export const YARD_TEST_COURSE_NEARBY_RADIUS_M = Math.round(METERS_PER_MILE);

export type YardTestGeometry = {
  center: LatLng;
  tee: LatLng;
  green: LatLng;
  /** Hole 1 par from the env JSON. Not a default. */
  par: number;
};

export type YardTestCatalogEntry = {
  id: string;
  courseKey: string;
  name: string;
  club: string;
  city: string;
  state: string;
  country: string;
  locality: string;
  location: LatLng;
  holeCount: number;
  aliases: readonly string[];
};

type BuildGate = { dev: boolean; extraFlag: boolean };

export type YardTestUnlockTapState = {
  count: number;
  firstAtMs: number | null;
};

let gateOverride: BuildGate | null = null;
/** `'env'` reads expo.extra. `null` is an explicit miss (tests). */
let geometryOverride: YardTestGeometry | null | 'env' = 'env';
let switchOn = false;
let unlocked = false;

function readExtra(): Record<string, unknown> | null {
  try {
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    const extra = Constants.expoConfig?.extra;
    return extra && typeof extra === 'object' ? extra : null;
  } catch {
    return null;
  }
}

function readExtraFlag(): boolean {
  return readExtra()?.[YARD_TEST_COURSE_EXTRA_KEY] === true;
}

function readBuildGate(): BuildGate {
  if (gateOverride) return gateOverride;
  return {
    dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    extraFlag: readExtraFlag(),
  };
}

function point(raw: unknown): LatLng | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const lat = (raw as { lat?: unknown }).lat;
  const lng = (raw as { lng?: unknown }).lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const point = { lat, lng };
  return isValidLatLng(point) ? point : null;
}

/**
 * Env JSON only. Missing fields, a bad point, or a par outside 3–5 → null.
 * Never substitutes a pin, a par, or a yardage.
 */
export function parseYardTestCourseGeometry(raw: unknown): YardTestGeometry | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as { center?: unknown; tee?: unknown; green?: unknown; par?: unknown };
  const center = point(record.center);
  const tee = point(record.tee);
  const green = point(record.green);
  const par = record.par;
  if (!center || !tee || !green) return null;
  if (typeof par !== 'number' || !Number.isInteger(par) || par < 3 || par > 5) return null;
  return { center, tee, green, par };
}

export function readYardTestCourseGeometry(): YardTestGeometry | null {
  if (geometryOverride !== 'env') return geometryOverride;
  return parseYardTestCourseGeometry(readExtra()?.[YARD_TEST_GEOMETRY_EXTRA_KEY]);
}

function hole1Yards(geometry: YardTestGeometry): number {
  return Math.round(haversineYards(geometry.tee, geometry.green));
}

/** Build gate passed and the env geometry parsed. False when either is missing. */
export function yardTestCourseBuildAllowed(): boolean {
  const gate = readBuildGate();
  if (!(gate.dev || gate.extraFlag)) return false;
  return readYardTestCourseGeometry() != null;
}

/** Build gate, geometry, and the Settings switch. Nearby / search use this. */
export function yardTestCourseEnabled(): boolean {
  return switchOn && yardTestCourseBuildAllowed();
}

/**
 * Settings row. Hidden until the credits-line unlock, except `__DEV__` builds
 * that already passed the build gate. The switch itself still defaults off.
 */
export function yardTestCourseSettingsRowVisible(): boolean {
  if (!yardTestCourseBuildAllowed()) return false;
  if (readBuildGate().dev) return true;
  return unlocked;
}

export function yardTestCourseUnlocked(): boolean {
  return unlocked;
}

export function parseYardTestCourseSetting(raw: string | null | undefined): boolean {
  return raw === '1';
}

export function serializeYardTestCourseSetting(on: boolean): string {
  return on ? '1' : '0';
}

export function hydrateYardTestCourseFromSettings(read: (key: string) => string | null): void {
  switchOn = parseYardTestCourseSetting(read(YARD_TEST_COURSE_SETTING_KEY));
  unlocked = parseYardTestCourseSetting(read(YARD_TEST_UNLOCK_SETTING_KEY));
}

/** Ignored unless the build allows the course, so a gated-off build cannot turn it on. */
export function setYardTestCourseSwitch(on: boolean, write?: (key: string, value: string) => void): void {
  if (!yardTestCourseBuildAllowed()) return;
  switchOn = on;
  write?.(YARD_TEST_COURSE_SETTING_KEY, serializeYardTestCourseSetting(on));
}

/** Persist the hidden unlock. Ignored when the build does not allow the course. */
export function setYardTestCourseUnlocked(write?: (key: string, value: string) => void): void {
  if (!yardTestCourseBuildAllowed()) return;
  unlocked = true;
  write?.(YARD_TEST_UNLOCK_SETTING_KEY, '1');
}

export function advanceYardTestUnlockTap(
  state: YardTestUnlockTapState,
  nowMs: number,
  windowMs: number = YARD_TEST_UNLOCK_WINDOW_MS,
): YardTestUnlockTapState & { unlocked: boolean } {
  const stale = state.firstAtMs == null || nowMs - state.firstAtMs > windowMs;
  const count = stale ? 1 : state.count + 1;
  if (count >= YARD_TEST_UNLOCK_TAPS) {
    return { count: 0, firstAtMs: null, unlocked: true };
  }
  return { count, firstAtMs: stale ? nowMs : state.firstAtMs, unlocked: false };
}

export function setYardTestCourseGateForTests(gate: BuildGate | null): void {
  gateOverride = gate;
}

export function setYardTestCourseGeometryForTests(geometry: YardTestGeometry | null): void {
  geometryOverride = geometry;
}

export function resetYardTestCourseForTests(): void {
  gateOverride = null;
  geometryOverride = 'env';
  switchOn = false;
  unlocked = false;
}

export function isYardTestCourseId(id: string | null | undefined): boolean {
  const value = id?.trim() ?? '';
  return value === YARD_TEST_COURSE_ID || value === YARD_TEST_COURSE_KEY;
}

/** The test course cannot be starred or saved for offline play. */
export function courseAllowsFavorite(id: string | null | undefined): boolean {
  return !isYardTestCourseId(id);
}

export function yardTestCatalogEntry(): YardTestCatalogEntry | null {
  const geometry = readYardTestCourseGeometry();
  if (!geometry || !yardTestCourseBuildAllowed()) return null;
  return {
    id: YARD_TEST_COURSE_ID,
    courseKey: YARD_TEST_COURSE_KEY,
    name: YARD_TEST_COURSE_NAME,
    club: YARD_TEST_COURSE_NAME,
    city: '',
    state: '',
    country: '',
    locality: '',
    location: geometry.center,
    holeCount: YARD_TEST_COURSE_HOLE_COUNT,
    aliases: ['yard test'],
  };
}

function summary(distanceMeters: number | null): CourseSummary | null {
  const entry = yardTestCatalogEntry();
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    club: entry.club,
    city: entry.city || null,
    state: entry.state || null,
    country: entry.country || null,
    location: entry.location,
    distanceMeters,
  };
}

/** Nearby row when enabled and `from` is within ~1 mile of the center. */
export function yardTestCourseNearby(from: LatLng): CourseSummary | null {
  const geometry = readYardTestCourseGeometry();
  if (!geometry || !yardTestCourseEnabled() || !isValidLatLng(from)) return null;
  const meters = haversineYards(from, geometry.center) * METERS_PER_YARD;
  if (meters > YARD_TEST_COURSE_NEARBY_RADIUS_M) return null;
  return summary(Math.round(meters));
}

export function yardTestCourseSearchRow(): CourseSummary | null {
  if (!yardTestCourseEnabled()) return null;
  return summary(null);
}

/** Test course first, everything else in its existing order. */
export function pinYardTestCourseFirst<T extends { id?: string | null }>(rows: readonly T[]): T[] {
  const pinned = rows.filter((row) => isYardTestCourseId(row.id));
  if (pinned.length === 0) return [...rows];
  return [...pinned, ...rows.filter((row) => !isYardTestCourseId(row.id))];
}

/**
 * Watch nearby list. Enabled → the rows unchanged. Disabled → this course dropped,
 * including a list cached while it was on.
 */
export function coursesForWatchNearby<T extends { id?: string | null }>(rows: readonly T[]): T[] {
  if (yardTestCourseEnabled()) return [...rows];
  return rows.filter((row) => !isYardTestCourseId(row.id));
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

/**
 * Hole 1 uses the env tee, green, and par. Yards are haversine, not a stored number.
 * Holes 2–9 are empty. Null when the build gate fails or the geometry is missing.
 */
export function yardTestCourseDetail(): CourseDetail | null {
  const geometry = readYardTestCourseGeometry();
  if (!geometry || !yardTestCourseBuildAllowed()) return null;
  const holes: HoleCourseData[] = [
    {
      ...emptyHole(1),
      par: geometry.par,
      yards: hole1Yards(geometry),
      teeCentroid: { ...geometry.tee },
      greenCentroid: { ...geometry.green },
    },
  ];
  for (let n = 2; n <= YARD_TEST_COURSE_HOLE_COUNT; n += 1) holes.push(emptyHole(n));
  return {
    id: YARD_TEST_COURSE_ID,
    name: YARD_TEST_COURSE_NAME,
    holeCount: YARD_TEST_COURSE_HOLE_COUNT,
    location: geometry.center,
    city: null,
    state: null,
    holes,
    tees: [],
    greenCentersAvailable: true,
    // Supplied pins only: no waterfall source to name, and nothing written to the paint cache.
    paintResult: { ok: true, source: null, fromCache: false },
  };
}
