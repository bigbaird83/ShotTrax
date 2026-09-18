import { featureCentroid } from '../domain/catchUpMap';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { CourseLayoutSeed } from './layout';
import type { OsmFeature, OsmGolfKind, OsmOverlay, OsmOverlayHook, OsmOverlayQuery } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_HOLE_RADIUS_M = 1000;
const DEFAULT_COURSE_RADIUS_M = 1200;
const OSM_KINDS: OsmGolfKind[] = ['green', 'fairway', 'tee', 'hole'];

export type OsmOverlayDeps = {
  fetch?: typeof fetch;
  overpassUrl?: string;
};

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

function parseOsmKind(tags: Record<string, unknown> | null): OsmGolfKind | null {
  const golf = tags && typeof tags.golf === 'string' ? tags.golf.trim().toLowerCase() : '';
  return OSM_KINDS.includes(golf as OsmGolfKind) ? (golf as OsmGolfKind) : null;
}

function parseOsmHoleNumber(tags: Record<string, unknown> | null): number | null {
  if (!tags) return null;
  for (const key of ['ref', 'hole', 'hole_number', 'holeNumber']) {
    const n = asFiniteNumber(tags[key]);
    if (n != null && Number.isInteger(n) && n >= 1 && n <= 18) return n;
  }
  return null;
}

function parseCoordList(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLng[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const lat = asFiniteNumber(rec.lat ?? rec.latitude);
    const lng = asFiniteNumber(rec.lon ?? rec.lng ?? rec.longitude);
    const point = lat != null && lng != null ? { lat, lng } : null;
    if (isValidLatLng(point)) out.push(point);
  }
  return out;
}

function parseMemberRings(members: unknown): LatLng[][] {
  if (!Array.isArray(members)) return [];
  const rings: LatLng[][] = [];
  for (const member of members) {
    const rec = asRecord(member);
    if (!rec) continue;
    const role = typeof rec.role === 'string' ? rec.role : '';
    if (role && role !== 'outer') continue;
    const coords = parseCoordList(rec.geometry);
    if (coords.length >= 2) rings.push(coords);
  }
  return rings;
}

export function parseOverpassOverlay(json: unknown): OsmOverlay | null {
  const record = asRecord(json);
  const elements = record && Array.isArray(record.elements) ? record.elements : Array.isArray(json) ? json : [];
  const features: OsmFeature[] = [];
  for (const el of elements) {
    const rec = asRecord(el);
    if (!rec) continue;
    const tags = asRecord(rec.tags);
    const kind = parseOsmKind(tags);
    if (!kind) continue;
    const holeNumber = parseOsmHoleNumber(tags);
    const wayCoords = parseCoordList(rec.geometry);
    const rings = wayCoords.length >= 2 ? [wayCoords] : parseMemberRings(rec.members);
    for (const coordinates of rings) {
      if (coordinates.length < 2) continue;
      features.push({ kind, holeNumber, coordinates });
    }
  }
  if (features.length === 0) return null;
  return {
    source: 'osm',
    features,
    geojson: null,
  };
}

export function featuresForHole(overlay: OsmOverlay | null, holeNumber: number): OsmFeature[] {
  if (!overlay) return [];
  const numbered = overlay.features.filter((f) => f.holeNumber === holeNumber);
  if (numbered.length > 0) return numbered;
  // Unmapped hole refs: show unnumbered features in the query bbox, never invent.
  return overlay.features.filter((f) => f.holeNumber == null);
}

/** OSM tee-box centroid. Missing tee polygon → null, never invented. */
export function teePointForHole(overlay: OsmOverlay | null, holeNumber: number): LatLng | null {
  const tees = featuresForHole(overlay, holeNumber).filter((feature) => feature.kind === 'tee');
  if (tees.length === 0) return null;
  return featureCentroid(tees[0].coordinates);
}

/**
 * Tee from the hole line itself (golf=hole), not the tee-box polygon.
 * First/last point: the end farther from the green is the tee. No green → first point.
 * Missing hole line → null. Never invents a coordinate.
 */
export function teePointFromHoleFeature(
  overlay: OsmOverlay | null,
  holeNumber: number,
  green?: LatLng | null,
): LatLng | null {
  const lines = featuresForHole(overlay, holeNumber)
    .filter((feature) => feature.kind === 'hole')
    .map((feature) => feature.coordinates.filter((point) => isValidLatLng(point)))
    .filter((coordinates) => coordinates.length >= 2);
  if (lines.length === 0) return null;

  let coords = lines[0];
  if (isValidLatLng(green) && lines.length > 1) {
    let bestDist = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const start = line[0];
      const end = line[line.length - 1];
      const dist = Math.min(haversineYards(start, green), haversineYards(end, green));
      if (dist < bestDist) {
        bestDist = dist;
        coords = line;
      }
    }
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  if (isValidLatLng(green)) {
    return haversineYards(first, green) >= haversineYards(last, green) ? first : last;
  }
  return first;
}

/**
 * Fairway vertex farthest from the green. Used only when the tee box and
 * hole line are missing. Never the phone. No green → null.
 */
export function teePointFromFairway(
  overlay: OsmOverlay | null,
  holeNumber: number,
  green?: LatLng | null,
): LatLng | null {
  if (!isValidLatLng(green)) return null;
  let best: LatLng | null = null;
  let bestYards = -1;
  for (const feature of featuresForHole(overlay, holeNumber)) {
    if (feature.kind !== 'fairway') continue;
    for (const point of feature.coordinates) {
      if (!isValidLatLng(point)) continue;
      const yards = haversineYards(point, green);
      if (yards > bestYards) {
        bestYards = yards;
        best = point;
      }
    }
  }
  return best;
}

/** Tee box, then hole line, then fairway. Never the phone or the clubhouse. */
export function resolveOverlayTee(
  overlay: OsmOverlay | null,
  holeNumber: number,
  green?: LatLng | null,
): LatLng | null {
  return (
    teePointFromHoleFeature(overlay, holeNumber, green) ??
    teePointForHole(overlay, holeNumber) ??
    teePointFromFairway(overlay, holeNumber, green)
  );
}

function overpassQuery(location: LatLng, radiusM: number): string {
  const r = Math.max(50, Math.min(3000, Math.round(radiusM)));
  const lat = location.lat;
  const lng = location.lng;
  return `[out:json][timeout:25];
(
  way["golf"="green"](around:${r},${lat},${lng});
  way["golf"="fairway"](around:${r},${lat},${lng});
  way["golf"="tee"](around:${r},${lat},${lng});
  way["golf"="hole"](around:${r},${lat},${lng});
  relation["golf"="green"](around:${r},${lat},${lng});
  relation["golf"="fairway"](around:${r},${lat},${lng});
  relation["golf"="tee"](around:${r},${lat},${lng});
);
out geom;`;
}

/**
 * OSM course overlay (golf=green/fairway/tee/hole).
 * Returns null when there is no location, the query fails, or OSM has nothing —
 * never invents GeoJSON. OSM par tags are ignored (par comes from course API only).
 */
export async function fetchOsmOverlay(
  query: OsmOverlayQuery | string,
  deps: OsmOverlayDeps = {},
): Promise<OsmOverlay | null> {
  const q: OsmOverlayQuery = typeof query === 'string' ? { courseId: query } : query;
  const location = isValidLatLng(q.location) ? q.location : null;
  if (!location) return null;

  const radiusM =
    q.radiusM ?? (q.holeNumber != null ? DEFAULT_HOLE_RADIUS_M : DEFAULT_COURSE_RADIUS_M);
  const fetchImpl = deps.fetch ?? fetch;
  const url = deps.overpassUrl ?? OVERPASS_URL;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `data=${encodeURIComponent(overpassQuery(location, radiusM))}`,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const overlay = parseOverpassOverlay(json);
    if (!overlay) return null;
    if (q.holeNumber != null) {
      const features = featuresForHole(overlay, q.holeNumber);
      return features.length > 0 ? { ...overlay, features } : null;
    }
    return overlay;
  } catch {
    return null;
  }
}

const overlayCache = new Map<string, OsmOverlay>();
const teeCache = new Map<string, LatLng>();

export function osmOverlayCacheKey(args: {
  courseId?: string | null;
  holeNumber: number;
  green: LatLng | null;
}): string | null {
  if (!isValidLatLng(args.green)) return null;
  return `${args.courseId ?? ''}:${args.holeNumber}:${args.green.lat.toFixed(5)},${args.green.lng.toFixed(5)}`;
}

/** Sync tee so Add shot can draw tee + green without waiting on a fetch or a phone fix. */
export function cachedResolvedTee(args: {
  courseId?: string | null;
  holeNumber: number;
  green: LatLng | null;
}): LatLng | null {
  const key = osmOverlayCacheKey(args);
  const tee = key ? teeCache.get(key) ?? null : null;
  return isValidLatLng(tee) ? tee : null;
}

export function rememberResolvedTee(
  args: {
    courseId?: string | null;
    holeNumber: number;
    green: LatLng | null;
  },
  tee: LatLng | null,
): void {
  const key = osmOverlayCacheKey(args);
  if (!key || !isValidLatLng(tee)) return;
  teeCache.set(key, tee);
}

/** Sync cache so Add shot can frame tee + green without waiting on a new fetch or a phone fix. */
export function cachedOsmOverlay(args: {
  courseId?: string | null;
  holeNumber: number;
  green: LatLng | null;
}): OsmOverlay | null {
  const key = osmOverlayCacheKey(args);
  return key ? overlayCache.get(key) ?? null : null;
}

export function rememberOsmOverlay(
  args: {
    courseId?: string | null;
    holeNumber: number;
    green: LatLng | null;
  },
  overlay: OsmOverlay | null,
): void {
  const key = osmOverlayCacheKey(args);
  if (!key || !overlay) return;
  overlayCache.set(key, overlay);
}

export const osmOverlayHook: OsmOverlayHook = {
  fetchCourseOverlay: (query) => fetchOsmOverlay(query),
};

/**
 * Fill missing layout tees from one OSM query around the course / hole-1 green.
 * Existing API tees win. Never invents a coordinate. Never uses the phone.
 */
export async function fillLayoutTeesFromOsm(
  layout: CourseLayoutSeed,
  deps: OsmOverlayDeps & { timeoutMs?: number } = {},
): Promise<CourseLayoutSeed> {
  const holes = layout.holes ?? [];
  if (holes.length === 0) return layout;
  const location =
    holes.find((hole) => isValidLatLng(hole.greenCentroid))?.greenCentroid ??
    (isValidLatLng(layout.location) ? layout.location : null);
  if (!location) return layout;

  const work = (async () => {
    const overlay = await fetchOsmOverlay(
      {
        courseId: layout.apiId,
        location,
        radiusM: 1800,
      },
      deps,
    );
    if (!overlay) return layout;
    return {
      ...layout,
      holes: holes.map((hole) => {
        const green = isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
        if (green) {
          rememberOsmOverlay({ courseId: layout.apiId, holeNumber: hole.number, green }, overlay);
        }
        if (isValidLatLng(hole.teeCentroid)) {
          if (green) {
            rememberResolvedTee({ courseId: layout.apiId, holeNumber: hole.number, green }, hole.teeCentroid);
          }
          return hole;
        }
        const tee = resolveOverlayTee(overlay, hole.number, green);
        if (tee && green) {
          rememberResolvedTee({ courseId: layout.apiId, holeNumber: hole.number, green }, tee);
        }
        return { ...hole, teeCentroid: tee };
      }),
    };
  })();

  const timeoutMs = deps.timeoutMs;
  if (timeoutMs == null || timeoutMs <= 0) return work;
  return Promise.race([
    work,
    new Promise<CourseLayoutSeed>((resolve) => {
      setTimeout(() => resolve(layout), timeoutMs);
    }),
  ]);
}
