import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  LOCAL_COURSE_CATALOG,
  catalogCourseDetail,
  catalogEntryById,
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
  MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  inventGreenFromClubhouse,
} from './hydrate';

test('local catalog indexes Thunderbird Country Club (Heber Springs) as 9 pin-sheet greens, tees HARD-MISS', () => {
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
  assert.deepEqual(report.hydratedHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(report.hardMissHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(report.needsDocPinSheets, false);
  assert.equal(report.needsDocTeePins, true);
  assert.equal(
    thunderbirdHoleSources().every((row) => row.status === 'hydrated' && !row.needsDocPinSheet),
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

test('local catalog indexes Mountain Ranch (Fairfield Bay) as 18 OSM-hydrated holes', () => {
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

test('catalog nearby includes Thunderbird only when the phone is in range', () => {
  const near = nearbyLocalCatalog(THUNDERBIRD_HEBER_CLUBHOUSE, 5);
  assert.equal(near.some((row) => row.name === 'Thunderbird Country Club'), true);
  assert.equal(near.find((row) => row.name === 'Thunderbird Country Club')?.distanceMeters, 0);
  const ranch = nearbyLocalCatalog(MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE, 5);
  assert.equal(ranch.some((row) => row.name === 'Mountain Ranch Golf Club'), true);
  assert.equal(nearbyLocalCatalog({ lat: 37, lng: -122 }, 25).length > 0, true);
  assert.deepEqual(nearbyLocalCatalog({ lat: 0.2, lng: 0.2 }, 25), []);
});

test('catalog getCourse returns 9 Doc greens — null tees, never the clubhouse', () => {
  const detail = catalogCourseDetail('local:thunderbird-heber-springs-ar');
  assert.ok(detail);
  assert.equal(detail?.name, 'Thunderbird Country Club');
  assert.equal(detail?.holeCount, 9);
  assert.equal(detail?.holes.length, 9);
  assert.equal(detail?.tees.length, 0);
  assert.equal(detail?.greenCentersAvailable, true);
  assert.deepEqual(detail?.location, THUNDERBIRD_HEBER_CLUBHOUSE);
  assert.deepEqual(detail?.holes[0]?.greenCentroid, { lat: 35.52695, lng: -92.03735 });
  assert.equal(detail?.holes[0]?.par, 4);
  assert.equal(detail?.holes[0]?.yards, 267);
  for (const hole of detail?.holes ?? []) {
    assert.equal(hole.teeCentroid, null);
    assert.equal(hole.greenCentroid != null, true);
    assert.equal(hole.par != null, true);
    assert.notDeepEqual(hole.teeCentroid, THUNDERBIRD_HEBER_CLUBHOUSE);
    assert.notDeepEqual(hole.greenCentroid, THUNDERBIRD_HEBER_CLUBHOUSE);
  }
  assert.equal(catalogCourseDetail('4'), null);
  assert.equal(catalogEntryById(THUNDERBIRD_HEBER_SPRINGS_AR_KEY)?.name, 'Thunderbird Country Club');

  const ranch = catalogCourseDetail('local:mountain-ranch-fairfield-bay-ar');
  assert.ok(ranch);
  assert.equal(ranch?.name, 'Mountain Ranch Golf Club');
  assert.equal(ranch?.holeCount, 18);
  assert.equal(ranch?.holes.length, 18);
  assert.equal(ranch?.tees.length, 0);
  assert.deepEqual(ranch?.holes[0]?.teeCentroid, { lat: 35.6126927, lng: -92.2884055 });
  assert.deepEqual(ranch?.holes[0]?.greenCentroid, { lat: 35.6149737, lng: -92.2861298 });
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
    getKey: () => null,
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
  assert.equal(ranchDetail?.holes[0]?.teeCentroid != null, true);
  assert.equal(ranchDetail?.holes[0]?.greenCentroid != null, true);
  const far = await client.nearbyCourses({ lat: 0.2, lng: 0.2 });
  assert.deepEqual(far, []);
  const detail = await client.getCourse('local:thunderbird-heber-springs-ar');
  assert.equal(detail?.holeCount, 9);
  assert.equal(detail?.holes[0]?.teeCentroid, null);
  assert.deepEqual(detail?.holes[0]?.greenCentroid, { lat: 35.52695, lng: -92.03735 });
  assert.equal(
    (await client.searchCourses('pebble')).some((row) => /pebble/i.test(row.name)),
    true,
  );
  assert.equal(await client.getCourse('4'), null);
  assert.equal(calls, 0);
});

test('API search results win; catalog fills a Thunderbird miss without duplicating the same club', async () => {
  const client = createCourseDataClient({
    getKey: () => 'test-key',
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
