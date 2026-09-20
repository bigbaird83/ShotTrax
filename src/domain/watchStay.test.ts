import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  shouldWatchStayFrontmost,
  watchStayAfterExplicitLeave,
  watchStayAfterRoundEnds,
  watchStayUsesExtendedRuntime,
  watchStayWhenIdleWithoutTaps,
  watchStaysFrontmostDuringRound,
} from './watchStay';

test('TF 53 F: Watch stays in ShotTraxx while the round is live, not after leave', () => {
  assert.equal(watchStaysFrontmostDuringRound(), true);
  assert.equal(watchStayUsesExtendedRuntime(), true);
  assert.equal(watchStayWhenIdleWithoutTaps(), true);
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
  assert.match(session, /WKExtendedRuntimeSession/);
  assert.match(session, /syncRoundStay/);
  assert.match(session, /startRoundStay/);
  assert.match(session, /noteScenePhase/);
  assert.match(session, /hasLiveHole \|\| putt\.open/);
  assert.match(session, /userLeftApp/);
  assert.doesNotMatch(session, /CoreMotion|CMMotion|HKWorkout|HealthKit/);
  assert.match(watchUi, /scenePhase/);
  assert.match(watchUi, /noteScenePhase\("active"\)/);
  assert.match(watchUi, /noteScenePhase\("background"\)/);
});
