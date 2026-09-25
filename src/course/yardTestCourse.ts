/**
 * TEMP: Goode Circle Test — a backyard course for on-device QA. Not a real course.
 *
 * Build gate: `__DEV__` or `expo.extra.debugYardCourse === true`. A production
 * build has neither (app.config.js forces the extra false on the production
 * EAS profile), so the course never resolves, lists, or searches there.
 *
 * Runtime flag: the Settings "Yard test course" switch (SQLite, default off).
 * Nearby and search list the course only when the build gate passes AND the
 * switch is on. A round already started on it keeps resolving while the build
 * gate passes, even after the switch goes off.
 *
 * Only hole 1 has pins. Holes 2–9 have no tee or green — never invented.
 */
import { METERS_PER_YARD } from '../config/sensing';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { METERS_PER_MILE } from '../domain/nearbyRadius';
import type { CourseDetail, CourseSummary, HoleCourseData } from './types';

export const YARD_TEST_COURSE_KEY = 'goode-circle-test-magnolia-ar';
/** Same `local:` prefix as the bundled catalog (see LOCAL_CATALOG_ID_PREFIX). */
export const YARD_TEST_COURSE_ID = `local:${YARD_TEST_COURSE_KEY}`;
export const YARD_TEST_COURSE_NAME = 'Goode Circle Test';
export const YARD_TEST_COURSE_HOLE_COUNT = 9;

export const YARD_TEST_COURSE_SETTING_KEY = 'debug.yardTestCourse';
export const YARD_TEST_COURSE_EXTRA_KEY = 'debugYardCourse';

/** Nearby pin anchor. Not a tee or green. */
export const YARD_TEST_COURSE_ANCHOR: LatLng = { lat: 33.3118, lng: -93.2268 };
/** Nearby lists it only within ~1 mile of the anchor. */
export const YARD_TEST_COURSE_NEARBY_RADIUS_M = Math.round(METERS_PER_MILE);

export const YARD_TEST_HOLE1_TEE: LatLng = { lat: 33.31183, lng: -93.22676 };
export const YARD_TEST_HOLE1_GREEN: LatLng = { lat: 33.31221, lng: -93.22674 };
export const YARD_TEST_HOLE1_PAR = 3;
/** Haversine tee → green, rounded (~46 yd). */
export const YARD_TEST_HOLE1_YARDS = Math.round(haversineYards(YARD_TEST_HOLE1_TEE, YARD_TEST_HOLE1_GREEN));

export const YARD_TEST_CATALOG_ENTRY = {
  id: YARD_TEST_COURSE_ID,
  courseKey: YARD_TEST_COURSE_KEY,
  name: YARD_TEST_COURSE_NAME,
  club: YARD_TEST_COURSE_NAME,
  city: 'Magnolia',
  state: 'AR',
  country: 'US',
  locality: 'Magnolia, AR',
  location: YARD_TEST_COURSE_ANCHOR,
  holeCount: YARD_TEST_COURSE_HOLE_COUNT,
  aliases: ['Goode Circle', 'Yard test course'] as readonly string[],
} as const;

type BuildGate = { dev: boolean; extraFlag: boolean };

let gateOverride: BuildGate | null = null;
let switchOn = false;

function readExtraFlag(): boolean {
  try {
    // Lazy: node tests must not load react-native via expo-constants.
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    return Constants.expoConfig?.extra?.[YARD_TEST_COURSE_EXTRA_KEY] === true;
  } catch {
    return false;
  }
}

function readBuildGate(): BuildGate {
  if (gateOverride) return gateOverride;
  return {
    dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    extraFlag: readExtraFlag(),
  };
}

/** Dev bundle or `extra.debugYardCourse === true`. False on production. */
export function yardTestCourseBuildAllowed(): boolean {
  const gate = readBuildGate();
  return gate.dev || gate.extraFlag;
}

/** Build gate AND the Settings switch. Nearby / search list the course only then. */
export function yardTestCourseEnabled(): boolean {
  return switchOn && yardTestCourseBuildAllowed();
}

export function parseYardTestCourseSetting(raw: string | null | undefined): boolean {
  return raw === '1';
}

export function serializeYardTestCourseSetting(on: boolean): string {
  return on ? '1' : '0';
}

export function hydrateYardTestCourseFromSettings(read: (key: string) => string | null): void {
  switchOn = parseYardTestCourseSetting(read(YARD_TEST_COURSE_SETTING_KEY));
}

/** Ignored outside the build gate, so a production build can never turn it on. */
export function setYardTestCourseSwitch(on: boolean, write?: (key: string, value: string) => void): void {
  if (!yardTestCourseBuildAllowed()) return;
  switchOn = on;
  write?.(YARD_TEST_COURSE_SETTING_KEY, serializeYardTestCourseSetting(on));
}

export function setYardTestCourseGateForTests(gate: BuildGate | null): void {
  gateOverride = gate;
}

export function resetYardTestCourseForTests(): void {
  gateOverride = null;
  switchOn = false;
}

export function isYardTestCourseId(id: string | null | undefined): boolean {
  const value = id?.trim() ?? '';
  return value === YARD_TEST_COURSE_ID || value === YARD_TEST_COURSE_KEY;
}

function summary(distanceMeters: number | null): CourseSummary {
  const entry = YARD_TEST_CATALOG_ENTRY;
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

/** Nearby row when enabled and `from` is within ~1 mile of the anchor. */
export function yardTestCourseNearby(from: LatLng): CourseSummary | null {
  if (!yardTestCourseEnabled() || !isValidLatLng(from)) return null;
  const meters = haversineYards(from, YARD_TEST_COURSE_ANCHOR) * METERS_PER_YARD;
  if (meters > YARD_TEST_COURSE_NEARBY_RADIUS_M) return null;
  return summary(Math.round(meters));
}

export function yardTestCourseSearchRow(): CourseSummary | null {
  return yardTestCourseEnabled() ? summary(null) : null;
}

/** Test course first, everything else in its existing order. */
export function pinYardTestCourseFirst<T extends { id?: string | null }>(rows: readonly T[]): T[] {
  const pinned = rows.filter((row) => isYardTestCourseId(row.id));
  if (pinned.length === 0) return [...rows];
  return [...pinned, ...rows.filter((row) => !isYardTestCourseId(row.id))];
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
 * Hole 1 tee + green + par 3 + haversine yards. Holes 2–9 are empty.
 * No front/back/depth (no GIR data). Null outside the build gate.
 */
export function yardTestCourseDetail(): CourseDetail | null {
  if (!yardTestCourseBuildAllowed()) return null;
  const holes: HoleCourseData[] = [
    {
      ...emptyHole(1),
      par: YARD_TEST_HOLE1_PAR,
      yards: YARD_TEST_HOLE1_YARDS,
      teeCentroid: { ...YARD_TEST_HOLE1_TEE },
      greenCentroid: { ...YARD_TEST_HOLE1_GREEN },
    },
  ];
  for (let n = 2; n <= YARD_TEST_COURSE_HOLE_COUNT; n += 1) holes.push(emptyHole(n));
  return {
    id: YARD_TEST_COURSE_ID,
    name: YARD_TEST_COURSE_NAME,
    holeCount: YARD_TEST_COURSE_HOLE_COUNT,
    location: YARD_TEST_COURSE_ANCHOR,
    city: YARD_TEST_CATALOG_ENTRY.city,
    state: YARD_TEST_CATALOG_ENTRY.state,
    holes,
    tees: [],
    greenCentersAvailable: true,
    // Hand-entered pins: no waterfall source to name, and nothing written to the paint cache.
    paintResult: { ok: true, source: null, fromCache: false },
  };
}
