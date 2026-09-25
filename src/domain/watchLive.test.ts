import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { clubStripThreeClosestIds } from './clubStrip';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { clubListPayload, parseClubList } from './watchMessages';
import {
  WATCH_LIVE_DISTANCE_FILTER_M,
  WATCH_LIVE_YARDS_FINDING_GPS,
  WATCH_LIVE_YARDS_LOCATION_OFF,
  WATCH_LIVE_YARDS_NO_GREEN,
  WATCH_LIVE_YARDS_WEAK_GPS,
  WATCH_LOCATION_WHEN_IN_USE,
  WATCH_WIDGET_RELOAD_MIN_MS,
  WATCH_WIDGET_RELOAD_MIN_YD,
  phoneLiveShouldReplaceWatch,
  planWatchLiveYards,
  watchClubCarry,
  watchGreenFields,
  watchLiveLocationBackgroundMode,
  watchLiveYardsReason,
  watchShouldRequestLocationAuthorization,
  watchWidgetShouldReload,
  type WatchLiveYardsAuth,
} from './watchLive';

const listBase = {
  top3: ['club_7i'],
  bag: ['club_7i', 'club_8i', 'club_pw', 'club_putter'],
  labels: { club_7i: '7i', club_8i: '8i', club_pw: 'PW', club_putter: 'Pt' },
};

test('course green is sent only when the phone has a real course point', () => {
  assert.equal(watchGreenFields({ green: null }), null);
  assert.equal(watchGreenFields({ green: { lat: 0, lng: 0 } }), null);
  const fields = watchGreenFields({
    green: { lat: 33.5, lng: -111.9 },
    front: { lat: 33.5001, lng: -111.9001 },
    back: { lat: 0, lng: 0 },
  });
  assert.equal(fields?.greenLat, 33.5);
  assert.equal(fields?.greenLng, -111.9);
  assert.equal(fields?.greenFrontLat, 33.5001);
  assert.equal(fields?.greenBackLat, undefined);
});

test('club carry is the play-wheel number, putter and empty carries dropped', () => {
  assert.deepEqual(watchClubCarry({ club_7i: 150.4, club_putter: 8, club_lw: 0, club_sw: null }), {
    club_7i: 150,
  });
});

test('Watch live yards use the phone good/soft/none bands and the 600 yard cap', () => {
  const green = { lat: 33.5, lng: -111.9 };
  const here = { lat: 33.501, lng: -111.9 };
  const good = planWatchLiveYards({ fix: { ...here, accuracyM: SOFT_GPS_MIN_M - 0.1 }, green });
  assert.equal(good.quality, 'good');
  assert.ok(good.yards != null && good.yards > 0);
  const soft = planWatchLiveYards({ fix: { ...here, accuracyM: SOFT_GPS_MAX_M }, green });
  assert.equal(soft.quality, 'soft');
  assert.equal(soft.yards, good.yards);
  const poor = planWatchLiveYards({ fix: { ...here, accuracyM: SOFT_GPS_MAX_M + 0.1 }, green });
  assert.equal(poor.quality, 'none');
  assert.equal(poor.yards, null);
  assert.equal(planWatchLiveYards({ fix: { ...here, accuracyM: 5 }, green: null }).yards, null);
  const far = planWatchLiveYards({
    fix: { lat: 33.5 + 0.02, lng: -111.9, accuracyM: 5 },
    green,
  });
  if ((far.yards ?? 0) > 600) {
    assert.equal(far.quality, 'none');
    assert.equal(far.yards, null);
  }
});

test('a dash names why there are no live yards and never invents a number', () => {
  const base = {
    hasTrustedYards: false,
    hasGreen: true,
    authorization: 'authorized' as const,
    accuracyM: null as number | null,
  };
  assert.equal(
    watchLiveYardsReason({ ...base, hasTrustedYards: true, hasGreen: false, authorization: 'denied', accuracyM: 80 }),
    null,
  );
  assert.equal(watchLiveYardsReason({ ...base, hasGreen: false }), WATCH_LIVE_YARDS_NO_GREEN);
  assert.equal(
    watchLiveYardsReason({ ...base, hasGreen: false, authorization: 'denied', accuracyM: 80 }),
    WATCH_LIVE_YARDS_NO_GREEN,
  );
  assert.equal(watchLiveYardsReason({ ...base, authorization: 'denied' }), WATCH_LIVE_YARDS_LOCATION_OFF);
  assert.equal(
    watchLiveYardsReason({ ...base, authorization: 'restricted', accuracyM: 40 }),
    WATCH_LIVE_YARDS_LOCATION_OFF,
  );
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: SOFT_GPS_MAX_M + 0.1 }), WATCH_LIVE_YARDS_WEAK_GPS);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: 80 }), WATCH_LIVE_YARDS_WEAK_GPS);
  assert.equal(watchLiveYardsReason({ ...base, authorization: 'notDetermined', accuracyM: 40 }), WATCH_LIVE_YARDS_WEAK_GPS);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: SOFT_GPS_MAX_M }), null);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: 0 }), null);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: null }), WATCH_LIVE_YARDS_FINDING_GPS);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: -1 }), WATCH_LIVE_YARDS_FINDING_GPS);
  assert.equal(watchLiveYardsReason({ ...base, accuracyM: Number.POSITIVE_INFINITY }), WATCH_LIVE_YARDS_FINDING_GPS);
  assert.equal(watchLiveYardsReason({ ...base, authorization: 'notDetermined', accuracyM: null }), null);
  for (const reason of [
    WATCH_LIVE_YARDS_NO_GREEN,
    WATCH_LIVE_YARDS_WEAK_GPS,
    WATCH_LIVE_YARDS_LOCATION_OFF,
    WATCH_LIVE_YARDS_FINDING_GPS,
  ]) {
    assert.equal(reason.trim().length > 0, true);
    assert.doesNotMatch(reason, /\d/);
  }
  assert.equal(watchLiveYardsReason(base), WATCH_LIVE_YARDS_FINDING_GPS);
});

test('request only while active, re-request on next active if still notDetermined', () => {
  let sceneActive = false;
  let authorization: WatchLiveYardsAuth = 'notDetermined';
  let requestInFlight = false;
  const requests: string[] = [];
  const decide = (where: string) => {
    if (!watchShouldRequestLocationAuthorization({ sceneActive, authorization, requestInFlight })) return;
    requestInFlight = true;
    requests.push(where);
  };

  decide('background-launch');
  assert.deepEqual(requests, []);

  sceneActive = true;
  decide('scene-active');
  decide('live-round-while-active');
  assert.deepEqual(requests, ['scene-active']);

  sceneActive = false;
  requestInFlight = false;
  decide('wrist-down');
  assert.deepEqual(requests, ['scene-active']);

  sceneActive = true;
  decide('next-active');
  assert.deepEqual(requests, ['scene-active', 'next-active']);

  authorization = 'authorized';
  requestInFlight = false;
  decide('authorized');
  authorization = 'denied';
  decide('denied');
  authorization = 'restricted';
  decide('restricted');
  assert.deepEqual(requests, ['scene-active', 'next-active']);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const initFn = session.slice(session.indexOf('override init()'), session.indexOf('func requestHome'));
  assert.match(initFn, /launch authorization=/);
  assert.doesNotMatch(initFn, /requestWhenInUseAuthorization/);
  const requestCalls = session.match(/location\.requestWhenInUseAuthorization\(\)/g) ?? [];
  assert.equal(requestCalls.length, 1);

  const ask = session.slice(
    session.indexOf('private func requestLiveLocationAuthorizationIfNeeded'),
    session.indexOf('private func syncLiveLocation'),
  );
  assert.match(ask, /guard sceneIsActive else \{ return \}/);
  assert.doesNotMatch(ask, /liveHoleInProgress/);
  assert.match(ask, /authorizationStatus == \.notDetermined/);
  assert.match(ask, /!locationAuthRequestInFlight/);
  assert.ok(ask.indexOf('guard sceneIsActive else') < ask.indexOf('location.requestWhenInUseAuthorization()'));
  assert.match(ask, /requestWhenInUseAuthorization; scene active/);

  const scene = session.slice(session.indexOf('func noteScenePhase'), session.indexOf('private func noteLocationScene'));
  assert.ok(scene.indexOf('sceneIsActive = true') < scene.indexOf('requestLiveLocationAuthorizationIfNeeded()'));
  assert.match(scene, /locationAuthRequestInFlight = false/);
  const liveStart = session.slice(session.indexOf('private func syncLiveLocation'), session.indexOf('func locationManagerDidChangeAuthorization'));
  assert.match(liveStart, /if liveHoleInProgress \{[\s\S]*requestLiveLocationAuthorizationIfNeeded\(\)/);
  const stay = session.slice(session.indexOf('private func syncRoundStay'), session.indexOf('private func syncWorkoutDeniedHint'));
  const roundGoesLive = stay.slice(stay.indexOf('if next && !wantsStay'), stay.indexOf('wantsStay = next'));
  assert.match(roundGoesLive, /sceneIsActive/);
  assert.match(roundGoesLive, /locationAuthRequestInFlight = false/);
  assert.ok(stay.indexOf('locationAuthRequestInFlight = false') < stay.indexOf('syncLiveLocation()'));

  const authChange = session.slice(
    session.indexOf('func locationManagerDidChangeAuthorization'),
    session.indexOf('func locationManager(_: CLLocationManager, didFailWithError'),
  );
  assert.match(authChange, /case \.authorizedWhenInUse, \.authorizedAlways:/);
  assert.match(authChange, /startLiveLocationIfAuthorized\(\)/);
  assert.doesNotMatch(authChange, /requestWhenInUseAuthorization/);
  assert.match(authChange, /case \.notDetermined:\s*break/);
});

test('a stale phone push cannot overwrite fresher Watch yards on the same hole', () => {
  assert.equal(
    phoneLiveShouldReplaceWatch({ phoneHole: 4, phoneAtMs: 2_000, watchHole: 4, watchAtMs: 3_000 }),
    false,
  );
  assert.equal(
    phoneLiveShouldReplaceWatch({ phoneHole: 4, phoneAtMs: 4_000, watchHole: 4, watchAtMs: 3_000 }),
    true,
  );
  assert.equal(
    phoneLiveShouldReplaceWatch({ phoneHole: 5, phoneAtMs: 1_000, watchHole: 4, watchAtMs: 9_000 }),
    true,
  );
  assert.equal(
    phoneLiveShouldReplaceWatch({ phoneHole: 4, phoneAtMs: null, watchHole: 4, watchAtMs: 3_000 }),
    false,
  );
  assert.equal(
    phoneLiveShouldReplaceWatch({ phoneHole: 4, phoneAtMs: 1_000, watchHole: null, watchAtMs: null }),
    true,
  );
});

test('widget reload waits out yard drift and still fires on a hole change', () => {
  assert.equal(WATCH_WIDGET_RELOAD_MIN_YD, 1);
  assert.equal(WATCH_WIDGET_RELOAD_MIN_MS, 45_000);
  const previous = { hole: 1, quality: 'good', yards: 180, atMs: 1_000 };
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'good', yards: 179, previous, nowMs: 2_000 }),
    false,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'good', yards: 175, previous, nowMs: 2_000 }),
    false,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'good', yards: 179, previous, nowMs: 1_000 + WATCH_WIDGET_RELOAD_MIN_MS }),
    true,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'good', yards: 180, previous, nowMs: 1_000 + WATCH_WIDGET_RELOAD_MIN_MS }),
    false,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'none', yards: null, previous, nowMs: 1_100 }),
    false,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 1, quality: 'none', yards: null, previous, nowMs: 1_000 + WATCH_WIDGET_RELOAD_MIN_MS }),
    true,
  );
  assert.equal(
    watchWidgetShouldReload({ hole: 2, quality: 'good', yards: 180, previous, nowMs: 1_100 }),
    true,
  );
});

test('clubList carries the green, carries, tee length, and fix time without becoming required keys', () => {
  const msg = clubListPayload({
    ...listBase,
    holeNumber: 4,
    yardsToGreen: 160,
    yardsQuality: 'good',
    complication: { yards: 142, quality: 'good', atMs: 1_700_000_000_000 },
    teeLengthYards: 385,
    green: { lat: 33.5, lng: -111.9, front: { lat: 33.5002, lng: -111.9002 } },
    clubCarry: { club_7i: 150, club_8i: 140, club_pw: 120, club_putter: 3 },
  });
  assert.equal(msg.greenLat, 33.5);
  assert.equal(msg.greenFrontLat, 33.5002);
  assert.equal(msg.teeLengthYards, 385);
  assert.equal(msg.complicationAt, 1_700_000_000_000);
  assert.deepEqual(msg.clubCarry, { club_7i: 150, club_8i: 140, club_pw: 120 });
  const parsed = parseClubList(JSON.parse(JSON.stringify(msg)));
  assert.equal(parsed?.greenLng, -111.9);
  assert.equal(parsed?.clubCarry?.club_8i, 140);
  assert.equal(parsed?.teeLengthYards, 385);
  const bare = clubListPayload({ ...listBase, holeNumber: 1, yardsToGreen: null, yardsQuality: 'none' });
  assert.equal(bare.greenLat, undefined);
  assert.equal(bare.clubCarry, undefined);
  assert.equal(bare.teeLengthYards, undefined);
  assert.equal(parseClubList({ ...bare, greenLat: 0, greenLng: 0 })?.greenLat, undefined);
});

test('Watch re-rank uses the same closest-carry window as the phone wheel', () => {
  const clubs = [
    { id: 'club_lw', carry: 75 },
    { id: 'club_sw', carry: 90 },
    { id: 'club_gw', carry: 105 },
    { id: 'club_pw', carry: 120 },
    { id: 'club_7i', carry: 150 },
    { id: 'club_driver', carry: 230 },
  ];
  assert.deepEqual(clubStripThreeClosestIds(clubs, 100), ['club_sw', 'club_gw', 'club_pw']);
  assert.deepEqual(clubStripThreeClosestIds(clubs, 220), ['club_pw', 'club_7i', 'club_driver']);
  assert.ok(!clubStripThreeClosestIds(clubs, 100).includes('club_driver'));

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const windowFn = watch.slice(watch.indexOf('private var stripWindowStart'), watch.indexOf('private var stripWindowToken'));
  assert.match(windowFn, /rankYards/);
  assert.match(windowFn, /abs\(a\.carry - hole\)/);
  const carries = watch.slice(watch.indexOf('private var stripClubs'), watch.indexOf('private var wheelClubs'));
  assert.match(carries, /clubCarry/);
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /func adoptWatchFix/);
  assert.match(session, /phoneLiveShouldReplace/);
  assert.match(session, /accuracyM < 15/);
  assert.match(session, /accuracyM <= 25/);
  assert.match(session, /yards > 600/);
  assert.match(session, /widgetReloadMinYd = 1/);
  assert.match(session, /widgetReloadMinSec = 45.0/);
  assert.match(session, /greenLat/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /watchGreenFields\(\{ green, front: pins\.front, back: pins\.back \}\)/);
  assert.match(hole, /watchClubCarry\(stripPlan\.carries\)/);
  assert.match(hole, /atMs: fix\?\.timestamp/);
  assert.doesNotMatch(hole, /isIosBackgroundLocationEnabled:\s*true/);
});

test('Watch live location stays up wrist-down and stops when the round ends', () => {
  assert.equal(watchLiveLocationBackgroundMode(), 'location');
  assert.equal(WATCH_LIVE_DISTANCE_FILTER_M, 3);
  assert.match(WATCH_LOCATION_WHEN_IN_USE, /show yards to the green and mark where you hit from/);
  assert.doesNotMatch(WATCH_LOCATION_WHEN_IN_USE, /more accurate than the phone/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  const target = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.ok(plist.includes(WATCH_LOCATION_WHEN_IN_USE));
  assert.ok(target.includes(WATCH_LOCATION_WHEN_IN_USE));
  assert.match(target, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /<key>NSLocationWhenInUseUsageDescription<\/key>/);
  assert.match(plist, /<string>workout-processing<\/string>/);
  assert.match(plist, /<string>location<\/string>/);
  assert.match(target, /WKBackgroundModes: \['workout-processing', 'location'\]/);
  assert.match(session, /activityType = \.fitness/);
  assert.match(session, /kCLLocationAccuracyBest/);
  assert.match(session, /liveDistanceFilterM: CLLocationDistance = 3/);
  assert.match(session, /pausesLocationUpdatesAutomatically = false/);
  assert.match(session, /func locationManagerDidChangeAuthorization/);
  assert.match(session, /didFailWithError/);
  assert.match(session, /category: "liveYards"/);
  assert.match(session, /launch authorization=/);
  assert.match(session, /scene active authorization=/);
  assert.match(session, /clubList missing green/);
  assert.match(session, /@Published private\(set\) var liveYardsReason: String\?/);
  const reason = session.slice(
    session.indexOf('private static func liveYardsReason'),
    session.indexOf('private func liveAuthBucket'),
  );
  assert.ok(reason.indexOf('if hasTrustedYards { return nil }') < reason.indexOf('return "No green"'));
  assert.ok(reason.indexOf('return "No green"') < reason.indexOf('return "Location off"'));
  assert.ok(reason.indexOf('return "Location off"') < reason.indexOf('return "Weak GPS"'));
  assert.ok(reason.indexOf('return "Weak GPS"') < reason.indexOf('return "Finding GPS"'));
  assert.match(reason, /accuracyM > 25/);
  assert.match(reason, /authorization == "authorized"/);
  assert.match(reason, /return nil/);
  const authChange = session.slice(
    session.indexOf('func locationManagerDidChangeAuthorization'),
    session.indexOf('func locationManager(_: CLLocationManager, didFailWithError'),
  );
  assert.ok(authChange.indexOf('@unknown default') < authChange.indexOf('syncLiveYardsReason()'));
  assert.match(authChange, /case \.notDetermined:\s*break/);
  const ask = session.slice(
    session.indexOf('private func requestLiveLocationAuthorizationIfNeeded'),
    session.indexOf('private func syncLiveLocation'),
  );
  assert.match(ask, /guard sceneIsActive else \{ return \}/);
  assert.doesNotMatch(ask, /liveHoleInProgress/);
  assert.match(ask, /authorizationStatus == \.notDetermined/);
  assert.match(ask, /requestWhenInUseAuthorization\(\)/);
  assert.match(ask, /requestWhenInUseAuthorization; scene active/);
  assert.match(session, /fix accepted/);
  assert.match(session, /fix rejected/);
  assert.match(session, /allowsBackgroundLocationUpdates = true/);
  assert.match(session, /allowsBackgroundLocationUpdates = false/);
  assert.match(session, /location\.startUpdatingLocation\(\)/);
  assert.match(session, /location\.stopUpdatingLocation\(\)/);

  const note = session.slice(session.indexOf('private func noteLocationScene'), session.indexOf('enum ComplicationReloader'));
  const kept = note.slice(note.indexOf('guard !liveHoleInProgress'), note.indexOf('endLiveLocation()'));
  assert.match(kept, /keeping location updates for the live hole/);
  assert.doesNotMatch(kept, /stopUpdatingLocation/);
  assert.match(note, /endLiveLocation\(\)/);

  const end = session.slice(session.indexOf('private func endLiveLocation'), session.indexOf('private func syncLiveLocation'));
  assert.match(end, /stopUpdatingLocation/);
  assert.match(end, /disableWorkoutBackgroundLocation\(\)/);
  const disable = session.slice(
    session.indexOf('private func disableWorkoutBackgroundLocation'),
    session.indexOf('private func startLiveLocationIfAuthorized'),
  );
  assert.match(disable, /allowsBackgroundLocationUpdates = false/);

  const scene = session.slice(session.indexOf('func noteScenePhase'), session.indexOf('private func noteLocationScene'));
  assert.match(scene, /noteLocationScene\(active: true\)/);
  assert.match(scene, /noteLocationScene\(active: false\)/);
  assert.doesNotMatch(scene, /stopUpdatingLocation/);
  assert.doesNotMatch(scene, /stopRoundStay/);
});

test('watch target infoPlist is copied into the Info.plist Xcode compiles', () => {
  const require = createRequire(import.meta.url);
  const { mergeInfoPlist, watchTargetInfoPlist } = require('../../plugins/withWatchInfoPlist.js') as {
    mergeInfoPlist: (
      plistText: string,
      infoPlist: Record<string, unknown>,
    ) => { changed: boolean; text: string };
    watchTargetInfoPlist: (projectRoot: string, expoConfig: { ios: { bundleIdentifier: string } }) => Record<string, unknown>;
  };
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
  const info = watchTargetInfoPlist(projectRoot, { ios: { bundleIdentifier: 'com.shottrax.app' } });
  assert.equal(info.NSLocationWhenInUseUsageDescription, WATCH_LOCATION_WHEN_IN_USE);
  assert.deepEqual(info.WKBackgroundModes, ['workout-processing', 'location']);
  const plistText = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  assert.equal(mergeInfoPlist(plistText, info).changed, false);
  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.match(app, /plugins\/withWatchInfoPlist/);
});
