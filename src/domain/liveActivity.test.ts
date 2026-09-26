import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_GROUP_GAMES, planGroupGames, type GroupHoleIn } from './groupGames';
import {
  formatLiveGroupLine,
  formatLiveLastShot,
  liveActivityPayloadKey,
  planLiveActivityPayload,
} from './liveActivity';

const G = { lat: 35.5, lng: -92.0 };
const F = { lat: 35.4999, lng: -92.0 };
const B = { lat: 35.5001, lng: -92.0 };
const clubs: Record<string, string> = { c7: '7 Iron', cd: 'Driver' };

test('payload: hole, par, running score, and green points', () => {
  const p = planLiveActivityPayload({
    roundId: 'r1',
    courseName: '  North Hills ',
    hole: { number: 7, par: 4 },
    pins: { front: F, middle: G, back: B },
    runningPar: { visible: true, line: 'thru 6, +3' },
    lastShot: '7 Iron · 152 yd',
    groupLine: null,
  });
  assert.deepEqual(p, {
    roundId: 'r1',
    courseName: 'North Hills',
    hole: 7,
    par: 4,
    front: F,
    middle: G,
    back: B,
    scoreLine: 'thru 6, +3',
    lastShot: '7 Iron · 152 yd',
    groupLine: null,
  });
});

test('front and back only when the course has both; no green → no middle; nothing invented', () => {
  const p = planLiveActivityPayload({
    roundId: 'r1',
    courseName: null,
    hole: { number: 1, par: null },
    pins: { front: F, middle: null, back: null },
    runningPar: { visible: false, line: '' },
    lastShot: null,
    groupLine: null,
  });
  assert.equal(p.front, null);
  assert.equal(p.back, null);
  assert.equal(p.middle, null);
  assert.equal(p.par, null);
  assert.equal(p.courseName, 'Round');
  assert.equal(p.scoreLine, '');

  const zero = planLiveActivityPayload({
    roundId: 'r1',
    courseName: 'X',
    hole: { number: 2, par: 3 },
    pins: { front: { lat: 0, lng: 0 }, middle: { lat: 0, lng: 0 }, back: B },
    runningPar: { visible: false, line: '' },
    lastShot: null,
    groupLine: null,
  });
  assert.equal(zero.middle, null);
  assert.equal(zero.front, null);
});

test('last shot is the latest one with a club and a distance', () => {
  const name = (id: string) => clubs[id] ?? null;
  assert.equal(
    formatLiveLastShot(
      [
        { seq: 1, clubId: 'cd', distanceYards: 251.6 },
        { seq: 2, clubId: 'c7', distanceYards: 152.2 },
        { seq: 3, clubId: 'c7', distanceYards: null },
      ],
      name,
    ),
    '7 Iron · 152 yd',
  );
  assert.equal(formatLiveLastShot([{ seq: 1, clubId: null, distanceYards: 200 }], name), null);
  assert.equal(formatLiveLastShot([], name), null);
});

test('group line: leader, ties, net, and skins riding', () => {
  const holes: GroupHoleIn[] = [1, 2].map((n) => ({ number: n, par: 4, strokeIndex: n }));
  const players = [
    { id: 'me', name: 'You', handicap: 5, scores: { 1: 4, 2: 5 } },
    { id: 'ann', name: 'Ann', handicap: 2, scores: { 1: 4, 2: 4 } },
  ];
  const gross = planGroupGames({ holes, players, settings: DEFAULT_GROUP_GAMES });
  assert.equal(formatLiveGroupLine(gross, 2), 'Ann leads E');

  const tied = planGroupGames({
    holes,
    players: [players[0], { ...players[1], scores: { 1: 4, 2: 5 } }],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.equal(formatLiveGroupLine(tied, 2), 'You & Ann lead +1 · 2 skins riding');

  const net = planGroupGames({ holes, players, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  assert.match(formatLiveGroupLine(net, 2) ?? '', / net/);

  assert.equal(formatLiveGroupLine(gross, 1), null);
  assert.equal(formatLiveGroupLine(null, 3), null);
});

test('payload key changes only when the payload does', () => {
  const base = planLiveActivityPayload({
    roundId: 'r1',
    courseName: 'X',
    hole: { number: 1, par: 4 },
    pins: { front: null, middle: G, back: null },
    runningPar: { visible: false, line: '' },
    lastShot: null,
    groupLine: null,
  });
  assert.equal(liveActivityPayloadKey(base), liveActivityPayloadKey({ ...base }));
  assert.notEqual(liveActivityPayloadKey(base), liveActivityPayloadKey({ ...base, lastShot: 'Driver · 250 yd' }));
  assert.equal(liveActivityPayloadKey(null), 'none');
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('app and widget share one identical ShotTraxxRoundAttributes', () => {
  const app = read('../../modules/live-activity/ios/ShotTraxxRoundAttributes.swift');
  const widget = read('../../targets/live-activity/ShotTraxxRoundAttributes.swift');
  assert.equal(widget, app);
  assert.match(app, /struct ShotTraxxRoundAttributes: ActivityAttributes/);
});

test('native yards: 25 m fixes only, nothing past 1000 yd, location only while the activity is up', () => {
  const swift = read('../../modules/live-activity/ios/RoundLiveActivity.swift');
  assert.match(swift, /maxAccuracyM = 25\.0/);
  assert.match(swift, /maxYards = 1000/);
  assert.match(swift, /maxFixAgeS = 30\.0/);
  assert.match(swift, /showsBackgroundLocationIndicator = true/);
  assert.match(swift, /forInfoDictionaryKey: "UIBackgroundModes"/);
  assert.match(swift, /func end\(\) \{\n    stopLocation\(\)/);
  assert.match(swift, /activityStateUpdates where next != \.active/);
  assert.doesNotMatch(swift, /requestAlwaysAuthorization|requestWhenInUseAuthorization/);
  const module = read('../../modules/live-activity/ios/LiveActivityModule.swift');
  assert.match(module, /Name\("ShotTraxxLiveActivity"\)/);
  assert.match(read('../../modules/live-activity/index.ts'), /requireOptionalNativeModule<LiveActivityNative>\('ShotTraxxLiveActivity'\)/);
});

test('app config: Live Activities on, location background mode, still When In Use only', () => {
  const app = JSON.parse(read('../../app.json'));
  const plist = app.expo.ios.infoPlist;
  assert.equal(plist.NSSupportsLiveActivities, true);
  assert.deepEqual(plist.UIBackgroundModes, ['location']);
  assert.match(plist.NSLocationWhenInUseUsageDescription, /Lock Screen up to date until the round ends/);
  const raw = read('../../app.json');
  assert.doesNotMatch(raw, /NSLocationAlways/);
  assert.match(raw, /"isIosBackgroundLocationEnabled": false/);
  const extensions = app.expo.extra.eas.build.experimental.ios.appExtensions;
  assert.ok(extensions.some((e: { targetName: string; bundleIdentifier: string }) =>
    e.targetName === 'ShotTraxxRound' && e.bundleIdentifier === 'com.shottrax.app.round'));
  assert.match(read('../../targets/live-activity/expo-target.config.js'), /type: 'widget'[\s\S]*name: 'ShotTraxxRound'/);
});

test('stale yards: a stale date 60 s after the fix, and stale content shows — not the last numbers', () => {
  const policy = read('../../modules/live-activity/ios/LiveRoundPolicy.swift');
  assert.match(policy, /staleAfterS: TimeInterval = 60/);
  assert.match(policy, /refreshBeforeStaleS: TimeInterval = 30/);
  const swift = read('../../modules/live-activity/ios/RoundLiveActivity.swift');
  assert.doesNotMatch(swift, /staleDate: nil/);
  assert.equal((swift.match(/ActivityContent\(state: [a-z]+, staleDate: stale\)/g) ?? []).length, 3);
  // Every fix (standing still keeps fresh yards and pushes the stale date out).
  assert.match(swift, /distanceFilter = kCLDistanceFilterNone/);
  const widget = read('../../targets/live-activity/index.swift');
  assert.match(widget, /stale \? nil : yards/);
  // Every yard value on screen goes through the stale check.
  assert.doesNotMatch(widget, /yardsText\(state\./);
  assert.doesNotMatch(widget, /yards: state\./);
  assert.equal((widget.match(/context\.isStale/g) ?? []).length, 4);
});

test('swipe-away: remembered per round, no new activity or location for it; a new round clears it', () => {
  const policy = read('../../modules/live-activity/ios/LiveRoundPolicy.swift');
  assert.match(policy, /userDismissed && !endedByApp \? roundId : current/);
  assert.match(policy, /roundId != dismissedRoundId/);
  const swift = read('../../modules/live-activity/ios/RoundLiveActivity.swift');
  assert.match(swift, /dismissedRoundKey = "shottraxx\.liveActivity\.dismissedRoundId"/);
  assert.match(swift, /guard LiveRoundPolicy\.mayStart\(roundId: next\.roundId, dismissedRoundId: dismissed\) else \{[\s\S]*?stopLocation\(\)[\s\S]*?return false/);
  // The guard runs before any Activity.request or startLocation in sync.
  const sync = swift.slice(swift.indexOf('func sync(json: String)'), swift.indexOf('func end()'));
  assert.ok(sync.indexOf('LiveRoundPolicy.mayStart') < sync.indexOf('Activity.request'));
  assert.ok(sync.indexOf('LiveRoundPolicy.mayStart') < sync.indexOf('startLocation()'));
  assert.match(swift, /userDismissed: next == \.dismissed/);
  assert.match(swift, /endedByApp\.insert\(item\.id\)/);
  assert.match(read('../../modules/live-activity/ios/ShotTraxxRoundAttributes.swift'), /var roundId: String/);
  assert.match(read('../../app/round/[id]/hole/[number].tsx'), /roundId: round\.id,/);
  // The Swift policy tests themselves run on the Mac runner.
  const workflow = read('../../.github/workflows/watch-compile.yml');
  assert.match(workflow, /live-round-policy-tests\/main\.swift/);
});

test('an adopted activity (app relaunched mid-round) is watched too, so a swipe-away still sticks', () => {
  const swift = read('../../modules/live-activity/ios/RoundLiveActivity.swift');
  const sync = swift.slice(swift.indexOf('func sync(json: String)'), swift.indexOf('func end()'));
  const adopt = sync.indexOf('Activity<ShotTraxxRoundAttributes>.activities.first');
  const request = sync.indexOf('Activity.request');
  const watch = sync.indexOf('LiveRoundPolicy.needsWatch(activityId: activity?.id, watchedActivityId: watchedActivityId)');
  assert.ok(adopt > 0 && request > 0 && watch > 0);
  // One watch check after both the adopt and the request paths, not inside the request branch only.
  assert.ok(watch > adopt && watch > request);
  assert.equal((sync.match(/watchState\(\)/g) ?? []).length, 1);
  assert.match(sync, /if LiveRoundPolicy\.needsWatch\([^)]*\) \{\n      watchState\(\)/);
  // A held activity from another round is re-selected (and then ended as "other").
  assert.match(sync, /activity\?\.attributes\.roundId != next\.roundId/);
  // watchState records which activity it follows; end() and a finished watch clear it.
  const watchFn = swift.slice(swift.indexOf('private func watchState()'), swift.indexOf('private func staleDate()'));
  assert.match(watchFn, /watchedActivityId = activityId/);
  // A replaced or cancelled watch stands down; only the current activity's watch stops location.
  assert.match(watchFn, /guard let self, !Task\.isCancelled, self\.watchedActivityId == activityId else \{ return \}/);
  assert.match(watchFn, /if self\.activity == nil \|\| self\.activity\?\.id == activityId \{\n            self\.stopLocation\(\)/);
  assert.match(watchFn, /self\.saveDismissed\(remembered\)\n          self\.watchedActivityId = nil/);
  assert.match(swift.slice(swift.indexOf('func end()'), swift.indexOf('private func endActivity')), /watchedActivityId = nil/);
  const policy = read('../../modules/live-activity/ios/LiveRoundPolicy.swift');
  assert.match(policy, /static func needsWatch\(activityId: String\?, watchedActivityId: String\?\) -> Bool/);
  assert.match(read('../../.github/scripts/live-round-policy-tests/main.swift'), /adopted after relaunch/);
});
