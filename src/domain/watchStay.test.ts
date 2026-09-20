import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  shouldWatchStayFrontmost,
  watchStayAfterExplicitLeave,
  watchStayAfterRoundEnds,
  watchStayBackgroundMode,
  watchStayIdleDoesNotCountAsLeave,
  watchStayUsesExtendedRuntime,
  watchStayWhenIdleWithoutTaps,
  watchStaysFrontmostDuringRound,
} from './watchStay';

test('TF 54 F: Watch stays in ShotTraxx while the round is live, not after leave', () => {
  assert.equal(watchStaysFrontmostDuringRound(), true);
  assert.equal(watchStayUsesExtendedRuntime(), true);
  assert.equal(watchStayWhenIdleWithoutTaps(), true);
  assert.equal(watchStayIdleDoesNotCountAsLeave(), true);
  assert.equal(watchStayBackgroundMode(), 'self-care');
  assert.equal(watchStayAfterExplicitLeave(), false);
  assert.equal(watchStayAfterRoundEnds(), false);

  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: false }), true);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: false, puttOpen: true }), true);
  assert.equal(shouldWatchStayFrontmost({ hasLiveHole: false, puttOpen: false }), false);
  assert.equal(
    shouldWatchStayFrontmost({ hasLiveHole: true, puttOpen: true, userLeftApp: true }),
    false,
  );

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  const target = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(session, /WKExtendedRuntimeSession/);
  assert.match(session, /syncRoundStay/);
  assert.match(session, /startRoundStay/);
  assert.match(session, /noteScenePhase/);
  assert.match(session, /hasLiveHole \|\| putt\.open/);
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
  assert.match(plist, /WKBackgroundModes/);
  assert.match(plist, /self-care/);
  assert.match(target, /WKBackgroundModes/);
  assert.match(target, /self-care/);
  assert.doesNotMatch(session, /CoreMotion|CMMotion|HKWorkout|HealthKit/);
  assert.doesNotMatch(plist, /workout-processing|HealthKit/);
  assert.match(watchUi, /scenePhase/);
  assert.match(watchUi, /noteScenePhase\("active"\)/);
  assert.match(watchUi, /noteScenePhase\("inactive"\)/);
  assert.match(watchUi, /noteScenePhase\("background"\)/);
});
