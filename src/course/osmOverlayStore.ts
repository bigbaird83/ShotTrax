import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from './types';

/**
 * On-device course overlay store.
 *
 * SQLite settings key `course.osm.overlay`, attached from `DbProvider` the
 * same way as `course.paint.cache` and `golfapi.hydrates`. One blob for every
 * course that has real Overpass features. Reinstall wipes SQLite.
 *
 * Records keep only what the map draws: kind, hole, and coordinates.
 * Empty results are not written. There is no server copy and no new secret.
 */
export const COURSE_OSM_OVERLAY_SETTING_KEY = 'course.osm.overlay';

const OSM_KINDS = new Set<OsmGolfKind>([
  'green',
  'fairway',
  'tee',
  'hole',
  'bunker',
  'water_hazard',
  'lateral_water_hazard',
  'cartpath',
]);

export type CourseOsmOverlayRecord = {
  v: 1;
  courseId: string;
  fetchedAt: string;
  source: 'osm';
  features: OsmFeature[];
};

type PersistHooks = {
  load: () => string | null;
  save: (json: string) => void;
};

const memory = new Map<string, CourseOsmOverlayRecord>();
let persist: PersistHooks | null = null;

function trim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseHoleNumber(value: unknown): number | null | undefined {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 18) return value;
  return undefined;
}

function parseCoordinate(value: unknown): LatLng | null {
  const record = asRecord(value);
  if (!record) return null;
  const lat = typeof record.lat === 'number' ? record.lat : Number.NaN;
  const lng = typeof record.lng === 'number' ? record.lng : Number.NaN;
  const point = { lat, lng };
  return isValidLatLng(point) ? point : null;
}

function compactFeatures(raw: unknown): OsmFeature[] {
  if (!Array.isArray(raw)) return [];
  const features: OsmFeature[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const kind = trim(record.kind);
    if (!kind || !OSM_KINDS.has(kind as OsmGolfKind)) continue;
    const holeNumber = parseHoleNumber(record.holeNumber);
    if (holeNumber === undefined) continue;
    if (!Array.isArray(record.coordinates)) continue;
    const coordinates: LatLng[] = [];
    for (const point of record.coordinates) {
      const parsed = parseCoordinate(point);
      if (parsed) coordinates.push(parsed);
    }
    if (coordinates.length < 2) continue;
    features.push({ kind: kind as OsmGolfKind, holeNumber, coordinates });
  }
  return features;
}

export function parseCourseOsmOverlayRecord(raw: unknown): CourseOsmOverlayRecord | null {
  const record = asRecord(raw);
  if (!record || record.v !== 1 || record.source !== 'osm') return null;
  const courseId = trim(record.courseId);
  const fetchedAt = trim(record.fetchedAt);
  if (!courseId || !fetchedAt) return null;
  const features = compactFeatures(record.features);
  if (features.length === 0) return null;
  return { v: 1, courseId, fetchedAt, source: 'osm', features };
}

function parseBlob(raw: unknown): CourseOsmOverlayRecord[] {
  const record = asRecord(raw);
  if (!record || record.v !== 1) return [];
  const courses = asRecord(record.courses);
  if (!courses) return [];
  const out: CourseOsmOverlayRecord[] = [];
  for (const value of Object.values(courses)) {
    const parsed = parseCourseOsmOverlayRecord(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function courseOsmOverlayFromRecord(record: CourseOsmOverlayRecord): OsmOverlay {
  return { source: 'osm', features: record.features, geojson: null };
}

export function serializeCourseOsmOverlayCache(): string {
  const courses: Record<string, CourseOsmOverlayRecord> = {};
  for (const record of memory.values()) courses[record.courseId] = record;
  return JSON.stringify({ v: 1, courses });
}

function flushPersist(): void {
  persist?.save(serializeCourseOsmOverlayCache());
}

export function restoreCourseOsmOverlayCache(raw: string | null | undefined): void {
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  for (const record of parseBlob(parsed)) memory.set(record.courseId, record);
}

export function attachCourseOsmOverlayPersist(hooks: PersistHooks | null): void {
  persist = hooks;
  if (hooks) restoreCourseOsmOverlayCache(hooks.load());
}

export function resetCourseOsmOverlayForTests(): void {
  memory.clear();
  persist = null;
}

/**
 * Write a real Overpass overlay. Empty features and any source other than
 * `osm` are ignored so a miss cannot replace a saved course with null.
 */
export function saveCourseOsmOverlay(input: {
  courseId: string;
  fetchedAt: string;
  source: 'osm';
  features: OsmFeature[];
}): boolean {
  const record = parseCourseOsmOverlayRecord({ v: 1, ...input });
  if (!record) return false;
  memory.set(record.courseId, record);
  flushPersist();
  return true;
}

export function loadCourseOsmOverlay(courseId: string | null | undefined): CourseOsmOverlayRecord | null {
  const id = courseId?.trim() ?? '';
  if (!id) return null;
  return memory.get(id) ?? null;
}

export function listCourseOsmOverlays(): CourseOsmOverlayRecord[] {
  return [...memory.values()];
}

export function forgetCourseOsmOverlay(courseId: string | null | undefined): void {
  const id = courseId?.trim() ?? '';
  if (!id || !memory.delete(id)) return;
  flushPersist();
}
