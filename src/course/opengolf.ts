import { METERS_PER_YARD } from '../config/sensing';
import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { haversineYards } from '../domain/haversine';
import { isCourseCardLatLng, isValidLatLng, type LatLng } from '../domain/latLng';
import type { LocalCourseCatalogEntry } from './catalog';
import type { CourseHydrate, CourseHydrateHole, CourseHydrateMatch } from './hydrate';
import { OPEN_GOLF_HOLE_SHARDS } from './opengolfShards';
import type { CourseSummary } from './types';

/** Readme: review / do not silently paint snaps past ~1,000 m. */
export const OPEN_GOLF_MATCH_DIST_MAX_M = 1000;

export const OPEN_GOLF_KEY_PREFIX = 'opengolf:';
export const OPEN_GOLF_FETCHED_AT = '2026-09-21T12:00:00Z';

export const OPEN_GOLF_ATTRIBUTION = [
  'OpenStreetMap contributors',
  'OpenGolf',
] as const;

/** Hand-verified hydrates. OpenGolf never overwrites these keys or identities. */
export const OPEN_GOLF_RESERVED_KEYS = [
  'cypress-creek-cabot-ar',
  'greystone-cabot-ar',
  'pleasant-valley-lr-ar',
  'thunderbird-heber-springs-ar',
  'mountain-ranch-fairfield-bay-ar',
] as const;

/** Same Nominatim pin as hydrate.ts — never a tee or green. */
const THUNDERBIRD_HEBER_CLUBHOUSE: LatLng = { lat: 35.525292, lng: -92.038355 };

export type OpenGolfHoleTuple = readonly [
  hole: number,
  par: number,
  teeLat: number,
  teeLng: number,
  greenLat: number,
  greenLng: number,
];

export type OpenGolfCourseRow = readonly [
  id: string,
  name: string,
  city: string,
  state: string,
  lat: number,
  lng: number,
  holes: readonly OpenGolfHoleTuple[],
];

export type OpenGolfPack = {
  v: 1;
  at: string;
  md: number;
  attr: readonly string[];
  c: readonly OpenGolfCourseRow[];
};

export type OpenGolfQuarantineReason =
  | 'high-match-dist'
  | 'missing-hole-number'
  | 'missing-coords'
  | 'gate-fail'
  | 'reserved-overwrite'
  | 'thunderbird-heber'
  | 'duplicate-hole'
  | 'empty-course';

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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeOpenGolfName(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function openGolfCourseKey(courseId: string): string {
  return `${OPEN_GOLF_KEY_PREFIX}${courseId.trim()}`;
}

export function isOpenGolfCourseKey(courseKey: string | null | undefined): boolean {
  return Boolean(asString(courseKey)?.startsWith(OPEN_GOLF_KEY_PREFIX));
}

export function openGolfCourseIdFromKey(courseKey: string | null | undefined): string | null {
  const key = asString(courseKey);
  if (!key?.startsWith(OPEN_GOLF_KEY_PREFIX)) return null;
  const id = key.slice(OPEN_GOLF_KEY_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function parseOpenGolfHoleNumber(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n == null) return null;
  const hole = Number.isInteger(n) ? n : Number.isInteger(Math.round(n)) && Math.abs(n - Math.round(n)) < 1e-6
    ? Math.round(n)
    : null;
  if (hole == null || hole < 1 || hole > 18) return null;
  return hole;
}

export function parseOpenGolfPar(value: unknown): number | null {
  const par = asFiniteNumber(value);
  if (par == null) return null;
  const rounded = Number.isInteger(par) ? par : Math.abs(par - Math.round(par)) < 1e-6 ? Math.round(par) : null;
  return rounded != null && rounded >= 3 && rounded <= 6 ? rounded : null;
}

/** Doc Thunderbird (Heber Springs, AR) — dump is centroid-only; never ingest or overwrite. */
export function isThunderbirdHeberOpenGolfRow(row: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  location?: LatLng | null;
}): boolean {
  const name = normalizeOpenGolfName(row.name);
  if (!/\bthunderbird\b/.test(name)) return false;
  const bag = [
    name,
    normalizeOpenGolfName(row.city),
    normalizeOpenGolfName(row.state),
  ].join(' ');
  if (/heber springs/.test(bag) || (/\bheber\b/.test(bag) && (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)))) {
    return true;
  }
  if (isCourseCardLatLng(row.location) && haversineYards(row.location, THUNDERBIRD_HEBER_CLUBHOUSE) <= 1800) {
    return true;
  }
  return false;
}

/** Existing hand-verified hydrates. OpenGolf must not replace their tee/green. */
export function isReservedOpenGolfIdentity(row: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
}): boolean {
  const name = normalizeOpenGolfName(row.name);
  const bag = [
    name,
    normalizeOpenGolfName(row.city),
    normalizeOpenGolfName(row.state),
    normalizeOpenGolfName(row.locality),
  ].join(' ');
  if (!name) return false;
  if (/\bthunderbird\b/.test(name) && (/heber springs/.test(bag) || (/\bheber\b/.test(bag) && /\bar\b/.test(bag)))) {
    return true;
  }
  if (/mountain ranch/.test(name) && /fairfield/.test(bag)) return true;
  if (/cypress creek/.test(name) && (/\bcabot\b/.test(bag) || /\bgreystone\b/.test(name))) return true;
  if (/\bgreystone\b/.test(name) && !/cypress creek/.test(name) && (/\bcabot\b/.test(bag) || /\bar\b/.test(bag))) {
    return true;
  }
  if (/pleasant valley/.test(name) && (/little rock/.test(bag) || (/\bar\b/.test(bag) && !/\bcabot\b/.test(bag)))) {
    return true;
  }
  return false;
}

export function openGolfHolePassesIngestGates(hole: {
  tee?: LatLng | null;
  green?: LatLng | null;
}): boolean {
  if (!isCourseCardLatLng(hole.tee) || !isCourseCardLatLng(hole.green)) return false;
  return decideCourseCardPaint({
    tee: hole.tee ?? null,
    green: hole.green ?? null,
    phone: null,
  }).mount;
}

function parseHoleTuple(raw: unknown): OpenGolfHoleTuple | null {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const hole = parseOpenGolfHoleNumber(raw[0]);
  const par = asFiniteNumber(raw[1]);
  const teeLat = asFiniteNumber(raw[2]);
  const teeLng = asFiniteNumber(raw[3]);
  const greenLat = asFiniteNumber(raw[4]);
  const greenLng = asFiniteNumber(raw[5]);
  if (hole == null || teeLat == null || teeLng == null || greenLat == null || greenLng == null) return null;
  const storedPar = par != null && par >= 3 && par <= 6 ? par : 0;
  const tee = { lat: teeLat, lng: teeLng };
  const green = { lat: greenLat, lng: greenLng };
  if (!openGolfHolePassesIngestGates({ tee, green })) return null;
  return [hole, storedPar, teeLat, teeLng, greenLat, greenLng];
}

export type OpenGolfCatalogRow = readonly [
  id: string,
  name: string,
  city: string,
  state: string,
  lat: number,
  lng: number,
  holeCount: number,
];

function parseCatalogRow(raw: unknown): OpenGolfCatalogRow | null {
  if (!Array.isArray(raw) || raw.length < 7) return null;
  const id = asString(raw[0]);
  const name = asString(raw[1]);
  const city = asString(raw[2]);
  const state = asString(raw[3]);
  const lat = asFiniteNumber(raw[4]);
  const lng = asFiniteNumber(raw[5]);
  const holeCount = parseOpenGolfHoleNumber(raw[6]) ?? asFiniteNumber(raw[6]);
  if (!id || !name || !city || !state || lat == null || lng == null || holeCount == null) return null;
  if (isThunderbirdHeberOpenGolfRow({ name, city, state, location: { lat, lng } })) return null;
  if (isReservedOpenGolfIdentity({ name, city, state })) return null;
  if (!isValidLatLng({ lat, lng })) return null;
  return [id, name, city, state, lat, lng, holeCount];
}

export function parseOpenGolfCatalog(raw: unknown): OpenGolfCatalogRow[] {
  const record = asRecord(raw);
  if (!record || record.v !== 1 || !Array.isArray(record.c)) return [];
  const md = asFiniteNumber(record.md);
  if (md !== OPEN_GOLF_MATCH_DIST_MAX_M) return [];
  const out: OpenGolfCatalogRow[] = [];
  const seen = new Set<string>();
  for (const item of record.c) {
    const row = parseCatalogRow(item);
    if (!row || seen.has(row[0])) continue;
    seen.add(row[0]);
    out.push(row);
  }
  return out;
}

function parseHoleShard(raw: unknown): Map<string, OpenGolfHoleTuple[]> {
  const record = asRecord(raw);
  const map = new Map<string, OpenGolfHoleTuple[]>();
  if (!record || typeof record.h !== 'object' || record.h == null || Array.isArray(record.h)) return map;
  for (const [id, tuples] of Object.entries(record.h as Record<string, unknown>)) {
    if (!Array.isArray(tuples)) continue;
    const parsed: OpenGolfHoleTuple[] = [];
    const seen = new Set<number>();
    for (const item of tuples) {
      const hole = parseHoleTuple(item);
      if (!hole || seen.has(hole[0])) continue;
      seen.add(hole[0]);
      parsed.push(hole);
    }
    if (parsed.length > 0) map.set(id, parsed.sort((a, b) => a[0] - b[0]));
  }
  return map;
}

let catalogRows: OpenGolfCatalogRow[] | null = null;
const hydrateCache = new Map<string, CourseHydrate>();
const shardCache = new Map<string, Map<string, OpenGolfHoleTuple[]>>();
let byId: Map<string, OpenGolfCatalogRow> | null = null;
let byKey: Map<string, OpenGolfCatalogRow> | null = null;
let byNameCityState: Map<string, OpenGolfCatalogRow[]> | null = null;
let catalogCache: LocalCourseCatalogEntry[] | null = null;

function nameCityStateKey(name: string, city: string, state: string): string {
  return `${normalizeOpenGolfName(name)}|${normalizeOpenGolfName(city)}|${normalizeOpenGolfName(state)}`;
}

export function resetOpenGolfPackForTests(): void {
  catalogRows = null;
  hydrateCache.clear();
  shardCache.clear();
  byId = null;
  byKey = null;
  catalogCache = null;
  byNameCityState = null;
}

function readBundledOpenGolfCatalog(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./hydrates/opengolf/catalog.json');
}

export function loadOpenGolfCatalogRows(): readonly OpenGolfCatalogRow[] {
  if (catalogRows) return catalogRows;
  catalogRows = parseOpenGolfCatalog(readBundledOpenGolfCatalog());
  return catalogRows;
}

function catalogIndexes(): {
  byId: Map<string, OpenGolfCatalogRow>;
  byKey: Map<string, OpenGolfCatalogRow>;
  byNameCityState: Map<string, OpenGolfCatalogRow[]>;
} {
  if (byId && byKey && byNameCityState) return { byId, byKey, byNameCityState };
  byId = new Map();
  byKey = new Map();
  byNameCityState = new Map();
  for (const row of loadOpenGolfCatalogRows()) {
    byId.set(row[0], row);
    byKey.set(openGolfCourseKey(row[0]), row);
    const key = nameCityStateKey(row[1], row[2], row[3]);
    const list = byNameCityState.get(key) ?? [];
    list.push(row);
    byNameCityState.set(key, list);
  }
  return { byId, byKey, byNameCityState };
}

function loadHoleShard(state: string): Map<string, OpenGolfHoleTuple[]> {
  const cached = shardCache.get(state);
  if (cached) return cached;
  const loader = OPEN_GOLF_HOLE_SHARDS[state];
  const parsed = loader ? parseHoleShard(loader()) : new Map<string, OpenGolfHoleTuple[]>();
  shardCache.set(state, parsed);
  return parsed;
}

function catalogRowToCourseRow(row: OpenGolfCatalogRow): OpenGolfCourseRow | null {
  const holes = loadHoleShard(row[3]).get(row[0]);
  if (!holes || holes.length === 0) return null;
  return [row[0], row[1], row[2], row[3], row[4], row[5], holes];
}

/** Full pack view for smoke/tests — lazy-loads shards as rows are read. */
export function loadOpenGolfPack(): OpenGolfPack | null {
  const rows = loadOpenGolfCatalogRows();
  if (rows.length === 0) return null;
  const courses: OpenGolfCourseRow[] = [];
  for (const row of rows) {
    const full = catalogRowToCourseRow(row);
    if (full) courses.push(full);
  }
  return {
    v: 1,
    at: OPEN_GOLF_FETCHED_AT,
    md: OPEN_GOLF_MATCH_DIST_MAX_M,
    attr: OPEN_GOLF_ATTRIBUTION,
    c: courses,
  };
}

export function openGolfRowToHydrate(row: OpenGolfCourseRow): CourseHydrate | null {
  const key = openGolfCourseKey(row[0]);
  const cached = hydrateCache.get(key);
  if (cached) return cached;
  const holes: CourseHydrateHole[] = row[6].map((hole) => ({
    hole: hole[0],
    par: hole[1] >= 3 && hole[1] <= 6 ? hole[1] : null,
    yards: null,
    tee: { lat: hole[2], lng: hole[3], label: 'default' },
    green: { lat: hole[4], lng: hole[5] },
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
    greenWidthYards: null,
  }));
  const parsed: CourseHydrate = {
    courseKey: key,
    displayName: row[1],
    locality: `${row[2]}, ${row[3]}`,
    source: 'osm',
    sourceRef: `opengolf-osm ${row[0]}; OSM golf=hole centerline first/last node; one rep tee + green surface center; match_dist_m<=${OPEN_GOLF_MATCH_DIST_MAX_M}; never daily pins`,
    fetchedAt: OPEN_GOLF_FETCHED_AT,
    holes,
  };
  hydrateCache.set(key, parsed);
  return parsed;
}

export function loadOpenGolfHydrate(courseKey: string | null | undefined): CourseHydrate | null {
  const id = openGolfCourseIdFromKey(courseKey) ?? asString(courseKey);
  if (!id) return null;
  const { byId, byKey } = catalogIndexes();
  const catalog = byKey.get(id) ?? byId.get(id) ?? null;
  if (!catalog) return null;
  const row = catalogRowToCourseRow(catalog);
  return row ? openGolfRowToHydrate(row) : null;
}

export function resolveOpenGolfHydrateKey(course: CourseHydrateMatch): string | null {
  if (isThunderbirdHeberOpenGolfRow({
    name: course.name,
    city: course.city,
    state: course.state ?? course.locality,
    location: course.location,
  })) {
    return null;
  }
  if (isReservedOpenGolfIdentity(course)) return null;
  const { byId, byKey, byNameCityState } = catalogIndexes();
  const direct = asString(course.courseKey);
  if (direct) {
    if (byKey.has(direct)) return direct;
    if (byId.has(direct)) return openGolfCourseKey(direct);
    const fromKey = openGolfCourseIdFromKey(direct);
    if (fromKey && byId.has(fromKey)) return openGolfCourseKey(fromKey);
  }
  const name = asString(course.name);
  const city = asString(course.city);
  const state = asString(course.state);
  if (name && city && state) {
    const hits = byNameCityState.get(nameCityStateKey(name, city, state)) ?? [];
    if (hits.length === 1) return openGolfCourseKey(hits[0][0]);
  }
  if (name && city) {
    const needle = `${normalizeOpenGolfName(name)}|${normalizeOpenGolfName(city)}|`;
    const hits: OpenGolfCatalogRow[] = [];
    for (const [key, rows] of byNameCityState) {
      if (key.startsWith(needle)) hits.push(...rows);
    }
    if (hits.length === 1) return openGolfCourseKey(hits[0][0]);
  }
  if (isCourseCardLatLng(course.location)) {
    const hits: OpenGolfCatalogRow[] = [];
    for (const row of loadOpenGolfCatalogRows()) {
      const loc = { lat: row[4], lng: row[5] };
      if (haversineYards(course.location, loc) <= 1800) hits.push(row);
    }
    if (hits.length === 1 && !isReservedOpenGolfIdentity({
      name: hits[0][1],
      city: hits[0][2],
      state: hits[0][3],
    })) {
      return openGolfCourseKey(hits[0][0]);
    }
  }
  return null;
}

export function openGolfRowToCatalogEntry(row: OpenGolfCatalogRow | OpenGolfCourseRow): LocalCourseCatalogEntry {
  const holeCount = Array.isArray(row[6])
    ? row[6].reduce((max, hole) => Math.max(max, hole[0]), 0)
    : row[6];
  return {
    id: `local:${openGolfCourseKey(row[0])}`,
    courseKey: openGolfCourseKey(row[0]),
    name: row[1],
    club: row[1],
    city: row[2],
    state: row[3],
    country: 'US',
    locality: `${row[2]}, ${row[3]}`,
    location: { lat: row[4], lng: row[5] },
    holeCount,
    aliases: [],
  };
}

export function openGolfCatalogEntries(): readonly LocalCourseCatalogEntry[] {
  if (catalogCache) return catalogCache;
  catalogCache = loadOpenGolfCatalogRows().map((row) => openGolfRowToCatalogEntry(row));
  return catalogCache;
}

export function openGolfCatalogEntryById(id: string | null | undefined): LocalCourseCatalogEntry | null {
  const value = id?.trim() ?? '';
  if (!value) return null;
  return openGolfCatalogEntries().find((entry) => entry.id === value || entry.courseKey === value) ?? null;
}

function catalogBag(entry: LocalCourseCatalogEntry): string {
  return [entry.name, entry.club, entry.city, entry.state, entry.locality, ...entry.aliases]
    .map((part) => normalizeOpenGolfName(part))
    .join(' ');
}

export function searchOpenGolfCatalog(query: string): CourseSummary[] {
  const tokens = normalizeOpenGolfName(query).split(' ').filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  const out: CourseSummary[] = [];
  for (const entry of openGolfCatalogEntries()) {
    const bag = catalogBag(entry);
    if (!tokens.every((token) => bag.includes(token))) continue;
    out.push({
      id: entry.id,
      name: entry.name,
      club: entry.club,
      city: entry.city,
      state: entry.state,
      country: entry.country,
      location: entry.location,
      distanceMeters: null,
    });
  }
  return out;
}

export function nearbyOpenGolfCatalog(from: LatLng, radiusKm: number): CourseSummary[] {
  if (!isValidLatLng(from)) return [];
  const radiusM = Math.max(1000, radiusKm * 1000);
  const out: CourseSummary[] = [];
  for (const entry of openGolfCatalogEntries()) {
    const meters = haversineYards(from, entry.location) * METERS_PER_YARD;
    if (meters <= radiusM) {
      out.push({
        id: entry.id,
        name: entry.name,
        club: entry.club,
        city: entry.city,
        state: entry.state,
        country: entry.country,
        location: entry.location,
        distanceMeters: Math.round(meters),
      });
    }
  }
  return out;
}

export function signalLabOpenGolfIngest(): {
  centerlineOnly: true;
  neverInventDailyPins: true;
  neverOverwriteThunderbirdHeber: true;
  quarantineHighMatchDist: true;
  matchDistMaxM: typeof OPEN_GOLF_MATCH_DIST_MAX_M;
  emptyStaysMiss: true;
  odblShareAlike: true;
} {
  return {
    centerlineOnly: true,
    neverInventDailyPins: true,
    neverOverwriteThunderbirdHeber: true,
    quarantineHighMatchDist: true,
    matchDistMaxM: OPEN_GOLF_MATCH_DIST_MAX_M,
    emptyStaysMiss: true,
    odblShareAlike: true,
  };
}
