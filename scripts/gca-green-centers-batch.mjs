#!/usr/bin/env node
/**
 * Nightly Golf Courses API Pro green-centers batch puller.
 *
 * GET https://golfcoursesapi.com/api/v1/courses/:id/green-centers
 * Bearer GOLF_COURSES_API_KEY (same name as EAS). Read-only. Never invents greens.
 *
 * Queue: AR / Doc belt first (Heber Springs, Fairfield Bay, Little Rock /
 * Magnolia, Cypress Creek, Greystone, Pleasant Valley), then rest of US.
 * Only persist parsed green-center rows. Skip empties / 403 / missing.
 * OSM / HARD-MISS stay for courses with no Pro greens (Thunderbird pins
 * are never invented).
 *
 * Nightly cap default 350 courses (see DEFAULT_NIGHTLY_CAP). Override with
 * GCA_GREENS_BATCH_CAP. Logs status counts only — never keys or PII payloads.
 *
 *   npm run gca:greens-batch
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isTlsFailure, readKey } from './gca-green-centers-probe.mjs';

export const GCA_API_BASE = 'https://golfcoursesapi.com/api/v1';
export const TIMEOUT_MS = 15_000;
export const REQUEST_GAP_MS = 600;
export const CONSECUTIVE_403_ABORT = 5;

/**
 * Locked nightly cap (Signal / Doc: middle of 200–500).
 *
 * GCA Pro published limits: 10,000 req/day, 120/min burst (free is 30/day).
 * 350 green-center GETs plus ~10 priority searches and a few list pages is
 * ~365 requests (~4% of daily quota). 600 ms gaps stay ~100/min — under the
 * 120/min burst (200–500 ms would sit at or over that ceiling). Leaves
 * daytime quota for the app. ~7.4k advertised US greens / 350 ≈ 21 nights.
 */
export const DEFAULT_NIGHTLY_CAP = 350;

/** Clubhouse / course pins from hydrate.ts — never persist these as greens. */
export const CLUBHOUSE_DENYLIST = [
  { lat: 35.027715, lng: -92.031642, label: 'Cypress Creek Cabot' },
  { lat: 35.021, lng: -92.061, label: 'Greystone Cabot' },
  { lat: 34.78, lng: -92.411, label: 'Pleasant Valley Little Rock' },
  { lat: 35.525292, lng: -92.038355, label: 'Thunderbird Heber Springs' },
  { lat: 35.611, lng: -92.29, label: 'Mountain Ranch Fairfield Bay' },
];

/**
 * AR / Doc belt first. Queries run before US pagination.
 * Thunderbird is searched so a real Pro payload can persist under its API id;
 * the curated local catalog stays HARD-MISS and never gets invented pins.
 */
export const AR_DOC_BELT_PRIORITY = [
  { q: 'Thunderbird Heber Springs', label: 'Heber Springs — Thunderbird' },
  { q: 'Heber Springs AR', label: 'Heber Springs' },
  { q: 'Mountain Ranch Fairfield Bay', label: 'Fairfield Bay — Mountain Ranch' },
  { q: 'Fairfield Bay AR', label: 'Fairfield Bay' },
  { q: 'Cypress Creek Cabot', label: 'Cabot — Cypress Creek' },
  { q: 'Greystone Cabot', label: 'Cabot — Greystone' },
  { q: 'Cabot AR', label: 'Cabot' },
  { q: 'Pleasant Valley Little Rock', label: 'Little Rock — Pleasant Valley' },
  { q: 'Little Rock AR', label: 'Little Rock region' },
  { q: 'Magnolia AR', label: 'Magnolia region' },
];

export const AR_DOC_BELT_LABELS = AR_DOC_BELT_PRIORITY.map((row) => row.label);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
export const DEFAULT_STORE_PATH = join(REPO_ROOT, 'src/course/hydrates/gca/green-centers.json');
export const DEFAULT_CURSOR_PATH = join(REPO_ROOT, 'src/course/hydrates/gca/cursor.json');

const NEAR_ZERO_DEG = 0.01;
const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_YARD = 0.9144;

export function emptyCounts() {
  return { fetched: 0, skipped_empty: 0, 403: 0, errors: 0 };
}

export function emptyCursor() {
  return {
    version: 1,
    priorityIndex: 0,
    arStateId: null,
    arListPage: 1,
    usListPage: 1,
    arListDone: false,
    processedIds: [],
    lastRunAt: null,
    lastCounts: emptyCounts(),
  };
}

export function emptyStore() {
  return { version: 1, source: 'golfapi', updatedAt: null, courses: {} };
}

export function readCap(env = process.env) {
  const raw = env.GCA_GREENS_BATCH_CAP;
  if (raw == null || String(raw).trim() === '') return DEFAULT_NIGHTLY_CAP;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_NIGHTLY_CAP;
  return Math.min(n, 2_000);
}

function asRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isUsCountry(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const n = normalize(value);
    return n === 'us' || n === 'usa' || n === 'united states' || n === 'united states of america';
  }
  const record = asRecord(value);
  if (!record) return false;
  const iso = asString(record.iso2) ?? asString(record.iso);
  if (iso && iso.toUpperCase() === 'US') return true;
  return isUsCountry(record.name);
}

export function isArkansas(value) {
  const n = normalize(value);
  return n === 'ar' || n === 'arkansas';
}

export function isValidGreenPoint(point) {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat) < NEAR_ZERO_DEG && Math.abs(lng) < NEAR_ZERO_DEG) return false;
  return true;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineYards(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters / METERS_PER_YARD;
}

export function isClubhousePin(point) {
  if (!isValidGreenPoint(point)) return false;
  return CLUBHOUSE_DENYLIST.some((pin) => haversineYards(point, pin) < 5);
}

export function parseGreenCenterRows(json) {
  const payload = asRecord(json)?.data ?? json;
  const record = asRecord(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.holes)
      ? record.holes
      : Array.isArray(record?.green_centers)
        ? record.green_centers
        : Array.isArray(record?.greenCenters)
          ? record.greenCenters
          : [];
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const hole = asFiniteNumber(row.hole ?? row.hole_number ?? row.holeNumber ?? row.number);
    if (hole == null || !Number.isInteger(hole) || hole < 1 || hole > 18) continue;
    const lat = asFiniteNumber(row.lat ?? row.latitude);
    const lng = asFiniteNumber(row.lng ?? row.lon ?? row.longitude);
    const point = lat != null && lng != null ? { lat, lng } : null;
    if (!isValidGreenPoint(point) || isClubhousePin(point)) continue;
    if (seen.has(hole)) continue;
    seen.add(hole);
    out.push({ hole, lat: point.lat, lng: point.lng });
  }
  out.sort((a, b) => a.hole - b.hole);
  return out;
}

export function parseCourseListRow(raw) {
  const record = asRecord(raw);
  if (!record) return null;
  const idRaw = record.id ?? record.course_id ?? record.courseId;
  const id = asString(idRaw) ?? (idRaw != null && idRaw !== '' ? String(idRaw) : null);
  const name = asString(record.name ?? record.course_name ?? record.courseName);
  if (!id || !name) return null;
  const lat = asFiniteNumber(record.latitude ?? record.lat ?? asRecord(record.coordinates)?.latitude);
  const lng = asFiniteNumber(record.longitude ?? record.lng ?? asRecord(record.coordinates)?.longitude);
  const location = lat != null && lng != null ? { lat, lng } : null;
  return {
    id,
    name,
    club: asString(record.club ?? record.club_name),
    city: asString(record.city),
    state: asString(record.state ?? record.region),
    country: record.country ?? null,
    location: isValidGreenPoint(location) ? location : null,
  };
}

export function parseCourseList(json) {
  const payload = asRecord(json)?.data ?? json;
  const rows = Array.isArray(payload) ? payload : [];
  const out = [];
  for (const row of rows) {
    const parsed = parseCourseListRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parseListMeta(json) {
  const meta = asRecord(asRecord(json)?.meta) ?? {};
  const current = asFiniteNumber(meta.current_page);
  const last = asFiniteNumber(meta.last_page);
  return {
    currentPage: current != null && Number.isInteger(current) ? current : 1,
    lastPage: last != null && Number.isInteger(last) ? last : 1,
  };
}

export function parseArkansasStateId(json) {
  const payload = asRecord(json)?.data ?? json;
  const rows = Array.isArray(payload) ? payload : [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const iso = asString(record.iso2) ?? asString(record.iso);
    if (iso && iso.toUpperCase() === 'AR') {
      const id = record.id;
      return id != null && id !== '' ? String(id) : null;
    }
    if (normalize(record.name) === 'arkansas') {
      const id = record.id;
      return id != null && id !== '' ? String(id) : null;
    }
  }
  return null;
}

export function beltRank(course) {
  const bag = normalize([course.name, course.club, course.city, course.state].filter(Boolean).join(' '));
  if (/\bthunderbird\b/.test(bag) && /heber/.test(bag)) return 0;
  if (/mountain ranch/.test(bag) && /fairfield/.test(bag)) return 1;
  if (/cypress creek/.test(bag)) return 2;
  if (/\bgreystone\b/.test(bag)) return 3;
  if (/pleasant valley/.test(bag)) return 4;
  if (/\bmagnolia\b/.test(bag)) return 5;
  if (/little rock/.test(bag)) return 6;
  if (/heber springs/.test(bag) || /fairfield bay/.test(bag) || /\bcabot\b/.test(bag)) return 7;
  if (isArkansas(course.state)) return 8;
  return 9;
}

export function prioritizeCourses(courses, processed) {
  const seen = new Set(processed);
  const out = [];
  for (const course of courses) {
    if (!course?.id || seen.has(course.id)) continue;
    if (course.country != null && !isUsCountry(course.country) && !isArkansas(course.state)) continue;
    seen.add(course.id);
    out.push(course);
  }
  out.sort((a, b) => {
    const rank = beltRank(a) - beltRank(b);
    if (rank !== 0) return rank;
    const ar = Number(isArkansas(b.state)) - Number(isArkansas(a.state));
    if (ar !== 0) return ar;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
  return out;
}

export function formatCountsLine(counts, extra = {}) {
  const cap = extra.cap != null ? ` cap=${extra.cap}` : '';
  return `GCA_GREENS_BATCH fetched=${counts.fetched} skipped_empty=${counts.skipped_empty} 403=${counts[403]} errors=${counts.errors}${cap}`;
}

export function redactForLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/GOLF_COURSES_API_KEY=\S+/gi, 'GOLF_COURSES_API_KEY=[redacted]');
  }
  if (typeof value === 'object') {
    const record = { ...value };
    delete record.key;
    delete record.authorization;
    delete record.Authorization;
    delete record.payload;
    delete record.body;
    delete record.holes;
    delete record.address;
    delete record.phone;
    delete record.website;
    delete record.postal_code;
    return record;
  }
  return value;
}

function readJsonFile(path, fallback) {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function loadCursor(path = DEFAULT_CURSOR_PATH) {
  const raw = readJsonFile(path, emptyCursor());
  const record = asRecord(raw) ?? {};
  const processed = Array.isArray(record.processedIds)
    ? record.processedIds.map((id) => String(id)).filter((id) => id.length > 0)
    : [];
  const counts = asRecord(record.lastCounts) ?? {};
  return {
    version: 1,
    priorityIndex: Number.isInteger(record.priorityIndex) ? record.priorityIndex : 0,
    arStateId: record.arStateId != null && record.arStateId !== '' ? String(record.arStateId) : null,
    arListPage: Number.isInteger(record.arListPage) && record.arListPage > 0 ? record.arListPage : 1,
    usListPage: Number.isInteger(record.usListPage) && record.usListPage > 0 ? record.usListPage : 1,
    arListDone: Boolean(record.arListDone),
    processedIds: processed,
    lastRunAt: asString(record.lastRunAt),
    lastCounts: {
      fetched: Number(counts.fetched) || 0,
      skipped_empty: Number(counts.skipped_empty) || 0,
      403: Number(counts[403] ?? counts['403']) || 0,
      errors: Number(counts.errors) || 0,
    },
  };
}

export function loadStore(path = DEFAULT_STORE_PATH) {
  const raw = readJsonFile(path, emptyStore());
  const record = asRecord(raw) ?? {};
  const coursesIn = asRecord(record.courses) ?? {};
  const courses = {};
  for (const [id, value] of Object.entries(coursesIn)) {
    const row = asRecord(value);
    if (!row) continue;
    const holes = parseGreenCenterRows({ data: { holes: row.holes } });
    const name = asString(row.name);
    if (!name || holes.length === 0) continue;
    courses[id] = {
      id,
      name,
      club: asString(row.club),
      city: asString(row.city),
      state: asString(row.state),
      country: asString(row.country) ?? 'US',
      location: isValidGreenPoint(row.location) ? row.location : null,
      fetchedAt: asString(row.fetchedAt) ?? '1970-01-01T00:00:00Z',
      holes,
    };
  }
  return {
    version: 1,
    source: 'golfapi',
    updatedAt: asString(record.updatedAt),
    courses,
  };
}

function processedSet(cursor, store) {
  const ids = new Set(cursor.processedIds.map(String));
  for (const id of Object.keys(store.courses)) ids.add(id);
  return ids;
}

function sleepFn(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(path, key, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${GCA_API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json, retryAfter: res.headers?.get?.('Retry-After') ?? null };
  } finally {
    clearTimeout(timer);
  }
}

export async function collectQueue(opts) {
  const {
    key,
    fetchImpl,
    cursor,
    processed,
    cap,
    timeoutMs,
    sleep = sleepFn,
    gapMs = REQUEST_GAP_MS,
  } = opts;
  const collected = [];
  const seen = new Set(processed);
  const next = { ...cursor };

  const take = (rows) => {
    for (const row of prioritizeCourses(rows, seen)) {
      collected.push(row);
      seen.add(row.id);
    }
  };

  const get = async (path) => {
    await sleep(gapMs);
    return apiGet(path, key, fetchImpl, timeoutMs);
  };

  while (next.priorityIndex < AR_DOC_BELT_PRIORITY.length && collected.length < cap) {
    const query = AR_DOC_BELT_PRIORITY[next.priorityIndex];
    const search = new URLSearchParams({ q: query.q, per_page: '100' });
    const { status, json } = await get(`/courses?${search.toString()}`);
    if (status >= 200 && status < 300) take(parseCourseList(json));
    next.priorityIndex += 1;
  }

  if (!next.arStateId && collected.length < cap) {
    const { status, json } = await get('/states?country=US');
    if (status >= 200 && status < 300) {
      next.arStateId = parseArkansasStateId(json);
    }
  }

  while (!next.arListDone && next.arStateId && collected.length < cap) {
    const search = new URLSearchParams({
      state_prov_id: String(next.arStateId),
      per_page: '100',
      page: String(next.arListPage),
    });
    const { status, json } = await get(`/courses?${search.toString()}`);
    if (status < 200 || status >= 300) break;
    take(parseCourseList(json));
    const meta = parseListMeta(json);
    if (next.arListPage >= meta.lastPage) {
      next.arListDone = true;
      break;
    }
    next.arListPage += 1;
  }

  while (collected.length < cap) {
    const search = new URLSearchParams({
      country: 'US',
      per_page: '100',
      page: String(next.usListPage),
    });
    const { status, json } = await get(`/courses?${search.toString()}`);
    if (status < 200 || status >= 300) break;
    take(parseCourseList(json));
    const meta = parseListMeta(json);
    if (next.usListPage >= meta.lastPage) break;
    next.usListPage += 1;
  }

  return {
    queue: prioritizeCourses(collected, processed).slice(0, cap),
    cursor: next,
  };
}

export function persistCourse(store, course, holes, fetchedAt) {
  if (!holes.length) return store;
  return {
    ...store,
    source: 'golfapi',
    updatedAt: fetchedAt,
    courses: {
      ...store.courses,
      [course.id]: {
        id: course.id,
        name: course.name,
        club: course.club,
        city: course.city,
        state: course.state,
        country: isUsCountry(course.country) ? 'US' : asString(course.country) ?? 'US',
        location: course.location,
        fetchedAt,
        holes,
      },
    },
  };
}

export function classifyGreenCenters(status, holes) {
  if (status === 403) return '403';
  if (status === 200 && holes.length > 0) return 'fetched';
  if (status === 200 || status === 404) return 'skipped_empty';
  return 'errors';
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetch?: typeof fetch,
 *   storePath?: string,
 *   cursorPath?: string,
 *   cap?: number,
 *   timeoutMs?: number,
 *   gapMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => string,
 *   log?: (...args: unknown[]) => void,
 *   persist?: boolean,
 * }} [opts]
 */
export async function runGreensBatch(opts = {}) {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const storePath = opts.storePath ?? DEFAULT_STORE_PATH;
  const cursorPath = opts.cursorPath ?? DEFAULT_CURSOR_PATH;
  const cap = opts.cap ?? readCap(env);
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const gapMs = opts.gapMs ?? REQUEST_GAP_MS;
  const sleep = opts.sleep ?? sleepFn;
  const now = opts.now ?? (() => new Date().toISOString());
  const log = opts.log ?? console.log;
  const persist = opts.persist ?? true;

  const counts = emptyCounts();
  const key = readKey(env);
  if (!key) {
    const line = 'GCA_GREENS_BATCH skipped=NO_KEY';
    log(line);
    log('GOLF_COURSES_API_KEY missing — batch skipped. Greens stay blank (never invented).');
    return { code: 'NO_KEY', counts, line, queue: [] };
  }

  let store = loadStore(storePath);
  let cursor = loadCursor(cursorPath);
  const processed = processedSet(cursor, store);

  let queue = [];
  try {
    const collected = await collectQueue({
      key,
      fetchImpl,
      cursor,
      processed,
      cap,
      timeoutMs,
      sleep,
      gapMs,
    });
    queue = collected.queue;
    cursor = collected.cursor;
  } catch (err) {
    if (isTlsFailure(err)) {
      counts.errors += 1;
      const line = formatCountsLine(counts, { cap });
      log(line);
      log('[Signal Lab] gca-greens-batch TLS/network failed; greens stay blank.');
      return { code: 'TLS_FAIL', counts, line, queue: [] };
    }
    throw err;
  }

  let consecutive403 = 0;
  const fetchedAt = now();

  for (const course of queue) {
    await sleep(gapMs);
    let status = 0;
    let json = null;
    try {
      const res = await apiGet(`/courses/${encodeURIComponent(course.id)}/green-centers`, key, fetchImpl, timeoutMs);
      status = res.status;
      json = res.json;
      if (status === 429) {
        counts.errors += 1;
        log(formatCountsLine(counts, { cap }));
        log('[Signal Lab] gca-greens-batch hit 429 — stopping this night.');
        break;
      }
    } catch (err) {
      if (err && typeof err === 'object' && err.name === 'AbortError') {
        counts.errors += 1;
        continue;
      }
      if (isTlsFailure(err)) {
        counts.errors += 1;
        break;
      }
      counts.errors += 1;
      continue;
    }

    const holes = status === 200 ? parseGreenCenterRows(json) : [];
    const kind = classifyGreenCenters(status, holes);
    counts[kind] += 1;

    if (kind === 'fetched') {
      store = persistCourse(store, course, holes, fetchedAt);
      consecutive403 = 0;
    } else if (kind === 'skipped_empty') {
      cursor.processedIds = [...new Set([...cursor.processedIds, course.id])];
      consecutive403 = 0;
    } else if (kind === '403') {
      consecutive403 += 1;
      if (consecutive403 >= CONSECUTIVE_403_ABORT) {
        log('[Signal Lab] gca-greens-batch consecutive 403 — abort (free plan or Pro locked). Never invent greens.');
        break;
      }
    }
  }

  cursor.lastRunAt = fetchedAt;
  cursor.lastCounts = counts;
  if (persist) {
    writeJsonFile(storePath, store);
    writeJsonFile(cursorPath, cursor);
  }

  const line = formatCountsLine(counts, { cap });
  log(line);
  log(
    '[Signal Lab] gca-greens-batch',
    redactForLog({
      fetched: counts.fetched,
      skipped_empty: counts.skipped_empty,
      403: counts[403],
      errors: counts.errors,
      cap,
      queued: queue.length,
      priority: 'AR-first then US',
    }),
  );
  return { code: 'OK', counts, line, queue, store, cursor };
}

export async function main() {
  try {
    await runGreensBatch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(formatCountsLine({ ...emptyCounts(), errors: 1 }, { cap: readCap() }));
    console.log('[Signal Lab] gca-greens-batch error (redacted). Greens stay blank.');
    if (isTlsFailure(err)) {
      console.log('TLS/network to golfcoursesapi.com failed. Greens stay blank.');
      return;
    }
    console.log(redactForLog(msg));
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().then(
    () => process.exit(0),
    () => process.exit(0),
  );
}
