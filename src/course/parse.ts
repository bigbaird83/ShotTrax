import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { CourseDetail, CourseSummary, HoleCourseData } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/** Parse a lat/lng pair. Returns null instead of inventing a pin. */
export function parseLatLng(raw: unknown): LatLng | null {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length >= 2) {
    const lat = asFiniteNumber(raw[0]);
    const lng = asFiniteNumber(raw[1]);
    const point = lat != null && lng != null ? { lat, lng } : null;
    return isValidLatLng(point) ? point : null;
  }
  const record = asRecord(raw);
  if (record) {
    const lat = asFiniteNumber(pick(record, ['lat', 'latitude']));
    const lng = asFiniteNumber(pick(record, ['lng', 'lon', 'longitude']));
    const nested = parseLatLng(
      pick(record, ['green', 'green_center', 'greenCenter', 'centroid', 'location', 'coordinates']),
    );
    if (nested) return nested;
    const point = lat != null && lng != null ? { lat, lng } : null;
    return isValidLatLng(point) ? point : null;
  }
  return null;
}

/** Course par when present. Blank (null) if missing — never invented. */
export function parsePar(raw: unknown): number | null {
  const record = asRecord(raw);
  const value = record ? pick(record, ['par', 'par_men', 'parMen', 'mens_par']) : raw;
  const n = asFiniteNumber(value);
  if (n == null || !Number.isInteger(n)) return null;
  if (n < 3 || n > 6) return null;
  return n;
}

export function parseHoleNumber(raw: unknown): number | null {
  const record = asRecord(raw);
  const value = record ? pick(record, ['hole', 'hole_number', 'holeNumber', 'number', 'no']) : raw;
  const n = asFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < 1 || n > 18) return null;
  return n;
}

export function parseGreenCentroid(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return parseLatLng(raw);
  const nested = parseLatLng(
    pick(record, ['green', 'green_center', 'greenCenter', 'centroid', 'green_centroid']),
  );
  if (nested) return nested;
  const lat = asFiniteNumber(pick(record, ['green_lat', 'greenLat', 'green_latitude']));
  const lng = asFiniteNumber(pick(record, ['green_lng', 'greenLng', 'green_longitude']));
  const point = lat != null && lng != null ? { lat, lng } : null;
  return isValidLatLng(point) ? point : null;
}

function parseCourseSummary(raw: unknown): CourseSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(pick(record, ['id', 'course_id', 'courseId'])) ?? String(pick(record, ['id']) ?? '');
  const name = asString(pick(record, ['name', 'course_name', 'courseName']));
  if (!id || !name) return null;
  const distance = asFiniteNumber(pick(record, ['distance_meters', 'distanceMeters', 'distance_m', 'distance']));
  return {
    id,
    name,
    club: asString(pick(record, ['club', 'club_name', 'clubName'])),
    city: asString(pick(record, ['city'])),
    state: asString(pick(record, ['state', 'region'])),
    country: asString(pick(record, ['country', 'country_code'])),
    location: parseLatLng(record),
    distanceMeters: distance,
  };
}

function unwrapData(json: unknown): unknown {
  const record = asRecord(json);
  if (!record) return json;
  if (record.data !== undefined) return record.data;
  return json;
}

export function parseNearbyCourses(json: unknown): CourseSummary[] {
  const payload = unwrapData(json);
  const rows = Array.isArray(payload) ? payload : [];
  const out: CourseSummary[] = [];
  for (const row of rows) {
    const parsed = parseCourseSummary(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

function findHolesArray(raw: unknown): unknown[] {
  const record = asRecord(raw);
  if (!record) return Array.isArray(raw) ? raw : [];
  const direct = pick(record, ['holes', 'scorecard']);
  if (Array.isArray(direct)) return direct;
  const nested = asRecord(direct);
  if (nested && Array.isArray(nested.holes)) return nested.holes;
  const tees = record.tees;
  if (Array.isArray(tees) && tees[0]) {
    const tee = asRecord(tees[0]);
    if (tee && Array.isArray(tee.holes)) return tee.holes;
  }
  const inner = asRecord(record.data);
  if (inner) return findHolesArray(inner);
  return [];
}

export function parseCourseHoles(raw: unknown): HoleCourseData[] {
  const holes: HoleCourseData[] = [];
  for (const item of findHolesArray(raw)) {
    const holeNumber = parseHoleNumber(item);
    if (holeNumber == null) continue;
    holes.push({
      holeNumber,
      par: parsePar(item),
      greenCentroid: parseGreenCentroid(item),
    });
  }
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  return holes;
}

export function parseCourseDetail(json: unknown): CourseDetail | null {
  const payload = unwrapData(json);
  const record = asRecord(payload) ?? asRecord(json);
  if (!record) return null;
  const id = asString(pick(record, ['id', 'course_id', 'courseId']));
  const name = asString(pick(record, ['name', 'course_name', 'courseName']));
  if (!id || !name) return null;
  const holes = parseCourseHoles(record);
  const holeCount = asFiniteNumber(pick(record, ['hole_count', 'holeCount', 'holes_count']));
  return {
    id,
    name,
    holeCount: holeCount != null && Number.isInteger(holeCount) ? holeCount : holes.length || null,
    holes,
  };
}
