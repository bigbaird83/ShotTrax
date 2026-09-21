import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { haversineYards } from '../domain/haversine';
import { isCourseCardLatLng, type LatLng } from '../domain/latLng';
import type { CourseHydrate, CourseHydrateHole, CourseHydrateMatch, CourseHydrateTee } from './hydrate';

export const GOLFAPI_BASE = 'https://golfapi.io/api/v2.3';
export const GOLFAPI_CACHE_SETTING_KEY = 'golfapi.hydrates';
export const GOLFAPI_KEY_PREFIX = 'golfapi:';

export const GOLFAPI_KEY_NAMES = [
  'GOLFAPI_KEY',
  'EXPO_PUBLIC_GOLFAPI_KEY',
  'GOLF_API_IO_KEY',
  'EXPO_PUBLIC_GOLF_API_IO_KEY',
] as const;

type GolfApiCoord = {
  poi: number;
  location: number;
  hole: number;
  lat: number;
  lng: number;
};

type GolfApiTeeSet = {
  name: string;
  lengths: number[];
};

export type GolfApiFetchDeps = {
  fetchImpl?: typeof fetch;
  now?: () => string;
  /**
   * Skip the on-device golfapi blob. Used when that blob was already tried
   * in this resolve and failed sanity, so last resort can buy a fresh card.
   * A passing cache hit must not set this.
   */
  skipCache?: boolean;
};

type PersistHooks = {
  load: () => string | null;
  save: (json: string) => void;
};

const memory = new Map<string, CourseHydrate>();
const aliasToKey = new Map<string, string>();
let persist: PersistHooks | null = null;

function trimKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extraGolfApiKey(): string | null {
  try {
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
      manifest?: { extra?: Record<string, unknown> };
    };
    return (
      trimKey(Constants.expoConfig?.extra?.golfApiKey) ??
      trimKey(Constants.manifest?.extra?.golfApiKey)
    );
  } catch {
    return null;
  }
}

/** Optional golfapi.io key. Absent → no fetch, never invent. */
export function getGolfApiKey(): string | null {
  for (const name of GOLFAPI_KEY_NAMES) {
    const key = trimKey(process.env[name]);
    if (key) return key;
  }
  return extraGolfApiKey();
}

export function golfApiCourseKey(courseId: string): string {
  return `${GOLFAPI_KEY_PREFIX}${courseId.trim()}`;
}

export function normalizeGolfApiName(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function golfApiNameCityKey(name: string | null | undefined, city: string | null | undefined): string | null {
  const n = normalizeGolfApiName(name);
  const c = normalizeGolfApiName(city);
  if (!n) return null;
  return `namecity:${n}|${c}`;
}

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

function pointPassesGates(tee: LatLng | null, green: LatLng | null): boolean {
  if (!isCourseCardLatLng(tee) || !isCourseCardLatLng(green)) return false;
  return decideCourseCardPaint({ tee, green, phone: null }).mount;
}

function parseCoord(raw: unknown): GolfApiCoord | null {
  const record = asRecord(raw);
  if (!record) return null;
  const poi = asFiniteNumber(record.poi);
  const location = asFiniteNumber(record.location);
  const hole = asFiniteNumber(record.hole);
  const lat = asFiniteNumber(record.latitude ?? record.lat);
  const lng = asFiniteNumber(record.longitude ?? record.lng);
  if (
    poi == null ||
    location == null ||
    hole == null ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    lat == null ||
    lng == null
  ) {
    return null;
  }
  const point = { lat, lng };
  if (!isCourseCardLatLng(point)) return null;
  return { poi, location, hole, lat, lng };
}

function parseTeeSets(raw: unknown): GolfApiTeeSet[] {
  if (!Array.isArray(raw)) return [];
  const out: GolfApiTeeSet[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const name = trimKey(record.teeName) ?? trimKey(record.tee_name) ?? 'default';
    const lengths: number[] = [];
    let any = false;
    for (let n = 1; n <= 18; n += 1) {
      const yards = asFiniteNumber(record[`length${n}`]) ?? 0;
      lengths.push(yards > 0 ? yards : 0);
      if (yards > 0) any = true;
    }
    if (!any) continue;
    out.push({ name, lengths });
  }
  return out;
}

function pickTee(
  candidates: LatLng[],
  green: LatLng,
  hole: number,
  teeSets: GolfApiTeeSet[],
): { tee: CourseHydrateTee } | null {
  if (candidates.length === 0) return null;
  const preferred =
    teeSets.find((set) => /blue/i.test(set.name) && (set.lengths[hole - 1] ?? 0) > 0) ??
    teeSets.find((set) => (set.lengths[hole - 1] ?? 0) > 0) ??
    null;
  const target = preferred?.lengths[hole - 1] ?? 0;
  let chosen = candidates[0];
  if (target > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const delta = Math.abs(haversineYards(candidate, green) - target);
      if (delta < best) {
        best = delta;
        chosen = candidate;
      }
    }
  } else {
    let best = -1;
    for (const candidate of candidates) {
      const span = haversineYards(candidate, green);
      if (span > best) {
        best = span;
        chosen = candidate;
      }
    }
  }
  if (!pointPassesGates(chosen, green)) return null;
  return { tee: { lat: chosen.lat, lng: chosen.lng, label: preferred?.name ?? 'default' } };
}

function isCoursePin(point: LatLng, clubhouse: LatLng | null): boolean {
  if (!clubhouse || !isCourseCardLatLng(clubhouse)) return false;
  return haversineYards(point, clubhouse) < 5;
}

/** Map golfapi.io course + coordinates into a hydrate. Thin / missing GPS → null. Never invents. */
export function mapGolfApiCourseToHydrate(args: {
  course: unknown;
  coordinates: unknown;
  fetchedAt?: string;
}): CourseHydrate | null {
  const course = asRecord(args.course);
  if (!course) return null;
  const courseId = trimKey(course.courseID) ?? trimKey(course.courseId);
  const displayName =
    trimKey(course.clubName) ?? trimKey(course.courseName) ?? trimKey(course.name);
  const city = trimKey(course.city);
  const state = trimKey(course.state);
  if (!courseId || !displayName) return null;
  const locality = [city, state].filter(Boolean).join(', ') || displayName;
  const clubhouseLat = asFiniteNumber(course.latitude);
  const clubhouseLng = asFiniteNumber(course.longitude);
  const clubhouse =
    clubhouseLat != null && clubhouseLng != null ? { lat: clubhouseLat, lng: clubhouseLng } : null;
  const payload = asRecord(args.coordinates);
  const rows = Array.isArray(args.coordinates)
    ? args.coordinates
    : Array.isArray(payload?.coordinates)
      ? payload.coordinates
      : [];
  const coords = rows.map(parseCoord).filter((row): row is GolfApiCoord => row != null);
  if (coords.length === 0) return null;
  const teeSets = parseTeeSets(course.tees);
  const pars = Array.isArray(course.parsMen) ? course.parsMen : [];
  const holes: CourseHydrateHole[] = [];
  const seen = new Set<number>();
  for (let n = 1; n <= 18; n += 1) {
    const holeCoords = coords.filter((row) => row.hole === n);
    const greenRow = holeCoords.find((row) => row.poi === 1 && row.location === 2);
    if (!greenRow) continue;
    const green = { lat: greenRow.lat, lng: greenRow.lng };
    if (isCoursePin(green, clubhouse)) continue;
    const teeCandidates = holeCoords
      .filter((row) => (row.poi === 11 || row.poi === 12) && row.location === 2)
      .map((row) => ({ lat: row.lat, lng: row.lng }))
      .filter((point) => !isCoursePin(point, clubhouse));
    const picked = pickTee(teeCandidates, green, n, teeSets);
    if (!picked) continue;
    const parRaw = asFiniteNumber(pars[n - 1]);
    const par = parRaw != null && Number.isInteger(parRaw) && parRaw >= 3 && parRaw <= 6 ? parRaw : null;
    seen.add(n);
    holes.push({
      hole: n,
      par,
      yards: teeSets.find((set) => set.name === picked.tee.label)?.lengths[n - 1] ?? null,
      tee: picked.tee,
      green,
      greenFront: null,
      greenBack: null,
      greenDepthYards: null,
      greenWidthYards: null,
    });
  }
  if (holes.length === 0) return null;
  const numHolesRaw = asFiniteNumber(course.numHoles ?? course.num_holes);
  const numHoles = numHolesRaw === 9 || numHolesRaw === 18 ? numHolesRaw : null;
  return {
    courseKey: golfApiCourseKey(courseId),
    displayName,
    locality,
    source: 'golfapi',
    sourceRef: `golfapi.io courseID=${courseId} club=${displayName} coords=${coords.length} runtime`,
    fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    numHoles,
    holes,
  };
}

function rememberAliases(hydrate: CourseHydrate, aliases: string[]): void {
  memory.set(hydrate.courseKey, hydrate);
  for (const alias of aliases) {
    const key = trimKey(alias);
    if (!key) continue;
    aliasToKey.set(key, hydrate.courseKey);
    memory.set(key, hydrate);
  }
}

export function serializeGolfApiCache(): string {
  const unique = new Map<string, CourseHydrate>();
  for (const hydrate of memory.values()) unique.set(hydrate.courseKey, hydrate);
  return JSON.stringify({
    aliases: Object.fromEntries(aliasToKey),
    hydrates: Object.fromEntries(unique),
  });
}

export function restoreGolfApiCache(raw: string | null | undefined): void {
  const record = asRecord(raw ? safeJson(raw) : null);
  if (!record) return;
  const hydrates = asRecord(record.hydrates);
  const aliases = asRecord(record.aliases);
  if (hydrates) {
    for (const [key, value] of Object.entries(hydrates)) {
      const hydrate = value as CourseHydrate;
      if (hydrate?.courseKey && Array.isArray(hydrate.holes) && hydrate.holes.length > 0) {
        memory.set(key, hydrate);
        memory.set(hydrate.courseKey, hydrate);
      }
    }
  }
  if (aliases) {
    for (const [alias, key] of Object.entries(aliases)) {
      if (typeof key === 'string' && memory.has(key)) aliasToKey.set(alias, key);
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function flushPersist(): void {
  persist?.save(serializeGolfApiCache());
}

export function attachGolfApiCachePersist(hooks: PersistHooks | null): void {
  persist = hooks;
  if (hooks) restoreGolfApiCache(hooks.load());
}

export function resetGolfApiCacheForTests(): void {
  memory.clear();
  aliasToKey.clear();
  persist = null;
}

export function saveCachedGolfApiHydrate(hydrate: CourseHydrate, aliases: string[] = []): void {
  if (!hydrate.holes.length) return;
  rememberAliases(hydrate, aliases);
  flushPersist();
}

export function loadCachedGolfApiHydrate(courseKey: string | null | undefined): CourseHydrate | null {
  const key = trimKey(courseKey);
  if (!key) return null;
  return memory.get(key) ?? (aliasToKey.has(key) ? memory.get(aliasToKey.get(key) ?? '') ?? null : null);
}

/** Same on-device cache. Names match the runtime hydrate brief. */
export const loadCachedHydrate = loadCachedGolfApiHydrate;
export const saveCachedHydrate = saveCachedGolfApiHydrate;

export function resolveGolfApiHydrateKey(course: CourseHydrateMatch): string | null {
  const courseKey = trimKey(course.courseKey);
  if (courseKey && (memory.has(courseKey) || aliasToKey.has(courseKey))) {
    return aliasToKey.get(courseKey) ?? courseKey;
  }
  const nameCity = golfApiNameCityKey(course.name, course.city ?? course.locality);
  if (nameCity && (memory.has(nameCity) || aliasToKey.has(nameCity))) {
    return aliasToKey.get(nameCity) ?? nameCity;
  }
  return null;
}

async function golfApiGet(
  path: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  const res = await fetchImpl(`${GOLFAPI_BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function searchHits(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
  const record = asRecord(raw);
  const rows = record?.courses ?? record?.data ?? record?.results;
  if (!Array.isArray(rows)) return record ? [record] : [];
  return rows.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
}

function courseMatchesHit(course: CourseHydrateMatch, hit: Record<string, unknown>): boolean {
  const name = normalizeGolfApiName(course.name);
  const hitName = normalizeGolfApiName(
    trimKey(hit.clubName) ?? trimKey(hit.courseName) ?? trimKey(hit.name),
  );
  if (!name || !hitName) return false;
  const tokens = name.split(' ').filter((token) => token.length > 2);
  if (tokens.length === 0) return hitName === name;
  if (!tokens.every((token) => hitName.includes(token))) return false;
  const city = normalizeGolfApiName(course.city);
  const hitCity = normalizeGolfApiName(trimKey(hit.city));
  if (city && hitCity && city !== hitCity) return false;
  return true;
}

/**
 * Search + course + coordinates. No key / miss / thin → null.
 * Last-resort paint source — the waterfall calls this only after OSM/OpenGolf
 * and GCA Pro both hard-miss. Never invents tee/green. Cache hit skips the network.
 */
export async function fetchGolfApiHydrate(
  course: CourseHydrateMatch,
  deps: GolfApiFetchDeps = {},
): Promise<CourseHydrate | null> {
  if (!deps.skipCache) {
    const cachedKey = resolveGolfApiHydrateKey(course);
    const cached = loadCachedGolfApiHydrate(cachedKey ?? course.courseKey);
    if (cached && cached.holes.length > 0) return cached;
  }

  const key = getGolfApiKey();
  if (!key) return null;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const q = [course.name, course.city, course.state].filter((part) => trimKey(part)).join(' ');
  if (!q) return null;
  const search = await golfApiGet(`/courses?country=US&q=${encodeURIComponent(q)}`, key, fetchImpl);
  const hit = searchHits(search).find((row) => courseMatchesHit(course, row)) ?? null;
  const courseId = trimKey(hit?.courseID) ?? trimKey(hit?.courseId);
  if (!courseId) return null;

  const detail = (await golfApiGet(`/courses/${encodeURIComponent(courseId)}`, key, fetchImpl)) ?? hit;
  const coordinates = await golfApiGet(`/coordinates/${encodeURIComponent(courseId)}`, key, fetchImpl);
  const hydrate = mapGolfApiCourseToHydrate({
    course: detail,
    coordinates,
    fetchedAt: deps.now?.() ?? new Date().toISOString(),
  });
  if (!hydrate) return null;
  const aliases = [
    golfApiCourseKey(courseId),
    golfApiNameCityKey(course.name, course.city),
    golfApiNameCityKey(hydrate.displayName, course.city),
    trimKey(course.courseKey),
  ].filter((value): value is string => Boolean(value));
  saveCachedGolfApiHydrate(hydrate, aliases);
  return hydrate;
}
