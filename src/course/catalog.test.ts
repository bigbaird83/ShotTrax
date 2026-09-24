import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  LOCAL_COURSE_CATALOG,
  catalogCourseDetail,
  catalogEntryById,
  greensNorthHillsCourseReport,
  greensNorthHillsHoleSources,
  mergeCatalogSummaries,
  mountainRanchCourseReport,
  mountainRanchHoleSources,
  nearbyLocalCatalog,
  searchLocalCatalog,
  thunderbirdCourseReport,
  thunderbirdHoleSources,
} from './catalog';
import { createCourseDataClient } from './client';
import {
  GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  inventGreenFromClubhouse,
} from './hydrate';

test('local catalog indexes Thunderbird Country Club (Heber Springs) as HARD-MISS', () => {
  const entry = LOCAL_COURSE_CATALOG.find((row) => row.courseKey === THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
  assert.ok(entry);
  assert.equal(entry?.name, 'Thunderbird Country Club');
  assert.equal(entry?.city, 'Heber Springs');
  assert.equal(entry?.state, 'AR');
  assert.equal(entry?.holeCount, 9);
  assert.deepEqual(entry?.location, THUNDERBIRD_HEBER_CLUBHOUSE);
  assert.equal(inventGreenFromClubhouse(), false);

  const report = thunderbirdCourseReport();
  assert.equal(report.searchableName, 'Thunderbird Country Club');
  assert.equal(report.holeCount, 9);
  assert.deepEqual(report.hydratedHoles, []);
  assert.deepEqual(report.hardMissHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(report.needsDocPinSheets, true);
  assert.equal(report.needsDocTeePins, true);
  assert.equal(
    thunderbirdHoleSources().every((row) => row.status === 'hard-miss' && row.needsDocPinSheet),
    true,
  );
});

test('catalog search finds Thunderbird by name or Heber Springs and never invents another club', () => {
  const byName = searchLocalCatalog('thunderbird');
  assert.equal(byName.some((row) => row.id === 'local:thunderbird-heber-springs-ar'), true);
  assert.equal(searchLocalCatalog('thunderbird heber springs')[0]?.id, 'local:thunderbird-heber-springs-ar');
  assert.equal(searchLocalCatalog('Heber Springs').some((row) => row.id === 'local:thunderbird-heber-springs-ar'), true);
  assert.equal(
    searchLocalCatalog('thunderbird golf course').some((row) => row.id === 'local:thunderbird-heber-springs-ar'),
    true,
  );
  assert.equal(
    searchLocalCatalog('pebble').some((row) => /pebble/i.test(row.name)),
    true,
  );
  assert.deepEqual(searchLocalCatalog('thunderbird cabot'), []);
  assert.deepEqual(searchLocalCatalog('   '), []);
});

test('local catalog indexes Mountain Ranch (Fairfield Bay) as 18 golfapi holes', () => {
  const entry = LOCAL_COURSE_CATALOG.find((row) => row.courseKey === MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY);
  assert.ok(entry);
  assert.equal(entry?.name, 'Mountain Ranch Golf Club');
  assert.equal(entry?.city, 'Fairfield Bay');
  assert.equal(entry?.state, 'AR');
  assert.equal(entry?.holeCount, 18);
  assert.deepEqual(entry?.location, MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE);
  assert.equal(inventGreenFromClubhouse(), false);

  const report = mountainRanchCourseReport();
  assert.equal(report.searchableName, 'Mountain Ranch Golf Club');
  assert.equal(report.holeCount, 18);
  assert.deepEqual(report.hydratedHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(report.hardMissHoles, []);
  assert.equal(report.needsDocPinSheets, false);
  assert.equal(
    mountainRanchHoleSources().every((row) => row.status === 'hydrated' && !row.needsDocPinSheet),
    true,
  );
});

test('catalog search finds Mountain Ranch by name or Fairfield Bay', () => {
  const byName = searchLocalCatalog('mountain ranch');
  assert.equal(byName.some((row) => row.id === 'local:mountain-ranch-fairfield-bay-ar'), true);
  assert.equal(searchLocalCatalog('Fairfield Bay').some((row) => row.id === 'local:mountain-ranch-fairfield-bay-ar'), true);
  assert.deepEqual(searchLocalCatalog('mountain ranch cabot'), []);
  assert.deepEqual(searchLocalCatalog('thunderbird fairfield'), []);
});

test('local catalog indexes The Greens at North Hills (Sherwood) as 18 golfapi holes', () => {
  const entry = LOCAL_COURSE_CATALOG.find((row) => row.courseKey === GREENS_NORTH_HILLS_SHERWOOD_AR_KEY);
  assert.ok(entry);
  assert.equal(entry?.name, 'The Greens at North Hills');
  assert.equal(entry?.city, 'Sherwood');
  assert.equal(entry?.state, 'AR');
  assert.equal(entry?.holeCount, 18);
  assert.deepEqual(entry?.location, GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE);
  assert.deepEqual(entry?.aliases, ['Greens at North Hills', 'North Hills', 'The Greens At North Hills']);
  assert.equal(inventGreenFromClubhouse(), false);

  const report = greensNorthHillsCourseReport();
  assert.equal(report.searchableName, 'The Greens at North Hills');
  assert.equal(report.holeCount, 18);
  assert.deepEqual(report.hydratedHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(report.hardMissHoles, []);
  assert.equal(report.needsDocPinSheets, false);
  assert.equal(
    greensNorthHillsHoleSources().every((row) => row.status === 'hydrated' && !row.needsDocPinSheet),
    true,
  );
});

test('catalog search finds North Hills by name or Sherwood and never invents another club', () => {
  const byName = searchLocalCatalog('north hills');
  assert.equal(byName.some((row) => row.id === 'local:greens-north-hills-sherwood-ar'), true);
  assert.equal(searchLocalCatalog('greens at north hills')[0]?.id, 'local:greens-north-hills-sherwood-ar');
  assert.equal(searchLocalCatalog('Sherwood').some((row) => row.id === 'local:greens-north-hills-sherwood-ar'), true);
  assert.equal(
    searchLocalCatalog('The Greens At North Hills').some((row) => row.id === 'local:greens-north-hills-sherwood-ar'),
    true,
  );
  assert.deepEqual(searchLocalCatalog('north hills cabot'), []);
  assert.deepEqual(searchLocalCatalog('north hills pittsburgh'), []);
});

test('catalog nearby includes Thunderbird only when the phone is in range', () => {
  const near = nearbyLocalCatalog(THUNDERBIRD_HEBER_CLUBHOUSE, 5);
  assert.equal(near.some((row) => row.name === 'Thunderbird Country Club'), true);
  assert.equal(near.find((row) => row.name === 'Thunderbird Country Club')?.distanceMeters, 0);
  const ranch = nearbyLocalCatalog(MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE, 5);
  assert.equal(ranch.some((row) => row.name === 'Mountain Ranch Golf Club'), true);
  const hills = nearbyLocalCatalog(GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE, 5);
  assert.equal(hills.some((row) => row.name === 'The Greens at North Hills'), true);
  assert.equal(nearbyLocalCatalog({ lat: 37, lng: -122 }, 25).length > 0, true);
  assert.deepEqual(nearbyLocalCatalog({ lat: 0.2, lng: 0.2 }, 25), []);
});

test('catalog getCourse leaves Thunderbird tees and greens blank — never the clubhouse or golfapi seed', () => {
  const detail = catalogCourseDetail('local:thunderbird-heber-springs-ar');
  assert.ok(detail);
  assert.equal(detail?.name, 'Thunderbird Country Club');
  assert.equal(detail?.holeCount, 9);
  assert.equal(detail?.holes.length, 9);
  assert.equal(detail?.tees.length, 0);
  assert.equal(detail?.greenCentersAvailable, false);
  assert.deepEqual(detail?.location, THUNDERBIRD_HEBER_CLUBHOUSE);
  for (const hole of detail?.holes ?? []) {
    assert.equal(hole.teeCentroid, null);
    assert.equal(hole.greenCentroid, null);
    assert.equal(hole.greenFront, null);
    assert.equal(hole.greenBack, null);
  }
  assert.equal(catalogCourseDetail('4'), null);
  assert.equal(catalogEntryById(THUNDERBIRD_HEBER_SPRINGS_AR_KEY)?.name, 'Thunderbird Country Club');

  const hills = catalogCourseDetail('local:greens-north-hills-sherwood-ar');
  assert.ok(hills);
  assert.equal(hills?.name, 'The Greens at North Hills');
  assert.equal(hills?.holeCount, 18);
  assert.equal(hills?.holes.length, 18);
  assert.deepEqual(hills?.holes[0]?.teeCentroid, { lat: 34.8216237, lng: -92.2303544 });
  assert.deepEqual(hills?.holes[0]?.greenCentroid, { lat: 34.8207099, lng: -92.2254161 });
  for (const hole of hills?.holes ?? []) {
    assert.equal(hole.teeCentroid != null, true);
    assert.equal(hole.greenCentroid != null, true);
    assert.notDeepEqual(hole.teeCentroid, GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE);
    assert.notDeepEqual(hole.greenCentroid, GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE);
  }

  const ranch = catalogCourseDetail('local:mountain-ranch-fairfield-bay-ar');
  assert.ok(ranch);
  assert.equal(ranch?.name, 'Mountain Ranch Golf Club');
  assert.equal(ranch?.holeCount, 18);
  assert.equal(ranch?.holes.length, 18);
  assert.equal(ranch?.tees.length, 0);
  assert.deepEqual(ranch?.holes[0]?.teeCentroid, { lat: 35.6125806, lng: -92.2884427 });
  assert.deepEqual(ranch?.holes[0]?.greenCentroid, { lat: 35.6149788, lng: -92.2861247 });
  for (const hole of ranch?.holes ?? []) {
    assert.equal(hole.teeCentroid != null, true);
    assert.equal(hole.greenCentroid != null, true);
    assert.notDeepEqual(hole.teeCentroid, MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE);
    assert.notDeepEqual(hole.greenCentroid, MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE);
  }
});

test('unconfigured client still searches the local catalog and does not call the network', async () => {
  let calls = 0;
  const client = createCourseDataClient({
    getBaseUrl: () => null,
    fetch: async () => {
      calls += 1;
      throw new Error('network should not run');
    },
  });
  const found = await client.searchCourses('thunderbird heber springs');
  assert.equal(found[0].name, 'Thunderbird Country Club');
  const nearby = await client.nearbyCourses(THUNDERBIRD_HEBER_CLUBHOUSE, 5);
  assert.equal(nearby.some((row) => row.name === 'Thunderbird Country Club'), true);
  const ranchNearby = await client.nearbyCourses(MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE, 5);
  assert.equal(ranchNearby.some((row) => row.name === 'Mountain Ranch Golf Club'), true);
  const ranchSearch = await client.searchCourses('mountain ranch');
  assert.equal(ranchSearch.some((row) => row.name === 'Mountain Ranch Golf Club'), true);
  const ranchDetail = await client.getCourse('local:mountain-ranch-fairfield-bay-ar');
  assert.equal(ranchDetail?.holeCount, 18);
  assert.equal(ranchDetail?.paintResult?.ok, true);
  assert.equal(ranchDetail?.paintResult?.source, 'golfapi');
  assert.equal(ranchDetail?.paintResult?.fromCache, true);
  assert.equal(ranchDetail?.holes[0]?.teeCentroid != null, true);
  assert.equal(ranchDetail?.holes[0]?.greenCentroid != null, true);
  const far = await client.nearbyCourses({ lat: 0.2, lng: 0.2 });
  assert.deepEqual(far, []);
  const detail = await client.getCourse('local:thunderbird-heber-springs-ar');
  assert.equal(detail?.holeCount, 9);
  assert.equal(detail?.paintResult?.ok, false);
  assert.equal(detail?.paintResult?.source, null);
  assert.equal(detail?.holes[0]?.teeCentroid, null);
  assert.equal(detail?.holes[0]?.greenCentroid, null);
  const hills = await client.searchCourses('greens north hills sherwood');
  assert.equal(hills.some((row) => row.name === 'The Greens at North Hills'), true);
  const hillsDetail = await client.getCourse('local:greens-north-hills-sherwood-ar');
  assert.equal(hillsDetail?.holeCount, 18);
  assert.equal(hillsDetail?.paintResult?.ok, true);
  assert.equal(hillsDetail?.paintResult?.source, 'golfapi');
  assert.equal(hillsDetail?.paintResult?.fromCache, true);
  assert.equal(hillsDetail?.holes[0]?.teeCentroid != null, true);
  assert.equal(hillsDetail?.holes[0]?.greenCentroid != null, true);
  assert.equal(
    (await client.searchCourses('pebble')).some((row) => /pebble/i.test(row.name)),
    true,
  );
  assert.equal(await client.getCourse('4'), null);
  assert.equal(calls, 0);
});

test('API search results win; catalog fills a Thunderbird miss without duplicating the same club', async () => {
  const client = createCourseDataClient({
    getBaseUrl: () => 'https://share.test/gca/v1',
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('q=thunderbird')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: '99',
                name: 'Thunderbird Country Club',
                city: 'Heber Springs',
                state: 'AR',
                latitude: 35.525292,
                longitude: -92.038355,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  const found = await client.searchCourses('thunderbird');
  assert.equal(found[0].id, '99');
  assert.equal(found[0].name, 'Thunderbird Country Club');
  assert.equal(found.filter((row) => row.city === 'Heber Springs').length, 1);

  const other = mergeCatalogSummaries(
    [{ id: '7', name: 'Other CC', club: null, city: 'Cabot', state: 'AR', country: 'US', location: null, distanceMeters: null }],
    searchLocalCatalog('thunderbird heber springs'),
  );
  assert.equal(other[0].name, 'Other CC');
  assert.equal(other.some((row) => row.name === 'Thunderbird Country Club'), true);
});

test('course list searches the local catalog without requiring a Golf Courses API key', () => {
  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  const findFn = picker.slice(picker.indexOf('const onFind'), picker.indexOf('useEffect(() => {'));
  assert.match(findFn, /searchCourses\(plan\.q\)/);
  assert.match(findFn, /nearbyCourses\(plan\.from\)/);
  assert.doesNotMatch(findFn, /if \(!configured\) return/);
  const client = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');
  assert.match(client, /searchLocalCatalog/);
  assert.match(client, /nearbyLocalCatalog/);
  assert.match(client, /mergeCatalogSummaries/);
});
