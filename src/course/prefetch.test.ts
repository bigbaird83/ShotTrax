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
import { cachedResolvedTee, rememberResolvedTee } from './osmOverlay';
import type { CourseLayoutSeed } from './layout';
import type { OsmOverlay } from './types';

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
  const frames = await prefetchCourseCard(seed, {
    fetchOverlay: async (query) => {
      if (query.holeNumber !== 2) return null;
      return {
        source: 'osm',
        geojson: null,
        features: [{ kind: 'hole', holeNumber: 2, coordinates: [hole2Tee, hole2Green] }],
      };
    },
  });
  assert.equal(frames.length, 2);
  assert.equal(frames[0].fromCache, true);
  assert.deepEqual(frames[1].tee, hole2Tee);
  assert.deepEqual(cachedResolvedTee({ courseId: seed.apiId, holeNumber: 2, green: hole2Green }), hole2Tee);
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
