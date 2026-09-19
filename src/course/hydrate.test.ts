import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { planCourseCardCamera } from '../domain/holeCamera';
import { signalLabCypressHydrate, signalLabGreystoneHydrate } from '../domain/playLayout';
import { GREYSTONE_CABOT, PLEASANT_VALLEY_LITTLE_ROCK } from '../domain/reproCourseCard';
import {
  CYPRESS_CREEK_CABOT_AR_KEY,
  CYPRESS_CREEK_CLUBHOUSE,
  GREYSTONE_CABOT_AR_KEY,
  GREYSTONE_CABOT_CLUBHOUSE,
  applyCourseHydrateToLayout,
  fetchGolfApiCypressHydrate,
  getGolfApiKey,
  hydrateHolePassesGates,
  inventGreenFromClubhouse,
  inventGreenFromScorecardYards,
  isClubhousePin,
  loadCourseHydrate,
  loadHydrateForCourse,
  matchesCypressCreekCabot,
  matchesGreystoneCabot,
  parseCourseHydrate,
  prefetchCourseHydrateOnce,
  resetHydrateMeterForTests,
  resolveCourseHydrateKey,
  resolveHydrateTeeGreen,
} from './hydrate';

const hydrate = loadCourseHydrate(CYPRESS_CREEK_CABOT_AR_KEY);
const greystoneHydrate = loadCourseHydrate(GREYSTONE_CABOT_AR_KEY);

test('Cypress OSM hydrate is 18 gated holes; clubhouse is never a pin', () => {
  assert.ok(hydrate);
  assert.equal(hydrate?.courseKey, 'cypress-creek-cabot-ar');
  assert.equal(hydrate?.displayName, 'Cypress Creek Golf Club');
  assert.equal(hydrate?.locality, 'Cabot, AR');
  assert.equal(hydrate?.source, 'osm');
  assert.match(hydrate?.sourceRef ?? '', /way\/889858723/);
  assert.match(hydrate?.sourceRef ?? '', /tee\/way\/781188319/);
  assert.match(hydrate?.sourceRef ?? '', /green\/way\/781182770/);
  assert.deepEqual(hydrate?.holes[0]?.tee, {
    lat: 35.0254604,
    lng: -92.0297854,
    label: 'default',
  });
  assert.deepEqual(hydrate?.holes[0]?.green, { lat: 35.027902, lng: -92.0287661 });
  assert.equal(hydrate?.holes.length, 18);
  assert.deepEqual(
    hydrate?.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  assert.equal(signalLabCypressHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabCypressHydrate().greystoneWestStillMisses, false);
  assert.equal(isClubhousePin(CYPRESS_CREEK_CLUBHOUSE), true);
  assert.equal(isClubhousePin(GREYSTONE_CABOT_CLUBHOUSE), true);
  for (const hole of hydrate?.holes ?? []) {
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    assert.equal(isClubhousePin(tee), false);
    assert.equal(isClubhousePin(green), false);
    assert.equal(hydrateHolePassesGates({ tee, green }), true);
    assert.equal(decideCourseCardPaint({ tee, green, phone: null }).mount, true);
    assert.ok(planCourseCardCamera({ tee, green, phone: null }));
  }
});

test('Greystone OSM hydrate is 18 gated holes; clubhouse is never a pin', () => {
  assert.ok(greystoneHydrate);
  assert.equal(greystoneHydrate?.courseKey, 'greystone-cabot-ar');
  assert.equal(greystoneHydrate?.displayName, 'Greystone Country Club');
  assert.equal(greystoneHydrate?.locality, 'Cabot, AR');
  assert.equal(greystoneHydrate?.source, 'osm');
  assert.match(greystoneHydrate?.sourceRef ?? '', /way\/889653505/);
  assert.match(greystoneHydrate?.sourceRef ?? '', /H11 unlabeled green way\/889985712/);
  assert.match(greystoneHydrate?.sourceRef ?? '', /nearest-tee may be forward\/mid/);
  assert.deepEqual(greystoneHydrate?.holes[0]?.tee, {
    lat: 35.0214267,
    lng: -92.0612297,
    label: 'default',
  });
  assert.deepEqual(greystoneHydrate?.holes[0]?.green, { lat: 35.0202789, lng: -92.058169 });
  assert.deepEqual(greystoneHydrate?.holes[10]?.green, { lat: 35.0191851, lng: -92.0686739 });
  assert.equal(greystoneHydrate?.holes.length, 18);
  assert.deepEqual(
    greystoneHydrate?.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(signalLabGreystoneHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabGreystoneHydrate().cypressStillExclusive, true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  for (const hole of greystoneHydrate?.holes ?? []) {
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    assert.equal(isClubhousePin(tee), false);
    assert.equal(isClubhousePin(green), false);
    assert.equal(hydrateHolePassesGates({ tee, green }), true);
    assert.equal(decideCourseCardPaint({ tee, green, phone: null }).mount, true);
    assert.ok(planCourseCardCamera({ tee, green, phone: null }));
  }
});

test('hydrate gates match the miss card: null, ~0,0, same-point, past 700 yd', () => {
  const hole1 = hydrate?.holes[0];
  assert.ok(hole1);
  const tee = { lat: hole1.tee.lat, lng: hole1.tee.lng };
  const green = { lat: hole1.green.lat, lng: hole1.green.lng };
  assert.equal(hydrateHolePassesGates({ tee: null, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: null }), false);
  assert.equal(hydrateHolePassesGates({ tee: { lat: 0, lng: 0 }, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: { lat: 0.001, lng: 0 } }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: tee }), false);
  assert.equal(hydrateHolePassesGates({ tee: CYPRESS_CREEK_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: CYPRESS_CREEK_CLUBHOUSE }), false);
  assert.equal(hydrateHolePassesGates({ tee: GREYSTONE_CABOT_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: GREYSTONE_CABOT_CLUBHOUSE }), false);
  assert.equal(
    hydrateHolePassesGates({
      tee,
      green: { lat: green.lat + 0.02, lng: green.lng + 0.02 },
    }),
    false,
  );
  assert.equal(
    parseCourseHydrate({
      courseKey: 'cypress-creek-cabot-ar',
      displayName: 'Cypress Creek Golf Club',
      locality: 'Cabot, AR',
      source: 'osm',
      sourceRef: 'thin',
      fetchedAt: '2026-09-19T22:00:00Z',
      holes: [{ hole: 1, par: 4, tee: { lat: 0, lng: 0, label: 'default' }, green }],
    })?.holes.length,
    0,
  );
});

test('matching is Cypress Creek Cabot only — Greystone name never hits Cypress', () => {
  assert.equal(matchesCypressCreekCabot({ name: 'Cypress Creek Golf Club', city: 'Cabot', state: 'AR' }), true);
  assert.equal(matchesCypressCreekCabot({ name: 'Cypress Creek', city: 'Cabot' }), true);
  assert.equal(matchesCypressCreekCabot({ name: 'Cypress Creek at Greystone' }), true);
  assert.equal(matchesCypressCreekCabot({ name: 'Cypress Creek Country Club' }), true);
  assert.equal(matchesCypressCreekCabot({ courseKey: CYPRESS_CREEK_CABOT_AR_KEY }), true);
  assert.equal(matchesCypressCreekCabot({ name: 'Cypress Creek Golf Club', location: CYPRESS_CREEK_CLUBHOUSE }), true);
  assert.equal(matchesCypressCreekCabot({ name: GREYSTONE_CABOT.name, city: GREYSTONE_CABOT.city }), false);
  assert.equal(matchesCypressCreekCabot({ name: 'Greystone Country Club', city: 'Cabot', state: 'AR' }), false);
  assert.equal(matchesCypressCreekCabot({ name: 'Greystone Country Club', location: GREYSTONE_CABOT_CLUBHOUSE }), false);
  assert.equal(matchesCypressCreekCabot({ name: PLEASANT_VALLEY_LITTLE_ROCK.name }), false);
  assert.equal(matchesCypressCreekCabot({ name: 'Magnolia Country Club' }), false);
  assert.equal(resolveCourseHydrateKey({ name: 'Cypress Creek at Greystone' }), CYPRESS_CREEK_CABOT_AR_KEY);
  assert.equal(resolveCourseHydrateKey({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), CYPRESS_CREEK_CABOT_AR_KEY);
});

test('matching is Greystone Cabot only — Cypress Creek never hits Greystone', () => {
  assert.equal(matchesGreystoneCabot({ name: GREYSTONE_CABOT.name, city: GREYSTONE_CABOT.city }), true);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone Country Club', city: 'Cabot', state: 'AR' }), true);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone', locality: 'Cabot, AR' }), true);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone Country Club', location: GREYSTONE_CABOT.location }), true);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone Country Club', location: GREYSTONE_CABOT_CLUBHOUSE }), true);
  assert.equal(matchesGreystoneCabot({ courseKey: GREYSTONE_CABOT_AR_KEY }), true);
  assert.equal(matchesGreystoneCabot({ name: 'Cypress Creek at Greystone' }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Cypress Creek Golf Club', location: GREYSTONE_CABOT_CLUBHOUSE }), false);
  assert.equal(matchesGreystoneCabot({ name: PLEASANT_VALLEY_LITTLE_ROCK.name }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Magnolia Country Club' }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone Country Club' }), false);
  assert.equal(resolveCourseHydrateKey({ name: 'Greystone Country Club', city: 'Cabot' }), GREYSTONE_CABOT_AR_KEY);
  assert.equal(loadHydrateForCourse({ name: 'Greystone Country Club', city: 'Cabot' })?.courseKey, GREYSTONE_CABOT_AR_KEY);
  assert.equal(loadHydrateForCourse({ name: 'Cypress Creek Golf Club', city: 'Cabot' })?.courseKey, CYPRESS_CREEK_CABOT_AR_KEY);
});

test('Pro-null Cypress uses hydrate; a sane Pro card is left alone', () => {
  const live = resolveHydrateTeeGreen({
    name: 'Cypress Creek Golf Club',
    city: 'Cabot',
    state: 'AR',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(live.usedHydrate, true);
  assert.equal(live.courseKey, CYPRESS_CREEK_CABOT_AR_KEY);
  assert.deepEqual(live.tee, { lat: hydrate!.holes[0].tee.lat, lng: hydrate!.holes[0].tee.lng });
  assert.deepEqual(live.green, { lat: hydrate!.holes[0].green.lat, lng: hydrate!.holes[0].green.lng });
  assert.equal(decideCourseCardPaint({ tee: live.tee, green: live.green, phone: null }).mount, true);

  const keep = resolveHydrateTeeGreen({
    name: 'Cypress Creek Golf Club',
    city: 'Cabot',
    holeNumber: 1,
    tee: { lat: 35.025, lng: -92.03 },
    green: { lat: 35.027, lng: -92.028 },
  });
  assert.equal(keep.usedHydrate, false);
  assert.deepEqual(keep.tee, { lat: 35.025, lng: -92.03 });

  const greystone = resolveHydrateTeeGreen({
    name: 'Greystone Country Club',
    city: 'Cabot',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(greystone.usedHydrate, true);
  assert.equal(greystone.courseKey, GREYSTONE_CABOT_AR_KEY);
  assert.deepEqual(greystone.tee, {
    lat: greystoneHydrate!.holes[0].tee.lat,
    lng: greystoneHydrate!.holes[0].tee.lng,
  });
  assert.deepEqual(greystone.green, {
    lat: greystoneHydrate!.holes[0].green.lat,
    lng: greystoneHydrate!.holes[0].green.lng,
  });
  assert.notDeepEqual(greystone.tee, { lat: hydrate!.holes[0].tee.lat, lng: hydrate!.holes[0].tee.lng });
  assert.equal(decideCourseCardPaint({ tee: greystone.tee, green: greystone.green, phone: null }).mount, true);

  const pleasant = resolveHydrateTeeGreen({
    name: PLEASANT_VALLEY_LITTLE_ROCK.name,
    city: PLEASANT_VALLEY_LITTLE_ROCK.city,
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(pleasant.usedHydrate, false);
  assert.equal(pleasant.tee, null);
  assert.equal(pleasant.green, null);
});

test('layout apply fills thin Cypress and Greystone cards; other courses stay empty', () => {
  const filled = applyCourseHydrateToLayout(
    { apiId: 'pro-cypress', name: 'Cypress Creek Golf Club', location: CYPRESS_CREEK_CLUBHOUSE, holes: [] },
    { name: 'Cypress Creek Golf Club', city: 'Cabot', state: 'AR' },
  );
  assert.equal(filled.holes?.length, 18);
  assert.equal(filled.holes?.[0]?.teeCentroid != null, true);
  assert.equal(filled.holes?.[0]?.greenCentroid != null, true);
  assert.equal(filled.holes?.[0]?.yards, null);
  assert.deepEqual(filled.holes?.[0]?.teeCentroid, {
    lat: hydrate!.holes[0].tee.lat,
    lng: hydrate!.holes[0].tee.lng,
  });

  const greystone = applyCourseHydrateToLayout(
    { apiId: 'pro-grey', name: GREYSTONE_CABOT.name, location: GREYSTONE_CABOT.location, holes: [] },
    { name: GREYSTONE_CABOT.name, city: GREYSTONE_CABOT.city },
  );
  assert.equal(greystone.holes?.length, 18);
  assert.deepEqual(greystone.holes?.[0]?.teeCentroid, {
    lat: greystoneHydrate!.holes[0].tee.lat,
    lng: greystoneHydrate!.holes[0].tee.lng,
  });
  assert.deepEqual(greystone.holes?.[0]?.greenCentroid, {
    lat: greystoneHydrate!.holes[0].green.lat,
    lng: greystoneHydrate!.holes[0].green.lng,
  });
  assert.notDeepEqual(greystone.holes?.[0]?.teeCentroid, filled.holes?.[0]?.teeCentroid);
  assert.equal(greystone.holes?.[0]?.yards, null);

  const pleasant = applyCourseHydrateToLayout(
    { apiId: 'pro-pv', name: PLEASANT_VALLEY_LITTLE_ROCK.name, location: PLEASANT_VALLEY_LITTLE_ROCK.location, holes: [] },
    { name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: PLEASANT_VALLEY_LITTLE_ROCK.city },
  );
  assert.deepEqual(pleasant.holes, []);
});

test('prefetch meters unique hydrate once and golfapi does not invent without a key', async () => {
  resetHydrateMeterForTests();
  const logs: unknown[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    prefetchCourseHydrateOnce({ name: 'Cypress Creek Golf Club', city: 'Cabot' });
    prefetchCourseHydrateOnce({ name: 'Cypress Creek Golf Club', city: 'Cabot' });
    prefetchCourseHydrateOnce({ name: 'Greystone Country Club', city: 'Cabot' });
    prefetchCourseHydrateOnce({ name: 'Greystone Country Club', city: 'Cabot' });
  } finally {
    console.log = original;
  }
  const hydrateLogs = logs.filter((row) => Array.isArray(row) && row[0] === '[Signal Lab] hydrate');
  assert.equal(hydrateLogs.length, 2);
  const payloads = hydrateLogs.map((row) => (row as unknown[])[1] as { courseKey?: string; holes?: number });
  assert.deepEqual(
    payloads.map((row) => row.courseKey).sort(),
    [CYPRESS_CREEK_CABOT_AR_KEY, GREYSTONE_CABOT_AR_KEY].sort(),
  );
  assert.equal(payloads.every((row) => row.holes === 18), true);

  const previous = GOLFAPI_KEY_NAMES_SNAPSHOT();
  try {
    for (const name of previous.names) delete process.env[name];
    assert.equal(getGolfApiKey(), null);
    assert.equal(await fetchGolfApiCypressHydrate(), null);
  } finally {
    previous.restore();
  }
});

test('Start Round / hole load apply hydrate before MapView for Cypress', () => {
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /applyCourseHydrateToLayout/);
  const apply = home.slice(home.indexOf('async function loadLayout'), home.indexOf('export default function HomeScreen'));
  assert.match(apply, /applyCourseHydrateToLayout/);
  assert.ok(apply.indexOf('applyCourseHydrateToLayout') < apply.indexOf('rememberLayoutHoles'));

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /resolveHydrateTeeGreen/);
  assert.match(hole, /prefetchCourseHydrateOnce/);
  const camera = hole.slice(hole.indexOf('const courseCamera ='), hole.indexOf('const addShotFrom ='));
  assert.match(camera, /planCourseCardCamera/);
  assert.match(camera, /phone: null/);
  assert.equal((hole.match(/planCourseCardCamera\(/g) ?? []).length, 1);

  const watch = readFileSync(new URL('../services/watchNearby.ts', import.meta.url), 'utf8');
  assert.match(watch, /applyCourseHydrateToLayout/);
});

function GOLFAPI_KEY_NAMES_SNAPSHOT(): { names: string[]; restore: () => void } {
  const names = ['GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY', 'GOLF_API_IO_KEY', 'EXPO_PUBLIC_GOLF_API_IO_KEY'];
  const prev = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  return {
    names,
    restore: () => {
      for (const name of names) {
        if (prev[name] == null) delete process.env[name];
        else process.env[name] = prev[name];
      }
    },
  };
}
