import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { offlinePackFor, setFavorite, writeOfflinePack, type FavoriteCourse, type JsonStore } from '../domain/favorites';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from './hydrate';
import {
  backfillReadyFavoriteOverlays,
  downloadFavoriteForOffline,
  resetFavoriteOverlayBackfillForTests,
} from './offlineFavorite';
import {
  dropCourseOverlayMemory,
  hydrateOsmOverlayMemory,
  COURSE_OSM_OVERLAY_RADIUS_M,
  cachedOsmOverlay,
  fetchOsmOverlay,
  OSM_BUSY_BACKOFF_MS,
} from './osmOverlay';
import { ensureHoleTeeGreen } from './prefetch';
import {
  COURSE_OSM_OVERLAY_SETTING_KEY,
  attachCourseOsmOverlayPersist,
  loadCourseOsmOverlay,
  resetCourseOsmOverlayForTests,
  restoreCourseOsmOverlayCache,
  saveCourseOsmOverlay,
} from './osmOverlayStore';
import { createMemoryCoursePaintCache } from './paintCache';
import type { CoursePaintResult } from './waterfall';
import type { OsmOverlay, OsmOverlayQuery } from './types';
import { YARD_TEST_COURSE_ID } from './yardTestCourse';

const FETCHED_AT = '2026-09-26T12:00:00.000Z';
const GREEN_1 = { lat: 33.267, lng: -93.239 };
const GREEN_2 = { lat: 33.271, lng: -93.233 };
const TEE_1 = { lat: 33.264, lng: -93.242 };
const BUNKER = [
  { lat: 33.2672, lng: -93.2388 },
  { lat: 33.2674, lng: -93.2386 },
  { lat: 33.2673, lng: -93.2384 },
  { lat: 33.2672, lng: -93.2388 },
];

const COURSE_OVERLAY: OsmOverlay = {
  source: 'osm',
  geojson: { type: 'FeatureCollection', features: [] },
  features: [
    { kind: 'green', holeNumber: 1, coordinates: [GREEN_1, { lat: GREEN_1.lat + 0.0002, lng: GREEN_1.lng }] },
    { kind: 'green', holeNumber: 2, coordinates: [GREEN_2, { lat: GREEN_2.lat + 0.0002, lng: GREEN_2.lng }] },
    { kind: 'bunker', holeNumber: null, coordinates: BUNKER },
  ],
};

function memoryStore(): JsonStore {
  const raw = new Map<string, string>();
  return {
    get: (key) => raw.get(key) ?? null,
    set: (key, value) => {
      raw.set(key, value);
    },
  };
}

function favorite(id: string, location: FavoriteCourse['location']): FavoriteCourse {
  return { id, name: 'Magnolia Country Club', city: 'Magnolia', state: 'AR', country: 'US', location };
}

function readyPaint(): CoursePaintResult {
  return {
    ok: true,
    source: 'golfapi',
    fromCache: false,
    nineByTwo: false,
    holes: [
      { hole: 1, tee: TEE_1, green: GREEN_1, par: 4, yards: 410 },
      { hole: 2, tee: null, green: GREEN_2, par: 3, yards: 165 },
    ],
  };
}

function missPaint(): CoursePaintResult {
  return { ok: false, source: null, fromCache: false, nineByTwo: false, holes: [] };
}

describe('persisted OSM course overlays', { concurrency: 1 }, () => {
  test('setting key sits beside the paint cache and the hole screen reads it', () => {
    assert.equal(COURSE_OSM_OVERLAY_SETTING_KEY, 'course.osm.overlay');
    assert.equal(COURSE_OSM_OVERLAY_RADIUS_M, 1800);
    const provider = readFileSync(new URL('../db/DbProvider.tsx', import.meta.url), 'utf8');
    assert.match(provider, /attachCourseOsmOverlayPersist/);
    assert.match(provider, /hydrateOsmOverlayMemory/);
    const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
    assert.match(repo, /getCourseOsmOverlay/);
    const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
    assert.match(hole, /storedOverlay/);
    assert.match(hole, /cachedOsmOverlay/);
    assert.match(hole, /ensureHoleTeeGreen/);
  });

  test('a real course overlay round-trips and draws offline when the green shifts', async () => {
    resetCourseOsmOverlayForTests();
    dropCourseOverlayMemory('overlay-magnolia');
    const blob = { json: null as string | null };
    attachCourseOsmOverlayPersist({
      load: () => blob.json,
      save: (json) => {
        blob.json = json;
      },
    });

    const store = memoryStore();
    const course = favorite('overlay-magnolia', { lat: 33.26, lng: -93.24 });
    let query: OsmOverlayQuery | null = null;
    const status = await downloadFavoriteForOffline(course, store, {
      now: () => FETCHED_AT,
      resolve: async () => readyPaint(),
      fetchOverlay: async (next) => {
        query = next;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.ok(query);
    assert.equal(query?.holeNumber, undefined);
    assert.equal(query?.radiusM, 1800);
    assert.equal(query?.courseId, course.id);
    assert.deepEqual(query?.location, {
      lat: (GREEN_1.lat + GREEN_2.lat) / 2,
      lng: (GREEN_1.lng + GREEN_2.lng) / 2,
    });
    assert.ok(blob.json);
    assert.doesNotMatch(blob.json ?? '', /geojson/);
    assert.doesNotMatch(blob.json ?? '', /"par"/);
    assert.doesNotMatch(blob.json ?? '', /"yards"/);
    const saved = loadCourseOsmOverlay(course.id);
    assert.equal(saved?.source, 'osm');
    assert.equal(saved?.fetchedAt, FETCHED_AT);
    assert.equal(saved?.features.length, 3);
    assert.deepEqual(Object.keys(saved?.features[0] ?? {}).sort(), ['coordinates', 'holeNumber', 'kind']);
    assert.deepEqual(Object.keys(saved?.features[0]?.coordinates[0] ?? {}).sort(), ['lat', 'lng']);

    const shifted = { lat: GREEN_1.lat + 0.00021, lng: GREEN_1.lng - 0.00019 };
    const beforeRestart = cachedOsmOverlay({ courseId: course.id, holeNumber: 1, green: shifted });
    assert.equal(beforeRestart?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 1), true);
    assert.equal(beforeRestart?.features.some((feature) => feature.kind === 'bunker'), true);
    assert.equal(beforeRestart?.features.some((feature) => feature.holeNumber === 2), false);

    const snapshot = blob.json;
    resetCourseOsmOverlayForTests();
    dropCourseOverlayMemory(course.id);
    assert.equal(loadCourseOsmOverlay(course.id), null);
    attachCourseOsmOverlayPersist({
      load: () => snapshot,
      save: (json) => {
        blob.json = json;
      },
    });
    hydrateOsmOverlayMemory();
    assert.equal(loadCourseOsmOverlay(course.id)?.features.length, 3);

    let fetches = 0;
    const frame = await ensureHoleTeeGreen(
      {
        courseId: course.id,
        holeNumber: 1,
        tee: TEE_1,
        green: shifted,
        location: shifted,
      },
      {
        fetchOverlay: async () => {
          fetches += 1;
          throw new Error('offline');
        },
      },
    );
    assert.equal(fetches, 0);
    assert.deepEqual(frame.tee, TEE_1);
    assert.deepEqual(frame.green, shifted);
    const offline = cachedOsmOverlay({ courseId: course.id, holeNumber: 1, green: null });
    assert.deepEqual(
      offline?.features.find((feature) => feature.kind === 'green')?.coordinates[0],
      GREEN_1,
    );
    const hole2 = cachedOsmOverlay({
      courseId: course.id,
      holeNumber: 2,
      green: { lat: GREEN_2.lat + 0.0004, lng: GREEN_2.lng - 0.0002 },
    });
    assert.equal(hole2?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 2), true);
    assert.equal(hole2?.features.some((feature) => feature.holeNumber === 1), false);

    let refreshFetches = 0;
    const again = await downloadFavoriteForOffline(course, store, {
      now: () => '2026-09-26T13:00:00.000Z',
      resolve: async () => readyPaint(),
      fetchOverlay: async () => {
        refreshFetches += 1;
        return null;
      },
    });
    assert.equal(refreshFetches, 1);
    assert.equal(again, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(loadCourseOsmOverlay(course.id)?.fetchedAt, FETCHED_AT);
    assert.equal(loadCourseOsmOverlay(course.id)?.features.length, 3);

    const thrown = await downloadFavoriteForOffline(course, store, {
      now: () => '2026-09-26T14:00:00.000Z',
      resolve: async () => readyPaint(),
      fetchOverlay: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(thrown, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(loadCourseOsmOverlay(course.id)?.features.length, 3);
    resetCourseOsmOverlayForTests();
    dropCourseOverlayMemory(course.id);
  });

  test('a failed, empty, or unlocated overlay stores nothing and leaves Ready or Miss alone', async () => {
    resetCourseOsmOverlayForTests();
    const store = memoryStore();
    const course = favorite('overlay-fail', GREEN_1);
    let fetches = 0;
    const ready = await downloadFavoriteForOffline(course, store, {
      now: () => FETCHED_AT,
      resolve: async () => readyPaint(),
      fetchOverlay: async () => {
        fetches += 1;
        return null;
      },
    });
    assert.equal(fetches, 1);
    assert.equal(ready, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(loadCourseOsmOverlay(course.id), null);

    const empty = await downloadFavoriteForOffline(favorite('overlay-empty', GREEN_1), store, {
      now: () => FETCHED_AT,
      resolve: async () => readyPaint(),
      fetchOverlay: async () => ({ source: 'osm', features: [], geojson: null }),
    });
    assert.equal(empty, 'ready');
    assert.equal(offlinePackFor(store, 'overlay-empty')?.status, 'ready');
    assert.equal(loadCourseOsmOverlay('overlay-empty'), null);
    assert.equal(saveCourseOsmOverlay({ courseId: 'overlay-empty', fetchedAt: FETCHED_AT, source: 'osm', features: [] }), false);

    const missed = await downloadFavoriteForOffline(favorite('overlay-miss', GREEN_1), store, {
      now: () => FETCHED_AT,
      resolve: async () => missPaint(),
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(missed, 'miss');
    assert.equal(fetches, 1);
    assert.equal(loadCourseOsmOverlay('overlay-miss'), null);

    const noPin = await downloadFavoriteForOffline(
      favorite('overlay-nopin', null),
      store,
      {
        now: () => FETCHED_AT,
        resolve: async () => ({
          ok: true,
          source: 'osm',
          fromCache: false,
          nineByTwo: false,
          holes: [{ hole: 1, tee: null, green: null, par: 4, yards: 100 }],
        }),
        fetchOverlay: async () => {
          fetches += 1;
          return COURSE_OVERLAY;
        },
      },
    );
    assert.equal(noPin, 'ready');
    assert.equal(fetches, 1);
    assert.equal(loadCourseOsmOverlay('overlay-nopin'), null);

    restoreCourseOsmOverlayCache('{');
    restoreCourseOsmOverlayCache(JSON.stringify({ v: 1, courses: { bad: { source: 'gca', features: [] } } }));
    assert.equal(loadCourseOsmOverlay('bad'), null);
    resetCourseOsmOverlayForTests();
  });

  test('HARD-MISS and the yard test course skip the overlay fetch', async () => {
    resetCourseOsmOverlayForTests();
    const store = memoryStore();
    let fetches = 0;
    const tb = favorite(`local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`, THUNDERBIRD_HEBER_CLUBHOUSE);
    tb.name = 'Thunderbird Country Club';
    tb.city = 'Heber Springs';
    const status = await downloadFavoriteForOffline(tb, store, {
      now: () => FETCHED_AT,
      resolve: async () => {
        throw new Error('hard miss must not paint');
      },
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(status, 'miss');
    assert.equal(fetches, 0);
    assert.equal(offlinePackFor(store, tb.id)?.status, 'miss');
    assert.equal(loadCourseOsmOverlay(tb.id), null);

    let writes = 0;
    const yard = await downloadFavoriteForOffline(
      favorite(YARD_TEST_COURSE_ID, GREEN_1),
      {
        get: () => null,
        set: () => {
          writes += 1;
        },
      },
      {
        fetchOverlay: async () => {
          fetches += 1;
          return COURSE_OVERLAY;
        },
      },
    );
    assert.equal(yard, 'miss');
    assert.equal(fetches, 0);
    assert.equal(writes, 0);
    assert.equal(loadCourseOsmOverlay(YARD_TEST_COURSE_ID), null);
    resetCourseOsmOverlayForTests();
  });
});

function readyFavorite(store: JsonStore, course: FavoriteCourse, updatedAt = FETCHED_AT): void {
  setFavorite(store, course, true);
  writeOfflinePack(store, { courseId: course.id, status: 'ready', updatedAt });
}

describe('backfill overlays for Ready favorites', { concurrency: 1 }, () => {
  test('launch, Home, Favorites, and an open round each ask for the backfill', () => {
    const provider = readFileSync(new URL('../db/DbProvider.tsx', import.meta.url), 'utf8');
    assert.match(provider, /backfillReadyFavoriteOverlays\(readSettingStore\(opened\)\)/);
    const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
    assert.match(home, /backfillReadyFavoriteOverlays\(favoriteStore\)/);
    const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
    assert.match(favorites, /backfillReadyFavoriteOverlays\(store\)/);
    const round = readFileSync(new URL('../../app/round/[id]/_layout.tsx', import.meta.url), 'utf8');
    assert.match(round, /backfillReadyFavoriteOverlays/);
    assert.match(round, /courseApiId/);
  });

  test('a Ready favorite with no overlay is persisted once and the pack stays Ready', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('backfill-ready');
    const store = memoryStore();
    const course = favorite('backfill-ready', { lat: 33.26, lng: -93.24 });
    readyFavorite(store, course);
    const cache = createMemoryCoursePaintCache();
    await cache.put({
      v: 1,
      key: `id:${course.id}`,
      aliases: [],
      source: 'golfapi',
      name: course.name,
      city: course.city,
      numHoles: 18,
      nineByTwo: false,
      fetchedAt: FETCHED_AT,
      holes: [
        { hole: 1, tee: TEE_1, green: GREEN_1, par: 4, yards: 410 },
        { hole: 2, tee: null, green: GREEN_2, par: 3, yards: 165 },
      ],
    });
    const packs = store.get('course.offline.packs');
    let fetches = 0;
    let query: OsmOverlayQuery | null = null;
    await backfillReadyFavoriteOverlays(store, {
      now: () => '2026-09-26T15:00:00.000Z',
      cache,
      fetchOverlay: async (next) => {
        fetches += 1;
        query = next;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 1);
    assert.equal(query?.holeNumber, undefined);
    assert.equal(query?.radiusM, 1800);
    assert.equal(query?.courseId, course.id);
    assert.deepEqual(query?.location, {
      lat: (GREEN_1.lat + GREEN_2.lat) / 2,
      lng: (GREEN_1.lng + GREEN_2.lng) / 2,
    });
    const saved = loadCourseOsmOverlay(course.id);
    assert.equal(saved?.source, 'osm');
    assert.equal(saved?.fetchedAt, '2026-09-26T15:00:00.000Z');
    assert.equal(saved?.features.length, 3);
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.updatedAt, FETCHED_AT);
    assert.equal(store.get('course.offline.packs'), packs);

    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 1);
    dropCourseOverlayMemory(course.id);
  });

  test('a failed fetch stores nothing and is not retried until the next session', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('backfill-fail');
    dropCourseOverlayMemory('backfill-throw');
    const store = memoryStore();
    const course = favorite('backfill-fail', GREEN_1);
    readyFavorite(store, course);
    const packs = store.get('course.offline.packs');
    let fetches = 0;
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        fetches += 1;
        return null;
      },
    });
    assert.equal(fetches, 1);
    assert.equal(loadCourseOsmOverlay(course.id), null);
    assert.equal(store.get('course.offline.packs'), packs);
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 1);
    assert.equal(loadCourseOsmOverlay(course.id), null);

    const thrown = favorite('backfill-throw', GREEN_1);
    readyFavorite(store, thrown);
    let throws = 0;
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        throws += 1;
        throw new Error('offline');
      },
    });
    assert.equal(throws, 1);
    assert.equal(loadCourseOsmOverlay(thrown.id), null);
    assert.equal(offlinePackFor(store, thrown.id)?.status, 'ready');
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        throws += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(throws, 1);
    assert.equal(loadCourseOsmOverlay(thrown.id), null);
    dropCourseOverlayMemory(course.id);
    dropCourseOverlayMemory(thrown.id);
  });

  test('a course that already has a stored overlay is not refetched', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('backfill-stored');
    const store = memoryStore();
    const course = favorite('backfill-stored', GREEN_1);
    readyFavorite(store, course);
    assert.equal(
      saveCourseOsmOverlay({
        courseId: course.id,
        fetchedAt: FETCHED_AT,
        source: 'osm',
        features: COURSE_OVERLAY.features,
      }),
      true,
    );
    let fetches = 0;
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        fetches += 1;
        return {
          source: 'osm',
          geojson: null,
          features: [{ kind: 'water_hazard', holeNumber: 1, coordinates: BUNKER }],
        };
      },
    });
    assert.equal(fetches, 0);
    assert.equal(loadCourseOsmOverlay(course.id)?.fetchedAt, FETCHED_AT);
    assert.equal(loadCourseOsmOverlay(course.id)?.features.length, 3);
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    dropCourseOverlayMemory(course.id);
  });

  test('Ready favorites are fetched one at a time, open course first', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('backfill-a');
    dropCourseOverlayMemory('backfill-b');
    const store = memoryStore();
    const first = favorite('backfill-a', GREEN_1);
    const second = favorite('backfill-b', GREEN_2);
    readyFavorite(store, first);
    readyFavorite(store, second);
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const fetchOverlay = async (query: OsmOverlayQuery) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(query.courseId ?? '');
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return COURSE_OVERLAY;
    };
    await Promise.all([
      backfillReadyFavoriteOverlays(store, { courseId: first.id, fetchOverlay }),
      backfillReadyFavoriteOverlays(store, { courseId: second.id, fetchOverlay }),
    ]);
    assert.deepEqual(order, [first.id, second.id]);
    assert.equal(maxInFlight, 1);
    assert.equal(loadCourseOsmOverlay(first.id)?.features.length, 3);
    assert.equal(loadCourseOsmOverlay(second.id)?.features.length, 3);
    assert.equal(offlinePackFor(store, first.id)?.updatedAt, FETCHED_AT);
    assert.equal(offlinePackFor(store, second.id)?.updatedAt, FETCHED_AT);
    dropCourseOverlayMemory(first.id);
    dropCourseOverlayMemory(second.id);
  });

  test('a Miss pack and a hard-miss favorite are not fetched', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    const store = memoryStore();
    const missed = favorite('backfill-miss', GREEN_1);
    setFavorite(store, missed, true);
    writeOfflinePack(store, { courseId: missed.id, status: 'miss', updatedAt: FETCHED_AT });
    const tb = favorite(`local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`, THUNDERBIRD_HEBER_CLUBHOUSE);
    tb.name = 'Thunderbird Country Club';
    tb.city = 'Heber Springs';
    readyFavorite(store, tb);
    let fetches = 0;
    await backfillReadyFavoriteOverlays(store, {
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 0);
    assert.equal(loadCourseOsmOverlay(missed.id), null);
    assert.equal(loadCourseOsmOverlay(tb.id), null);
    assert.equal(offlinePackFor(store, missed.id)?.status, 'miss');
    assert.equal(offlinePackFor(store, tb.id)?.status, 'ready');
  });

  test('backfill retries a busy course later in the same session', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    const busyId = 'backfill-busy';
    const nextId = 'backfill-after-busy';
    dropCourseOverlayMemory(busyId);
    dropCourseOverlayMemory(nextId);
    const store = memoryStore();
    const busy = favorite(busyId, GREEN_1);
    const next = favorite(nextId, GREEN_2);
    readyFavorite(store, next);
    readyFavorite(store, busy);
    let now = 1_700_000_000_000;
    const nowMs = () => now;
    let busyCalls = 0;
    let nextCalls = 0;
    const bodyFor = (lat: number, lng: number) => ({
      elements: [
        {
          type: 'way',
          tags: { golf: 'green', ref: '1' },
          geometry: [
            { lat, lon: lng },
            { lat: lat + 0.0002, lon: lng },
          ],
        },
      ],
    });
    const fetchOverlay = (query: OsmOverlayQuery) =>
      fetchOsmOverlay(query, {
        retryDelayMs: 0,
        nowMs,
        getBaseUrl: () => 'https://share.test',
        fetch: async (input) => {
          const courseId = new URL(String(input)).searchParams.get('courseId');
          if (courseId === busyId) {
            busyCalls += 1;
            if (busyCalls <= 2) {
              return new Response(JSON.stringify({ error: 'upstream_busy' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(JSON.stringify(bodyFor(GREEN_1.lat, GREEN_1.lng)), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          nextCalls += 1;
          return new Response(JSON.stringify(bodyFor(GREEN_2.lat, GREEN_2.lng)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      });
    try {
      await backfillReadyFavoriteOverlays(store, {
        nowMs,
        fetchOverlay,
        now: () => '2026-09-26T16:00:00.000Z',
      });
      assert.equal(busyCalls, 2);
      assert.equal(nextCalls, 1);
      assert.equal(loadCourseOsmOverlay(busyId), null);
      assert.equal(loadCourseOsmOverlay(nextId)?.features.length, 1);
      assert.equal(offlinePackFor(store, busyId)?.status, 'ready');
      assert.equal(offlinePackFor(store, busyId)?.updatedAt, FETCHED_AT);
      assert.equal(offlinePackFor(store, nextId)?.updatedAt, FETCHED_AT);

      await backfillReadyFavoriteOverlays(store, { nowMs, fetchOverlay });
      assert.equal(busyCalls, 2);
      assert.equal(nextCalls, 1);
      assert.equal(loadCourseOsmOverlay(busyId), null);

      now += OSM_BUSY_BACKOFF_MS[0];
      await backfillReadyFavoriteOverlays(store, {
        nowMs,
        fetchOverlay,
        now: () => '2026-09-26T16:01:00.000Z',
      });
      assert.equal(busyCalls, 3);
      assert.equal(nextCalls, 1);
      assert.equal(loadCourseOsmOverlay(busyId)?.source, 'osm');
      assert.equal(loadCourseOsmOverlay(busyId)?.features.length, 1);
      assert.equal(loadCourseOsmOverlay(busyId)?.features[0]?.coordinates[0]?.lat, GREEN_1.lat);
      assert.equal(offlinePackFor(store, busyId)?.status, 'ready');
      assert.equal(offlinePackFor(store, busyId)?.updatedAt, FETCHED_AT);
    } finally {
      dropCourseOverlayMemory(busyId);
      dropCourseOverlayMemory(nextId);
    }
  });

  test('Worker upstream_busy stores nothing and leaves Ready alone', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('overlay-worker-busy');
    const store = memoryStore();
    const course = favorite('overlay-worker-busy', GREEN_1);
    const urls: string[] = [];
    const status = await downloadFavoriteForOffline(course, store, {
      now: () => FETCHED_AT,
      resolve: async () => readyPaint(),
      fetchOverlay: (query) =>
        fetchOsmOverlay(query, {
          retryDelayMs: 0,
          getBaseUrl: () => 'https://share.test',
          fetch: async (input) => {
            urls.push(String(input));
            return new Response(JSON.stringify({ error: 'upstream_busy' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
            });
          },
        }),
    });
    assert.equal(status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.updatedAt, FETCHED_AT);
    assert.equal(loadCourseOsmOverlay(course.id), null);
    assert.equal(urls.length, 2);
    assert.equal(urls.every((url) => url.includes('/osm/v1/overlay?')), true);
    assert.equal(urls.some((url) => url.includes('overpass')), false);
    dropCourseOverlayMemory(course.id);
  });

  test('a Worker timeout does not store an overlay', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('overlay-worker-timeout');
    const store = memoryStore();
    const course = favorite('overlay-worker-timeout', GREEN_1);
    const urls: string[] = [];
    const status = await downloadFavoriteForOffline(course, store, {
      now: () => FETCHED_AT,
      resolve: async () => readyPaint(),
      fetchOverlay: (query) =>
        fetchOsmOverlay(query, {
          retryDelayMs: 0,
          workerTimeoutMs: 30,
          getBaseUrl: () => 'https://share.test',
          fetch: async (input, init) => {
            const url = String(input);
            urls.push(url);
            if (url.includes('/osm/v1/overlay')) {
              assert.equal(new URL(url).searchParams.get('lat'), GREEN_1.lat.toFixed(4));
              assert.equal(new URL(url).searchParams.get('lng'), GREEN_1.lng.toFixed(4));
              assert.equal(new URL(url).searchParams.get('radius'), '1800');
              await new Promise((_resolve, reject) => {
                const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
                if (init?.signal?.aborted) onAbort();
                else init?.signal?.addEventListener('abort', onAbort, { once: true });
              });
            }
            return new Response('no', { status: 500 });
          },
        }),
    });
    assert.equal(status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
    assert.equal(offlinePackFor(store, course.id)?.updatedAt, FETCHED_AT);
    assert.equal(loadCourseOsmOverlay(course.id), null);
    assert.equal(urls.some((url) => url.includes('/osm/v1/overlay?')), true);
    assert.equal(urls.some((url) => url.includes('overpass')), true);
    dropCourseOverlayMemory(course.id);
  });

  test('no query center does not spend the session attempt', async () => {
    resetCourseOsmOverlayForTests();
    resetFavoriteOverlayBackfillForTests();
    dropCourseOverlayMemory('backfill-nocenter');
    const store = memoryStore();
    const course = favorite('backfill-nocenter', null);
    readyFavorite(store, course);
    let fetches = 0;
    await backfillReadyFavoriteOverlays(store, {
      loadCenter: async () => null,
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 0);
    assert.equal(loadCourseOsmOverlay(course.id), null);
    await backfillReadyFavoriteOverlays(store, {
      loadCenter: async () => GREEN_1,
      fetchOverlay: async () => {
        fetches += 1;
        return COURSE_OVERLAY;
      },
    });
    assert.equal(fetches, 1);
    assert.equal(loadCourseOsmOverlay(course.id)?.features.length, 3);
    dropCourseOverlayMemory(course.id);
  });
});
