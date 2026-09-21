import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchGolfApiHydrate,
  getGolfApiKey,
  loadCachedGolfApiHydrate,
  mapGolfApiCourseToHydrate,
  resetGolfApiCacheForTests,
  saveCachedGolfApiHydrate,
} from './golfapi';
import { inventGreenFromClubhouse, inventGreenFromScorecardYards } from './hydrate';

const THUNDERBIRD_COURSE = {
  courseID: '011141520629948893391',
  clubName: 'Thunderbird Country Club',
  city: 'Heber Springs',
  state: 'AR',
  latitude: '35.52505',
  longitude: '-92.03984',
  parsMen: [4, 3],
  tees: [
    {
      teeName: 'Blue',
      length1: 267,
      length2: 116,
      length3: 0,
    },
  ],
};

const THUNDERBIRD_COORDS = {
  coordinates: [
    { poi: 1, location: 2, hole: 1, latitude: 35.522655, longitude: -92.0393088 },
    { poi: 11, location: 2, hole: 1, latitude: 35.524339, longitude: -92.0394006 },
    { poi: 12, location: 2, hole: 1, latitude: 35.5250149, longitude: -92.0393432 },
    { poi: 1, location: 2, hole: 2, latitude: 35.5226358, longitude: -92.0379452 },
    { poi: 11, location: 2, hole: 2, latitude: 35.5224589, longitude: -92.039042 },
    { poi: 12, location: 2, hole: 2, latitude: 35.5224092, longitude: -92.0391466 },
  ],
};

test('golfapi mapper uses poi 1 loc 2 green and length-matched tee — never invents', () => {
  const hydrate = mapGolfApiCourseToHydrate({
    course: THUNDERBIRD_COURSE,
    coordinates: THUNDERBIRD_COORDS,
    fetchedAt: '2026-09-21T14:12:17Z',
  });
  assert.ok(hydrate);
  assert.equal(hydrate?.source, 'golfapi');
  assert.equal(hydrate?.holes.length, 2);
  assert.deepEqual(hydrate?.holes[0]?.tee, { lat: 35.5250149, lng: -92.0393432, label: 'Blue' });
  assert.deepEqual(hydrate?.holes[0]?.green, { lat: 35.522655, lng: -92.0393088 });
  assert.deepEqual(hydrate?.holes[1]?.tee, { lat: 35.5224589, lng: -92.039042, label: 'Blue' });
  assert.deepEqual(hydrate?.holes[1]?.green, { lat: 35.5226358, lng: -92.0379452 });
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  assert.equal(mapGolfApiCourseToHydrate({ course: THUNDERBIRD_COURSE, coordinates: { coordinates: [] } }), null);
});

test('golfapi fetch is null without a key and cache hit skips the network', async () => {
  resetGolfApiCacheForTests();
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let calls = 0;
  try {
    for (const name of names) delete process.env[name];
    assert.equal(getGolfApiKey(), null);
    assert.equal(
      await fetchGolfApiHydrate(
        { name: 'Thunderbird Country Club', city: 'Heber Springs' },
        { fetchImpl: async () => { calls += 1; throw new Error('no network'); } },
      ),
      null,
    );
    assert.equal(calls, 0);

    process.env.GOLFAPI_KEY = 'test-key';
    const seeded = mapGolfApiCourseToHydrate({
      course: THUNDERBIRD_COURSE,
      coordinates: THUNDERBIRD_COORDS,
    });
    assert.ok(seeded);
    saveCachedGolfApiHydrate(seeded!, ['namecity:thunderbird country club|heber springs']);
    const cached = await fetchGolfApiHydrate(
      { name: 'Thunderbird Country Club', city: 'Heber Springs' },
      { fetchImpl: async () => { calls += 1; throw new Error('cache should skip'); } },
    );
    assert.equal(cached?.courseKey, seeded?.courseKey);
    assert.equal(loadCachedGolfApiHydrate(seeded!.courseKey)?.holes.length, 2);
    assert.equal(calls, 0);
  } finally {
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});

test('golfapi fetch maps mocked search + coords and does not invent on empty GPS', async () => {
  resetGolfApiCacheForTests();
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.GOLFAPI_KEY = 'test-key';
    const urls: string[] = [];
    const fetched = await fetchGolfApiHydrate(
      { name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR' },
      {
        now: () => '2026-09-21T14:12:17Z',
        fetchImpl: async (input) => {
          const url = String(input);
          urls.push(url);
          if (url.includes('/courses?')) {
            return new Response(JSON.stringify([THUNDERBIRD_COURSE]), { status: 200 });
          }
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify(THUNDERBIRD_COORDS), { status: 200 });
          }
          return new Response(JSON.stringify(THUNDERBIRD_COURSE), { status: 200 });
        },
      },
    );
    assert.ok(fetched);
    assert.equal(fetched?.source, 'golfapi');
    assert.equal(fetched?.holes[0]?.tee?.lat, 35.5250149);
    assert.equal(urls.some((url) => url.includes('country=US')), true);
    assert.equal(urls.filter((url) => url.includes('/coordinates/')).length, 1);

    resetGolfApiCacheForTests();
    const thin = await fetchGolfApiHydrate(
      { name: 'Thunderbird Country Club', city: 'Heber Springs' },
      {
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify({ coordinates: [] }), { status: 200 });
          }
          return new Response(JSON.stringify(THUNDERBIRD_COURSE), { status: 200 });
        },
      },
    );
    assert.equal(thin, null);
    assert.equal(inventGreenFromClubhouse(), false);
  } finally {
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});
