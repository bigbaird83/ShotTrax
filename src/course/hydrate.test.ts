import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decideCourseCardPaint } from '../domain/courseCardPaint';
import { planCourseCardCamera } from '../domain/holeCamera';
import {
  signalLabCypressHydrate,
  signalLabGreystoneHydrate,
  signalLabPleasantValleyHydrate,
  signalLabThunderbirdHydrate,
  signalLabMountainRanchHydrate,
  signalLabGreensNorthHillsHydrate,
} from '../domain/playLayout';
import { GREYSTONE_CABOT, PLEASANT_VALLEY_LITTLE_ROCK } from '../domain/reproCourseCard';
import {
  CYPRESS_CREEK_CABOT_AR_KEY,
  CYPRESS_CREEK_CLUBHOUSE,
  GREYSTONE_CABOT_AR_KEY,
  GREYSTONE_CABOT_CLUBHOUSE,
  PLEASANT_VALLEY_LR_AR_KEY,
  PLEASANT_VALLEY_LR_CLUBHOUSE,
  THUNDERBIRD_HEBER_CLUBHOUSE,
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE,
  GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE,
  applyCourseHydrateToLayout,
  fetchGolfApiCypressHydrate,
  getGolfApiKey,
  hydrateHoleFor,
  hydrateHolePassesGates,
  inventGreenFromClubhouse,
  inventGreenFromScorecardYards,
  isClubhousePin,
  loadCourseHydrate,
  loadHydrateForCourse,
  matchesCypressCreekCabot,
  matchesGreystoneCabot,
  matchesPleasantValleyLR,
  matchesThunderbirdHeberSprings,
  matchesMountainRanchFairfieldBay,
  matchesGreensNorthHillsSherwood,
  parseCourseHydrate,
  prefetchCourseHydrateOnce,
  resetHydrateMeterForTests,
  resolveCourseHydrateKey,
  resolveHydrateTeeGreen,
} from './hydrate';

const hydrate = loadCourseHydrate(CYPRESS_CREEK_CABOT_AR_KEY);
const greystoneHydrate = loadCourseHydrate(GREYSTONE_CABOT_AR_KEY);
const pleasantValleyHydrate = loadCourseHydrate(PLEASANT_VALLEY_LR_AR_KEY);
const thunderbirdHydrate = loadCourseHydrate(THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
const mountainRanchHydrate = loadCourseHydrate(MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY);
const greensNorthHillsHydrate = loadCourseHydrate(GREENS_NORTH_HILLS_SHERWOOD_AR_KEY);

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
  assert.equal(signalLabCypressHydrate().pleasantValleyStillMisses, false);
  assert.equal(isClubhousePin(CYPRESS_CREEK_CLUBHOUSE), true);
  assert.equal(isClubhousePin(GREYSTONE_CABOT_CLUBHOUSE), true);
  assert.equal(isClubhousePin(PLEASANT_VALLEY_LR_CLUBHOUSE), true);
  assert.equal(isClubhousePin(THUNDERBIRD_HEBER_CLUBHOUSE), true);
  assert.equal(isClubhousePin(MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE), true);
  assert.equal(isClubhousePin(GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE), true);
  for (const hole of hydrate?.holes ?? []) {
    assert.ok(hole.tee);
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
  assert.equal(signalLabGreystoneHydrate().pleasantValleyStillMisses, false);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  for (const hole of greystoneHydrate?.holes ?? []) {
    assert.ok(hole.tee);
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    assert.equal(isClubhousePin(tee), false);
    assert.equal(isClubhousePin(green), false);
    assert.equal(hydrateHolePassesGates({ tee, green }), true);
    assert.equal(decideCourseCardPaint({ tee, green, phone: null }).mount, true);
    assert.ok(planCourseCardCamera({ tee, green, phone: null }));
  }
});

test('Pleasant Valley OSM+Doc hydrate is 18 gated holes; clubhouse is never a pin', () => {
  assert.ok(pleasantValleyHydrate);
  assert.equal(pleasantValleyHydrate?.courseKey, 'pleasant-valley-lr-ar');
  assert.equal(pleasantValleyHydrate?.displayName, 'Pleasant Valley Country Club');
  assert.equal(pleasantValleyHydrate?.locality, 'Little Rock, AR');
  assert.equal(pleasantValleyHydrate?.source, 'manual_verified');
  assert.match(pleasantValleyHydrate?.sourceRef ?? '', /relation\/9510054/);
  assert.match(pleasantValleyHydrate?.sourceRef ?? '', /H11 tee=Doc-verified hole-way start way\/1029471857/);
  assert.match(pleasantValleyHydrate?.sourceRef ?? '', /H11 green=osm unlabeled way\/686636682/);
  assert.deepEqual(pleasantValleyHydrate?.holes[0]?.tee, {
    lat: 34.778121,
    lng: -92.4057792,
    label: 'default',
  });
  assert.deepEqual(pleasantValleyHydrate?.holes[0]?.green, { lat: 34.7752172, lng: -92.4047103 });
  assert.deepEqual(pleasantValleyHydrate?.holes[10]?.tee, {
    lat: 34.7807034,
    lng: -92.4134576,
    label: 'default',
  });
  assert.deepEqual(pleasantValleyHydrate?.holes[10]?.green, {
    lat: 34.78218659411765,
    lng: -92.41640845882353,
  });
  assert.equal(pleasantValleyHydrate?.holes.length, 18);
  assert.deepEqual(
    pleasantValleyHydrate?.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(signalLabPleasantValleyHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabPleasantValleyHydrate().cypressStillExclusive, true);
  assert.equal(signalLabPleasantValleyHydrate().greystoneStillExclusive, true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  for (const hole of pleasantValleyHydrate?.holes ?? []) {
    assert.ok(hole.tee);
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
  assert.ok(hole1.tee);
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
  assert.equal(hydrateHolePassesGates({ tee: PLEASANT_VALLEY_LR_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: PLEASANT_VALLEY_LR_CLUBHOUSE }), false);
  assert.equal(hydrateHolePassesGates({ tee: THUNDERBIRD_HEBER_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: THUNDERBIRD_HEBER_CLUBHOUSE }), false);
  assert.equal(hydrateHolePassesGates({ tee: MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE }), false);
  assert.equal(hydrateHolePassesGates({ tee: GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE, green }), false);
  assert.equal(hydrateHolePassesGates({ tee, green: GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE }), false);
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
  assert.equal(matchesGreystoneCabot({ name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: PLEASANT_VALLEY_LITTLE_ROCK.city }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Magnolia Country Club' }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Greystone Country Club' }), false);
  assert.equal(resolveCourseHydrateKey({ name: 'Greystone Country Club', city: 'Cabot' }), GREYSTONE_CABOT_AR_KEY);
  assert.equal(loadHydrateForCourse({ name: 'Greystone Country Club', city: 'Cabot' })?.courseKey, GREYSTONE_CABOT_AR_KEY);
  assert.equal(loadHydrateForCourse({ name: 'Cypress Creek Golf Club', city: 'Cabot' })?.courseKey, CYPRESS_CREEK_CABOT_AR_KEY);
});

test('matching is Pleasant Valley Little Rock only — Cypress and Greystone Cabot never match', () => {
  assert.equal(
    matchesPleasantValleyLR({ name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: PLEASANT_VALLEY_LITTLE_ROCK.city }),
    true,
  );
  assert.equal(matchesPleasantValleyLR({ name: 'Pleasant Valley Country Club', city: 'Little Rock', state: 'AR' }), true);
  assert.equal(matchesPleasantValleyLR({ name: 'Pleasant Valley', locality: 'Little Rock, AR' }), true);
  assert.equal(
    matchesPleasantValleyLR({
      name: 'Pleasant Valley Country Club',
      location: PLEASANT_VALLEY_LITTLE_ROCK.location,
    }),
    true,
  );
  assert.equal(
    matchesPleasantValleyLR({ name: 'Pleasant Valley Country Club', location: PLEASANT_VALLEY_LR_CLUBHOUSE }),
    true,
  );
  assert.equal(matchesPleasantValleyLR({ courseKey: PLEASANT_VALLEY_LR_AR_KEY }), true);
  assert.equal(matchesPleasantValleyLR({ name: 'Pleasant Valley Country Club' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Cypress Creek at Greystone' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Cypress Creek Golf Club', location: PLEASANT_VALLEY_LR_CLUBHOUSE }), false);
  assert.equal(matchesPleasantValleyLR({ name: GREYSTONE_CABOT.name, city: GREYSTONE_CABOT.city }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Greystone Country Club', city: 'Little Rock' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Greystone Country Club', location: PLEASANT_VALLEY_LR_CLUBHOUSE }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Pleasant Valley Country Club', city: 'Cabot' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Magnolia Country Club' }), false);
  assert.equal(matchesCypressCreekCabot({ name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: 'Little Rock' }), false);
  assert.equal(matchesGreystoneCabot({ name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: 'Little Rock' }), false);
  assert.equal(
    resolveCourseHydrateKey({ name: 'Pleasant Valley Country Club', city: 'Little Rock' }),
    PLEASANT_VALLEY_LR_AR_KEY,
  );
  assert.equal(
    loadHydrateForCourse({ name: 'Pleasant Valley Country Club', city: 'Little Rock' })?.courseKey,
    PLEASANT_VALLEY_LR_AR_KEY,
  );
  assert.equal(resolveCourseHydrateKey({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), CYPRESS_CREEK_CABOT_AR_KEY);
  assert.equal(resolveCourseHydrateKey({ name: 'Greystone Country Club', city: 'Cabot' }), GREYSTONE_CABOT_AR_KEY);
});

test('Thunderbird golfapi seed is HARD-MISS and does not paint tees or greens', () => {
  assert.equal(thunderbirdHydrate, null);
  const raw = JSON.parse(
    readFileSync(new URL('./hydrates/thunderbird-heber-springs-ar.json', import.meta.url), 'utf8'),
  ) as { source?: string; sourceRef?: string };
  assert.equal(raw.source, 'golfapi');
  assert.match(raw.sourceRef ?? '', /011141520629948893391/);
  assert.equal(signalLabThunderbirdHydrate().paintsViaHydrateWhenProMisses, false);
  assert.equal(signalLabThunderbirdHydrate().hardMissAllNine, true);
  assert.equal(signalLabThunderbirdHydrate().greensFromDocPinSheets, false);
  assert.equal(signalLabThunderbirdHydrate().greensFromGolfApi, false);
  assert.equal(signalLabThunderbirdHydrate().neverInventTees, true);
  assert.equal(signalLabThunderbirdHydrate().needsDocPinSheets, true);
  assert.equal(signalLabThunderbirdHydrate().needsDocTeePins, true);
  assert.equal(signalLabThunderbirdHydrate().golfApiSeedBlocked, true);
  assert.equal(signalLabThunderbirdHydrate().deviceGolfApiCacheBlocked, true);
  assert.equal(signalLabThunderbirdHydrate().networkGolfApiBlocked, true);
  assert.equal(signalLabThunderbirdHydrate().neverInventUnlabeledGreens, true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  assert.equal(isClubhousePin(THUNDERBIRD_HEBER_CLUBHOUSE), true);
  assert.equal(hydrateHoleFor(thunderbirdHydrate, 1), null);
  assert.equal(hydrateHoleFor(thunderbirdHydrate, 10), null);
});

test('matching is Thunderbird Heber Springs only — other AR hydrates never match', () => {
  assert.equal(
    matchesThunderbirdHeberSprings({ name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR' }),
    true,
  );
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Thunderbird Golf Course', locality: 'Heber Springs, AR' }), true);
  assert.equal(
    matchesThunderbirdHeberSprings({ name: 'Thunderbird Country Club', location: THUNDERBIRD_HEBER_CLUBHOUSE }),
    true,
  );
  assert.equal(matchesThunderbirdHeberSprings({ courseKey: THUNDERBIRD_HEBER_SPRINGS_AR_KEY }), true);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Thunderbird Country Club' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Thunderbird Country Club', city: 'Rancho Mirage' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: GREYSTONE_CABOT.name, city: GREYSTONE_CABOT.city }), false);
  assert.equal(
    matchesThunderbirdHeberSprings({ name: PLEASANT_VALLEY_LITTLE_ROCK.name, city: PLEASANT_VALLEY_LITTLE_ROCK.city }),
    false,
  );
  assert.equal(matchesCypressCreekCabot({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), false);
  assert.equal(matchesGreystoneCabot({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), false);
  assert.equal(matchesPleasantValleyLR({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'The Greens at North Hills', city: 'Sherwood' }), false);
  assert.equal(
    resolveCourseHydrateKey({ name: 'Thunderbird Country Club', city: 'Heber Springs' }),
    THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  );
  assert.equal(loadHydrateForCourse({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), null);
  assert.equal(resolveCourseHydrateKey({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), CYPRESS_CREEK_CABOT_AR_KEY);
  assert.equal(resolveCourseHydrateKey({ name: 'Greystone Country Club', city: 'Cabot' }), GREYSTONE_CABOT_AR_KEY);
});

test('Mountain Ranch golfapi hydrate is 18 gated holes; clubhouse is never a pin', () => {
  assert.ok(mountainRanchHydrate);
  assert.equal(mountainRanchHydrate?.courseKey, 'mountain-ranch-fairfield-bay-ar');
  assert.equal(mountainRanchHydrate?.displayName, 'Mountain Ranch Golf Club');
  assert.equal(mountainRanchHydrate?.locality, 'Fairfield Bay, AR');
  assert.equal(mountainRanchHydrate?.source, 'golfapi');
  assert.match(mountainRanchHydrate?.sourceRef ?? '', /golfapi\.io/);
  assert.match(mountainRanchHydrate?.sourceRef ?? '', /012141520627858482448/);
  assert.deepEqual(mountainRanchHydrate?.holes[0]?.tee, {
    lat: 35.6125806,
    lng: -92.2884427,
    label: 'Blue',
  });
  assert.deepEqual(mountainRanchHydrate?.holes[0]?.green, { lat: 35.6149788, lng: -92.2861247 });
  assert.equal(mountainRanchHydrate?.holes.length, 18);
  assert.deepEqual(
    mountainRanchHydrate?.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(signalLabMountainRanchHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabMountainRanchHydrate().thunderbirdStillExclusive, true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  for (const hole of mountainRanchHydrate?.holes ?? []) {
    assert.ok(hole.tee);
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    assert.equal(isClubhousePin(tee), false);
    assert.equal(isClubhousePin(green), false);
    assert.equal(hydrateHolePassesGates({ tee, green }), true);
    assert.equal(decideCourseCardPaint({ tee, green, phone: null }).mount, true);
    assert.ok(planCourseCardCamera({ tee, green, phone: null }));
  }
});

test('matching is Mountain Ranch Fairfield Bay only — Thunderbird and Cabot never match', () => {
  assert.equal(
    matchesMountainRanchFairfieldBay({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay', state: 'AR' }),
    true,
  );
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'Mountain Ranch', locality: 'Fairfield Bay, AR' }), true);
  assert.equal(
    matchesMountainRanchFairfieldBay({ name: 'Mountain Ranch Golf Club', location: MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE }),
    true,
  );
  assert.equal(matchesMountainRanchFairfieldBay({ courseKey: MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY }), true);
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'Mountain Ranch Golf Club' }), false);
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'Mountain Ranch Golf Club', city: 'Heber Springs' }), false);
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), false);
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);
  assert.equal(matchesCypressCreekCabot({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }), false);
  assert.equal(matchesMountainRanchFairfieldBay({ name: 'The Greens at North Hills', city: 'Sherwood' }), false);
  assert.equal(
    resolveCourseHydrateKey({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }),
    MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  );
  assert.equal(
    loadHydrateForCourse({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' })?.courseKey,
    MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
  );
});

test('Greens at North Hills golfapi hydrate is 18 gated holes; clubhouse is never a pin', () => {
  assert.ok(greensNorthHillsHydrate);
  assert.equal(greensNorthHillsHydrate?.courseKey, 'greens-north-hills-sherwood-ar');
  assert.equal(greensNorthHillsHydrate?.displayName, 'The Greens at North Hills');
  assert.equal(greensNorthHillsHydrate?.locality, 'Sherwood, AR');
  assert.equal(greensNorthHillsHydrate?.source, 'golfapi');
  assert.match(greensNorthHillsHydrate?.sourceRef ?? '', /golfapi\.io/);
  assert.match(greensNorthHillsHydrate?.sourceRef ?? '', /012141520629628765160/);
  assert.deepEqual(greensNorthHillsHydrate?.holes[0]?.tee, {
    lat: 34.8216237,
    lng: -92.2303544,
    label: 'Blue',
  });
  assert.deepEqual(greensNorthHillsHydrate?.holes[0]?.green, { lat: 34.8207099, lng: -92.2254161 });
  assert.equal(greensNorthHillsHydrate?.holes.length, 18);
  assert.deepEqual(
    greensNorthHillsHydrate?.holes.map((hole) => hole.hole),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(signalLabGreensNorthHillsHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabGreensNorthHillsHydrate().neverMatchOtherNorthHills, true);
  assert.equal(signalLabGreensNorthHillsHydrate().thunderbirdStillExclusive, true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(inventGreenFromScorecardYards(), false);
  for (const hole of greensNorthHillsHydrate?.holes ?? []) {
    assert.ok(hole.tee);
    const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
    const green = { lat: hole.green.lat, lng: hole.green.lng };
    assert.equal(isClubhousePin(tee), false);
    assert.equal(isClubhousePin(green), false);
    assert.equal(hydrateHolePassesGates({ tee, green }), true);
    assert.equal(decideCourseCardPaint({ tee, green, phone: null }).mount, true);
    assert.ok(planCourseCardCamera({ tee, green, phone: null }));
  }
});

test('matching is Greens at North Hills Sherwood only — other North Hills clubs never match', () => {
  assert.equal(
    matchesGreensNorthHillsSherwood({ name: 'The Greens at North Hills', city: 'Sherwood', state: 'AR' }),
    true,
  );
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'Greens at North Hills', locality: 'Sherwood, AR' }), true);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'North Hills', city: 'Sherwood' }), true);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'The Greens At North Hills', city: 'Sherwood' }), true);
  assert.equal(matchesGreensNorthHillsSherwood({ courseKey: GREENS_NORTH_HILLS_SHERWOOD_AR_KEY }), true);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'The Greens at North Hills' }), false);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'North Hills Country Club', city: 'Pittsburgh' }), false);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'North Hills', city: 'Knoxville' }), false);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'North Hills Country Club' }), false);
  assert.equal(
    matchesGreensNorthHillsSherwood({ name: 'The Greens at North Hills', location: GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE }),
    false,
  );
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'Thunderbird Country Club', city: 'Heber Springs' }), false);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' }), false);
  assert.equal(matchesGreensNorthHillsSherwood({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);
  assert.equal(matchesThunderbirdHeberSprings({ name: 'The Greens at North Hills', city: 'Sherwood' }), false);
  assert.equal(matchesCypressCreekCabot({ name: 'The Greens at North Hills', city: 'Sherwood' }), false);
  assert.equal(
    resolveCourseHydrateKey({ name: 'The Greens at North Hills', city: 'Sherwood' }),
    GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  );
  assert.equal(
    loadHydrateForCourse({ name: 'The Greens at North Hills', city: 'Sherwood' })?.courseKey,
    GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
  );
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
  assert.equal(pleasant.usedHydrate, true);
  assert.equal(pleasant.courseKey, PLEASANT_VALLEY_LR_AR_KEY);
  assert.deepEqual(pleasant.tee, {
    lat: pleasantValleyHydrate!.holes[0].tee.lat,
    lng: pleasantValleyHydrate!.holes[0].tee.lng,
  });
  assert.deepEqual(pleasant.green, {
    lat: pleasantValleyHydrate!.holes[0].green.lat,
    lng: pleasantValleyHydrate!.holes[0].green.lng,
  });
  assert.notDeepEqual(pleasant.tee, { lat: hydrate!.holes[0].tee.lat, lng: hydrate!.holes[0].tee.lng });
  assert.notDeepEqual(pleasant.tee, {
    lat: greystoneHydrate!.holes[0].tee.lat,
    lng: greystoneHydrate!.holes[0].tee.lng,
  });
  assert.equal(decideCourseCardPaint({ tee: pleasant.tee, green: pleasant.green, phone: null }).mount, true);
});

test('layout apply fills thin Cypress, Greystone, and Pleasant Valley cards', () => {
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
  assert.equal(pleasant.holes?.length, 18);
  assert.deepEqual(pleasant.holes?.[0]?.teeCentroid, {
    lat: pleasantValleyHydrate!.holes[0].tee.lat,
    lng: pleasantValleyHydrate!.holes[0].tee.lng,
  });
  assert.deepEqual(pleasant.holes?.[0]?.greenCentroid, {
    lat: pleasantValleyHydrate!.holes[0].green.lat,
    lng: pleasantValleyHydrate!.holes[0].green.lng,
  });
  assert.deepEqual(pleasant.holes?.[10]?.teeCentroid, {
    lat: pleasantValleyHydrate!.holes[10].tee.lat,
    lng: pleasantValleyHydrate!.holes[10].tee.lng,
  });
  assert.notDeepEqual(pleasant.holes?.[0]?.teeCentroid, filled.holes?.[0]?.teeCentroid);
  assert.notDeepEqual(pleasant.holes?.[0]?.teeCentroid, greystone.holes?.[0]?.teeCentroid);
  assert.equal(pleasant.holes?.[0]?.yards, null);

  const thunderbird = resolveHydrateTeeGreen({
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(thunderbird.usedHydrate, false);
  assert.equal(thunderbird.courseKey, THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
  assert.equal(thunderbird.tee, null);
  assert.equal(thunderbird.green, null);
  assert.equal(decideCourseCardPaint({ tee: thunderbird.tee, green: thunderbird.green, phone: null }).mount, false);

  const thunderbirdLayout = applyCourseHydrateToLayout(
    {
      apiId: 'local:thunderbird-heber-springs-ar',
      name: 'Thunderbird Country Club',
      location: THUNDERBIRD_HEBER_CLUBHOUSE,
      holes: [{ number: 1, par: null, yards: null, handicap: null, greenCentroid: null, teeCentroid: null }],
    },
    { name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR' },
  );
  assert.equal(thunderbirdLayout.holes?.[0]?.teeCentroid, null);
  assert.equal(thunderbirdLayout.holes?.[0]?.greenCentroid, null);
  assert.equal(thunderbirdLayout.holes?.[0]?.greenFront ?? null, null);
  assert.equal(thunderbirdLayout.holes?.length, 1);

  const northHills = resolveHydrateTeeGreen({
    name: 'The Greens at North Hills',
    city: 'Sherwood',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(northHills.usedHydrate, true);
  assert.equal(northHills.courseKey, GREENS_NORTH_HILLS_SHERWOOD_AR_KEY);
  assert.deepEqual(northHills.tee, {
    lat: greensNorthHillsHydrate!.holes[0].tee!.lat,
    lng: greensNorthHillsHydrate!.holes[0].tee!.lng,
  });
  assert.deepEqual(northHills.green, greensNorthHillsHydrate!.holes[0].green);
  assert.equal(decideCourseCardPaint({ tee: northHills.tee, green: northHills.green, phone: null }).mount, true);

  const northHillsLayout = applyCourseHydrateToLayout(
    { apiId: 'local:greens-north-hills-sherwood-ar', name: 'The Greens at North Hills', location: GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE, holes: [] },
    { name: 'The Greens at North Hills', city: 'Sherwood', state: 'AR' },
  );
  assert.equal(northHillsLayout.holes?.length, 18);
  assert.deepEqual(northHillsLayout.holes?.[0]?.teeCentroid, northHills.tee);
  assert.deepEqual(northHillsLayout.holes?.[0]?.greenCentroid, northHills.green);
  assert.notDeepEqual(northHillsLayout.holes?.[0]?.teeCentroid, GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE);
  assert.notDeepEqual(northHillsLayout.holes?.[0]?.greenCentroid, GREENS_NORTH_HILLS_SHERWOOD_CLUBHOUSE);

  const ranchLive = resolveHydrateTeeGreen({
    name: 'Mountain Ranch Golf Club',
    city: 'Fairfield Bay',
    holeNumber: 1,
    tee: null,
    green: null,
  });
  assert.equal(ranchLive.usedHydrate, true);
  assert.equal(ranchLive.courseKey, MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY);
  assert.deepEqual(ranchLive.tee, {
    lat: mountainRanchHydrate!.holes[0].tee.lat,
    lng: mountainRanchHydrate!.holes[0].tee.lng,
  });
  assert.deepEqual(ranchLive.green, {
    lat: mountainRanchHydrate!.holes[0].green.lat,
    lng: mountainRanchHydrate!.holes[0].green.lng,
  });
  assert.equal(decideCourseCardPaint({ tee: ranchLive.tee, green: ranchLive.green, phone: null }).mount, true);

  const ranchLayout = applyCourseHydrateToLayout(
    { apiId: 'pro-ranch', name: 'Mountain Ranch Golf Club', location: MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE, holes: [] },
    { name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay', state: 'AR' },
  );
  assert.equal(ranchLayout.holes?.length, 18);
  assert.deepEqual(ranchLayout.holes?.[0]?.teeCentroid, ranchLive.tee);
  assert.deepEqual(ranchLayout.holes?.[0]?.greenCentroid, ranchLive.green);
  assert.notDeepEqual(ranchLayout.holes?.[0]?.teeCentroid, THUNDERBIRD_HEBER_CLUBHOUSE);
  assert.notDeepEqual(ranchLayout.holes?.[0]?.teeCentroid, MOUNTAIN_RANCH_FAIRFIELD_BAY_CLUBHOUSE);
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
    prefetchCourseHydrateOnce({ name: 'Pleasant Valley Country Club', city: 'Little Rock' });
    prefetchCourseHydrateOnce({ name: 'Pleasant Valley Country Club', city: 'Little Rock' });
    prefetchCourseHydrateOnce({ name: 'Thunderbird Country Club', city: 'Heber Springs' });
    prefetchCourseHydrateOnce({ name: 'Thunderbird Country Club', city: 'Heber Springs' });
    prefetchCourseHydrateOnce({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' });
    prefetchCourseHydrateOnce({ name: 'Mountain Ranch Golf Club', city: 'Fairfield Bay' });
    prefetchCourseHydrateOnce({ name: 'The Greens at North Hills', city: 'Sherwood' });
    prefetchCourseHydrateOnce({ name: 'The Greens at North Hills', city: 'Sherwood' });
  } finally {
    console.log = original;
  }
  const hydrateLogs = logs.filter((row) => Array.isArray(row) && row[0] === '[Signal Lab] hydrate');
  assert.equal(hydrateLogs.length, 5);
  const payloads = hydrateLogs.map((row) => (row as unknown[])[1] as { courseKey?: string; holes?: number });
  assert.deepEqual(
    payloads.map((row) => row.courseKey).sort(),
    [
      CYPRESS_CREEK_CABOT_AR_KEY,
      GREENS_NORTH_HILLS_SHERWOOD_AR_KEY,
      GREYSTONE_CABOT_AR_KEY,
      MOUNTAIN_RANCH_FAIRFIELD_BAY_AR_KEY,
      PLEASANT_VALLEY_LR_AR_KEY,
    ].sort(),
  );
  assert.equal(
    payloads.some((row) => row.courseKey === THUNDERBIRD_HEBER_SPRINGS_AR_KEY),
    false,
  );
  assert.equal(
    payloads.every((row) => row.holes === 18),
    true,
  );

  const previous = GOLFAPI_KEY_NAMES_SNAPSHOT();
  try {
    for (const name of previous.names) delete process.env[name];
    assert.equal(getGolfApiKey(), null);
    assert.equal(await fetchGolfApiCypressHydrate(), null);
    process.env.GOLFAPI_KEY = 'test-key';
    const bundled = await fetchGolfApiCypressHydrate();
    assert.equal(bundled?.courseKey, CYPRESS_CREEK_CABOT_AR_KEY);
    assert.equal(bundled?.holes.length, 18);
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
  assert.match(watch, /courseKey: detail\.id/);

  const client = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');
  assert.match(client, /resolveCoursePaint/);
  const osmAt = client.indexOf('loadOsm:');
  const gcaAt = client.indexOf('loadGca:');
  const golfAt = client.indexOf('loadGolfApi:');
  assert.ok(osmAt > 0 && gcaAt > osmAt && golfAt > gcaAt);
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
