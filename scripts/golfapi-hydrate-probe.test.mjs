import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  SKIPPED,
  THUNDERBIRD,
  duplicateBackNine,
  mapGolfApiCourseToHydrate,
  probeThunderbird,
  readKey,
} from './golfapi-hydrate-probe.mjs';
import { readFileSync } from 'node:fs';

const COURSE = {
  courseID: '011141520629948893391',
  clubName: 'Thunderbird Country Club',
  city: 'Heber Springs',
  state: 'AR',
  latitude: '35.52505',
  longitude: '-92.03984',
  parsMen: [4, 3],
  tees: [{ teeName: 'Blue', length1: 267, length2: 116, length3: 0 }],
};

const COORDS = {
  coordinates: [
    { poi: 1, location: 2, hole: 1, latitude: 35.522655, longitude: -92.0393088 },
    { poi: 11, location: 2, hole: 1, latitude: 35.524339, longitude: -92.0394006 },
    { poi: 12, location: 2, hole: 1, latitude: 35.5250149, longitude: -92.0393432 },
    { poi: 1, location: 2, hole: 2, latitude: 35.5226358, longitude: -92.0379452 },
    { poi: 11, location: 2, hole: 2, latitude: 35.5224589, longitude: -92.039042 },
    { poi: 12, location: 2, hole: 2, latitude: 35.5224092, longitude: -92.0391466 },
  ],
};

test('mapper uses poi 1 loc 2 green and length-matched tee — never invents', () => {
  const mapped = mapGolfApiCourseToHydrate({
    course: COURSE,
    coordinates: COORDS,
    fetchedAt: '2026-09-21T14:12:17Z',
  });
  assert.equal(mapped.hydrate?.holes.length, 2);
  assert.deepEqual(mapped.hydrate?.holes[0]?.tee, { lat: 35.5250149, lng: -92.0393432, label: 'Blue' });
  assert.deepEqual(mapped.hydrate?.holes[0]?.green, { lat: 35.522655, lng: -92.0393088 });
  assert.equal(mapped.hydrate?.holes[0]?.yards, 267);
  assert.deepEqual(mapped.hydrate?.holes[1]?.tee, { lat: 35.5224589, lng: -92.039042, label: 'Blue' });
  assert.deepEqual(mapped.hydrate?.holes[1]?.green, { lat: 35.5226358, lng: -92.0379452 });
  assert.equal(mapGolfApiCourseToHydrate({ course: COURSE, coordinates: { coordinates: [] } }).hydrate, null);
});

test('same-point and missing GPS do not invent a hole', () => {
  const mapped = mapGolfApiCourseToHydrate({
    course: COURSE,
    coordinates: {
      coordinates: [
        { poi: 1, location: 2, hole: 1, latitude: 35.522655, longitude: -92.0393088 },
        { poi: 12, location: 2, hole: 1, latitude: 35.522655, longitude: -92.0393088 },
      ],
    },
  });
  assert.equal(mapped.hydrate, null);
  assert.equal(mapped.dropped[0]?.reason, 'same_point');
});

test('back nine that copies the front nine is a duplicate', () => {
  const holes = [
    { hole: 1, tee: { lat: 1, lng: 2 }, green: { lat: 1.001, lng: 2 } },
    { hole: 10, tee: { lat: 1, lng: 2 }, green: { lat: 1.001, lng: 2 } },
  ];
  assert.deepEqual(duplicateBackNine(holes), [10]);
});

test('probe calls only Thunderbird and writes NO_KEY without fetching', async () => {
  const urls = [];
  const outDir = mkdtempSync(join(tmpdir(), 'golfapi-probe-'));
  const result = await probeThunderbird({
    env: {},
    outDir,
    fetchImpl: async (url) => {
      urls.push(String(url));
      throw new Error('network');
    },
  });
  assert.equal(readKey({}), null);
  assert.equal(result.exitCode, 0);
  assert.equal(result.verdict.verdict, 'NO_KEY');
  assert.equal(result.verdict.holeCount, 0);
  assert.equal(urls.length, 0);
  assert.equal(THUNDERBIRD.slug, 'thunderbird-heber-springs-ar');
  assert.equal(SKIPPED.some((row) => row.name === 'Mystic Creek'), true);
  assert.equal(JSON.stringify(result.verdict).includes('secret'), false);
});

test('a keyed probe requests only Thunderbird search, course, and coordinates', async () => {
  const urls = [];
  const outDir = mkdtempSync(join(tmpdir(), 'golfapi-probe-'));
  const result = await probeThunderbird({
    env: { GOLFAPI_KEY: 'test-key-not-printed' },
    outDir,
    now: () => '2026-09-21T19:00:00Z',
    fetchImpl: async (url) => {
      const href = String(url);
      urls.push(href);
      assert.equal(href.includes('test-key-not-printed'), false);
      if (href.includes('/courses?')) {
        return new Response(JSON.stringify({
          courses: [{
            courseID: COURSE.courseID,
            clubName: 'Thunderbird Country Club',
            city: 'Heber Springs',
            state: 'AR',
            numHoles: 18,
            hasGPS: 1,
          }],
        }), { status: 200 });
      }
      if (href.includes('/coordinates/')) {
        return new Response(JSON.stringify(COORDS), { status: 200 });
      }
      return new Response(JSON.stringify(COURSE), { status: 200 });
    },
  });
  assert.equal(result.verdict.verdict, 'PARTIAL');
  assert.equal(result.verdict.holeCount, 2);
  assert.equal(urls.some((url) => url.includes('Mystic') || url.includes('Cypress') || url.includes('North%20Hills') || url.includes('Sherwood')), false);
  assert.equal(urls.filter((url) => url.includes('/coordinates/')).length, 1);
  const saved = JSON.parse(readFileSync(join(outDir, THUNDERBIRD.slug, 'hydrate.json'), 'utf8'));
  assert.equal(saved.courseKey, THUNDERBIRD.slug);
  assert.equal(saved.holes[0].tee.lat, 35.5250149);
  assert.equal(JSON.stringify(result.verdict).includes('test-key-not-printed'), false);
});

test('CLI prints NO_KEY and exits 0 without a key', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'golfapi-probe-cli-'));
  const ran = spawnSync(process.execPath, ['scripts/golfapi-hydrate-probe.mjs'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, GOLFAPI_KEY: '', EXPO_PUBLIC_GOLFAPI_KEY: '', GOLF_API_IO_KEY: '', EXPO_PUBLIC_GOLF_API_IO_KEY: '', OUT_DIR: outDir },
    encoding: 'utf8',
  });
  assert.equal(ran.status, 0);
  assert.match(ran.stdout, /VERDICT=NO_KEY/);
  assert.match(ran.stdout, /HOLES=0/);
  assert.doesNotMatch(ran.stdout, /Mystic Creek El Dorado/);
});
