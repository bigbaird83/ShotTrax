import { featureCentroid } from '../domain/catchUpMap';
import { haversineYards } from '../domain/haversine';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { getCourseProxyHost, OSM_OVERLAY_PROXY_PATH } from './config';
import type { CourseLayoutSeed } from './layout';
import {
  courseOsmOverlayFromRecord,
  listCourseOsmOverlays,
  loadCourseOsmOverlay,
} from './osmOverlayStore';
import type { OsmFeature, OsmGolfKind, OsmOverlay, OsmOverlayHook, OsmOverlayQuery } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_HOLE_RADIUS_M = 1000;
const DEFAULT_COURSE_RADIUS_M = 1200;
/** One query around the course / green centroid. Same radius as layout tee fill. */
export const COURSE_OSM_OVERLAY_RADIUS_M = 1800;
const OVERPASS_RETRY_DELAY_MS = 500;
/** Scorecard surfaces. Hole framing still uses only these. */
const PLAY_KINDS = new Set<OsmGolfKind>(['green', 'fairway', 'tee', 'hole']);
/**
 * Hazard and cart-path tags with real OSM volume (taginfo, 2026-09-24):
 * bunker ~719k, cartpath ~224k (about a third also `highway=service`),
 * water_hazard ~54k, lateral_water_hazard ~18k.
 * Not queried: `golf=hazard` (~13), bare `highway=service`, bare `natural=water`.
 */
const AREA_HAZARD_KINDS = new Set<OsmGolfKind>(['bunker', 'water_hazard', 'lateral_water_hazard']);
const OSM_KINDS = new Set<OsmGolfKind>([
  ...PLAY_KINDS,
  ...AREA_HAZARD_KINDS,
  'cartpath',
]);

export type OsmOverlayDeps = {
  fetch?: typeof fetch;
  overpassUrl?: string;
  /** Delay before the single retry. Tests pass 0. */
  retryDelayMs?: number;
  /**
   * Share-sync Worker host, same base as GCA Pro and golfapi.
   * Default is `getCourseProxyHost()`. Null skips the Worker and asks Overpass.
   */
  getBaseUrl?: () => string | null;
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
  // `golf=cartpath` already covers ways that are also `highway=service`.
  // A service road or pond with no golf overlay tag is not a cart path or hazard.
  return OSM_KINDS.has(golf as OsmGolfKind) ? (golf as OsmGolfKind) : null;
}

function coordinatesClosed(coordinates: LatLng[]): boolean {
  if (coordinates.length < 4) return false;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return Math.abs(first.lat - last.lat) < 1e-7 && Math.abs(first.lng - last.lng) < 1e-7;
}

/**
 * Hole lines and cart paths are strokes. Hazard areas fill only when OSM closed the ring.
 * Open hazard ways stay lines so the map does not invent a closing edge.
 * Green / fairway / tee stay polygons, including short rings, as before.
 */
export function osmFeatureRendersAsLine(feature: Pick<OsmFeature, 'kind' | 'coordinates'>): boolean {
  if (feature.kind === 'hole' || feature.kind === 'cartpath') return true;
  if (AREA_HAZARD_KINDS.has(feature.kind)) return !coordinatesClosed(feature.coordinates);
  return false;
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
  const play = overlay.features.filter((feature) => PLAY_KINDS.has(feature.kind));
  const numberedPlay = play.filter((feature) => feature.holeNumber === holeNumber);
  // Unmapped hole refs: show unnumbered play surfaces in the query bbox, never invent.
  const playForHole =
    numberedPlay.length > 0 ? numberedPlay : play.filter((feature) => feature.holeNumber == null);
  // Bunkers and cart paths are almost never hole-numbered. Keep them when OSM sent them
  // for this hole or with no hole ref. A ref for a different hole stays off this hole.
  const hazards = overlay.features.filter(
    (feature) =>
      !PLAY_KINDS.has(feature.kind) &&
      (feature.holeNumber === holeNumber || feature.holeNumber == null),
  );
  return [...playForHole, ...hazards];
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
  way["golf"="bunker"](around:${r},${lat},${lng});
  way["golf"="water_hazard"](around:${r},${lat},${lng});
  way["golf"="lateral_water_hazard"](around:${r},${lat},${lng});
  way["golf"="cartpath"](around:${r},${lat},${lng});
  relation["golf"="green"](around:${r},${lat},${lng});
  relation["golf"="fairway"](around:${r},${lat},${lng});
  relation["golf"="tee"](around:${r},${lat},${lng});
  relation["golf"="bunker"](around:${r},${lat},${lng});
  relation["golf"="water_hazard"](around:${r},${lat},${lng});
  relation["golf"="lateral_water_hazard"](around:${r},${lat},${lng});
);
out geom;`;
}

function overlayFromPayload(json: unknown, holeNumber: number | undefined): OsmOverlay | null {
  const overlay = parseOverpassOverlay(json);
  if (!overlay) return null;
  if (holeNumber == null) return overlay;
  const features = featuresForHole(overlay, holeNumber);
  return features.length > 0 ? { ...overlay, features } : null;
}

function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const WORKER_RADIUS_MIN_M = 200;
const WORKER_RADIUS_MAX_M = 2000;

function workerOverlayRadiusM(radiusM: number): number {
  const rounded = Math.round(radiusM);
  if (!Number.isFinite(rounded)) return WORKER_RADIUS_MIN_M;
  return Math.max(WORKER_RADIUS_MIN_M, Math.min(WORKER_RADIUS_MAX_M, rounded));
}

function workerErrorCode(json: unknown): string | null {
  const error = asRecord(json)?.error;
  return typeof error === 'string' ? error : null;
}

type WorkerFetch = { kind: 'skip' } | { kind: 'overlay'; overlay: OsmOverlay | null } | { kind: 'busy' };

/**
 * OSM course overlay (golf=green/fairway/tee/hole, plus bunker, water hazard, and cartpath).
 * Returns null when there is no location, the query fails, or OSM has nothing —
 * never invents GeoJSON. Bare service roads and untagged water are not overlays.
 * OSM par tags are ignored (par comes from course API only).
 * When the share-sync Worker is configured, ask it first. A definitive miss
 * (`no_overlay`) or a busy Worker (`upstream_busy`) is not sent on to Overpass.
 * Anything else falls back to a direct Overpass request.
 * One retry with backoff on Worker busy, Overpass 429 or 504, or a thrown timeout / network error.
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
  const retryDelayMs = deps.retryDelayMs ?? OVERPASS_RETRY_DELAY_MS;
  const courseId = q.courseId?.trim() ?? '';

  const readWorker = async (): Promise<WorkerFetch> => {
    const base = (deps.getBaseUrl ?? getCourseProxyHost)();
    const host = base?.trim().replace(/\/+$/, '') ?? '';
    if (!host || !courseId) return { kind: 'skip' };
    const radius = workerOverlayRadiusM(radiusM);
    const params = new URLSearchParams({
      courseId,
      lat: String(location.lat),
      lng: String(location.lng),
      radius: String(radius),
    });
    try {
      const res = await fetchImpl(`${host}${OSM_OVERLAY_PROXY_PATH}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      let json: unknown = undefined;
      if (res.status === 200 || res.status === 404 || res.status === 503) {
        try {
          json = await res.json();
        } catch {
          json = undefined;
        }
      }
      const error = workerErrorCode(json);
      if (res.status === 404 && error === 'no_overlay') return { kind: 'overlay', overlay: null };
      if (res.status === 503 && error === 'upstream_busy') return { kind: 'busy' };
      if (res.ok && json !== undefined) return { kind: 'overlay', overlay: overlayFromPayload(json, q.holeNumber) };
      return { kind: 'skip' };
    } catch {
      return { kind: 'skip' };
    }
  };

  const overpassAttempt = async (): Promise<{ overlay: OsmOverlay | null; retry: boolean }> => {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: `data=${encodeURIComponent(overpassQuery(location, radiusM))}`,
      });
      if (res.status === 429 || res.status === 504) return { overlay: null, retry: true };
      if (!res.ok) return { overlay: null, retry: false };
      try {
        const json: unknown = await res.json();
        return { overlay: overlayFromPayload(json, q.holeNumber), retry: false };
      } catch {
        return { overlay: null, retry: false };
      }
    } catch {
      return { overlay: null, retry: true };
    }
  };

  const firstWorker = await readWorker();
  if (firstWorker.kind === 'overlay') return firstWorker.overlay;
  if (firstWorker.kind === 'busy') {
    await waitMs(retryDelayMs);
    const secondWorker = await readWorker();
    if (secondWorker.kind === 'overlay') return secondWorker.overlay;
    if (secondWorker.kind === 'busy') return null;
  }

  const first = await overpassAttempt();
  if (!first.retry) return first.overlay;
  await waitMs(retryDelayMs);
  const second = await overpassAttempt();
  return second.overlay;
}

const overlayCache = new Map<string, OsmOverlay>();
const teeCache = new Map<string, LatLng>();
/** Full course overlay for this session, keyed by course id. Not persisted here. */
const courseWide = new Map<string, OsmOverlay>();
/** Course ids already asked this session. A miss is not stored as overlay data. */
const sessionFetched = new Set<string>();
const inflight = new Map<string, Promise<OsmOverlay | null>>();

function holeOverlayKey(courseId: string | null | undefined, holeNumber: number): string {
  return `${courseId?.trim() ?? ''}:${holeNumber}`;
}

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

function sliceOverlay(overlay: OsmOverlay, holeNumber: number): OsmOverlay | null {
  const features = featuresForHole(overlay, holeNumber);
  if (features.length === 0) return null;
  const sameFeatures =
    features.length === overlay.features.length &&
    features.every((feature, index) => feature === overlay.features[index]);
  return sameFeatures ? overlay : { source: 'osm', features, geojson: null };
}

/**
 * Hole overlay from memory, then the session course overlay, then the on-device
 * store. Key is course id + hole. Green coordinates are not part of the key, so
 * a slightly different green still hits. Hydrates the hole cache on a store hit.
 */
export function cachedOsmOverlay(args: {
  courseId?: string | null;
  holeNumber: number;
  green: LatLng | null;
}): OsmOverlay | null {
  void args.green;
  const key = holeOverlayKey(args.courseId, args.holeNumber);
  const hit = overlayCache.get(key);
  if (hit) return hit;

  const courseId = args.courseId?.trim() ?? '';
  if (!courseId) return null;

  let course = courseWide.get(courseId) ?? null;
  if (!course) {
    const stored = loadCourseOsmOverlay(courseId);
    if (!stored) return null;
    course = courseOsmOverlayFromRecord(stored);
    adoptCourseOverlay(courseId, course);
  }
  const existing = overlayCache.get(key);
  if (existing) return existing;
  const sliced = sliceOverlay(course, args.holeNumber);
  if (sliced) overlayCache.set(key, sliced);
  return sliced;
}

export function rememberOsmOverlay(
  args: {
    courseId?: string | null;
    holeNumber: number;
    green: LatLng | null;
  },
  overlay: OsmOverlay | null,
): void {
  void args.green;
  if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return;
  const sliced = sliceOverlay(overlay, args.holeNumber);
  if (!sliced) return;
  overlayCache.set(holeOverlayKey(args.courseId, args.holeNumber), sliced);
}

/**
 * Keep a real course-wide overlay in the session hole cache.
 * Does not persist. Empty overlays are ignored.
 */
export function adoptCourseOverlay(courseId: string | null | undefined, overlay: OsmOverlay | null): void {
  const id = courseId?.trim() ?? '';
  if (!id || !overlay || overlay.source !== 'osm' || overlay.features.length === 0) return;
  courseWide.set(id, overlay);
  for (let hole = 1; hole <= 18; hole += 1) {
    const key = holeOverlayKey(id, hole);
    if (overlayCache.has(key)) continue;
    const sliced = sliceOverlay(overlay, hole);
    if (sliced) overlayCache.set(key, sliced);
  }
}

/** Full course overlay already fetched this session, if one has real features. */
export function courseWideOsmOverlay(courseId: string | null | undefined): OsmOverlay | null {
  const id = courseId?.trim() ?? '';
  if (!id) return null;
  const overlay = courseWide.get(id) ?? null;
  if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return null;
  return overlay;
}

/** Drop one course from the session maps. The SQLite record is left alone. */
export function dropCourseOverlayMemory(courseId: string | null | undefined): void {
  const id = courseId?.trim() ?? '';
  if (!id) return;
  courseWide.delete(id);
  sessionFetched.delete(id);
  inflight.delete(id);
  for (let hole = 1; hole <= 18; hole += 1) overlayCache.delete(holeOverlayKey(id, hole));
}

/** Fill the session hole cache from the on-device store. Called once the DB is open. */
export function hydrateOsmOverlayMemory(): void {
  for (const record of listCourseOsmOverlays()) {
    adoptCourseOverlay(record.courseId, courseOsmOverlayFromRecord(record));
  }
}

function courseOverlaySettled(courseId: string): boolean {
  return courseWide.has(courseId) || sessionFetched.has(courseId) || loadCourseOsmOverlay(courseId) != null;
}

async function fetchCourseWide(
  courseId: string,
  args: { holeNumber: number; green: LatLng | null },
  query: OsmOverlayQuery,
  fetchOverlay: (query: OsmOverlayQuery) => Promise<OsmOverlay | null>,
): Promise<OsmOverlay | null> {
  try {
    const overlay = await fetchOverlay(query);
    if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return null;
    adoptCourseOverlay(courseId, overlay);
    rememberOsmOverlay({ courseId, holeNumber: args.holeNumber, green: args.green }, overlay);
    return overlay;
  } finally {
    sessionFetched.add(courseId);
    inflight.delete(courseId);
  }
}

/**
 * Stored or session course overlay, else one live course-wide query.
 * A failed or empty response is not cached as data. Later holes in this
 * session do not each call Overpass again.
 */
export async function loadCachedOrFetchCourseOverlay(
  args: {
    courseId?: string | null;
    holeNumber: number;
    green: LatLng | null;
    location?: LatLng | null;
  },
  deps: { fetchOverlay?: (query: OsmOverlayQuery) => Promise<OsmOverlay | null> } = {},
): Promise<OsmOverlay | null> {
  const cached = cachedOsmOverlay({
    courseId: args.courseId,
    holeNumber: args.holeNumber,
    green: args.green,
  });
  if (cached) return cached;

  const courseId = args.courseId?.trim() ?? '';
  if (courseId && courseOverlaySettled(courseId)) return null;

  const center = isValidLatLng(args.green)
    ? args.green
    : isValidLatLng(args.location)
      ? args.location
      : null;
  if (!center) return null;

  const fetchOverlay = deps.fetchOverlay ?? ((query: OsmOverlayQuery) => fetchOsmOverlay(query));
  const query: OsmOverlayQuery = {
    courseId: args.courseId,
    location: center,
    radiusM: COURSE_OSM_OVERLAY_RADIUS_M,
  };
  if (!courseId) {
    const overlay = await fetchOverlay(query);
    if (!overlay || overlay.source !== 'osm' || overlay.features.length === 0) return null;
    rememberOsmOverlay(args, overlay);
    return overlay;
  }

  const pending = inflight.get(courseId);
  if (pending) return pending;
  const next = fetchCourseWide(courseId, args, query, fetchOverlay);
  inflight.set(courseId, next);
  return next;
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
        radiusM: COURSE_OSM_OVERLAY_RADIUS_M,
      },
      deps,
    );
    if (!overlay) return layout;
    adoptCourseOverlay(layout.apiId, overlay);
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
