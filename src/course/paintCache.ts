import type { LatLng } from '../domain/latLng';
import { thunderbirdPaintCacheRecordBlocked } from './thunderbirdLock';

/**
 * Shared course-paint cache.
 *
 * Device: SQLite settings key `course.paint.cache` (see `src/db/repo.ts`).
 * Attached from `DbProvider` the same way as `golfapi.hydrates`. Survives
 * restarts on this phone. Reinstall wipes SQLite.
 *
 * Server: optional JSON GET/PUT host, same shape as share sync.
 *   EXPO_PUBLIC_COURSE_PAINT_CACHE_URL
 *   expo.extra.coursePaintCacheUrl  (app.config.js copies the env at build)
 * A PASS writes the record. The next resolve on any device that has the URL
 * reads it and does not call GCA Pro or golfapi again.
 *
 * Keys:
 *   id:<courseId>                         GCA / catalog id
 *   name:<normalized name>|<city>|<state> name fallback
 * One record is stored under every key it was saved with. A hit must match
 * the course name when both sides have one, so two courses never share an id.
 *
 * TODO: there is no multi-user host in this repo. When the URL is unset the
 * device cache is the only store — a second phone will buy golfapi once.
 * Point the URL at any JSON object store (PUT/GET `/{key}`). Do not add a
 * second EAS secret name for this.
 */
export const COURSE_PAINT_CACHE_SETTING_KEY = 'course.paint.cache';

export const COURSE_PAINT_CACHE_URL_NAMES = [
  'EXPO_PUBLIC_COURSE_PAINT_CACHE_URL',
  'COURSE_PAINT_CACHE_URL',
] as const;

export type CoursePaintSource = 'osm' | 'manual_verified' | 'gca' | 'golfapi';

export type CoursePaintHole = {
  hole: number;
  tee: LatLng | null;
  green: LatLng | null;
  par?: number | null;
  yards?: number | null;
};

export type CoursePaintCacheRecord = {
  v: 1;
  key: string;
  aliases: string[];
  source: CoursePaintSource;
  name: string | null;
  city: string | null;
  numHoles: number | null;
  nineByTwo: boolean;
  fetchedAt: string;
  holes: CoursePaintHole[];
};

export type CoursePaintCache = {
  get(key: string): Promise<CoursePaintCacheRecord | null>;
  put(record: CoursePaintCacheRecord): Promise<void>;
};

type PersistHooks = {
  load: () => string | null;
  save: (json: string) => void;
};

const memory = new Map<string, CoursePaintCacheRecord>();
let persist: PersistHooks | null = null;

function trim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePaintKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function coursePaintCacheKeys(course: {
  courseKey?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
}): string[] {
  const keys: string[] = [];
  const id = trim(course.courseKey);
  if (id) keys.push(`id:${id}`);
  const name = normalizePaintKeyPart(course.name);
  if (name) {
    keys.push(
      `name:${name}|${normalizePaintKeyPart(course.city)}|${normalizePaintKeyPart(course.state)}`,
    );
  }
  return keys;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePoint(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  const lat = asFinite(record.lat);
  const lng = asFinite(record.lng);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseHole(raw: unknown): CoursePaintHole | null {
  const record = asRecord(raw);
  if (!record) return null;
  const hole = asFinite(record.hole);
  if (hole == null || !Number.isInteger(hole) || hole < 1 || hole > 18) return null;
  const par = asFinite(record.par);
  const yards = asFinite(record.yards);
  return {
    hole,
    tee: parsePoint(record.tee),
    green: parsePoint(record.green),
    par: par != null && Number.isInteger(par) ? par : null,
    yards: yards != null ? yards : null,
  };
}

export function parseCoursePaintCacheRecord(raw: unknown): CoursePaintCacheRecord | null {
  const record = asRecord(raw);
  if (!record) return null;
  const key = trim(record.key);
  const source = trim(record.source);
  const fetchedAt = trim(record.fetchedAt);
  if (!key || !fetchedAt) return null;
  if (source !== 'osm' && source !== 'manual_verified' && source !== 'gca' && source !== 'golfapi') return null;
  if (!Array.isArray(record.holes)) return null;
  const holes: CoursePaintHole[] = [];
  const seen = new Set<number>();
  for (const item of record.holes) {
    const hole = parseHole(item);
    if (!hole || seen.has(hole.hole)) continue;
    seen.add(hole.hole);
    holes.push(hole);
  }
  if (holes.length === 0) return null;
  holes.sort((a, b) => a.hole - b.hole);
  const numHolesRaw = asFinite(record.numHoles);
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
    : [];
  return {
    v: 1,
    key,
    aliases,
    source,
    name: trim(record.name),
    city: trim(record.city),
    numHoles: numHolesRaw === 9 || numHolesRaw === 18 ? numHolesRaw : null,
    nineByTwo: record.nineByTwo === true,
    fetchedAt,
    holes,
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function serializeCoursePaintCache(): string {
  const records: Record<string, CoursePaintCacheRecord> = {};
  for (const [key, record] of memory) {
    records[key] = record;
  }
  return JSON.stringify({ v: 1, records });
}

function forgetPaintRecord(record: CoursePaintCacheRecord): void {
  const keys = new Set([record.key, ...record.aliases]);
  for (const key of keys) {
    if (memory.get(key) === record || memory.get(key)?.key === record.key) memory.delete(key);
  }
  flushPersist();
}

export function restoreCoursePaintCache(raw: string | null | undefined): void {
  const record = asRecord(raw ? safeJson(raw) : null);
  const rows = asRecord(record?.records);
  if (!rows) return;
  let dropped = false;
  for (const value of Object.values(rows)) {
    const parsed = parseCoursePaintCacheRecord(value);
    if (!parsed) continue;
    if (thunderbirdPaintCacheRecordBlocked(parsed)) {
      dropped = true;
      continue;
    }
    memory.set(parsed.key, parsed);
    for (const alias of parsed.aliases) memory.set(alias, parsed);
  }
  if (dropped) flushPersist();
}

function flushPersist(): void {
  persist?.save(serializeCoursePaintCache());
}

export function attachCoursePaintCachePersist(hooks: PersistHooks | null): void {
  persist = hooks;
  if (hooks) restoreCoursePaintCache(hooks.load());
}

export function resetCoursePaintCacheForTests(): void {
  memory.clear();
  persist = null;
}

export function getCoursePaintCacheUrl(): string | null {
  for (const name of COURSE_PAINT_CACHE_URL_NAMES) {
    const key = trim(process.env[name]);
    if (key) return key.replace(/\/+$/, '');
  }
  try {
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
      manifest?: { extra?: Record<string, unknown> };
    };
    const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
    return trim(extra?.coursePaintCacheUrl)?.replace(/\/+$/, '') ?? null;
  } catch {
    return null;
  }
}

export function cacheRecordMatchesCourse(
  record: CoursePaintCacheRecord,
  course: { name?: string | null; city?: string | null },
): boolean {
  const wanted = normalizePaintKeyPart(course.name);
  const stored = normalizePaintKeyPart(record.name);
  if (wanted && stored && wanted !== stored) return false;
  const wantedCity = normalizePaintKeyPart(course.city);
  const storedCity = normalizePaintKeyPart(record.city);
  if (wantedCity && storedCity && wantedCity !== storedCity) return false;
  return true;
}

async function remoteGet(
  key: string,
  deps: { fetchImpl?: typeof fetch; baseUrl?: string | null },
): Promise<CoursePaintCacheRecord | null> {
  const base = deps.baseUrl === undefined ? getCoursePaintCacheUrl() : deps.baseUrl;
  if (!base) return null;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;
  try {
    const res = await fetchImpl(`${base}/${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return parseCoursePaintCacheRecord(await res.json());
  } catch {
    return null;
  }
}

async function remotePut(
  record: CoursePaintCacheRecord,
  deps: { fetchImpl?: typeof fetch; baseUrl?: string | null },
): Promise<boolean> {
  const base = deps.baseUrl === undefined ? getCoursePaintCacheUrl() : deps.baseUrl;
  if (!base) return false;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return false;
  const keys = [record.key, ...record.aliases.filter((alias) => alias !== record.key)];
  let ok = true;
  for (const key of keys) {
    try {
      const res = await fetchImpl(`${base}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...record, key }),
      });
      if (!res.ok) ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
}

function rememberLocal(record: CoursePaintCacheRecord): void {
  const keys = new Set([record.key, ...record.aliases]);
  for (const key of keys) memory.set(key, record);
  flushPersist();
}

/** In-memory store. Tests use this so a second resolve does not touch globals. */
export function createMemoryCoursePaintCache(): CoursePaintCache {
  const records = new Map<string, CoursePaintCacheRecord>();
  return {
    async get(key: string) {
      return records.get(key) ?? null;
    },
    async put(record: CoursePaintCacheRecord) {
      const keys = new Set([record.key, ...record.aliases]);
      for (const key of keys) records.set(key, record);
    },
  };
}

/**
 * JSON GET/PUT cache. No local memory — the second resolve is a server read.
 * `baseUrl` null skips the network (device-only).
 */
export function createHttpCoursePaintCache(deps: {
  baseUrl: string | null;
  fetchImpl?: typeof fetch;
}): CoursePaintCache {
  return {
    get(key: string) {
      return remoteGet(key, deps);
    },
    async put(record: CoursePaintCacheRecord) {
      await remotePut(record, deps);
    },
  };
}

/**
 * Device memory + SQLite, then the configured JSON host.
 * Remote failures stay on the device copy. Never throws into paint.
 */
export function getSharedCoursePaintCache(): CoursePaintCache {
  return {
    async get(key: string) {
      const local = memory.get(key);
      if (local && thunderbirdPaintCacheRecordBlocked(local)) {
        forgetPaintRecord(local);
        return null;
      }
      if (local) return local;
      const remote = await remoteGet(key, {});
      if (!remote || thunderbirdPaintCacheRecordBlocked(remote)) return null;
      rememberLocal(remote);
      return remote;
    },
    async put(record: CoursePaintCacheRecord) {
      if (thunderbirdPaintCacheRecordBlocked(record)) return;
      rememberLocal(record);
      await remotePut(record, {});
    },
  };
}
