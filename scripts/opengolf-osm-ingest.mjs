#!/usr/bin/env node
/**
 * OpenGolf / OSM centerline ingest.
 *
 * Reads the attached US hole CSV (tee = first node, green = last node of
 * golf=hole ways). Writes a compact pack for the existing hydrate/catalog
 * path. Never invents daily pins. Never overwrites Thunderbird Heber Springs
 * or the other hand-verified AR hydrates. High match_dist_m rows are
 * quarantined, not painted.
 *
 * Usage:
 *   node scripts/opengolf-osm-ingest.mjs [csvPath]
 *
 * Looks for OPEN_GOLF_OSM_HOLES_CSV, then the uploads CSV, then argv.
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(ROOT, 'src/course/hydrates/opengolf');
const MATCH_DIST_MAX_M = 1000;
const MIN_SPAN_YD = 5;
const MAX_SPAN_YD = 700;
const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_YARD = 0.9144;
const FETCHED_AT = '2026-09-21T12:00:00Z';
const TB_CLUBHOUSE = { lat: 35.525292, lng: -92.038355 };

const DEFAULT_CSV_CANDIDATES = [
  process.env.OPEN_GOLF_OSM_HOLES_CSV,
  '/home/ubuntu/.cursor/projects/workspace/uploads/opengolf-osm-holes_c4db.csv',
  resolve(ROOT, 'uploads/opengolf-osm-holes.csv'),
].filter(Boolean);

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineYards(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters / METERS_PER_YARD;
}

function asFiniteNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseHoleNumber(value) {
  const n = asFiniteNumber(value);
  if (n == null) return null;
  const hole = Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
  if (hole == null || hole < 1 || hole > 18) return null;
  return hole;
}

function parsePar(value) {
  const n = asFiniteNumber(value);
  if (n == null) return null;
  const par = Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
  return par != null && par >= 3 && par <= 6 ? par : null;
}

function isValidPoint(point) {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  return true;
}

function holePassesGates(tee, green) {
  if (!isValidPoint(tee) || !isValidPoint(green)) return false;
  const span = haversineYards(tee, green);
  return span >= MIN_SPAN_YD && span <= MAX_SPAN_YD;
}

function isThunderbirdHeber(row) {
  const name = normalize(row.course_name);
  if (!/\bthunderbird\b/.test(name)) return false;
  const bag = [name, normalize(row.city), normalize(row.state)].join(' ');
  if (/heber springs/.test(bag) || (/\bheber\b/.test(bag) && (/\bar\b/.test(bag) || /\barkansas\b/.test(bag)))) {
    return true;
  }
  const loc = pointFrom(row.tee_lat, row.tee_lon) ?? pointFrom(row.green_lat, row.green_lon);
  return Boolean(loc && haversineYards(loc, TB_CLUBHOUSE) <= 1800);
}

function isReservedIdentity(row) {
  const name = normalize(row.course_name);
  const bag = [name, normalize(row.city), normalize(row.state)].join(' ');
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
  if (/north hills/.test(name) && /\bsherwood\b/.test(bag)) return true;
  return false;
}

function pointFrom(latRaw, lngRaw) {
  const lat = asFiniteNumber(latRaw);
  const lng = asFiniteNumber(lngRaw);
  const point = lat != null && lng != null ? { lat, lng } : null;
  return isValidPoint(point) ? point : null;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function readCsv(path) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  const rows = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells.map((cell) => cell.trim());
      continue;
    }
    const row = {};
    headers.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function roundCoord(value) {
  return Math.round(value * 1e7) / 1e7;
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV_CANDIDATES.find(Boolean));
  console.log(`[opengolf-ingest] csv ${csvPath}`);
  const rows = await readCsv(csvPath);

  const counts = {
    rows: rows.length,
    highMatchDist: 0,
    missingHoleNumber: 0,
    missingCoords: 0,
    gateFail: 0,
    reservedOverwrite: 0,
    thunderbirdHeber: 0,
    duplicateHole: 0,
    acceptedHoles: 0,
    acceptedCourses: 0,
    emptyCourse: 0,
  };

  /** @type {Map<string, { id: string, name: string, city: string, state: string, holes: Map<number, { dist: number, tuple: number[] }> }>} */
  const courses = new Map();
  const quarantineSamples = [];

  const bumpSample = (reason, row) => {
    if (quarantineSamples.length >= 12) return;
    quarantineSamples.push({
      reason,
      state: row.state || null,
      city: row.city || null,
      course: row.course_name || null,
      hole: row.hole_number || row.hole_ref || null,
      match_dist_m: asFiniteNumber(row.match_dist_m),
    });
  };

  for (const row of rows) {
    if (isThunderbirdHeber(row)) {
      counts.thunderbirdHeber += 1;
      bumpSample('thunderbird-heber', row);
      continue;
    }
    if (isReservedIdentity(row)) {
      counts.reservedOverwrite += 1;
      bumpSample('reserved-overwrite', row);
      continue;
    }

    const dist = asFiniteNumber(row.match_dist_m);
    if (dist == null || dist > MATCH_DIST_MAX_M) {
      counts.highMatchDist += 1;
      bumpSample('high-match-dist', row);
      continue;
    }

    const holeNumber = parseHoleNumber(row.hole_number) ?? parseHoleNumber(row.hole_ref);
    if (holeNumber == null) {
      counts.missingHoleNumber += 1;
      bumpSample('missing-hole-number', row);
      continue;
    }

    const tee = pointFrom(row.tee_lat, row.tee_lon);
    const green = pointFrom(row.green_lat, row.green_lon);
    if (!tee || !green) {
      counts.missingCoords += 1;
      bumpSample('missing-coords', row);
      continue;
    }
    if (!holePassesGates(tee, green)) {
      counts.gateFail += 1;
      bumpSample('gate-fail', row);
      continue;
    }

    const id = String(row.course_id || '').trim();
    const name = String(row.course_name || '').trim();
    const city = String(row.city || '').trim();
    const state = String(row.state || '').trim();
    if (!id || !name || !city || !state) {
      counts.emptyCourse += 1;
      continue;
    }

    let course = courses.get(id);
    if (!course) {
      course = { id, name, city, state, holes: new Map() };
      courses.set(id, course);
    }
    const tuple = [
      holeNumber,
      parsePar(row.osm_par) ?? 0,
      roundCoord(tee.lat),
      roundCoord(tee.lng),
      roundCoord(green.lat),
      roundCoord(green.lng),
    ];
    const prev = course.holes.get(holeNumber);
    if (prev) {
      counts.duplicateHole += 1;
      if (dist >= prev.dist) continue;
    }
    course.holes.set(holeNumber, { dist, tuple });
  }

  const packCourses = [];
  for (const course of courses.values()) {
    const holes = [...course.holes.values()]
      .map((item) => item.tuple)
      .sort((a, b) => a[0] - b[0]);
    if (holes.length === 0) {
      counts.emptyCourse += 1;
      continue;
    }
    let latSum = 0;
    let lngSum = 0;
    let n = 0;
    for (const hole of holes) {
      latSum += (hole[2] + hole[4]) / 2;
      lngSum += (hole[3] + hole[5]) / 2;
      n += 1;
    }
    packCourses.push([
      course.id,
      course.name,
      course.city,
      course.state,
      roundCoord(latSum / n),
      roundCoord(lngSum / n),
      holes,
    ]);
    counts.acceptedHoles += holes.length;
  }
  packCourses.sort((a, b) => {
    const state = String(a[3]).localeCompare(String(b[3]));
    if (state !== 0) return state;
    return String(a[1]).localeCompare(String(b[1]));
  });
  counts.acceptedCourses = packCourses.length;

  const pack = {
    v: 1,
    at: FETCHED_AT,
    md: MATCH_DIST_MAX_M,
    attr: ['OpenStreetMap contributors', 'OpenGolf'],
    c: packCourses,
  };

  const arCourses = packCourses.filter((row) => row[3] === 'AR').length;
  const arHoles = packCourses
    .filter((row) => row[3] === 'AR')
    .reduce((sum, row) => sum + row[6].length, 0);
  const thunderbirdInPack = packCourses.some((row) => {
    const name = normalize(row[1]);
    const bag = [name, normalize(row[2]), normalize(row[3])].join(' ');
    return /\bthunderbird\b/.test(name) && /heber/.test(bag);
  });
  const reservedInPack = packCourses.some((row) =>
    isReservedIdentity({
      course_name: row[1],
      city: row[2],
      state: row[3],
    }),
  );

  const json = JSON.stringify(pack);
  const gz = gzipSync(Buffer.from(json));
  const catalog = packCourses.map((row) => [
    row[0],
    row[1],
    row[2],
    row[3],
    row[4],
    row[5],
    row[6].reduce((max, hole) => Math.max(max, hole[0]), 0),
  ]);
  const catalogJson = JSON.stringify({
    v: 1,
    at: FETCHED_AT,
    md: MATCH_DIST_MAX_M,
    attr: pack.attr,
    c: catalog,
  });
  const byState = new Map();
  for (const row of packCourses) {
    const state = String(row[3]);
    const shard = byState.get(state) ?? {};
    shard[row[0]] = row[6];
    byState.set(state, shard);
  }

  await mkdir(resolve(OUT_DIR, 'holes'), { recursive: true });
  await writeFile(resolve(OUT_DIR, 'pack.json'), json);
  await writeFile(resolve(OUT_DIR, 'pack.json.gz'), gz);
  await writeFile(resolve(OUT_DIR, 'catalog.json'), catalogJson);
  const shardSizes = {};
  const states = [...byState.keys()].sort((a, b) => a.localeCompare(b));
  for (const state of states) {
    const shard = byState.get(state);
    const shardJson = JSON.stringify({ v: 1, s: state, h: shard });
    shardSizes[state] = Buffer.byteLength(shardJson);
    await writeFile(resolve(OUT_DIR, 'holes', `${state}.json`), shardJson);
  }
  const shardLoader = [
    '/* Generated by scripts/opengolf-osm-ingest.mjs — do not edit by hand. */',
    'export const OPEN_GOLF_HOLE_SHARDS: Record<string, () => unknown> = {',
    ...states.map(
      (state) =>
        `  ${JSON.stringify(state)}: () => require(${JSON.stringify(`./hydrates/opengolf/holes/${state}.json`)}),`,
    ),
    '};',
    '',
  ].join('\n');
  await writeFile(resolve(ROOT, 'src/course/opengolfShards.ts'), shardLoader);

  const report = {
    generatedAt: FETCHED_AT,
    source: 'OpenGolf OSM hole centerlines + OpenGolfAPI course match',
    license: 'ODbL-1.0',
    attribution: ['OpenStreetMap contributors', 'OpenGolf'],
    matchDistMaxM: MATCH_DIST_MAX_M,
    centerlineOnly: true,
    neverInventDailyPins: true,
    thunderbirdHeberProtected: true,
    thunderbirdHeberInPack: thunderbirdInPack,
    reservedOverwriteInPack: reservedInPack,
    counts,
    staged: {
      arCourses,
      arHoles,
      fullUsCourses: counts.acceptedCourses,
      fullUsHoles: counts.acceptedHoles,
    },
    size: {
      packJsonBytes: Buffer.byteLength(json),
      packGzipBytes: gz.length,
      catalogJsonBytes: Buffer.byteLength(catalogJson),
      shardJsonBytes: shardSizes,
    },
    samples: quarantineSamples,
  };
  await writeFile(resolve(OUT_DIR, 'quarantine.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log('[opengolf-ingest] accepted', counts.acceptedCourses, 'courses', counts.acceptedHoles, 'holes');
  console.log('[opengolf-ingest] AR', arCourses, 'courses', arHoles, 'holes');
  console.log('[opengolf-ingest] quarantine', {
    highMatchDist: counts.highMatchDist,
    missingHoleNumber: counts.missingHoleNumber,
    gateFail: counts.gateFail,
    reservedOverwrite: counts.reservedOverwrite,
    thunderbirdHeber: counts.thunderbirdHeber,
  });
  console.log(
    '[opengolf-ingest] size',
    `${(report.size.packJsonBytes / 1024 / 1024).toFixed(2)} MB pack`,
    `${(report.size.packGzipBytes / 1024 / 1024).toFixed(2)} MB gzip`,
    `${(report.size.catalogJsonBytes / 1024).toFixed(0)} KB catalog`,
    `${byState.size} state shards`,
  );
  if (thunderbirdInPack) {
    throw new Error('Thunderbird Heber Springs leaked into the OpenGolf pack');
  }
  if (reservedInPack) {
    throw new Error('Reserved hydrate identity leaked into the OpenGolf pack');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
