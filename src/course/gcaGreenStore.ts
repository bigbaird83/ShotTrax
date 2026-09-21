import { isCourseCardLatLng, isValidLatLng, type LatLng } from '../domain/latLng';
import { mergeGreenCenters, parseGreenCenters, type GreenCenterRow } from './parse';
import type { CourseDetail, HoleCourseData } from './types';
import rawStore from './hydrates/gca/green-centers.json';

export const GCA_CATALOG_KEY_PREFIX = 'gca-';

export type GcaPersistedHole = {
  hole: number;
  lat: number;
  lng: number;
};

export type GcaPersistedCourse = {
  id: string;
  name: string;
  club: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: LatLng | null;
  fetchedAt: string;
  holes: GcaPersistedHole[];
};

export type GcaGreenStore = {
  version: 1;
  source: 'golfapi';
  updatedAt: string | null;
  courses: Record<string, GcaPersistedCourse>;
};

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

function emptyStore(): GcaGreenStore {
  return { version: 1, source: 'golfapi', updatedAt: null, courses: {} };
}

function parsePersistedHole(raw: unknown): GcaPersistedHole | null {
  const rows = parseGreenCenters({ data: { holes: [raw] } });
  const row = rows[0];
  if (!row || !isCourseCardLatLng(row.greenCentroid)) return null;
  return {
    hole: row.holeNumber,
    lat: row.greenCentroid.lat,
    lng: row.greenCentroid.lng,
  };
}

function parsePersistedCourse(id: string, raw: unknown): GcaPersistedCourse | null {
  const record = asRecord(raw);
  if (!record) return null;
  const name = asString(record.name);
  const fetchedAt = asString(record.fetchedAt);
  if (!name || !fetchedAt) return null;
  const holesRaw = Array.isArray(record.holes) ? record.holes : [];
  const seen = new Set<number>();
  const holes: GcaPersistedHole[] = [];
  for (const item of holesRaw) {
    const hole = parsePersistedHole(item);
    if (!hole || seen.has(hole.hole)) continue;
    seen.add(hole.hole);
    holes.push(hole);
  }
  holes.sort((a, b) => a.hole - b.hole);
  if (holes.length === 0) return null;
  const locationRaw = record.location;
  const location = isValidLatLng(locationRaw as LatLng) ? (locationRaw as LatLng) : null;
  return {
    id,
    name,
    club: asString(record.club),
    city: asString(record.city),
    state: asString(record.state),
    country: asString(record.country),
    location,
    fetchedAt,
    holes,
  };
}

/** Parse a persisted GCA store. Empty / invalid courses are dropped — never invented. */
export function parseGcaGreenStore(raw: unknown): GcaGreenStore {
  const record = asRecord(raw);
  if (!record) return emptyStore();
  const coursesRaw = asRecord(record.courses) ?? {};
  const courses: Record<string, GcaPersistedCourse> = {};
  for (const [key, value] of Object.entries(coursesRaw)) {
    const id = asString(key) ?? asString(asRecord(value)?.id);
    if (!id) continue;
    const parsed = parsePersistedCourse(id, value);
    if (!parsed) continue;
    courses[parsed.id] = parsed;
  }
  return {
    version: 1,
    source: 'golfapi',
    updatedAt: asString(record.updatedAt),
    courses,
  };
}

export function loadGcaGreenStore(): GcaGreenStore {
  return parseGcaGreenStore(rawStore);
}

export function gcaGreensForCourse(id: string | null | undefined): GreenCenterRow[] {
  const key = asString(id);
  if (!key) return [];
  const course = loadGcaGreenStore().courses[key];
  if (!course) return [];
  return parseGreenCenters({ data: { holes: course.holes } });
}

export function listGcaPersistedCourses(): GcaPersistedCourse[] {
  return Object.values(loadGcaGreenStore().courses).sort((a, b) => {
    const state = (a.state ?? '').localeCompare(b.state ?? '');
    if (state !== 0) return state;
    return a.name.localeCompare(b.name);
  });
}

export function gcaCatalogCourseKey(id: string): string {
  return `${GCA_CATALOG_KEY_PREFIX}${id}`;
}

export function isGcaCatalogCourseKey(courseKey: string | null | undefined): boolean {
  const key = asString(courseKey);
  return Boolean(key && key.startsWith(GCA_CATALOG_KEY_PREFIX));
}

export function gcaIdFromCatalogKey(courseKey: string | null | undefined): string | null {
  const key = asString(courseKey);
  if (!key || !key.startsWith(GCA_CATALOG_KEY_PREFIX)) return null;
  const id = key.slice(GCA_CATALOG_KEY_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/**
 * Live Pro greens win. Persisted GCA greens fill holes the live payload left blank.
 * Never invents a coordinate.
 */
export function applyPersistedGreens(
  detail: CourseDetail,
  stored: GreenCenterRow[],
  live: GreenCenterRow[] = [],
): CourseDetail {
  const holes = mergeGreenCenters(mergeGreenCenters(detail.holes, live), stored);
  const tees = detail.tees.map((tee) => ({
    ...tee,
    holes: mergeGreenCenters(mergeGreenCenters(tee.holes, live), stored),
  }));
  const available = holes.some((hole) => hole.greenCentroid != null);
  return {
    ...detail,
    holes,
    tees,
    greenCentersAvailable: available ? true : detail.greenCentersAvailable,
  };
}

export function gcaStoreCourseDetail(id: string | null | undefined): CourseDetail | null {
  const key = asString(id);
  if (!key) return null;
  const course = loadGcaGreenStore().courses[key];
  if (!course) return null;
  const greens = parseGreenCenters({ data: { holes: course.holes } });
  if (greens.length === 0) return null;
  const holes: HoleCourseData[] = greens.map((row) => ({
    holeNumber: row.holeNumber,
    par: null,
    yards: null,
    handicap: null,
    greenCentroid: row.greenCentroid,
    greenFront: row.greenFront,
    greenBack: row.greenBack,
    greenDepthYards: row.greenDepthYards,
    teeCentroid: null,
  }));
  return {
    id: course.id,
    name: course.name,
    holeCount: holes.length,
    location: course.location,
    holes,
    tees: [],
    greenCentersAvailable: true,
  };
}
