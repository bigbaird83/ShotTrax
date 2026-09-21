import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  LOCAL_COURSE_CATALOG,
  catalogCourseDetail,
  catalogEntryById,
  mergeCatalogSummaries,
  nearbyLocalCatalog,
  searchLocalCatalog,
  thunderbirdCourseReport,
  thunderbirdHoleSources,
} from './catalog';
import { createCourseDataClient } from './client';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY, inventGreenFromClubhouse } from './hydrate';

test('local catalog indexes Thunderbird Country Club (Heber Springs) as 9 HARD-MISS holes', () => {
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
  assert.equal(
    thunderbirdHoleSources().every((row) => row.status === 'hard-miss' && row.needsDocPinSheet),
    true,
  );
});

test('catalog search finds Thunderbird by name or Heber Springs and never invents another club', () => {
  const byName = searchLocalCatalog('thunderbird');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].name, 'Thunderbird Country Club');
  assert.equal(byName[0].id, 'local:thunderbird-heber-springs-ar');
  assert.equal(searchLocalCatalog('Heber Springs').length, 1);
  assert.equal(searchLocalCatalog('thunderbird golf course').length, 1);
  assert.deepEqual(searchLocalCatalog('pebble'), []);
  assert.deepEqual(searchLocalCatalog('thunderbird cabot'), []);
  assert.deepEqual(searchLocalCatalog('   '), []);
});

test('catalog nearby includes Thunderbird only when the phone is in range', () => {
  const near = nearbyLocalCatalog(THUNDERBIRD_HEBER_CLUBHOUSE, 25);
  assert.equal(near.length, 1);
  assert.equal(near[0].name, 'Thunderbird Country Club');
  assert.equal(near[0].distanceMeters, 0);
  assert.deepEqual(nearbyLocalCatalog({ lat: 37, lng: -122 }, 25), []);
});

test('catalog getCourse returns 9 miss-card holes — null tee/green, never the clubhouse', () => {
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
    assert.equal(hole.par, null);
    assert.notDeepEqual(hole.teeCentroid, THUNDERBIRD_HEBER_CLUBHOUSE);
    assert.notDeepEqual(hole.greenCentroid, THUNDERBIRD_HEBER_CLUBHOUSE);
  }
  assert.equal(catalogCourseDetail('4'), null);
  assert.equal(catalogEntryById(THUNDERBIRD_HEBER_SPRINGS_AR_KEY)?.name, 'Thunderbird Country Club');
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
  const found = await client.searchCourses('thunderbird');
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Thunderbird Country Club');
  const nearby = await client.nearbyCourses(THUNDERBIRD_HEBER_CLUBHOUSE);
  assert.equal(nearby.length, 1);
  const far = await client.nearbyCourses({ lat: 37, lng: -122 });
  assert.deepEqual(far, []);
  const detail = await client.getCourse('local:thunderbird-heber-springs-ar');
  assert.equal(detail?.holeCount, 9);
  assert.equal(detail?.holes[0]?.teeCentroid, null);
  assert.equal(detail?.holes[0]?.greenCentroid, null);
  assert.deepEqual(await client.searchCourses('pebble'), []);
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
  assert.equal(found.length, 1);
  assert.equal(found[0].id, '99');
  assert.equal(found[0].name, 'Thunderbird Country Club');

  const other = mergeCatalogSummaries(
    [{ id: '7', name: 'Other CC', club: null, city: 'Cabot', state: 'AR', country: 'US', location: null, distanceMeters: null }],
    searchLocalCatalog('thunderbird'),
  );
  assert.equal(other.length, 2);
  assert.equal(other[0].name, 'Other CC');
  assert.equal(other[1].name, 'Thunderbird Country Club');
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
