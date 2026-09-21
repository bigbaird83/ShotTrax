import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCourseDataClient } from './client';
import { resetGolfApiCacheForTests, saveCachedGolfApiHydrate } from './golfapi';
import {
  attachCoursePaintCachePersist,
  createHttpCoursePaintCache,
  createMemoryCoursePaintCache,
  getSharedCoursePaintCache,
  resetCoursePaintCacheForTests,
  type CoursePaintCacheRecord,
} from './paintCache';
import {
  COURSE_PAINT_WATERFALL,
  cacheShortCircuitsPaidSources,
  gcaProCoordsPass,
  golfApiIsLastResort,
  loadGolfApiPaintCandidate,
  loadOsmOpenGolfCandidate,
  resolveCoursePaint,
  type PaintCandidate,
} from './waterfall';

const TEE = { lat: 35.5250149, lng: -92.0393432 };
const GREEN = { lat: 35.522655, lng: -92.0393088 };

function pair(hole: number, tee = TEE, green = GREEN): PaintCandidate['holes'][number] {
  const shift = (hole - 1) * 0.01;
  return {
    hole,
    tee: { lat: tee.lat + shift, lng: tee.lng },
    green: { lat: green.lat + shift, lng: green.lng },
  };
}

function osmHit(): PaintCandidate {
  return { source: 'osm', numHoles: 18, holes: [pair(1), pair(2)] };
}

function gcaHit(): PaintCandidate {
  return {
    source: 'gca',
    numHoles: 18,
    holes: [{ hole: 1, tee: null, green: GREEN }],
  };
}

function golfHit(): PaintCandidate {
  return { source: 'golfapi', numHoles: 18, holes: [pair(1)] };
}

function nineByTwoHit(): PaintCandidate {
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => pair(hole));
  const back = front.map((hole) => ({ ...hole, hole: hole.hole + 9, tee: { ...hole.tee! }, green: { ...hole.green! } }));
  return { source: 'golfapi', numHoles: 9, holes: [...front, ...back] };
}

const COURSE = { name: 'Waterfall CC', city: 'Heber Springs', state: 'AR', courseKey: 'wf-1' };

test('paint order is OSM, then GCA, then golfapi, and a cache hit skips paid calls', async () => {
  assert.deepEqual(COURSE_PAINT_WATERFALL, ['osm', 'gca', 'golfapi']);
  assert.equal(golfApiIsLastResort(), true);
  assert.equal(cacheShortCircuitsPaidSources(), true);
  assert.equal(gcaProCoordsPass([{ hole: 1, tee: null, green: null }]), false);
  assert.equal(gcaProCoordsPass(gcaHit().holes), true);

  const cache = createMemoryCoursePaintCache();
  const log: string[] = [];
  const osm = await resolveCoursePaint(COURSE, {
    cache,
    now: () => '2026-09-21T00:00:00Z',
    loadOsm: async () => {
      log.push('osm');
      return osmHit();
    },
    loadGca: async () => {
      log.push('gca');
      return gcaHit();
    },
    loadGolfApi: async () => {
      log.push('golfapi');
      return golfHit();
    },
  });
  assert.equal(osm.ok, true);
  assert.equal(osm.source, 'osm');
  assert.equal(osm.fromCache, false);
  assert.deepEqual(log, ['osm']);

  log.length = 0;
  const again = await resolveCoursePaint(COURSE, {
    cache,
    loadOsm: async () => {
      log.push('osm');
      return osmHit();
    },
    loadGca: async () => {
      log.push('gca');
      return gcaHit();
    },
    loadGolfApi: async () => {
      log.push('golfapi');
      return golfHit();
    },
  });
  assert.equal(again.ok, true);
  assert.equal(again.fromCache, true);
  assert.equal(again.source, 'osm');
  assert.deepEqual(log, []);
});

test('bundled Pleasant Valley is a free hit and skips GCA and golfapi', async () => {
  const log: string[] = [];
  const match = { name: 'Pleasant Valley Country Club', city: 'Little Rock', state: 'AR' };
  const result = await resolveCoursePaint(match, {
    cache: createMemoryCoursePaintCache(),
    loadOsm: async () => {
      log.push('osm');
      return loadOsmOpenGolfCandidate(match);
    },
    loadGca: async () => {
      log.push('gca');
      return gcaHit();
    },
    loadGolfApi: async () => {
      log.push('golfapi');
      return golfHit();
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'manual_verified');
  assert.equal(result.holes.length, 18);
  assert.deepEqual(log, ['osm']);
});

test('Thunderbird is HARD-MISS: golfapi seed, device cache, and network do not paint', async () => {
  const log: string[] = [];
  const match = {
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    courseKey: 'local:thunderbird-heber-springs-ar',
  };
  const poisoned = nineByTwoHit();
  const cache = createMemoryCoursePaintCache();
  await cache.put({
    v: 1,
    key: 'id:local:thunderbird-heber-springs-ar',
    aliases: ['name:thunderbird country club|heber springs|ar'],
    source: 'golfapi',
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    numHoles: 9,
    nineByTwo: true,
    fetchedAt: '2026-09-21T00:00:00Z',
    holes: poisoned.holes,
  });
  const result = await resolveCoursePaint(match, {
    cache,
    loadOsm: async () => {
      log.push('osm');
      return loadOsmOpenGolfCandidate(match);
    },
    loadGca: async () => {
      log.push('gca');
      return gcaHit();
    },
    loadGolfApi: async () => {
      log.push('golfapi');
      return poisoned;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.holes.length, 0);
  assert.deepEqual(log, ['osm']);
  assert.equal(await loadGolfApiPaintCandidate(match), null);

  log.length = 0;
  const osm = await resolveCoursePaint(match, {
    cache: createMemoryCoursePaintCache(),
    loadOsm: async () => {
      log.push('osm');
      return osmHit();
    },
    loadGca: async () => {
      log.push('gca');
      return gcaHit();
    },
    loadGolfApi: async () => {
      log.push('golfapi');
      return poisoned;
    },
  });
  assert.equal(osm.ok, true);
  assert.equal(osm.source, 'osm');
  assert.deepEqual(log, ['osm']);
});

test('OSM miss + GCA hit skips golfapi', async () => {
  const log: string[] = [];
  const result = await resolveCoursePaint(
    { ...COURSE, courseKey: 'wf-gca' },
    {
      cache: createMemoryCoursePaintCache(),
      loadOsm: async () => {
        log.push('osm');
        return null;
      },
      loadGca: async () => {
        log.push('gca');
        return gcaHit();
      },
      loadGolfApi: async () => {
        log.push('golfapi');
        return golfHit();
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.source, 'gca');
  assert.equal(result.fromCache, false);
  assert.deepEqual(result.holes[0]?.green, GREEN);
  assert.equal(result.holes[0]?.tee, null);
  assert.deepEqual(log, ['osm', 'gca']);
});

test('scorecard-only GCA is a miss and does not invent a green', async () => {
  const result = await resolveCoursePaint(
    { ...COURSE, courseKey: 'wf-score' },
    {
      cache: createMemoryCoursePaintCache(),
      loadOsm: async () => null,
      loadGca: async () => ({
        source: 'gca',
        numHoles: 18,
        holes: [{ hole: 1, tee: null, green: null, par: 4, yards: 400 }],
      }),
      loadGolfApi: async () => null,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.holes.length, 0);
});

test('both miss calls golfapi once, caches, and the second resolve makes 0 source calls', async () => {
  const store = new Map<string, string>();
  let gets = 0;
  let puts = 0;
  const cache = createHttpCoursePaintCache({
    baseUrl: 'https://paint-cache.test',
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (init?.method === 'PUT') {
        puts += 1;
        store.set(url, String(init.body));
        return new Response(init.body, { status: 200 });
      }
      gets += 1;
      const hit = store.get(url);
      return hit
        ? new Response(hit, { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { status: 404 });
    },
  });
  const log: string[] = [];
  const golf = nineByTwoHit();
  const first = await resolveCoursePaint(
    { ...COURSE, courseKey: 'wf-golf' },
    {
      cache,
      now: () => '2026-09-21T12:00:00Z',
      loadOsm: async () => {
        log.push('osm');
        return null;
      },
      loadGca: async () => {
        log.push('gca');
        return null;
      },
      loadGolfApi: async () => {
        log.push('golfapi');
        return golf;
      },
    },
  );
  assert.equal(first.ok, true);
  assert.equal(first.source, 'golfapi');
  assert.equal(first.nineByTwo, true);
  assert.equal(first.fromCache, false);
  assert.deepEqual(log, ['osm', 'gca', 'golfapi']);
  assert.equal(first.holes.find((hole) => hole.hole === 10)?.tee?.lat, first.holes[0]?.tee?.lat);
  assert.equal(first.holes.find((hole) => hole.hole === 10)?.green?.lng, first.holes[0]?.green?.lng);
  assert.ok(puts >= 1);

  log.length = 0;
  const getsBefore = gets;
  const putsBefore = puts;
  const second = await resolveCoursePaint(
    { ...COURSE, courseKey: 'wf-golf' },
    {
      cache,
      loadOsm: async () => {
        log.push('osm');
        return osmHit();
      },
      loadGca: async () => {
        log.push('gca');
        return gcaHit();
      },
      loadGolfApi: async () => {
        log.push('golfapi');
        throw new Error('golfapi must not run twice');
      },
    },
  );
  assert.equal(second.ok, true);
  assert.equal(second.fromCache, true);
  assert.equal(second.source, 'golfapi');
  assert.equal(second.nineByTwo, true);
  assert.deepEqual(log, []);
  assert.ok(gets > getsBefore);
  assert.equal(puts, putsBefore);
});

test('failed bundled golfapi seed fetches the network once and a PASS is cached', async () => {
  resetCoursePaintCacheForTests();
  resetGolfApiCacheForTests();
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const match = {
    name: 'Bad Seed CC',
    city: 'Nowhereville',
    state: 'ZZ',
    courseKey: 'bad-seed-id',
  };
  try {
    process.env.GOLFAPI_KEY = 'test-key';
    saveCachedGolfApiHydrate(
      {
        courseKey: 'golfapi:bad-seed',
        displayName: 'Bad Seed CC',
        locality: 'Nowhereville, ZZ',
        source: 'golfapi',
        sourceRef: 'test failed seed',
        fetchedAt: '2026-09-21T00:00:00Z',
        numHoles: 18,
        holes: [
          {
            hole: 1,
            par: 4,
            yards: 100,
            tee: { lat: 35.0, lng: -92.0, label: 'Blue' },
            green: { lat: 35.0, lng: -92.0 },
            greenFront: null,
            greenBack: null,
            greenDepthYards: null,
            greenWidthYards: null,
          },
        ],
      },
      ['bad-seed-id', 'namecity:bad seed cc|nowhereville'],
    );
    let coordinateCalls = 0;
    const cache = createMemoryCoursePaintCache();
    const result = await resolveCoursePaint(match, {
      cache,
      now: () => '2026-09-21T12:00:00Z',
      loadOsm: async () => null,
      loadGca: async () => null,
      loadGolfApi: () =>
        loadGolfApiPaintCandidate(match, {
          fetchImpl: async (input) => {
            const url = String(input);
            if (url.includes('/courses?')) {
              return new Response(
                JSON.stringify([
                  {
                    courseID: 'bad-refresh-1',
                    clubName: 'Bad Seed CC',
                    city: 'Nowhereville',
                    state: 'ZZ',
                    numHoles: 18,
                    parsMen: [4],
                    tees: [{ teeName: 'Blue', length1: 267 }],
                  },
                ]),
                { status: 200 },
              );
            }
            if (url.includes('/coordinates/')) {
              coordinateCalls += 1;
              return new Response(
                JSON.stringify({
                  coordinates: [
                    { poi: 1, location: 2, hole: 1, latitude: GREEN.lat, longitude: GREEN.lng },
                    { poi: 12, location: 2, hole: 1, latitude: TEE.lat, longitude: TEE.lng },
                  ],
                }),
                { status: 200 },
              );
            }
            return new Response(
              JSON.stringify({
                courseID: 'bad-refresh-1',
                clubName: 'Bad Seed CC',
                city: 'Nowhereville',
                state: 'ZZ',
                numHoles: 18,
                parsMen: [4],
                tees: [{ teeName: 'Blue', length1: 267 }],
              }),
              { status: 200 },
            );
          },
        }),
    });
    assert.equal(coordinateCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'golfapi');
    assert.equal(result.fromCache, false);
    assert.equal(result.nineByTwo, false);
    assert.equal(result.holes[0]?.tee?.lat, TEE.lat);
    assert.equal(result.holes[0]?.green?.lat, GREEN.lat);
    assert.notEqual(result.holes[0]?.tee?.lat, result.holes[0]?.green?.lat);
    const stored = await cache.get('id:bad-seed-id');
    assert.equal(stored?.source, 'golfapi');
    assert.equal(stored?.holes[0]?.tee?.lat, TEE.lat);
    assert.equal(stored?.holes[0]?.green?.lat, GREEN.lat);

    let secondCalls = 0;
    const again = await resolveCoursePaint(match, {
      cache,
      loadOsm: async () => {
        secondCalls += 1;
        return osmHit();
      },
      loadGca: async () => {
        secondCalls += 1;
        return gcaHit();
      },
      loadGolfApi: async () => {
        secondCalls += 1;
        throw new Error('passing cache must not refetch golfapi');
      },
    });
    assert.equal(again.ok, true);
    assert.equal(again.fromCache, true);
    assert.equal(again.source, 'golfapi');
    assert.equal(secondCalls, 0);
    assert.equal(coordinateCalls, 1);
  } finally {
    resetCoursePaintCacheForTests();
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});

test('golfapi 9-hole card without a back nine does not invent holes 10–18', async () => {
  const front = nineByTwoHit().holes.filter((hole) => hole.hole <= 9);
  const result = await resolveCoursePaint(
    { ...COURSE, courseKey: 'wf-nine' },
    {
      cache: createMemoryCoursePaintCache(),
      loadOsm: async () => null,
      loadGca: async () => null,
      loadGolfApi: async () => ({ source: 'golfapi', numHoles: 9, holes: front }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.nineByTwo, false);
  assert.deepEqual(
    result.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('device paint cache round-trips through the SQLite persist hook', async () => {
  resetCoursePaintCacheForTests();
  let blob: string | null = null;
  attachCoursePaintCachePersist({
    load: () => blob,
    save: (json) => {
      blob = json;
    },
  });
  const record: CoursePaintCacheRecord = {
    v: 1,
    key: 'id:device-1',
    aliases: ['name:device cc|cabot|ar'],
    source: 'golfapi',
    name: 'Device CC',
    city: 'Cabot',
    numHoles: 18,
    nineByTwo: false,
    fetchedAt: '2026-09-21T00:00:00Z',
    holes: [{ hole: 1, tee: TEE, green: GREEN }],
  };
  await getSharedCoursePaintCache().put(record);
  assert.ok(blob);
  resetCoursePaintCacheForTests();
  const snapshot = blob;
  attachCoursePaintCachePersist({
    load: () => snapshot,
    save: () => {},
  });
  const restored = await getSharedCoursePaintCache().get('name:device cc|cabot|ar');
  assert.equal(restored?.source, 'golfapi');
  assert.deepEqual(restored?.holes[0]?.tee, TEE);
  assert.deepEqual(restored?.holes[0]?.green, GREEN);
  resetCoursePaintCacheForTests();
});

test('device paint cache drops a poisoned Thunderbird golfapi row and keeps other courses', async () => {
  resetCoursePaintCacheForTests();
  const poisoned: CoursePaintCacheRecord = {
    v: 1,
    key: 'id:local:thunderbird-heber-springs-ar',
    aliases: ['name:thunderbird country club|heber springs|ar'],
    source: 'golfapi',
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    numHoles: 9,
    nineByTwo: true,
    fetchedAt: '2026-09-21T00:00:00Z',
    holes: [{ hole: 1, tee: TEE, green: GREEN }],
  };
  const other: CoursePaintCacheRecord = {
    v: 1,
    key: 'id:device-1',
    aliases: ['name:device cc|cabot|ar'],
    source: 'golfapi',
    name: 'Device CC',
    city: 'Cabot',
    numHoles: 18,
    nineByTwo: false,
    fetchedAt: '2026-09-21T00:00:00Z',
    holes: [{ hole: 1, tee: TEE, green: GREEN }],
  };
  const blob = JSON.stringify({ v: 1, records: { [poisoned.key]: poisoned, [other.key]: other } });
  let saved: string | null = null;
  attachCoursePaintCachePersist({
    load: () => blob,
    save: (json) => {
      saved = json;
    },
  });
  assert.equal(await getSharedCoursePaintCache().get(poisoned.key), null);
  assert.equal(await getSharedCoursePaintCache().get('name:thunderbird country club|heber springs|ar'), null);
  const kept = await getSharedCoursePaintCache().get('name:device cc|cabot|ar');
  assert.equal(kept?.name, 'Device CC');
  assert.equal(kept?.source, 'golfapi');
  assert.ok(saved);
  assert.equal(saved.includes('Thunderbird'), false);
  assert.equal(saved.includes('011141520629948893391'), false);
  resetCoursePaintCacheForTests();
});

test('getCourse buys golfapi once after OSM and GCA miss, then serves the cache', async () => {
  resetCoursePaintCacheForTests();
  resetGolfApiCacheForTests();
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let golfCalls = 0;
  let greenCalls = 0;
  try {
    process.env.GOLFAPI_KEY = 'test-key';
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('golfapi.io')) {
        golfCalls += 1;
        if (url.includes('/courses?')) {
          return new Response(
            JSON.stringify([
              {
                courseID: 'golf-501',
                clubName: 'Waterfall Miss CC',
                city: 'Nowhereville',
                state: 'ZZ',
                numHoles: 9,
                parsMen: [4],
                tees: [{ teeName: 'Blue', length1: 267 }],
              },
            ]),
            { status: 200 },
          );
        }
        if (url.includes('/coordinates/')) {
          const front = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((hole) => {
            const row = pair(hole);
            return [
              { poi: 1, location: 2, hole, latitude: row.green!.lat, longitude: row.green!.lng },
              { poi: 12, location: 2, hole, latitude: row.tee!.lat, longitude: row.tee!.lng },
            ];
          });
          const back = front.map((row) => ({ ...row, hole: row.hole + 9 }));
          return new Response(JSON.stringify({ coordinates: [...front, ...back] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            courseID: 'golf-501',
            clubName: 'Waterfall Miss CC',
            city: 'Nowhereville',
            state: 'ZZ',
            numHoles: 9,
            parsMen: [4, 4, 4, 4, 4, 4, 4, 4, 4],
            tees: [{ teeName: 'Blue', length1: 267 }],
          }),
          { status: 200 },
        );
      }
      if (url.includes('green-centers')) {
        greenCalls += 1;
        return new Response(JSON.stringify({ message: 'Pro only' }), { status: 403 });
      }
      return new Response(
        JSON.stringify({
          data: {
            id: 501,
            name: 'Waterfall Miss CC',
            city: 'Nowhereville',
            state: 'ZZ',
            scorecard: { hole_count: 9, teeboxes: [{ name: 'Blue', holes: [{ hole: 1, par: 4 }] }] },
          },
        }),
        { status: 200 },
      );
    };
    const client = createCourseDataClient({ getKey: () => 'gca-key', fetch: fetchImpl });
    const first = await client.getCourse('501');
    assert.equal(first?.holes[0]?.par, 4);
    assert.equal(first?.holes[0]?.teeCentroid?.lat, pair(1).tee?.lat);
    assert.equal(first?.holes[9]?.greenCentroid?.lat, pair(1).green?.lat);
    assert.ok(golfCalls > 0);
    assert.equal(greenCalls, 1);
    const golfAfter = golfCalls;
    const greensAfter = greenCalls;
    const second = await client.getCourse('501');
    assert.equal(second?.holes[0]?.teeCentroid?.lat, first?.holes[0]?.teeCentroid?.lat);
    assert.equal(second?.holes[9]?.teeCentroid?.lat, first?.holes[0]?.teeCentroid?.lat);
    assert.equal(golfCalls, golfAfter);
    assert.equal(greenCalls, greensAfter);
  } finally {
    resetCoursePaintCacheForTests();
    resetGolfApiCacheForTests();
    for (const name of names) {
      if (prev[name] == null) delete process.env[name];
      else process.env[name] = prev[name];
    }
  }
});
