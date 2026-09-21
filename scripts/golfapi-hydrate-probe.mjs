#!/usr/bin/env node
/**
 * Read-only golfapi.io hydrate probe.
 *
 * Default and only target: Thunderbird Country Club, Heber Springs, AR.
 * Does not call Mystic Creek, Cypress Creek, or North Hills.
 *
 * Flow matches the runtime client: search → course → coordinates
 * (`src/course/golfapi.ts`). Hole GPS is copied from the API only.
 * Missing tee/green, clubhouse pins, and Signal misses stay empty.
 * Never invents a coordinate. Never prints the API key.
 *
 * Writes golfapi-probe-out/<slug>/hydrate.json and verdict.json.
 * NO_KEY exits 0.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GOLFAPI_BASE = 'https://golfapi.io/api/v2.3';
export const OUT_DIR_DEFAULT = 'golfapi-probe-out';
export const KEY_NAMES = [
  'GOLFAPI_KEY',
  'EXPO_PUBLIC_GOLFAPI_KEY',
  'GOLF_API_IO_KEY',
  'EXPO_PUBLIC_GOLF_API_IO_KEY',
];

/** Signal course-card gates. Same numbers as src/domain/holeCamera.ts and latLng.ts. */
const NEAR_ZERO_DEG = 0.01;
const MIN_SPAN_YARDS = 5;
const MAX_SPAN_YARDS = 700;
const CLUBHOUSE_YARDS = 5;
const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_YARD = 0.9144;
const FRAME_PAD = 2.2;
const MIN_REGION_DELTA = 0.0048;

/**
 * Sole probe target. knownCourseId is the id already stored on the bundled
 * Thunderbird hydrate. It only breaks a search tie. It is never a coordinate.
 */
export const THUNDERBIRD = {
  slug: 'thunderbird-heber-springs-ar',
  name: 'Thunderbird Country Club',
  city: 'Heber Springs',
  state: 'AR',
  knownCourseId: '011141520629948893391',
};

/** Documented non-calls. The probe never builds a URL for these. */
export const SKIPPED = [
  { name: 'Mystic Creek', city: 'El Dorado', state: 'AR', reason: 'Doc/Lead: do not call golfapi' },
  { name: 'Cypress Creek', city: 'Cabot', state: 'AR', reason: 'OSM hydrate already bundled' },
  { name: 'The Greens at North Hills', city: 'Sherwood', state: 'AR', reason: 'bundled golfapi cache already present' },
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function trim(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readKey(env = process.env) {
  for (const name of KEY_NAMES) {
    const key = trim(env[name]);
    if (key) return key;
  }
  return null;
}

export function redact(value, key) {
  const text = String(value ?? '');
  if (!key) return text;
  return text.split(key).join('REDACTED');
}

function asRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeName(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haversineYards(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters / METERS_PER_YARD;
}

function isValidLatLng(point) {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function isNearZeroLatLng(point) {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return Math.abs(lat) < NEAR_ZERO_DEG && Math.abs(lng) < NEAR_ZERO_DEG;
}

function isCourseCardLatLng(point) {
  return isValidLatLng(point) && !isNearZeroLatLng(point);
}

function holeFrameRegion(points) {
  const valid = points.filter((point) => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lats = valid.map((point) => point.lat);
  const lngs = valid.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  if (!isValidLatLng({ lat: latitude, lng: longitude })) return null;
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max((maxLat - minLat) * FRAME_PAD, MIN_REGION_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * FRAME_PAD, MIN_REGION_DELTA),
  };
}

function regionIsPaintable(region) {
  if (!region) return false;
  if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return false;
  if (!Number.isFinite(region.latitudeDelta) || !Number.isFinite(region.longitudeDelta)) return false;
  if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return false;
  return isValidLatLng({ lat: region.latitude, lng: region.longitude });
}

/** Same mount decision as decideCourseCardPaint for a tee/green pair. */
export function signalGate(tee, green) {
  if (isNearZeroLatLng(tee) || isNearZeroLatLng(green)) {
    return { mount: false, reason: 'zero_coord', spanYards: null };
  }
  const teeOk = isCourseCardLatLng(tee) ? tee : null;
  const greenOk = isCourseCardLatLng(green) ? green : null;
  if (!teeOk || !greenOk) {
    const reason = !teeOk && !greenOk ? 'missing_both' : !teeOk ? 'missing_tee' : 'missing_green';
    return { mount: false, reason, spanYards: null };
  }
  const spanYards = haversineYards(teeOk, greenOk);
  if (!Number.isFinite(spanYards)) return { mount: false, reason: 'no_camera', spanYards: null };
  if (spanYards < MIN_SPAN_YARDS) return { mount: false, reason: 'same_point', spanYards };
  if (spanYards > MAX_SPAN_YARDS) return { mount: false, reason: 'absurd_span', spanYards };
  if (teeOk.lat === greenOk.lat && teeOk.lng === greenOk.lng) {
    return { mount: false, reason: 'no_camera', spanYards };
  }
  const region = holeFrameRegion([teeOk, greenOk]);
  if (!regionIsPaintable(region)) return { mount: false, reason: 'bad_region', spanYards };
  return { mount: true, reason: 'sane_region', spanYards };
}

function parseCoord(raw) {
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

function parseTeeSets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const name = trim(record.teeName) ?? trim(record.tee_name) ?? 'default';
    const lengths = [];
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

function isClubhousePin(point, clubhouse) {
  if (!clubhouse || !isCourseCardLatLng(clubhouse) || !isCourseCardLatLng(point)) return false;
  return haversineYards(point, clubhouse) < CLUBHOUSE_YARDS;
}

function pickTee(candidates, green, hole, teeSets) {
  if (candidates.length === 0) return { tee: null, reason: 'no_tee' };
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
  const gate = signalGate(chosen, green);
  if (!gate.mount) return { tee: null, reason: gate.reason, spanYards: gate.spanYards };
  return {
    tee: { lat: chosen.lat, lng: chosen.lng, label: preferred?.name ?? 'default' },
    reason: 'sane_region',
    spanYards: gate.spanYards,
    yards: teeSets.find((set) => set.name === (preferred?.name ?? 'default'))?.lengths[hole - 1] ?? null,
  };
}

/**
 * Map golfapi.io course + coordinates into a hydrate.
 * Same poi/location rules as mapGolfApiCourseToHydrate. Thin GPS → null.
 */
export function mapGolfApiCourseToHydrate(args) {
  const course = asRecord(args.course);
  if (!course) return { hydrate: null, dropped: [{ hole: null, reason: 'no_course' }] };
  const courseId = trim(course.courseID) ?? trim(course.courseId);
  const displayName = trim(course.clubName) ?? trim(course.courseName) ?? trim(course.name);
  const city = trim(course.city);
  const state = trim(course.state);
  if (!courseId || !displayName) return { hydrate: null, dropped: [{ hole: null, reason: 'no_identity' }] };
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
  const coords = rows.map(parseCoord).filter((row) => row != null);
  if (coords.length === 0) return { hydrate: null, dropped: [{ hole: null, reason: 'no_coordinates' }], coordCount: 0 };
  const teeSets = parseTeeSets(course.tees);
  const pars = Array.isArray(course.parsMen) ? course.parsMen : [];
  const holes = [];
  const dropped = [];
  for (let n = 1; n <= 18; n += 1) {
    const holeCoords = coords.filter((row) => row.hole === n);
    if (holeCoords.length === 0) {
      dropped.push({ hole: n, reason: 'no_coordinates' });
      continue;
    }
    const greenRow = holeCoords.find((row) => row.poi === 1 && row.location === 2);
    if (!greenRow) {
      dropped.push({ hole: n, reason: 'no_green' });
      continue;
    }
    const green = { lat: greenRow.lat, lng: greenRow.lng };
    if (isClubhousePin(green, clubhouse)) {
      dropped.push({ hole: n, reason: 'clubhouse_green' });
      continue;
    }
    const teeCandidates = holeCoords
      .filter((row) => (row.poi === 11 || row.poi === 12) && row.location === 2)
      .map((row) => ({ lat: row.lat, lng: row.lng }))
      .filter((point) => !isClubhousePin(point, clubhouse));
    const picked = pickTee(teeCandidates, green, n, teeSets);
    if (!picked.tee) {
      dropped.push({ hole: n, reason: picked.reason, spanYards: picked.spanYards ?? null });
      continue;
    }
    const parRaw = asFiniteNumber(pars[n - 1]);
    const par = parRaw != null && Number.isInteger(parRaw) && parRaw >= 3 && parRaw <= 6 ? parRaw : null;
    const yardsRaw = picked.yards;
    const hole = {
      hole: n,
      par,
      tee: picked.tee,
      green,
    };
    if (typeof yardsRaw === 'number' && Number.isFinite(yardsRaw)) hole.yards = yardsRaw;
    holes.push(hole);
  }
  if (holes.length === 0) {
    return { hydrate: null, dropped, coordCount: coords.length, courseId, displayName };
  }
  return {
    hydrate: {
      courseKey: `golfapi:${courseId}`,
      displayName,
      locality,
      source: 'golfapi',
      sourceRef: `golfapi.io courseID=${courseId} club=${displayName} coords=${coords.length} runtime`,
      fetchedAt: args.fetchedAt ?? new Date().toISOString(),
      holes,
    },
    dropped,
    coordCount: coords.length,
    courseId,
    displayName,
  };
}

function searchHits(raw) {
  if (Array.isArray(raw)) return raw.map(asRecord).filter((row) => row != null);
  const record = asRecord(raw);
  const rows = record?.courses ?? record?.data ?? record?.results;
  if (!Array.isArray(rows)) return record ? [record] : [];
  return rows.map(asRecord).filter((row) => row != null);
}

function courseMatchesHit(course, hit) {
  const name = normalizeName(course.name);
  const hitName = normalizeName(trim(hit.clubName) ?? trim(hit.courseName) ?? trim(hit.name));
  if (!name || !hitName) return false;
  const tokens = name.split(' ').filter((token) => token.length > 2);
  if (tokens.length === 0) return hitName === name;
  if (!tokens.every((token) => hitName.includes(token))) return false;
  const city = normalizeName(course.city);
  const hitCity = normalizeName(trim(hit.city));
  if (city && hitCity && city !== hitCity) return false;
  return true;
}

function cityMatches(course, hit) {
  const city = normalizeName(course.city);
  const hitCity = normalizeName(trim(hit.city));
  if (!city || !hitCity) return false;
  return city === hitCity;
}

export function pickSearchHit(course, hits) {
  const strict = hits.find((row) => courseMatchesHit(course, row));
  if (strict) return { hit: strict, match: 'strict' };
  const known = hits.find((row) => {
    const id = trim(row.courseID) ?? trim(row.courseId);
    return course.knownCourseId && id === course.knownCourseId && cityMatches(course, row);
  });
  if (known) return { hit: known, match: 'known-course-id' };
  const named = hits.find((row) => {
    const hitName = normalizeName(trim(row.clubName) ?? trim(row.courseName) ?? trim(row.name));
    return hitName.includes('thunderbird') && cityMatches(course, row);
  });
  if (named) return { hit: named, match: 'thunderbird-city' };
  return { hit: null, match: 'none' };
}

function hitSummary(hit) {
  return {
    courseID: trim(hit.courseID) ?? trim(hit.courseId),
    clubName: trim(hit.clubName),
    courseName: trim(hit.courseName),
    city: trim(hit.city),
    state: trim(hit.state),
    numHoles: asFiniteNumber(hit.numHoles),
    hasGPS: hit.hasGPS ?? null,
  };
}

function pointsNear(a, b) {
  if (!a || !b) return false;
  if (a.lat === b.lat && a.lng === b.lng) return true;
  return haversineYards(a, b) < 1;
}

export function duplicateBackNine(holes) {
  const copies = [];
  for (let n = 1; n <= 9; n += 1) {
    const front = holes.find((hole) => hole.hole === n);
    const back = holes.find((hole) => hole.hole === n + 9);
    if (!front || !back) continue;
    if (pointsNear(front.tee, back.tee) && pointsNear(front.green, back.green)) copies.push(n + 9);
  }
  return copies;
}

function loadBundled(slug) {
  try {
    const raw = readFileSync(join(ROOT, 'src/course/hydrates', `${slug}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function bundledGpsDiff(holes, bundled) {
  const previous = Array.isArray(bundled?.holes) ? bundled.holes : [];
  const changed = [];
  for (const hole of holes) {
    const prev = previous.find((row) => row?.hole === hole.hole);
    if (!prev) {
      changed.push(hole.hole);
      continue;
    }
    const teeSame =
      prev.tee &&
      hole.tee &&
      prev.tee.lat === hole.tee.lat &&
      prev.tee.lng === hole.tee.lng;
    const greenSame = prev.green && hole.green && prev.green.lat === hole.green.lat && prev.green.lng === hole.green.lng;
    if (!teeSame || !greenSame) changed.push(hole.hole);
  }
  return changed;
}

export function candidateHydrate(mapped, slug) {
  if (!mapped?.hydrate) return null;
  const source = mapped.hydrate;
  return {
    courseKey: slug,
    displayName: source.displayName,
    locality: source.locality,
    source: 'golfapi',
    sourceRef: source.sourceRef.replace(/ runtime$/, ' probe'),
    fetchedAt: source.fetchedAt,
    holes: source.holes.map((hole) => {
      const out = {
        hole: hole.hole,
        par: hole.par,
        tee: hole.tee,
        green: hole.green,
      };
      if (typeof hole.yards === 'number') out.yards = hole.yards;
      return out;
    }),
  };
}

export function judgeVerdict(args) {
  const holes = args.hydrate?.holes ?? [];
  const copies = duplicateBackNine(holes);
  const holeCount = holes.length;
  let verdict = 'THIN';
  if (args.code === 'NO_KEY') verdict = 'NO_KEY';
  else if (args.code === 'ERROR') verdict = 'ERROR';
  else if (args.code === 'HTTP') verdict = 'HTTP';
  else if (args.code === 'MISS') verdict = 'MISS';
  else if (copies.length > 0) verdict = 'DUPLICATE';
  else if (holeCount === 18) verdict = 'PASS';
  else if (holeCount > 0) verdict = 'PARTIAL';
  else verdict = 'THIN';
  return { verdict, holeCount, duplicateBackNine: copies };
}

function searchUrls(course) {
  const partial = course.name.split(' ').find((token) => token.length > 2) ?? course.name;
  const name = encodeURIComponent(partial);
  const city = encodeURIComponent(course.city);
  const state = encodeURIComponent(course.state);
  const q = encodeURIComponent([course.name, course.city, course.state].join(' '));
  return [
    `/courses?name=${name}&city=${city}&state=${state}&country=usa`,
    `/courses?name=${name}&city=${city}&country=usa`,
    `/courses?country=US&q=${q}`,
  ];
}

async function golfApiGet(path, key, fetchImpl) {
  const res = await fetchImpl(`${GOLFAPI_BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, snippet: text.slice(0, 180) };
}

function unwrapCourse(detail, hit) {
  const record = asRecord(detail);
  if (record && (trim(record.courseID) || trim(record.courseId) || trim(record.clubName))) return record;
  const nested = asRecord(record?.course) ?? asRecord(record?.data);
  if (nested && (trim(nested.courseID) || trim(nested.courseId) || trim(nested.clubName))) return nested;
  return asRecord(hit);
}

export async function probeThunderbird(opts = {}) {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const outDir = opts.outDir ?? OUT_DIR_DEFAULT;
  const now = opts.now ?? (() => new Date().toISOString());
  const course = THUNDERBIRD;
  const key = readKey(env);
  const courseDir = join(outDir, course.slug);
  mkdirSync(courseDir, { recursive: true });

  const baseVerdict = {
    slug: course.slug,
    name: course.name,
    city: course.city,
    state: course.state,
    skipped: SKIPPED,
    called: [],
    invented: false,
    bundledFileWritten: false,
  };

  const write = (verdict, hydrate) => {
    writeFileSync(join(courseDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
    if (hydrate) writeFileSync(join(courseDir, 'hydrate.json'), `${JSON.stringify(hydrate, null, 2)}\n`);
    else {
      writeFileSync(
        join(courseDir, 'hydrate.json'),
        `${JSON.stringify(
          {
            courseKey: course.slug,
            displayName: course.name,
            locality: `${course.city}, ${course.state}`,
            source: 'golfapi',
            sourceRef: 'golfapi.io probe — no usable GPS',
            fetchedAt: now(),
            holes: [],
          },
          null,
          2,
        )}\n`,
      );
    }
    return verdict;
  };

  if (!key) {
    const judged = judgeVerdict({ code: 'NO_KEY', hydrate: null });
    const verdict = write({
      ...baseVerdict,
      ...judged,
      note: 'GOLFAPI_KEY missing. Probe skipped. No GPS invented.',
    }, null);
    return { exitCode: 0, verdict };
  }

  const called = [];
  try {
    let search = null;
    let matched = { hit: null, match: 'none' };
    let hits = [];
    let searchFailure = null;
    for (const path of searchUrls(course)) {
      called.push(path);
      const attempt = await golfApiGet(path, key, fetchImpl);
      if (!attempt.ok) {
        searchFailure = attempt;
        continue;
      }
      search = attempt;
      hits = searchHits(attempt.json);
      matched = pickSearchHit(course, hits);
      if (matched.hit) break;
    }

    if (!search) {
      const judged = judgeVerdict({ code: 'HTTP', hydrate: null });
      const verdict = write({
        ...baseVerdict,
        ...judged,
        called,
        http: { search: searchFailure?.status ?? null },
        note: `Search HTTP ${searchFailure?.status ?? 'none'}. ${redact(searchFailure?.snippet ?? '', key)}`.trim(),
      }, null);
      return { exitCode: 0, verdict };
    }

    if (!matched.hit) {
      const judged = judgeVerdict({ code: 'MISS', hydrate: null });
      const verdict = write({
        ...baseVerdict,
        ...judged,
        called,
        http: { search: search.status },
        match: 'none',
        hits: hits.slice(0, 20).map(hitSummary),
        note: 'Search returned no Heber Springs Thunderbird hit. Coordinates were not requested.',
      }, null);
      return { exitCode: 0, verdict };
    }

    const courseId = trim(matched.hit.courseID) ?? trim(matched.hit.courseId);
    const detailPath = `/courses/${encodeURIComponent(courseId)}`;
    const coordPath = `/coordinates/${encodeURIComponent(courseId)}`;
    called.push(detailPath, coordPath);
    const detailRes = await golfApiGet(detailPath, key, fetchImpl);
    const coordRes = await golfApiGet(coordPath, key, fetchImpl);
    if (!detailRes.ok || !coordRes.ok) {
      const judged = judgeVerdict({ code: 'HTTP', hydrate: null });
      const verdict = write({
        ...baseVerdict,
        ...judged,
        called,
        http: { search: search.status, course: detailRes.status, coordinates: coordRes.status },
        courseId,
        match: matched.match,
        note: `Detail HTTP ${detailRes.status}, coordinates HTTP ${coordRes.status}. No GPS invented.`,
      }, null);
      return { exitCode: 0, verdict };
    }

    const detail = unwrapCourse(detailRes.json, matched.hit);
    const mapped = mapGolfApiCourseToHydrate({
      course: detail,
      coordinates: coordRes.json,
      fetchedAt: now(),
    });
    const hydrate = candidateHydrate(mapped, course.slug);
    const code = hydrate && hydrate.holes.length > 0 ? 'OK' : 'THIN';
    const judged = judgeVerdict({ code, hydrate });
    const bundled = loadBundled(course.slug);
    const verdict = write({
      ...baseVerdict,
      ...judged,
      called,
      http: { search: search.status, course: detailRes.status, coordinates: coordRes.status },
      courseId,
      match: matched.match,
      displayName: mapped.displayName ?? hydrate?.displayName ?? null,
      locality: hydrate?.locality ?? null,
      mapperCourseKey: mapped.hydrate?.courseKey ?? null,
      coordCount: mapped.coordCount ?? 0,
      measure: trim(detail?.measure) ?? null,
      numHoles: asFiniteNumber(detail?.numHoles),
      hasGPS: detail?.hasGPS ?? null,
      apiRequestsLeft: redact(detailRes.json?.apiRequestsLeft ?? coordRes.json?.apiRequestsLeft ?? '', key),
      dropped: mapped.dropped ?? [],
      signalHoles: hydrate?.holes.length ?? 0,
      bundledGpsHolesChanged: hydrate ? bundledGpsDiff(hydrate.holes, bundled) : [],
      note:
        judged.verdict === 'PASS'
          ? '18 holes with tee+green inside Signal gates. Candidate only — bundled Thunderbird JSON was not written.'
          : 'Candidate only. Bundled Thunderbird JSON was not written. Missing GPS was not invented.',
    }, hydrate);
    return { exitCode: 0, verdict };
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err), key);
    const judged = judgeVerdict({ code: 'ERROR', hydrate: null });
    const verdict = write({
      ...baseVerdict,
      ...judged,
      called,
      note: message,
    }, null);
    return { exitCode: 0, verdict };
  }
}

export function formatStatusLines(verdict) {
  return [
    `GOLFAPI_HYDRATE_PROBE=${verdict.verdict}`,
    `COURSE=${verdict.slug}`,
    `VERDICT=${verdict.verdict}`,
    `HOLES=${verdict.holeCount}`,
    `SIGNAL_HOLES=${verdict.signalHoles ?? verdict.holeCount}`,
    `DUPLICATE_BACK_NINE=${(verdict.duplicateBackNine ?? []).join(',') || '0'}`,
  ];
}

export async function main() {
  const outDir = trim(process.env.OUT_DIR) ?? OUT_DIR_DEFAULT;
  const result = await probeThunderbird({ outDir });
  const key = readKey();
  for (const line of formatStatusLines(result.verdict)) {
    console.log(redact(line, key));
  }
  if (result.verdict.note) console.log(redact(result.verdict.note, key));
  return result.exitCode;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().then(
    (code) => process.exit(code ?? 0),
    (err) => {
      const key = readKey();
      console.log(`GOLFAPI_HYDRATE_PROBE=ERROR`);
      console.log(redact(err instanceof Error ? err.message : String(err), key));
      process.exit(0);
    },
  );
}
