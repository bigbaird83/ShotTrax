import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { haversineYards } from '../domain/haversine';
import type { LatLng } from '../domain/latLng';
import { COPY } from '../domain/playerCopy';
import {
  buildCourseRequest,
  courseRequestBody,
  courseRequestMailto,
  courseRequestMutatesPaint,
  courseRequestSendsWithoutConfirm,
  courseRequestSubject,
  listCourseRequests,
  queueCourseRequest,
  SHOTTRAXX_CONTACT_EMAIL,
  SHOTTRAXX_X_HANDLE,
} from '../domain/courseRequest';
import {
  CONTRIBUTE_THANKS,
  contributionAppliesRewardAutomatically,
  contributionMutatesPaint,
  contributionRewardIsManualOpsOnly,
  contributionSendsWithoutConfirm,
  listContributions,
  queueContribution,
  teeGreenYardGate,
  validateContribution,
} from '../domain/courseContribute';
import {
  courseIsHardMiss,
  FAVORITES_BANNER,
  favoriteFromSummary,
  hardMissCanBeReadyOffline,
  isFavorite,
  listFavorites,
  offlinePackFor,
  offlineStatusAfterDownload,
  offlineStatusLabel,
  setFavorite,
  type JsonStore,
} from '../domain/favorites';
import {
  queueWatchPaintPack,
  watchPaintPackSyncSupported,
  watchShowsReadyOffline,
} from '../domain/watchPaintPack';
import {
  GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  loadCourseHydrate,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
} from './hydrate';
import { downloadFavoriteForOffline } from './offlineFavorite';
import { createMemoryCoursePaintCache } from './paintCache';
import { cacheHolesAfterFirst } from './prefetch';
import {
  appleBasemapTilesBestEffortOnly,
  appleBasemapTilesRequiredForMarksOrYards,
  backgroundHoleNumbers,
  hole1EntryFromLayout,
  offlineMarksUseLocalGps,
  offlineYardsUseLocalPaint,
  planStartRound,
  startRoundBlocksOnRemainingHoles,
} from './startRoundEntry';
import { thunderbirdGolfApiPaintBlocked } from './thunderbirdLock';
import { thunderbirdHardMissUntilDocOrOsm } from './catalog';
import { resolveCoursePaint, type CoursePaintCache } from './waterfall';
import type { CourseLayoutSeed } from './layout';
import { MAGNOLIA_CC } from '../domain/reproCourseCard';

function memoryStore(): JsonStore {
  const raw = new Map<string, string>();
  return {
    get: (key) => raw.get(key) ?? null,
    set: (key, value) => {
      raw.set(key, value);
    },
  };
}

function memoryCache(): CoursePaintCache & { puts: number } {
  const cache = {
    puts: 0,
    async get() {
      return null;
    },
    async put() {
      cache.puts += 1;
    },
  };
  return cache;
}

function pair(n: number): { tee: LatLng; green: LatLng; yards: number } {
  const tee = { lat: 33.2 + n * 0.02, lng: -93.2 };
  const green = { lat: tee.lat + 0.004, lng: tee.lng + 0.001 };
  return { tee, green, yards: Math.round(haversineYards(tee, green)) };
}

function sheet(rows: string[]): string {
  return ['hole,tee_lat,tee_lon,green_lat,green_lon,par,yards', ...rows].join('\n');
}

function row(n: number, yards: number | null = null, source = ''): string {
  const hole = pair(n);
  const stated = yards == null ? '' : String(yards);
  const extra = source ? `,${source}` : '';
  return `${n},${hole.tee.lat},${hole.tee.lng},${hole.green.lat},${hole.green.lng},4,${stated}${extra}`;
}

function validDraft(overrides: Partial<Parameters<typeof validateContribution>[0]> = {}) {
  const rows = [];
  for (let n = 1; n <= 9; n += 1) rows.push(row(n, pair(n).yards));
  return {
    courseName: 'Signal Creek',
    city: 'Cabot',
    claimedHoleCount: 9 as const,
    sheet: sheet(rows),
    email: 'mapper@example.com',
    grantCommercialOdbl: true,
    notes: 'from the tee markers',
    now: '2026-09-22T01:00:00.000Z',
    ...overrides,
  };
}

test('Start Round paints hole 1 immediately and caches 2–18 in the background', async () => {
  assert.equal(startRoundBlocksOnRemainingHoles(), false);
  assert.equal(offlineMarksUseLocalGps(), true);
  assert.equal(offlineYardsUseLocalPaint(), true);
  assert.equal(appleBasemapTilesBestEffortOnly(), true);
  assert.equal(appleBasemapTilesRequiredForMarksOrYards(), false);
  assert.deepEqual(backgroundHoleNumbers(18).includes(1), false);
  assert.equal(backgroundHoleNumbers(18)[0], 2);
  assert.equal(backgroundHoleNumbers(18).at(-1), 18);
  assert.equal(backgroundHoleNumbers(9).at(-1), 9);

  const layout: CourseLayoutSeed = {
    apiId: 'prefetch-course',
    name: 'Prefetch CC',
    location: MAGNOLIA_CC.hole1.tee,
    holes: [
      {
        number: 1,
        par: 4,
        yards: 400,
        handicap: 1,
        greenCentroid: MAGNOLIA_CC.hole1.green,
        teeCentroid: MAGNOLIA_CC.hole1.tee,
      },
    ],
  };
  const plan = planStartRound(layout, 18);
  assert.equal(plan.blocks, false);
  assert.equal(plan.hole1, 'paint');
  assert.equal(plan.backgroundHoles.includes(1), false);
  assert.equal(hole1EntryFromLayout({ ...layout, holes: [{ ...layout.holes![0], teeCentroid: null, greenCentroid: null }] }), 'miss');

  const fetched: Array<number | undefined> = [];
  const frames = await cacheHolesAfterFirst(layout, {
    holeCount: 18,
    fetchOverlay: async (query) => {
      fetched.push(query.holeNumber);
      return null;
    },
  });
  assert.deepEqual(
    frames.map((frame) => frame.holeNumber),
    backgroundHoleNumbers(18),
  );
  assert.equal(fetched.includes(1), false);
  assert.equal(fetched[0], 2);
  assert.equal(fetched.at(-1), 18);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const apply = home.slice(home.indexOf('const applyPickedCourse'), home.indexOf('const commitPick'));
  assert.ok(apply.indexOf('startRound') < apply.indexOf('prefetchCourseCardInBackground'));
  assert.ok(apply.indexOf('router.push') < apply.indexOf('prefetchCourseCardInBackground'));
  assert.match(apply, /holeCount/);
  assert.doesNotMatch(apply, /await /);
  const load = home.slice(home.indexOf('function loadLayout'), home.indexOf('export default'));
  assert.doesNotMatch(load, /getCourseDataClient|await /);

  const watch = readFileSync(new URL('../services/watchNearby.ts', import.meta.url), 'utf8');
  const start = watch.slice(watch.indexOf('const round = startRound'), watch.indexOf('return { ok: true, feedback: tee'));
  assert.ok(start.indexOf('router.push') < start.indexOf('prefetchCourseCardInBackground'));
  assert.match(start, /holeCount/);

  const mark = readFileSync(new URL('../domain/markShot.ts', import.meta.url), 'utf8');
  const yards = readFileSync(new URL('../domain/yardsToGreen.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(mark, /react-native-maps|MapView/);
  assert.doesNotMatch(yards, /react-native-maps|MapView/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /best-effort/);
});

test('Favorites offline states never mark HARD-MISS Ready', async () => {
  assert.equal(FAVORITES_BANNER, 'Add your favorite courses here to play without internet.');
  assert.equal(offlineStatusLabel('downloading'), 'Downloading');
  assert.equal(offlineStatusLabel('ready'), 'Ready offline');
  assert.equal(offlineStatusLabel('miss'), 'Miss (no map)');
  assert.equal(hardMissCanBeReadyOffline(), false);
  assert.equal(thunderbirdGolfApiPaintBlocked(), true);
  assert.equal(thunderbirdHardMissUntilDocOrOsm(), true);
  assert.equal(watchPaintPackSyncSupported(), false);
  assert.equal(watchShowsReadyOffline(), false);
  assert.equal(queueWatchPaintPack(), null);

  const store = memoryStore();
  const course = favoriteFromSummary({
    id: 'local:magnolia',
    name: 'Magnolia Country Club',
    city: 'Magnolia',
    state: 'AR',
    country: 'US',
    location: MAGNOLIA_CC.location,
  });
  assert.ok(course);
  setFavorite(store, course, true);
  assert.equal(isFavorite(store, course.id), true);
  setFavorite(store, course, false);
  assert.equal(listFavorites(store).length, 0);
  setFavorite(store, course, true);

  const tb = favoriteFromSummary({
    id: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    country: 'US',
    location: THUNDERBIRD_HEBER_CLUBHOUSE,
  });
  assert.ok(tb);
  assert.equal(courseIsHardMiss({ courseKey: tb.id, name: tb.name, city: tb.city, state: tb.state, location: tb.location }), true);
  assert.equal(offlineStatusAfterDownload({ name: tb.name, city: tb.city, state: tb.state, courseKey: tb.id }, true), 'miss');

  let resolved = false;
  const tbStatus = await downloadFavoriteForOffline(tb, store, {
    now: () => '2026-09-22T01:00:00.000Z',
    resolve: async () => {
      resolved = true;
      return { ok: true, source: 'osm', fromCache: false, nineByTwo: false, holes: [] };
    },
  });
  assert.equal(tbStatus, 'miss');
  assert.equal(resolved, false);
  assert.equal(offlinePackFor(store, tb.id)?.status, 'miss');
  assert.notEqual(offlinePackFor(store, tb.id)?.status, 'ready');

  const hydrate = loadCourseHydrate(GREENS_NORTH_HILLS_SHERWOOD_AR_KEY);
  assert.ok(hydrate);
  const cache = memoryCache();
  const hills = favoriteFromSummary({
    id: `local:${GREENS_NORTH_HILLS_SHERWOOD_AR_KEY}`,
    name: 'The Greens at North Hills',
    city: 'Sherwood',
    state: 'AR',
    country: 'US',
    location: null,
  });
  assert.ok(hills);
  const ready = await downloadFavoriteForOffline(hills, store, {
    now: () => '2026-09-22T01:00:00.000Z',
    resolve: (match) =>
      resolveCoursePaint(match, {
        cache,
        loadOsm: async () => ({
          source: 'osm',
          numHoles: 18,
          holes: hydrate.holes.map((hole) => ({
            hole: hole.hole,
            tee: hole.tee ? { lat: hole.tee.lat, lng: hole.tee.lng } : null,
            green: { lat: hole.green.lat, lng: hole.green.lng },
            par: hole.par,
            yards: hole.yards,
          })),
        }),
        loadGca: async () => null,
        loadGolfApi: async () => null,
      }),
  });
  assert.equal(ready, 'ready');
  assert.equal(offlinePackFor(store, hills.id)?.status, 'ready');
  assert.equal(cache.puts, 1);

  const missed = await downloadFavoriteForOffline(course, store, {
    now: () => '2026-09-22T01:02:00.000Z',
    resolve: (match) =>
      resolveCoursePaint(match, {
        cache,
        loadOsm: async () => ({
          source: 'osm',
          numHoles: 18,
          holes: [{ hole: 1, tee: THUNDERBIRD_HEBER_CLUBHOUSE, green: THUNDERBIRD_HEBER_CLUBHOUSE, par: 4, yards: 400 }],
        }),
        loadGca: async () => null,
        loadGolfApi: async () => null,
      }),
  });
  assert.equal(missed, 'miss');
  assert.equal(cache.puts, 1);

  const favoritesScreen = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  assert.match(favoritesScreen, /FAVORITES_BANNER/);
  assert.match(favoritesScreen, /Download for offline|COPY\.downloadForOffline/);
  assert.doesNotMatch(favoritesScreen, /Watch ready|watch ready/i);
});

test('OSM miss + GCA paint makes the offline download Ready and skips golfapi', async () => {
  const urls: string[] = [];
  const green = { lat: 35.522655, lng: -92.0393088 };
  const store = memoryStore();
  const course = favoriteFromSummary({
    id: 'gca-offline-1',
    name: 'Offline GCA Probe CC',
    city: 'Nowhereville',
    state: 'ZZ',
    country: 'US',
    location: null,
  });
  assert.ok(course);
  const status = await downloadFavoriteForOffline(course, store, {
    now: () => '2026-09-22T01:05:00.000Z',
    cache: createMemoryCoursePaintCache(),
    getBaseUrl: () => 'https://share.test/gca/v1',
    fetch: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/golfapi/')) {
        return new Response(JSON.stringify({ error: 'golfapi must not run' }), { status: 500 });
      }
      if (url.includes('/green-centers')) {
        return new Response(JSON.stringify([{ hole: 1, lat: green.lat, lng: green.lng }]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: { id: 'gca-offline-1', name: 'Offline GCA Probe CC', city: 'Nowhereville', state: 'ZZ' },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(status, 'ready');
  assert.equal(offlinePackFor(store, course.id)?.status, 'ready');
  assert.equal(urls.some((url) => url.includes('/green-centers')), true);
  assert.equal(urls.some((url) => url.includes('/golfapi/')), false);

  const offline = readFileSync(new URL('./offlineFavorite.ts', import.meta.url), 'utf8');
  assert.match(offline, /loadGcaPaintCandidate/);
  assert.doesNotMatch(offline, /loadGca:\s*async\s*\(\)\s*=>\s*null/);
  const request = readFileSync(new URL('../domain/courseRequest.ts', import.meta.url), 'utf8');
  const contribute = readFileSync(new URL('../domain/courseContribute.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(request, /loadGcaPaintCandidate|resolveCoursePaint/);
  assert.doesNotMatch(contribute, /loadGcaPaintCandidate|resolveCoursePaint/);
});

test('course request payload keeps email, handle, and fields and does not paint', () => {
  assert.equal(courseRequestMutatesPaint(), false);
  assert.equal(courseRequestSendsWithoutConfirm(), false);
  assert.equal(SHOTTRAXX_CONTACT_EMAIL, 'ShotTraxx@gmail.com');
  assert.equal(SHOTTRAXX_X_HANDLE, '@ShotTraxx');
  assert.equal(COPY.contactLine, 'ShotTraxx@gmail.com · X @ShotTraxx');

  const payload = buildCourseRequest({
    name: 'Oak Hills',
    city: 'Cabot',
    notes: 'nine holes, no map',
    now: '2026-09-22T01:00:00.000Z',
  });
  assert.ok(payload);
  assert.equal(payload.name, 'Oak Hills');
  assert.equal(payload.city, 'Cabot');
  assert.equal(payload.notes, 'nine holes, no map');
  assert.equal(payload.requestedAt, '2026-09-22T01:00:00.000Z');
  assert.equal(payload.email, 'ShotTraxx@gmail.com');
  assert.equal(payload.handle, '@ShotTraxx');
  const mailto = courseRequestMailto(payload);
  assert.equal(COPY.requestCourseEmailBrand, 'ShotTraxx™');
  assert.equal(COPY.spectatorTitle, 'ShotTraxx™');
  assert.match(COPY.requestCourseLede, /ShotTraxx™/);
  assert.match(COPY.contributeGrant, /ShotTraxx™/);
  assert.doesNotMatch(COPY.contributeGrant, /®/);
  assert.equal(courseRequestSubject(payload), 'ShotTraxx™ course request: Oak Hills — Cabot');
  assert.match(courseRequestBody(payload), /^ShotTraxx™\n/);
  assert.doesNotMatch(courseRequestSubject(payload), /®/);
  assert.doesNotMatch(courseRequestBody(payload), /®/);
  assert.match(mailto, /^mailto:ShotTraxx@gmail.com\?/);
  assert.match(decodeURIComponent(mailto), /ShotTraxx™/);
  assert.match(decodeURIComponent(mailto), /Oak Hills/);
  assert.match(decodeURIComponent(mailto), /Cabot/);
  assert.match(decodeURIComponent(mailto), /nine holes, no map/);
  assert.match(decodeURIComponent(mailto), /2026-09-22T01:00:00.000Z/);
  assert.match(decodeURIComponent(mailto), /@ShotTraxx/);

  const store = memoryStore();
  const cache = memoryCache();
  queueCourseRequest(store, payload);
  const queued = listCourseRequests(store);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].email, SHOTTRAXX_CONTACT_EMAIL);
  assert.equal(queued[0].handle, SHOTTRAXX_X_HANDLE);
  assert.equal(cache.puts, 0);
  assert.equal(buildCourseRequest({ name: '   ' }), null);

  const request = readFileSync(new URL('../../app/request-course.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const contribute = readFileSync(new URL('../../app/contribute-course.tsx', import.meta.url), 'utf8');
  assert.match(request, /COPY\.contactLine/);
  assert.match(settings, /COPY\.contactLine/);
  assert.match(contribute, /COPY\.contactLine/);
  assert.match(request, /Linking\.openURL/);
  assert.doesNotMatch(request, /useEffect/);
  assert.match(request, /queueCourseRequest/);
  const domain = readFileSync(new URL('../domain/courseRequest.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(domain, /resolveCoursePaint|setCoursePaintCache|rememberResolvedTee|cache\.put/);
});

test('contribution requires the grant, mirrors Signal checks, and does not paint', () => {
  assert.equal(contributionMutatesPaint(), false);
  assert.equal(contributionSendsWithoutConfirm(), false);
  assert.equal(contributionRewardIsManualOpsOnly(), true);
  assert.equal(contributionAppliesRewardAutomatically(), false);
  assert.equal(CONTRIBUTE_THANKS, 'Thanks — if we accept and publish your map, you get 1 free year.');

  const measured = pair(1).yards;
  assert.equal(teeGreenYardGate(measured, measured), true);
  assert.equal(teeGreenYardGate(measured, Math.round(measured * 1.2)), false);
  assert.equal(teeGreenYardGate(120, null), true);
  assert.equal(teeGreenYardGate(20, null), false);

  const store = memoryStore();
  const cache = memoryCache();
  const denied = queueContribution(store, validDraft({ grantCommercialOdbl: false }));
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.issues.some((issue) => issue.code === 'grant'), true);
  assert.equal(listContributions(store).length, 0);

  const noEmail = validateContribution(validDraft({ email: '' }));
  assert.equal(noEmail.ok, false);
  if (!noEmail.ok) assert.equal(noEmail.issues.some((issue) => issue.code === 'email'), true);

  const accepted = queueContribution(store, validDraft());
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.contribution.to, 'ShotTraxx@gmail.com');
    assert.equal(accepted.contribution.handle, '@ShotTraxx');
    assert.equal(accepted.contribution.grantCommercialOdbl, true);
    assert.equal(accepted.contribution.reward, 'manual-ops-only');
    assert.equal(accepted.contribution.email, 'mapper@example.com');
    assert.equal(accepted.contribution.rows.length, 9);
  }
  assert.equal(cache.puts, 0);

  const mirrorRows = [];
  for (let n = 1; n <= 9; n += 1) {
    const hole = pair(n);
    mirrorRows.push(`${n},${hole.tee.lat},${hole.tee.lng},${hole.green.lat},${hole.green.lng},4,${hole.yards}`);
  }
  for (let n = 1; n <= 9; n += 1) {
    const hole = pair(n);
    mirrorRows.push(`${n + 9},${hole.tee.lat},${hole.tee.lng},${hole.green.lat},${hole.green.lng},4,${hole.yards}`);
  }
  const mirror = validateContribution(validDraft({ claimedHoleCount: 9, sheet: sheet(mirrorRows) }));
  assert.equal(mirror.ok, true);
  if (mirror.ok) assert.equal(mirror.contribution.nineByTwo, true);

  const short = validateContribution(validDraft({ claimedHoleCount: 18 }));
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.issues.some((issue) => issue.code === 'hole_count'), true);

  const clubhouse = pair(3);
  const clubSheet = sheet([
    `${3},${THUNDERBIRD_HEBER_CLUBHOUSE.lat},${THUNDERBIRD_HEBER_CLUBHOUSE.lng},${clubhouse.green.lat},${clubhouse.green.lng},4,${clubhouse.yards}`,
  ]);
  const club = validateContribution(validDraft({ claimedHoleCount: 9, sheet: clubSheet }));
  assert.equal(club.ok, false);
  if (!club.ok) assert.equal(club.issues.some((issue) => issue.code === 'clubhouse'), true);

  const satellite = validateContribution(
    validDraft({
      sheet: ['hole,tee_lat,tee_lon,green_lat,green_lon,par,yards,source', `${row(1, pair(1).yards, 'approx-from-satellite')}`].join('\n'),
    }),
  );
  assert.equal(satellite.ok, false);
  if (!satellite.ok) assert.equal(satellite.issues.some((issue) => issue.code === 'satellite' || issue.code === 'centroid'), true);

  const blob = pair(4);
  const near = { lat: blob.tee.lat + 0.0001, lng: blob.tee.lng };
  const centroid = validateContribution(
    validDraft({
      sheet: sheet([`4,${blob.tee.lat},${blob.tee.lng},${near.lat},${near.lng},4,`]),
    }),
  );
  assert.equal(centroid.ok, false);
  if (!centroid.ok) assert.equal(centroid.issues.some((issue) => issue.code === 'yards' || issue.code === 'centroid'), true);

  const missing = validateContribution(
    validDraft({
      sheet: sheet(['5,33.2,-93.2,,-93.19,4,400']),
    }),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.issues.some((issue) => issue.code === 'wgs84'), true);
    assert.equal(missing.issues.some((issue) => /filled in/.test(issue.message)), true);
  }

  const domain = readFileSync(new URL('../domain/courseContribute.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(domain, /resolveCoursePaint|setCoursePaintCache|rememberResolvedTee|cache\.put/);
  const screen = readFileSync(new URL('../../app/contribute-course.tsx', import.meta.url), 'utf8');
  assert.match(screen, /CONTRIBUTE_THANKS/);
  assert.match(screen, /grantCommercialOdbl/);
  assert.match(screen, /Linking\.openURL/);
  assert.doesNotMatch(screen, /useEffect/);
});
