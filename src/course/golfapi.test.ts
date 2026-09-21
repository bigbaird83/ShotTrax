import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchGolfApiHydrate,
  getGolfApiKey,
  loadCachedGolfApiHydrate,
  loadCachedHydrate,
  mapGolfApiCourseToHydrate,
  resetGolfApiCacheForTests,
  saveCachedGolfApiHydrate,
  saveCachedHydrate,
} from './golfapi';
import {
  fillCourseDetailFromGolfApi,
  inventGreenFromClubhouse,
  inventGreenFromScorecardYards,
} from './hydrate';
import type { CourseDetail } from './types';

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
    const poisoned = mapGolfApiCourseToHydrate({
      course: THUNDERBIRD_COURSE,
      coordinates: THUNDERBIRD_COORDS,
    });
    assert.ok(poisoned);
    saveCachedGolfApiHydrate(poisoned!, ['namecity:thunderbird country club|heber springs']);
    assert.equal(loadCachedGolfApiHydrate(poisoned!.courseKey), null);
    const blocked = await fetchGolfApiHydrate(
      { name: 'Thunderbird Country Club', city: 'Heber Springs' },
      { fetchImpl: async () => { calls += 1; throw new Error('thunderbird must not call golfapi'); } },
    );
    assert.equal(blocked, null);
    assert.equal(calls, 0);

    const other = mapGolfApiCourseToHydrate({
      course: {
        ...THUNDERBIRD_COURSE,
        courseID: 'sample-municipal-1',
        clubName: 'Sample Municipal',
        city: 'Conway',
      },
      coordinates: THUNDERBIRD_COORDS,
    });
    assert.ok(other);
    saveCachedGolfApiHydrate(other!, ['namecity:sample municipal|conway']);
    const cached = await fetchGolfApiHydrate(
      { name: 'Sample Municipal', city: 'Conway' },
      { fetchImpl: async () => { calls += 1; throw new Error('cache should skip'); } },
    );
    assert.equal(cached?.courseKey, other?.courseKey);
    assert.equal(loadCachedGolfApiHydrate(other!.courseKey)?.holes.length, 2);
    assert.equal(loadCachedHydrate(other!.courseKey)?.holes.length, 2);
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
  const sample = {
    ...THUNDERBIRD_COURSE,
    courseID: 'sample-municipal-1',
    clubName: 'Sample Municipal',
    city: 'Conway',
  };
  try {
    process.env.GOLFAPI_KEY = 'test-key';
    let thunderbirdCalls = 0;
    assert.equal(
      await fetchGolfApiHydrate(
        { name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR' },
        {
          fetchImpl: async () => {
            thunderbirdCalls += 1;
            throw new Error('thunderbird network golfapi is blocked');
          },
        },
      ),
      null,
    );
    assert.equal(thunderbirdCalls, 0);

    const urls: string[] = [];
    const fetched = await fetchGolfApiHydrate(
      { name: 'Sample Municipal', city: 'Conway', state: 'AR' },
      {
        now: () => '2026-09-21T14:12:17Z',
        fetchImpl: async (input) => {
          const url = String(input);
          urls.push(url);
          if (url.includes('/courses?')) {
            return new Response(JSON.stringify([sample]), { status: 200 });
          }
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify(THUNDERBIRD_COORDS), { status: 200 });
          }
          return new Response(JSON.stringify(sample), { status: 200 });
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
      { name: 'Sample Municipal', city: 'Conway' },
      {
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify({ coordinates: [] }), { status: 200 });
          }
          return new Response(JSON.stringify(sample), { status: 200 });
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

const MISS_DETAIL: CourseDetail = {
  id: '99',
  name: 'Unknown CC',
  holeCount: 2,
  location: null,
  city: 'Heber Springs',
  state: 'AR',
  holes: [
    {
      holeNumber: 1,
      par: 4,
      yards: null,
      handicap: null,
      greenCentroid: null,
      greenFront: null,
      greenBack: null,
      greenDepthYards: null,
      teeCentroid: null,
    },
  ],
  tees: [],
  greenCentersAvailable: false,
};

test('fillCourseDetailFromGolfApi cache hit skips network and empty coords do not invent', async () => {
  resetGolfApiCacheForTests();
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let calls = 0;
  try {
    process.env.GOLFAPI_KEY = 'test-key';
    const seeded = mapGolfApiCourseToHydrate({
      course: {
        ...THUNDERBIRD_COURSE,
        courseID: 'unknown-cc-99',
        clubName: 'Unknown CC',
      },
      coordinates: THUNDERBIRD_COORDS,
    });
    assert.ok(seeded);
    saveCachedHydrate(seeded!, ['99', 'namecity:unknown cc|heber springs']);
    const filled = await fillCourseDetailFromGolfApi(
      MISS_DETAIL,
      { name: 'Unknown CC', city: 'Heber Springs', courseKey: '99' },
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error('cache should skip');
        },
      },
    );
    assert.equal(filled?.holes[0]?.teeCentroid?.lat, 35.5250149);
    assert.equal(filled?.holes[0]?.greenCentroid?.lat, 35.522655);
    assert.equal(calls, 0);

    resetGolfApiCacheForTests();
    const thinCourse = {
      courseID: 'thin-1',
      clubName: 'Unknown Thin CC',
      city: 'Nowhere',
      state: 'AR',
    };
    const thin = await fillCourseDetailFromGolfApi(
      { ...MISS_DETAIL, id: 'thin-1', name: 'Unknown Thin CC', city: 'Nowhere' },
      { name: 'Unknown Thin CC', city: 'Nowhere', courseKey: 'thin-1' },
      {
        fetchImpl: async (input) => {
          calls += 1;
          const url = String(input);
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify({ coordinates: [] }), { status: 200 });
          }
          return new Response(JSON.stringify(thinCourse), { status: 200 });
        },
      },
    );
    assert.equal(thin?.holes[0]?.greenCentroid, null);
    assert.equal(thin?.holes[0]?.teeCentroid, null);
    assert.equal(inventGreenFromClubhouse(), false);
    assert.equal(inventGreenFromScorecardYards(), false);
  } finally {
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});
