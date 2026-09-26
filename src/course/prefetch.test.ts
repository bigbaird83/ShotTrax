import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAGNOLIA_CC } from '../domain/reproCourseCard';
import {
  cameraFallsBackToPhoneForFraming,
  cameraFrameFromCache,
  cameraReadsCachedTeeGreenOnly,
  ensureHoleTeeGreen,
  prefetchCourseCard,
  rememberLayoutHoles,
  satelliteTilesBulkDownload,
  satelliteTilesWarmPerHole,
  startRoundBlocksOnCardPrefetch,
} from './prefetch';
import { cachedOsmOverlay, cachedResolvedTee, rememberResolvedTee } from './osmOverlay';
import type { CourseLayoutSeed } from './layout';
import type { OsmOverlay, OsmOverlayQuery } from './types';

const tee = MAGNOLIA_CC.hole1.tee;
const green = MAGNOLIA_CC.hole1.green;
const home = { lat: 40.7128, lng: -74.006 };

function layout(holes: CourseLayoutSeed['holes']): CourseLayoutSeed {
  return {
    apiId: 'prefetch-course',
    name: 'Prefetch CC',
    location: tee,
    holes,
  };
}

test('Start Round does not block hole 1 on whole-card prefetch', () => {
  assert.equal(startRoundBlocksOnCardPrefetch(), false);
  assert.equal(cameraReadsCachedTeeGreenOnly(), true);
  assert.equal(cameraFallsBackToPhoneForFraming(), false);
  assert.equal(satelliteTilesWarmPerHole(), true);
  assert.equal(satelliteTilesBulkDownload(), false);

  const homeSrc = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(homeSrc, /prefetchCourseCardInBackground/);
  assert.doesNotMatch(homeSrc, /fillLayoutTeesFromOsm/);
  const apply = homeSrc.slice(homeSrc.indexOf('const applyPickedCourse'), homeSrc.indexOf('const commitPick'));
  assert.ok(apply.indexOf('startRound') < apply.indexOf('prefetchCourseCardInBackground'));
  assert.ok(apply.indexOf('router.push') < apply.indexOf('prefetchCourseCardInBackground'));

  const watch = readFileSync(new URL('../services/watchNearby.ts', import.meta.url), 'utf8');
  assert.match(watch, /prefetchCourseCardInBackground/);
  assert.doesNotMatch(watch, /fillLayoutTeesFromOsm/);
});

test('camera reads cached tee+green only and never the phone', () => {
  rememberResolvedTee({ courseId: 'cache-1', holeNumber: 1, green }, tee);
  const camera = cameraFrameFromCache({
    courseId: 'cache-1',
    holeNumber: 1,
    tee: null,
    green,
    phone: home,
  });
  assert.deepEqual(camera?.points, [tee, green]);
  assert.equal(
    cameraFrameFromCache({
      courseId: 'cache-1',
      holeNumber: 2,
      tee: null,
      green,
      phone: home,
    }),
    null,
  );
  assert.equal(
    cameraFrameFromCache({
      courseId: 'cache-1',
      holeNumber: 1,
      tee: null,
      green: null,
      phone: home,
    }),
    null,
  );
});

test('missing hole fetches that hole only — never invents from the phone', async () => {
  const overlay: OsmOverlay = {
    source: 'osm',
    geojson: null,
    features: [
      {
        kind: 'hole',
        holeNumber: 3,
        coordinates: [tee, green],
      },
    ],
  };
  let fetched = 0;
  const frame = await ensureHoleTeeGreen(
    {
      courseId: 'fetch-1',
      holeNumber: 3,
      tee: null,
      green,
      location: green,
    },
    {
      fetchOverlay: async () => {
        fetched += 1;
        return overlay;
      },
    },
  );
  assert.equal(fetched, 1);
  assert.equal(frame.fetched, true);
  assert.equal(frame.fromCache, false);
  assert.deepEqual(frame.tee, tee);
  assert.deepEqual(frame.green, green);
  assert.deepEqual(cachedResolvedTee({ courseId: 'fetch-1', holeNumber: 3, green }), tee);
  assert.equal(cachedOsmOverlay({ courseId: 'fetch-1', holeNumber: 3, green }), overlay);

  const cached = await ensureHoleTeeGreen(
    {
      courseId: 'fetch-1',
      holeNumber: 3,
      tee: null,
      green,
      location: home,
    },
    {
      fetchOverlay: async () => {
        fetched += 1;
        return null;
      },
    },
  );
  assert.equal(fetched, 1);
  assert.equal(cached.fromCache, true);
  assert.deepEqual(cached.tee, tee);
  assert.equal(cachedOsmOverlay({ courseId: 'fetch-1', holeNumber: 3, green }), overlay);
});

test('tee+green already present still remembers hazard overlays from Overpass', async () => {
  const bunker = [
    { lat: green.lat + 0.0004, lng: green.lng + 0.0002 },
    { lat: green.lat + 0.0005, lng: green.lng + 0.0003 },
    { lat: green.lat + 0.0004, lng: green.lng + 0.0004 },
    { lat: green.lat + 0.0004, lng: green.lng + 0.0002 },
  ];
  const water = [
    { lat: green.lat - 0.0006, lng: green.lng - 0.0002 },
    { lat: green.lat - 0.0005, lng: green.lng - 0.0001 },
    { lat: green.lat - 0.0007, lng: green.lng },
    { lat: green.lat - 0.0006, lng: green.lng - 0.0002 },
  ];
  const lateral = [
    { lat: green.lat + 0.0002, lng: green.lng - 0.0005 },
    { lat: green.lat + 0.0003, lng: green.lng - 0.0004 },
    { lat: green.lat + 0.0001, lng: green.lng - 0.0003 },
    { lat: green.lat + 0.0002, lng: green.lng - 0.0005 },
  ];
  const cartpath = [
    { lat: tee.lat, lng: tee.lng + 0.0003 },
    { lat: green.lat, lng: green.lng + 0.0003 },
  ];
  const hazards: OsmOverlay = {
    source: 'osm',
    geojson: null,
    features: [
      { kind: 'bunker', holeNumber: null, coordinates: bunker },
      { kind: 'water_hazard', holeNumber: null, coordinates: water },
      { kind: 'lateral_water_hazard', holeNumber: 7, coordinates: lateral },
      { kind: 'cartpath', holeNumber: null, coordinates: cartpath },
    ],
  };
  const queries: OsmOverlayQuery[] = [];
  const frame = await ensureHoleTeeGreen(
    {
      courseId: 'gca-hit',
      holeNumber: 7,
      tee,
      green,
      location: home,
    },
    {
      fetchOverlay: async (query) => {
        queries.push(query);
        return hazards;
      },
    },
  );
  assert.equal(queries.length, 1);
  assert.equal(queries[0].holeNumber, undefined);
  assert.equal(queries[0].radiusM, 1800);
  assert.deepEqual(queries[0].location, green);
  assert.equal(frame.fromCache, true);
  assert.equal(frame.fetched, false);
  assert.deepEqual(frame.tee, tee);
  assert.deepEqual(frame.green, green);
  const cached = cachedOsmOverlay({ courseId: 'gca-hit', holeNumber: 7, green });
  assert.ok(cached);
  assert.deepEqual(
    cached?.features.map((feature) => feature.kind),
    ['bunker', 'water_hazard', 'lateral_water_hazard', 'cartpath'],
  );
  assert.deepEqual(cached?.features[0].coordinates, bunker);
  assert.deepEqual(cached?.features[1].coordinates, water);
  assert.deepEqual(cached?.features[2].coordinates, lateral);
  assert.deepEqual(cached?.features[3].coordinates, cartpath);

  const again = await ensureHoleTeeGreen(
    {
      courseId: 'gca-hit',
      holeNumber: 7,
      tee,
      green,
      location: home,
    },
    {
      fetchOverlay: async (query) => {
        queries.push(query);
        return null;
      },
    },
  );
  assert.equal(queries.length, 1);
  assert.equal(again.fromCache, true);
  assert.deepEqual(again.tee, tee);
  assert.equal(cachedOsmOverlay({ courseId: 'gca-hit', holeNumber: 7, green }), cached);
});

test('tee+green already present leaves overlay null when Overpass is empty', async () => {
  let fetched = 0;
  const frame = await ensureHoleTeeGreen(
    {
      courseId: 'gca-empty',
      holeNumber: 4,
      tee,
      green,
      location: home,
    },
    {
      fetchOverlay: async (query) => {
        fetched += 1;
        assert.deepEqual(query.location, green);
        assert.equal(query.radiusM, 1800);
        assert.equal(query.holeNumber, undefined);
        return null;
      },
    },
  );
  assert.equal(fetched, 1);
  assert.equal(frame.fromCache, true);
  assert.equal(frame.fetched, false);
  assert.deepEqual(frame.tee, tee);
  assert.deepEqual(frame.green, green);
  assert.equal(cachedOsmOverlay({ courseId: 'gca-empty', holeNumber: 4, green }), null);
});

test('background card prefetch remembers every hole tee+green without a phone fix', async () => {
  const seed = layout([
    { number: 1, par: 4, yards: 400, handicap: 1, greenCentroid: green, teeCentroid: tee },
    {
      number: 2,
      par: 3,
      yards: 170,
      handicap: 2,
      greenCentroid: { lat: green.lat + 0.01, lng: green.lng },
      teeCentroid: null,
    },
  ]);
  rememberLayoutHoles(seed);
  assert.deepEqual(cachedResolvedTee({ courseId: seed.apiId, holeNumber: 1, green }), tee);

  const hole2Green = seed.holes![1].greenCentroid!;
  const hole2Tee = { lat: hole2Green.lat - 0.002, lng: hole2Green.lng };
  let fetches = 0;
  const frames = await prefetchCourseCard(seed, {
    fetchOverlay: async (query) => {
      fetches += 1;
      assert.equal(query.holeNumber, undefined);
      assert.equal(query.radiusM, 1800);
      return {
        source: 'osm',
        geojson: null,
        features: [{ kind: 'hole', holeNumber: 2, coordinates: [hole2Tee, hole2Green] }],
      };
    },
  });
  assert.equal(fetches, 1);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].fromCache, true);
  assert.deepEqual(frames[1].tee, hole2Tee);
  assert.deepEqual(cachedResolvedTee({ courseId: seed.apiId, holeNumber: 2, green: hole2Green }), hole2Tee);
});

test('one course-wide overlay is reused, including when the green shifts slightly', async () => {
  const green2 = { lat: green.lat + 0.008, lng: green.lng };
  const hole2Tee = { lat: green2.lat - 0.002, lng: green2.lng };
  const bunker = [
    { lat: green.lat + 0.0004, lng: green.lng + 0.0002 },
    { lat: green.lat + 0.0005, lng: green.lng + 0.0003 },
    { lat: green.lat + 0.0004, lng: green.lng + 0.0004 },
  ];
  const overlay: OsmOverlay = {
    source: 'osm',
    geojson: null,
    features: [
      {
        kind: 'green',
        holeNumber: 1,
        coordinates: [green, { lat: green.lat + 0.0001, lng: green.lng }],
      },
      { kind: 'hole', holeNumber: 2, coordinates: [hole2Tee, green2] },
      { kind: 'bunker', holeNumber: null, coordinates: bunker },
    ],
  };
  let fetches = 0;
  const first = await ensureHoleTeeGreen(
    { courseId: 'session-hit', holeNumber: 1, tee: null, green, location: green },
    {
      fetchOverlay: async (query) => {
        fetches += 1;
        assert.equal(query.holeNumber, undefined);
        assert.equal(query.radiusM, 1800);
        assert.deepEqual(query.location, green);
        return overlay;
      },
    },
  );
  const second = await ensureHoleTeeGreen(
    { courseId: 'session-hit', holeNumber: 2, tee: null, green: green2, location: home },
    {
      fetchOverlay: async () => {
        fetches += 1;
        return null;
      },
    },
  );
  assert.equal(fetches, 1);
  assert.equal(first.tee, null);
  assert.deepEqual(first.green, green);
  assert.deepEqual(second.tee, hole2Tee);
  assert.notDeepEqual(second.tee, home);
  const shifted = { lat: green.lat + 0.00021, lng: green.lng - 0.00019 };
  const hole1 = cachedOsmOverlay({ courseId: 'session-hit', holeNumber: 1, green: shifted });
  assert.equal(hole1?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 1), true);
  assert.equal(hole1?.features.some((feature) => feature.kind === 'bunker'), true);
  assert.equal(hole1?.features.some((feature) => feature.holeNumber === 2), false);
  const hole2 = cachedOsmOverlay({
    courseId: 'session-hit',
    holeNumber: 2,
    green: { lat: green2.lat + 0.0003, lng: green2.lng },
  });
  assert.equal(hole2?.features.some((feature) => feature.kind === 'hole' && feature.holeNumber === 2), true);
  assert.equal(hole2?.features.some((feature) => feature.holeNumber === 1), false);
});

test('a failed course-wide overlay is not fetched again for the next hole', async () => {
  let fetches = 0;
  const green2 = { lat: green.lat + 0.01, lng: green.lng };
  await ensureHoleTeeGreen(
    { courseId: 'session-miss', holeNumber: 1, tee, green, location: green },
    {
      fetchOverlay: async () => {
        fetches += 1;
        return null;
      },
    },
  );
  await ensureHoleTeeGreen(
    { courseId: 'session-miss', holeNumber: 2, tee, green: green2, location: green2 },
    {
      fetchOverlay: async () => {
        fetches += 1;
        return null;
      },
    },
  );
  assert.equal(fetches, 1);
  assert.equal(cachedOsmOverlay({ courseId: 'session-miss', holeNumber: 1, green }), null);
  assert.equal(cachedOsmOverlay({ courseId: 'session-miss', holeNumber: 2, green: green2 }), null);
});

test('Signal Lab: prefetch never blocks hole 1 or falls back to the phone for framing', async () => {
  assert.equal(startRoundBlocksOnCardPrefetch(), false);
  assert.equal(cameraFallsBackToPhoneForFraming(), false);

  const missed = await ensureHoleTeeGreen(
    {
      courseId: 'phone-frame',
      holeNumber: 1,
      tee: null,
      green: null,
      location: home,
    },
    { fetchOverlay: async () => null },
  );
  assert.notDeepEqual(missed.tee, home);
  assert.notDeepEqual(missed.green, home);
  assert.equal(missed.tee, null);
  assert.equal(missed.green, null);
  assert.equal(
    cameraFrameFromCache({
      courseId: 'phone-frame',
      holeNumber: 1,
      tee: null,
      green: null,
      phone: home,
    }),
    null,
  );

  const homeSrc = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const apply = homeSrc.slice(homeSrc.indexOf('const applyPickedCourse'), homeSrc.indexOf('const commitPick'));
  assert.ok(apply.indexOf('router.push') < apply.indexOf('prefetchCourseCardInBackground'));
  assert.doesNotMatch(apply, /await prefetchCourseCard/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const camera = hole.slice(hole.indexOf('const courseCamera ='), hole.indexOf('const addShotFrom ='));
  assert.match(camera, /planCourseCardCamera/);
  assert.match(camera, /phone: null/);
  assert.doesNotMatch(camera, /phone: fix/);
});

test('hole camera still uses cached tee+green and fetches the current hole only', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /ensureHoleTeeGreen/);
  assert.match(hole, /cachedResolvedTee/);
  assert.match(hole, /planCourseCardCamera/);
  assert.match(hole, /phone: null/);
  assert.doesNotMatch(hole, /prefetchCourseCard\(/);
});
