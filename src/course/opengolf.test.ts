import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  loadCourseHydrate,
  loadHydrateForCourse,
  resolveCourseHydrateKey,
  resolveHydrateTeeGreen,
} from './hydrate';
import {
  OPEN_GOLF_MATCH_DIST_MAX_M,
  isReservedOpenGolfIdentity,
  isThunderbirdHeberOpenGolfRow,
  loadOpenGolfCatalogRows,
  loadOpenGolfHydrate,
  openGolfCourseKey,
  searchOpenGolfCatalog,
  signalLabOpenGolfIngest,
} from './opengolf';
import { catalogCourseDetail, searchLocalCatalog } from './catalog';

const MAGNOLIA_AR_ID = '2fa21943-abaa-43a4-a90f-cb06c82216b4';
const CAMDEN_AR_ID = 'ea1fd526-9d1d-44ab-bf9b-1f1196255427';

test('OpenGolf ingest locks: centerline only, quarantine high match_dist, never overwrite Thunderbird', () => {
  const flags = signalLabOpenGolfIngest();
  assert.equal(flags.centerlineOnly, true);
  assert.equal(flags.neverInventDailyPins, true);
  assert.equal(flags.neverOverwriteThunderbirdHeber, true);
  assert.equal(flags.quarantineHighMatchDist, true);
  assert.equal(flags.matchDistMaxM, OPEN_GOLF_MATCH_DIST_MAX_M);
  assert.equal(flags.emptyStaysMiss, true);
  assert.equal(flags.odblShareAlike, true);
  assert.equal(OPEN_GOLF_MATCH_DIST_MAX_M, 1000);
  assert.equal(
    isThunderbirdHeberOpenGolfRow({
      name: 'Thunderbird Country Club',
      city: 'Heber Springs',
      state: 'AR',
    }),
    true,
  );
  assert.equal(
    isReservedOpenGolfIdentity({ name: 'Mountain Ranch Golf Club At Fairfield Bay', city: 'Fairfield Bay', state: 'AR' }),
    true,
  );
  assert.equal(isReservedOpenGolfIdentity({ name: 'Cypress Creek At Greystone', city: 'Cabot', state: 'AR' }), true);
  assert.equal(isReservedOpenGolfIdentity({ name: 'Greystone Country Club', city: 'Cabot', state: 'AR' }), true);
  assert.equal(
    isReservedOpenGolfIdentity({ name: 'Regulation At Pleasant Valley Country Club', city: 'Little Rock', state: 'AR' }),
    true,
  );
  assert.equal(
    isReservedOpenGolfIdentity({ name: 'The Greens At North Hills', city: 'Sherwood', state: 'AR' }),
    true,
  );
  assert.equal(isReservedOpenGolfIdentity({ name: 'North Hills Country Club', city: 'Pittsburgh', state: 'PA' }), false);
});

test('OpenGolf catalog ships US holes and keeps Thunderbird / Mountain Ranch reserved', () => {
  const rows = loadOpenGolfCatalogRows();
  assert.ok(rows.length > 7000);
  assert.equal(
    rows.some((row) => isThunderbirdHeberOpenGolfRow({ name: row[1], city: row[2], state: row[3], location: { lat: row[4], lng: row[5] } })),
    false,
  );
  assert.equal(
    rows.some((row) => /mountain ranch/i.test(row[1]) && /fairfield/i.test(row[2])),
    false,
  );
  assert.equal(rows.some((row) => row[0] === MAGNOLIA_AR_ID && row[3] === 'AR'), true);
  assert.equal(rows.some((row) => row[0] === CAMDEN_AR_ID && row[3] === 'AR'), true);
  assert.equal(searchOpenGolfCatalog('thunderbird heber springs').length, 0);
  assert.equal(searchOpenGolfCatalog('   ').length, 0);
});

test('Magnolia and Camden AR paint from OpenGolf centerlines; missing holes stay miss', () => {
  assert.equal(
    resolveCourseHydrateKey({ name: 'Magnolia Country Club', city: 'Magnolia', state: 'AR' }),
    openGolfCourseKey(MAGNOLIA_AR_ID),
  );
  const magnolia = loadOpenGolfHydrate(openGolfCourseKey(MAGNOLIA_AR_ID));
  assert.ok(magnolia);
  assert.equal(magnolia?.source, 'osm');
  assert.match(magnolia?.sourceRef ?? '', /never daily pins/);
  assert.equal(magnolia?.holes.length, 18);
  assert.ok(magnolia?.holes[0]?.tee);
  assert.ok(magnolia?.holes[0]?.green);
  assert.equal(magnolia?.holes[0]?.greenFront, null);
  assert.equal(magnolia?.holes[0]?.greenBack, null);
  const live = resolveHydrateTeeGreen({
    name: 'Magnolia Country Club',
    city: 'Magnolia',
    state: 'AR',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(live.usedHydrate, true);
  assert.deepEqual(live.tee, { lat: magnolia!.holes[0].tee!.lat, lng: magnolia!.holes[0].tee!.lng });
  assert.deepEqual(live.green, magnolia!.holes[0].green);

  const camden = loadHydrateForCourse({ name: 'Camden Country Club', city: 'Camden', state: 'AR' });
  assert.ok(camden);
  assert.ok(camden!.holes.length >= 9);
  assert.ok(camden!.holes.length < 18 || camden!.holes.every((hole) => hole.tee && hole.green));
  const detail = catalogCourseDetail(`local:${openGolfCourseKey(CAMDEN_AR_ID)}`);
  assert.ok(detail);
  assert.equal(detail?.greenCentersAvailable, true);
  const missing = detail?.holes.filter((hole) => hole.teeCentroid == null || hole.greenCentroid == null) ?? [];
  for (const hole of missing) {
    assert.equal(hole.teeCentroid == null || hole.greenCentroid == null, true);
  }
});

test('Thunderbird Heber hydrate is unchanged by OpenGolf — golfapi tee+green, no daily-pin invent', () => {
  assert.equal(
    resolveCourseHydrateKey({ name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR' }),
    THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  );
  assert.equal(loadOpenGolfHydrate(THUNDERBIRD_HEBER_SPRINGS_AR_KEY), null);
  const tb = loadCourseHydrate(THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
  assert.equal(tb?.courseKey, THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
  assert.equal(tb?.source, 'golfapi');
  assert.equal(tb?.holes.length, 18);
  assert.deepEqual(tb?.holes[0]?.tee, { lat: 35.5250149, lng: -92.0393432, label: 'Blue' });
  assert.deepEqual(tb?.holes[0]?.green, { lat: 35.522655, lng: -92.0393088 });
  assert.ok(tb?.holes[0]?.greenFront);
  assert.ok(tb?.holes[0]?.greenBack);
  assert.equal(
    resolveCourseHydrateKey({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }),
    MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  );
  assert.equal(
    resolveCourseHydrateKey({ name: 'The Greens at North Hills', city: 'Sherwood' }),
    'greens-north-hills-sherwood-ar',
  );
  assert.equal(searchLocalCatalog('thunderbird heber springs')[0]?.id, 'local:thunderbird-heber-springs-ar');
});

test('repo and Settings attribute OpenStreetMap contributors and OpenGolf under ODbL', () => {
  const attrib = readFileSync(new URL('../../ATTRIBUTION.md', import.meta.url), 'utf8');
  const notice = readFileSync(new URL('../../NOTICE', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(attrib, /OpenStreetMap contributors/);
  assert.match(attrib, /OpenGolf/);
  assert.match(attrib, /ODbL/);
  assert.match(notice, /OpenStreetMap contributors/);
  assert.match(notice, /OpenGolf/);
  assert.match(settings, /COPY\.courseDataCredits/);
  assert.match(readme, /OpenGolf \/ OSM follow ingest/);
  assert.match(readme, /does \*\*not\*\* overwrite this card/);
});
