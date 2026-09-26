import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchGolfApiHydrate,
  getGolfApiBase,
  loadCachedGolfApiHydrate,
  loadCachedHydrate,
  mapGolfApiCourseToHydrate,
  pickGolfApiSearchHit,
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
  const names = ['EXPO_PUBLIC_SHARE_SYNC_URL'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let calls = 0;
  try {
    for (const name of names) delete process.env[name];
    assert.equal(getGolfApiBase(), null);
    assert.equal(
      await fetchGolfApiHydrate(
        { name: 'Thunderbird Country Club', city: 'Heber Springs' },
        { fetchImpl: async () => { calls += 1; throw new Error('no network'); } },
      ),
      null,
    );
    assert.equal(calls, 0);

    process.env.EXPO_PUBLIC_SHARE_SYNC_URL = 'https://share.test';
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
  const names = ['EXPO_PUBLIC_SHARE_SYNC_URL'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const sample = {
    ...THUNDERBIRD_COURSE,
    courseID: 'sample-municipal-1',
    clubName: 'Sample Municipal',
    city: 'Conway',
  };
  try {
    process.env.EXPO_PUBLIC_SHARE_SYNC_URL = 'https://share.test';
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
        fetchImpl: async (input, init) => {
          const url = String(input);
          urls.push(url);
          assert.equal(new Headers(init?.headers).get('Authorization'), null);
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
    const searchUrls = urls.filter((url) => new URL(url).pathname.endsWith('/courses'));
    assert.equal(searchUrls.length, 1);
    const searchParams = new URL(searchUrls[0] ?? '').searchParams;
    assert.equal(searchParams.get('country'), 'US');
    assert.equal(searchParams.get('name'), 'Sample Municipal');
    assert.equal(searchParams.has('q'), false);
    assert.equal(urls.every((url) => url.startsWith('https://share.test/golfapi/v2.3/')), true);
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
  const names = ['EXPO_PUBLIC_SHARE_SYNC_URL'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let calls = 0;
  try {
    process.env.EXPO_PUBLIC_SHARE_SYNC_URL = 'https://share.test';
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

const HIDDEN_HILLS = {
  name: 'Hidden Hills Golf Club',
  city: 'Jacksonville',
  state: 'FL',
  courseKey: '2936',
};

const HIDDEN_HILLS_HIT = {
  courseID: '012141520702871450040',
  clubName: 'Hidden Hills Golf Course',
  city: 'Jacksonville',
  state: 'FL',
};

test('golfapi matches Hidden Hills Golf Club to Hidden Hills Golf Course', () => {
  const picked = pickGolfApiSearchHit(HIDDEN_HILLS, [
    HIDDEN_HILLS_HIT,
    HIDDEN_HILLS_HIT,
    {
      courseID: 'fixture-hidden-hills-north',
      clubName: 'Hidden Hills North',
      city: 'Jacksonville',
      state: 'FL',
    },
  ]);
  assert.equal(picked?.courseID, '012141520702871450040');
});

test('golfapi state match treats USPS codes and full names as the same state', () => {
  assert.equal(
    pickGolfApiSearchHit({ ...HIDDEN_HILLS, state: 'FL' }, [{ ...HIDDEN_HILLS_HIT, state: 'Florida' }])
      ?.courseID,
    '012141520702871450040',
  );
  assert.equal(
    pickGolfApiSearchHit({ ...HIDDEN_HILLS, state: 'Florida' }, [{ ...HIDDEN_HILLS_HIT, state: 'fl' }])
      ?.courseID,
    '012141520702871450040',
  );
  assert.equal(
    pickGolfApiSearchHit(HIDDEN_HILLS, [{ ...HIDDEN_HILLS_HIT, courseID: 'fixture-ga', state: 'GA' }]),
    null,
  );
  assert.equal(
    pickGolfApiSearchHit(HIDDEN_HILLS, [
      { ...HIDDEN_HILLS_HIT, courseID: 'fixture-georgia', state: 'Georgia' },
    ]),
    null,
  );
});

test('golfapi rejects the same name in another state or another city', () => {
  assert.equal(
    pickGolfApiSearchHit(HIDDEN_HILLS, [
      { ...HIDDEN_HILLS_HIT, courseID: 'fixture-other-state', state: 'ZZ' },
    ]),
    null,
  );
  assert.equal(
    pickGolfApiSearchHit(HIDDEN_HILLS, [
      { ...HIDDEN_HILLS_HIT, courseID: 'fixture-other-city', city: 'Other City' },
    ]),
    null,
  );
});

test('golfapi generic-only names fall back to the full name', () => {
  const place = { city: 'Conway', state: 'AR' };
  assert.equal(
    pickGolfApiSearchHit(
      { name: 'The Golf & Country Club', ...place },
      [{ courseID: 'generic-same', clubName: 'The Golf & Country Club', ...place }],
    )?.courseID,
    'generic-same',
  );
  assert.equal(
    pickGolfApiSearchHit(
      { name: 'The Golf & Country Club', ...place },
      [{ courseID: 'generic-other', clubName: 'Golf Club', ...place }],
    ),
    null,
  );
  assert.equal(
    pickGolfApiSearchHit(
      { name: 'Sample Hills G.C.', ...place },
      [{ courseID: 'gc-1', courseName: 'The Links of Sample Hills', ...place }],
    )?.courseID,
    'gc-1',
  );
});

test('golfapi ambiguous hits return no match', () => {
  const place = { city: 'Conway', state: 'AR' };
  assert.equal(
    pickGolfApiSearchHit({ name: 'Sample Hills Golf Club', ...place }, [
      { courseID: 'amb-1', clubName: 'Sample Hills Golf Course', ...place },
      { courseID: 'amb-2', clubName: 'Sample Hills Country Club', ...place },
    ]),
    null,
  );
  assert.equal(
    pickGolfApiSearchHit({ name: 'Sample Hills Golf Club', ...place }, [
      { courseID: 'amb-north', clubName: 'Sample Hills North', ...place },
      { courseID: 'amb-south', clubName: 'Sample Hills South', ...place },
    ]),
    null,
  );
});

test('golfapi search uses name= and a miss retries once', async () => {
  resetGolfApiCacheForTests();
  const names = ['EXPO_PUBLIC_SHARE_SYNC_URL'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.EXPO_PUBLIC_SHARE_SYNC_URL = 'https://share.test';
    const urls: string[] = [];
    const missed = await fetchGolfApiHydrate(HIDDEN_HILLS, {
      fetchImpl: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ courses: [] }), { status: 200 });
      },
    });
    assert.equal(missed, null);
    assert.equal(urls.length, 2);
    const first = new URL(urls[0] ?? '');
    const second = new URL(urls[1] ?? '');
    assert.equal(first.searchParams.get('country'), 'US');
    assert.equal(first.searchParams.get('name'), 'Hidden Hills Golf Club');
    assert.equal(first.searchParams.has('q'), false);
    assert.deepEqual([...first.searchParams.keys()].sort(), ['country', 'name']);
    assert.equal(second.searchParams.get('country'), 'US');
    assert.equal(second.searchParams.get('name'), 'Hidden Hills');
    assert.equal(second.searchParams.has('q'), false);
    assert.equal(urls.some((url) => url.includes('/coordinates/')), false);
    assert.equal(urls.some((url) => /\/courses\/[^?]/.test(url)), false);
  } finally {
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});

test('golfapi full-name hit does not retry, then the cache skips the network', async () => {
  resetGolfApiCacheForTests();
  const names = ['EXPO_PUBLIC_SHARE_SYNC_URL'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const sample = {
    ...THUNDERBIRD_COURSE,
    courseID: 'sample-municipal-1',
    clubName: 'Sample Municipal Golf Course',
    city: 'Conway',
    state: 'AR',
  };
  try {
    process.env.EXPO_PUBLIC_SHARE_SYNC_URL = 'https://share.test';
    const urls: string[] = [];
    const fetched = await fetchGolfApiHydrate(
      { name: 'Sample Municipal Golf Club', city: 'Conway', state: 'AR', courseKey: 'sample-1' },
      {
        now: () => '2026-09-21T14:12:17Z',
        fetchImpl: async (input) => {
          const url = String(input);
          urls.push(url);
          if (new URL(url).pathname.endsWith('/courses')) {
            return new Response(JSON.stringify([sample]), { status: 200 });
          }
          if (url.includes('/coordinates/')) {
            return new Response(JSON.stringify(THUNDERBIRD_COORDS), { status: 200 });
          }
          return new Response(JSON.stringify(sample), { status: 200 });
        },
      },
    );
    assert.equal(fetched?.courseKey, 'golfapi:sample-municipal-1');
    const searches = urls.filter((url) => new URL(url).pathname.endsWith('/courses'));
    assert.equal(searches.length, 1);
    assert.equal(new URL(searches[0] ?? '').searchParams.get('name'), 'Sample Municipal Golf Club');
    assert.equal(urls.length, 3);
    let extra = 0;
    const again = await fetchGolfApiHydrate(
      { name: 'Sample Municipal Golf Club', city: 'Conway', state: 'AR', courseKey: 'sample-1' },
      {
        fetchImpl: async () => {
          extra += 1;
          throw new Error('cache should skip');
        },
      },
    );
    assert.equal(again?.courseKey, fetched?.courseKey);
    assert.equal(extra, 0);
  } finally {
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});
