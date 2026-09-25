import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  WATCH_HEALTH_SHARE_USAGE,
  WATCH_HEALTH_UPDATE_USAGE,
  shouldWatchStayFrontmost,
  watchHealthReadTypes,
  watchHealthShareTypes,
  watchStayAfterExplicitLeave,
  watchStayAfterRoundEnds,
  watchStayBackgroundMode,
  watchStayIdleDoesNotCountAsLeave,
  watchStayUsesExtendedRuntime,
  watchStayUsesGolfWorkout,
  watchStayWhenIdleWithoutTaps,
  watchStaysFrontmostDuringRound,
  watchWorkoutActivityType,
  watchWorkoutLocationType,
  watchWorkoutSavesToHealth,
} from './watchStay';

test('TF 54 F: Watch stays in ShotTraxx while the round is live, not after leave', () => {
  assert.equal(watchStaysFrontmostDuringRound(), true);
  assert.equal(watchStayUsesGolfWorkout(), true);
  assert.equal(watchStayUsesExtendedRuntime(), false);
  assert.equal(watchStayWhenIdleWithoutTaps(), true);
  assert.equal(watchStayIdleDoesNotCountAsLeave(), true);
  assert.equal(watchStayBackgroundMode(), 'workout-processing');
  assert.equal(watchWorkoutActivityType(), 'golf');
  assert.equal(watchWorkoutLocationType(), 'outdoor');
  assert.equal(watchWorkoutSavesToHealth(), false);
  assert.deepEqual(watchHealthShareTypes(), ['HKWorkoutType']);
  assert.deepEqual(watchHealthReadTypes(), []);
  assert.equal(watchStayAfterExplicitLeave(), false);
  assert.equal(watchStayAfterRoundEnds(), false);

  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: false }), true);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: false, puttOpen: true }), true);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: false, puttOpen: false }), false);
  assert.equal(
    shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: true, userLeftApp: true }),
    false,
  );
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: false, roundComplete: true }), false);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: true, roundLive: false }), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  const target = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  const phone = readFileSync(new URL('../../src/services/watchClub.ts', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');

  assert.match(session, /HKWorkoutSession/);
  assert.doesNotMatch(session, /WKExtendedRuntimeSession/);
  assert.match(session, /activityType = \.golf/);
  assert.match(session, /locationType = \.outdoor/);
  assert.match(session, /syncRoundStay/);
  assert.match(session, /startRoundStay/);
  assert.match(session, /golfWorkoutOccupied/);
  assert.match(session, /HKObjectType\.workoutType\(\)/);
  assert.match(session, /let typesToShare: Set<HKSampleType> = \[HKObjectType\.workoutType\(\)\]/);
  assert.match(session, /let typesToRead: Set<HKObjectType> = \[\]/);
  assert.match(session, /session\.end\(\)/);
  assert.doesNotMatch(session, /HKLiveWorkoutBuilder|finishWorkout|HKLiveWorkoutDataSource|HKQuantityType|heartRate|activeEnergy/);
  assert.match(session, /sharingDenied/);
  assert.match(session, /isHealthDataAvailable/);
  assert.doesNotMatch(session, /fatalError|preconditionFailure/);
  assert.match(session, /list\.roundLive && \(\(hasLiveHole && !list\.roundComplete\) \|\| putt\.open\)/);
  assert.match(session, /userLeftApp/);
  const leaveFn = session.slice(session.indexOf('func leave('), session.indexOf('func dismissNearbyToHole'));
  assert.match(leaveFn, /userLeftApp = true/);
  assert.match(leaveFn, /stopRoundStay/);
  const sceneFn = session.slice(session.indexOf('func noteScenePhase'), session.lastIndexOf('}'));
  assert.match(sceneFn, /phase == "inactive"/);
  assert.doesNotMatch(
    sceneFn.slice(sceneFn.indexOf('phase == "inactive"'), sceneFn.indexOf('phase == "background"')),
    /userLeftApp = true/,
  );
  assert.doesNotMatch(sceneFn, /stopRoundStay/);
  assert.match(plist, /WKBackgroundModes/);
  assert.match(plist, /workout-processing/);
  assert.doesNotMatch(plist, /self-care/);
  assert.match(plist, /NSHealthShareUsageDescription/);
  assert.match(plist, /NSHealthUpdateUsageDescription/);
  assert.match(target, /WKBackgroundModes/);
  assert.match(target, /workout-processing/);
  assert.doesNotMatch(target, /self-care/);
  assert.match(target, /com\.apple\.developer\.healthkit/);
  assert.match(target, /HealthKit/);
  assert.doesNotMatch(session, /CoreMotion|CMMotion/);
  assert.match(watchUi, /scenePhase/);
  assert.match(watchUi, /noteScenePhase\("active"\)/);
  assert.match(watchUi, /noteScenePhase\("inactive"\)/);
  assert.match(watchUi, /noteScenePhase\("background"\)/);

  assert.ok(plist.includes(WATCH_HEALTH_SHARE_USAGE));
  assert.ok(plist.includes(WATCH_HEALTH_UPDATE_USAGE));
  assert.ok(target.includes(WATCH_HEALTH_SHARE_USAGE));
  assert.ok(target.includes(WATCH_HEALTH_UPDATE_USAGE));
  assert.ok(app.includes(WATCH_HEALTH_SHARE_USAGE));
  assert.ok(app.includes(WATCH_HEALTH_UPDATE_USAGE));

  const parsed = JSON.parse(app) as {
    expo: {
      ios: { entitlements: Record<string, unknown>; infoPlist: Record<string, string> };
      extra: {
        eas: {
          build: {
            experimental: {
              ios: {
                appExtensions: { targetName: string; entitlements: Record<string, unknown> }[];
              };
            };
          };
        };
      };
    };
  };
  assert.equal(parsed.expo.ios.entitlements['com.apple.developer.healthkit'], undefined);
  assert.equal(parsed.expo.ios.infoPlist.NSHealthShareUsageDescription, WATCH_HEALTH_SHARE_USAGE);
  assert.equal(parsed.expo.ios.infoPlist.NSHealthUpdateUsageDescription, WATCH_HEALTH_UPDATE_USAGE);
  const watchExt = parsed.expo.extra.eas.build.experimental.ios.appExtensions.find(
    (row) => row.targetName === 'ShotTraxxWatch',
  );
  const widgetExt = parsed.expo.extra.eas.build.experimental.ios.appExtensions.find(
    (row) => row.targetName === 'ShotTraxxHole',
  );
  assert.equal(watchExt?.entitlements['com.apple.developer.healthkit'], true);
  assert.equal(widgetExt?.entitlements['com.apple.developer.healthkit'], undefined);

  assert.match(phone, /export function endWatchRound/);
  assert.match(phone, /roundComplete: true/);
  assert.match(phone, /roundLive: false/);
  assert.match(home, /endWatchRound\(active\.id\)/);
  assert.match(home, /if \(live\) endWatchRound\(round\.id\)/);
  assert.match(hole, /endWatchRound\(id\)/);
  assert.match(hole, /roundLive: round\?\.finishedAt == null/);
  assert.match(session, /message\["roundLive"\]/);
  assert.match(session, /stopRoundStay\(\)/);
});

test('Watch round start clears userLeftApp so the golf workout is requested', () => {
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');

  const replyFn = session.slice(session.indexOf('private func handleReply'), session.indexOf('private func failUnavailable'));
  const started = replyFn.slice(replyFn.indexOf('type == "startRound"'), replyFn.indexOf('if ok, let clubId'));
  assert.match(started, /hasPrefix\("Started"\)/);
  assert.match(started, /resumeRoundStayAfterWatchStart\(\)/);

  const startRound = session.slice(
    session.indexOf('private func startPickedRound'),
    session.indexOf('private var lastClubTapAt'),
  );
  assert.match(startRound, /resumeRoundStayAfterWatchStart\(\)/);

  const apply = session.slice(session.indexOf('private func applyClubList'), session.indexOf('private func applyPuttSheet'));
  assert.match(apply, /freshLiveListAfterHomeCoursePick/);
  assert.match(apply, /resumeRoundStayAfterWatchStart\(\)/);

  const resume = session.slice(
    session.indexOf('private func resumeRoundStayAfterWatchStart'),
    session.indexOf('private func clearWatchRoundStartPending'),
  );
  assert.match(resume, /userLeftApp = false/);
  assert.match(resume, /syncRoundStay\(\)/);

  const leaveFn = session.slice(session.indexOf('func leave('), session.indexOf('func homeAfterRound'));
  assert.match(leaveFn, /userLeftApp = true/);
  assert.match(leaveFn, /clearWatchRoundStartPending\(\)/);
});

test('requestAuthorization is gated on the active Watch scene', () => {
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');

  const requestFn = session.slice(
    session.indexOf('private func requestGolfWorkoutAuthorization'),
    session.indexOf('private func workoutShareStatusLabel'),
  );
  assert.match(requestFn, /guard sceneIsActive else/);
  assert.match(requestFn, /requestAuthorization\(toShare:/);
  assert.match(requestFn, /let typesToRead: Set<HKObjectType> = \[\]/);
  assert.match(requestFn, /workoutLog\.info\("requestAuthorization sent/);
  assert.match(requestFn, /workoutLog\.info\("requestAuthorization not sent/);
  assert.match(requestFn, /requestAuthorization callback success/);
  assert.match(requestFn, /requestAuthorization callback error/);
  assert.ok(requestFn.indexOf('guard sceneIsActive else') < requestFn.indexOf('requestAuthorization(toShare:'));
  assert.ok(requestFn.indexOf('golfAuthSheetUp = true') < requestFn.indexOf('requestAuthorization(toShare:'));

  const startFn = session.slice(
    session.indexOf('private func startRoundStay'),
    session.indexOf('private func requestGolfWorkoutAuthorization'),
  );
  const authorized = startFn.slice(startFn.indexOf('case .sharingAuthorized:'), startFn.indexOf('@unknown default'));
  assert.match(authorized, /beginGolfWorkoutSession\(\)/);
  assert.doesNotMatch(authorized, /sceneIsActive/);
  assert.match(startFn, /authorization status=/);

  const sceneFn = session.slice(session.indexOf('func noteScenePhase'), session.indexOf('enum ComplicationReloader'));
  assert.match(sceneFn, /sceneIsActive = true/);
  assert.match(sceneFn, /sceneIsActive = false/);
  assert.match(sceneFn, /status == \.notDetermined && !golfAuthSheetUp/);
  assert.match(sceneFn, /golfAuthInFlight = false/);
  assert.match(sceneFn, /startRoundStay\(\)/);
  assert.match(sceneFn, /phase == "inactive"/);
  assert.match(sceneFn, /phase == "background"/);
  assert.doesNotMatch(sceneFn, /stopRoundStay/);
});

test('denied workout share shows one club-list hint keyed on sharingDenied', () => {
  const hint =
    'Watch may sleep wrist-down. Turn on Workouts for ShotTraxx in the Health app on your iPhone.';
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.ok(session.includes(hint));

  const syncHint = session.slice(
    session.indexOf('private func syncWorkoutDeniedHint'),
    session.indexOf('func dismissWorkoutDeniedHint'),
  );
  assert.match(syncHint, /status == \.sharingDenied/);
  assert.match(syncHint, /wantsStay/);
  assert.match(syncHint, /sharingAuthorized/);
  assert.match(syncHint, /!list\.roundLive \|\| list\.roundComplete/);
  assert.match(syncHint, /workoutLog/);
  assert.match(syncHint, /workoutDeniedHintText/);
  assert.doesNotMatch(syncHint, /requestAuthorization/);

  const deniedCase = session.slice(session.indexOf('case .sharingDenied:'), session.indexOf('case .notDetermined:'));
  assert.doesNotMatch(deniedCase, /requestAuthorization/);

  const sceneFn = session.slice(session.indexOf('func noteScenePhase'), session.indexOf('enum ComplicationReloader'));
  assert.match(sceneFn, /syncWorkoutDeniedHint\(\)/);

  const clubPick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  assert.match(clubPick, /session\.workoutDeniedHint/);
  assert.match(clubPick, /dismissWorkoutDeniedHint\(\)/);
  assert.ok(clubPick.indexOf('workoutDeniedHint') < clubPick.indexOf('session.madeIt()'));
  assert.ok(clubPick.indexOf('actionPill("Hole Out")') < clubPick.indexOf('session.pick(clubId:'));
  assert.doesNotMatch(clubPick, /requestAuthorization|\.disabled\(/);
});
