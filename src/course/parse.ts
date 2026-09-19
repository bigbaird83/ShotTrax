import { pinOrNull } from '../domain/greenDepth';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { CourseDetail, CourseSummary, HoleCourseData, TeeSet } from './types';

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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/**
 * Parse a numeric pair. `[lat, lng]` first; GeoJSON Position `[lng, lat]`
 * when the first number cannot be a latitude (|lng| > 90).
 */
function parseCoordPair(first: number, second: number): LatLng | null {
  const asLatLng = { lat: first, lng: second };
  if (isValidLatLng(asLatLng)) return asLatLng;
  const asLngLat = { lat: second, lng: first };
  if (Math.abs(first) > 90 && Math.abs(second) <= 90 && isValidLatLng(asLngLat)) {
    return asLngLat;
  }
  return null;
}

/** Parse a lat/lng pair. Returns null instead of inventing a pin. */
export function parseLatLng(raw: unknown): LatLng | null {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length >= 2) {
    const first = asFiniteNumber(raw[0]);
    const second = asFiniteNumber(raw[1]);
    if (first == null || second == null) return null;
    return parseCoordPair(first, second);
  }
  const record = asRecord(raw);
  if (record) {
    const lat = asFiniteNumber(pick(record, ['lat', 'latitude']));
    const lng = asFiniteNumber(pick(record, ['lng', 'lon', 'longitude']));
    const nested = parseLatLng(
      pick(record, ['green', 'green_center', 'greenCenter', 'centroid', 'coordinates']),
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

/** Tee yardage when present. Blank if missing — never invented. */
export function parseYards(raw: unknown): number | null {
  const record = asRecord(raw);
  const value = record ? pick(record, ['yards', 'yardage', 'length', 'yds']) : raw;
  const n = asFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < 1 || n > 999) return null;
  return n;
}

/** Stroke index 1–18. Blank if missing — never invented. */
export function parseHandicap(raw: unknown): number | null {
  const record = asRecord(raw);
  const value = record
    ? pick(record, ['handicap', 'si', 'stroke_index', 'strokeIndex', 'index', 'handicap_men'])
    : raw;
  const n = asFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < 1 || n > 18) return null;
  return n;
}

export function parseGreenFront(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  return pinOrNull(
    parseLatLng(pick(record, ['front', 'green_front', 'greenFront', 'front_green', 'green_front_center'])),
  );
}

export function parseGreenBack(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  return pinOrNull(
    parseLatLng(pick(record, ['back', 'green_back', 'greenBack', 'back_green', 'green_back_center'])),
  );
}

export function parseGreenDepthYards(raw: unknown): number | null {
  const record = asRecord(raw);
  const value = record
    ? pick(record, ['depth_yards', 'depthYards', 'green_depth_yards', 'greenDepthYards', 'green_depth', 'depth'])
    : raw;
  const n = asFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < 1 || n > 80) return null;
  return n;
}

export function parseGreenCentroid(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return parseLatLng(raw);
  const nested = parseLatLng(
    pick(record, [
      'green',
      'green_center',
      'greenCenter',
      'green_location',
      'greenLocation',
      'centroid',
      'green_centroid',
    ]),
  );
  if (nested) return nested;
  const lat = asFiniteNumber(pick(record, ['green_lat', 'greenLat', 'green_latitude']));
  const lng = asFiniteNumber(pick(record, ['green_lng', 'greenLng', 'green_longitude']));
  const point = lat != null && lng != null ? { lat, lng } : null;
  return isValidLatLng(point) ? point : null;
}

/**
 * Tee coordinate on a scorecard hole. Green uses green_* / green_center only.
 * Top-level lat/lng on a hole row is the tee — never invented, never the phone.
 */
export function parseHoleTee(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  const nested = parseLatLng(
    pick(record, [
      'tee',
      'tee_center',
      'teeCenter',
      'tee_centroid',
      'tee_location',
      'teeLocation',
      'teebox',
      'tee_box',
      'teebox_center',
      'teeboxCenter',
    ]),
  );
  if (nested) return nested;
  const lat = asFiniteNumber(pick(record, ['tee_lat', 'teeLat', 'tee_latitude']));
  const lng = asFiniteNumber(pick(record, ['tee_lng', 'teeLng', 'tee_longitude']));
  const named = lat != null && lng != null ? { lat, lng } : null;
  if (isValidLatLng(named)) return named;
  if (pick(record, ['green_lat', 'greenLat', 'green', 'green_center', 'greenCenter']) != null) {
    return null;
  }
  return parseLatLng({
    lat: pick(record, ['lat', 'latitude']),
    lng: pick(record, ['lng', 'lon', 'longitude']),
  });
}

/** Course pin from `coordinates` or top-level lat/lng. Ignores address `location`. */
export function parseCourseLocation(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return parseLatLng(raw);
  const fromCoords = parseLatLng(pick(record, ['coordinates', 'coordinate']));
  if (fromCoords) return fromCoords;
  const lat = asFiniteNumber(pick(record, ['lat', 'latitude']));
  const lng = asFiniteNumber(pick(record, ['lng', 'lon', 'longitude']));
  const point = lat != null && lng != null ? { lat, lng } : null;
  return isValidLatLng(point) ? point : null;
}

function parseDistanceMeters(record: Record<string, unknown>): number | null {
  const meters = asFiniteNumber(
    pick(record, ['distance_meters', 'distanceMeters', 'distance_m']),
  );
  if (meters != null && meters >= 0) return meters;
  const km = asFiniteNumber(pick(record, ['distance_km', 'distanceKm']));
  if (km != null && km >= 0) return km * 1000;
  const distance = asFiniteNumber(pick(record, ['distance']));
  if (distance != null && distance >= 0) return distance;
  return null;
}

function parseCourseSummary(raw: unknown): CourseSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const idRaw = pick(record, ['id', 'course_id', 'courseId']);
  const id = asString(idRaw) ?? (idRaw != null && idRaw !== '' ? String(idRaw) : null);
  const name = asString(pick(record, ['name', 'course_name', 'courseName']));
  if (!id || !name) return null;
  return {
    id,
    name,
    club: asString(pick(record, ['club', 'club_name', 'clubName'])),
    city: asString(pick(record, ['city'])),
    state: asString(pick(record, ['state', 'region'])),
    country: asString(pick(record, ['country', 'country_code'])),
    location: parseCourseLocation(record),
    distanceMeters: parseDistanceMeters(record),
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
  const direct = pick(record, ['holes']);
  if (Array.isArray(direct)) return direct;
  const boxes = pick(record, ['teeboxes', 'tees', 'tee_boxes']);
  if (Array.isArray(boxes) && boxes[0]) {
    const tee = asRecord(boxes[0]);
    if (tee && Array.isArray(tee.holes)) return tee.holes;
  }
  const scorecard = pick(record, ['scorecard']);
  if (scorecard != null) return findHolesArray(scorecard);
  const nested = asRecord(direct);
  if (nested) return findHolesArray(nested);
  const inner = asRecord(record.data);
  if (inner) return findHolesArray(inner);
  return [];
}

function findTeeboxArray(raw: unknown): unknown[] {
  const record = asRecord(raw);
  if (!record) return [];
  const direct = pick(record, ['teeboxes', 'tees', 'tee_boxes']);
  if (Array.isArray(direct)) return direct;
  const scorecard = pick(record, ['scorecard']);
  if (scorecard != null) return findTeeboxArray(scorecard);
  const inner = asRecord(record.data);
  if (inner) return findTeeboxArray(inner);
  return [];
}

function parseHoleRow(item: unknown): HoleCourseData | null {
  const holeNumber = parseHoleNumber(item);
  if (holeNumber == null) return null;
  return {
    holeNumber,
    par: parsePar(item),
    yards: parseYards(item),
    handicap: parseHandicap(item),
    greenCentroid: parseGreenCentroid(item),
    greenFront: parseGreenFront(item),
    greenBack: parseGreenBack(item),
    greenDepthYards: parseGreenDepthYards(item),
    teeCentroid: parseHoleTee(item),
  };
}

export function parseCourseHoles(raw: unknown): HoleCourseData[] {
  const holes: HoleCourseData[] = [];
  for (const item of findHolesArray(raw)) {
    const parsed = parseHoleRow(item);
    if (parsed) holes.push(parsed);
  }
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  return holes;
}

export function parseTeeSet(raw: unknown): TeeSet | null {
  const record = asRecord(raw);
  if (!record) return null;
  const holes: HoleCourseData[] = [];
  const holeRows = Array.isArray(record.holes) ? record.holes : [];
  for (const item of holeRows) {
    const parsed = parseHoleRow(item);
    if (parsed) holes.push(parsed);
  }
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  const name = asString(pick(record, ['name', 'tee_name', 'teeName', 'color', 'tee']));
  if (!name) return null;
  const rating = asFiniteNumber(pick(record, ['rating', 'rating_men', 'course_rating', 'courseRating']));
  const slopeRaw = asFiniteNumber(pick(record, ['slope', 'slope_men', 'slopeRating', 'slope_rating']));
  const totalRaw = asFiniteNumber(pick(record, ['total_yards', 'totalYards', 'yards']));
  const totalYards =
    totalRaw != null && Number.isInteger(totalRaw) && totalRaw >= 1 && totalRaw <= 9999 ? totalRaw : null;
  return {
    name,
    rating: rating != null && rating > 0 ? rating : null,
    slope: slopeRaw != null && Number.isInteger(slopeRaw) && slopeRaw > 0 ? slopeRaw : null,
    totalYards,
    holes,
  };
}

export function parseTeeSets(raw: unknown): TeeSet[] {
  const out: TeeSet[] = [];
  findTeeboxArray(raw).forEach((box) => {
    const parsed = parseTeeSet(box);
    if (parsed) out.push(parsed);
  });
  return out;
}

export type GreenCenterRow = {
  holeNumber: number;
  greenCentroid: LatLng;
  greenFront: LatLng | null;
  greenBack: LatLng | null;
  greenDepthYards: number | null;
};

/**
 * Pro `GET /courses/:id/green-centers`. Each hole is `{ hole, lat, lng }`.
 * Front/back/depth are copied only when present — never invented from the centroid.
 */
export function parseGreenCenters(json: unknown): GreenCenterRow[] {
  const payload = unwrapData(json);
  const record = asRecord(payload);
  const fromNamed =
    record &&
    (pick(record, ['green_centers', 'greenCenters', 'greens', 'green_center', 'greenCentersList']));
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(fromNamed)
      ? fromNamed
      : record
        ? findHolesArray(record)
        : [];
  const out: GreenCenterRow[] = [];
  for (const item of rows) {
    const holeNumber = parseHoleNumber(item);
    const green = parseLatLng(item);
    if (holeNumber == null || !green) continue;
    out.push({
      holeNumber,
      greenCentroid: green,
      greenFront: parseGreenFront(item),
      greenBack: parseGreenBack(item),
      greenDepthYards: parseGreenDepthYards(item),
    });
  }
  return out;
}

export function mergeGreenCenters(
  holes: HoleCourseData[],
  greens: GreenCenterRow[],
): HoleCourseData[] {
  if (greens.length === 0) return holes;
  const byHole = new Map(greens.map((row) => [row.holeNumber, row]));
  const used = new Set<number>();
  const merged = holes.map((hole) => {
    const fromApi = byHole.get(hole.holeNumber) ?? null;
    if (fromApi) used.add(hole.holeNumber);
    return {
      ...hole,
      greenCentroid: hole.greenCentroid ?? fromApi?.greenCentroid ?? null,
      greenFront: hole.greenFront ?? fromApi?.greenFront ?? null,
      greenBack: hole.greenBack ?? fromApi?.greenBack ?? null,
      greenDepthYards: hole.greenDepthYards ?? fromApi?.greenDepthYards ?? null,
      teeCentroid: hole.teeCentroid,
    };
  });
  for (const row of greens) {
    if (used.has(row.holeNumber)) continue;
    merged.push({
      holeNumber: row.holeNumber,
      par: null,
      yards: null,
      handicap: null,
      greenCentroid: row.greenCentroid,
      greenFront: row.greenFront,
      greenBack: row.greenBack,
      greenDepthYards: row.greenDepthYards,
      teeCentroid: null,
    });
  }
  merged.sort((a, b) => a.holeNumber - b.holeNumber);
  return merged;
}

export function parseCourseDetail(json: unknown): CourseDetail | null {
  const payload = unwrapData(json);
  const record = asRecord(payload) ?? asRecord(json);
  if (!record) return null;
  const idRaw = pick(record, ['id', 'course_id', 'courseId']);
  const id = asString(idRaw) ?? (idRaw != null && idRaw !== '' ? String(idRaw) : null);
  const name = asString(pick(record, ['name', 'course_name', 'courseName']));
  if (!id || !name) return null;
  const tees = parseTeeSets(record).map((tee) => ({
    ...tee,
    holes: mergeGreenCenters(tee.holes, []),
  }));
  const holes = tees[0]?.holes ?? parseCourseHoles(record);
  const holeCount = asFiniteNumber(
    pick(record, ['hole_count', 'holeCount', 'holes_count']) ??
      asRecord(record.scorecard)?.hole_count ??
      asRecord(record.scorecard)?.holeCount,
  );
  return {
    id,
    name,
    holeCount: holeCount != null && Number.isInteger(holeCount) ? holeCount : holes.length || null,
    location: parseCourseLocation(record),
    holes,
    tees,
    greenCentersAvailable: asBoolean(pick(record, ['green_centers_available', 'greenCentersAvailable'])),
  };
}
