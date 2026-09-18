import { featureCentroid } from '../domain/catchUpMap';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { OsmFeature, OsmGolfKind, OsmOverlay, OsmOverlayHook, OsmOverlayQuery } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_HOLE_RADIUS_M = 400;
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

export const osmOverlayHook: OsmOverlayHook = {
  fetchCourseOverlay: (query) => fetchOsmOverlay(query),
};
