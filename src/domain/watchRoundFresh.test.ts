import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  WATCH_ROUND_FRESH_MS,
  nextStaleWatchRoundClear,
  watchCanContinueRound,
  watchLiveHoleInProgress,
  watchRecoveredWorkoutAction,
  watchRoundEndOverridesStaleSeq,
  watchRoundEndedClubList,
  watchRoundIsFresh,
  watchShouldStartRoundWorkout,
} from './watchRoundFresh';

const nowMs = 1_700_000_000_000;

const live = {
  hasLiveHole: true,
  puttOpen: false,
  userLeftApp: false,
  roundLive: true,
  roundComplete: false,
};

test('Continue shows only for a fresh live round, including after Home', () => {
  const fresh = { roundLive: true, roundComplete: false, hasLiveHole: true, roundIsFresh: true };
  assert.equal(watchCanContinueRound(fresh), true);
  assert.equal(watchCanContinueRound({ ...fresh, userLeftApp: true }), true);
  assert.equal(watchCanContinueRound({ ...fresh, userLeftApp: false }), true);
  assert.equal(
    watchCanContinueRound({ roundLive: false, roundComplete: true, hasLiveHole: true, roundIsFresh: true }),
    false,
  );
  assert.equal(
    watchCanContinueRound({ roundLive: true, roundComplete: false, hasLiveHole: true, roundIsFresh: false }),
    false,
  );
  assert.equal(watchCanContinueRound({ ...fresh, hasLiveHole: false }), false);
  assert.equal(watchCanContinueRound({ ...fresh, roundComplete: true }), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const gate = session.slice(session.indexOf('var canContinueRound: Bool {'), session.indexOf('var showsNearby'));
  assert.match(gate, /list\.roundLive && !list\.roundComplete && hasLiveHole && roundIsFresh/);
  assert.doesNotMatch(gate, /userLeftApp/);
  const ui = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const home = ui.slice(ui.indexOf('private var watchHome'), ui.indexOf('private var nearbySearch'));
  assert.match(home, /if session\.canContinueRound/);
  assert.ok(home.indexOf('canContinueRound') < home.indexOf('Continue · Hole'));
  const tile = home.slice(home.indexOf('if session.canContinueRound'), home.indexOf('Continue · Hole'));
  assert.doesNotMatch(tile, /hasLiveHole/);
});

test('a stale saved round starts no workout and still plays the clip', () => {
  assert.equal(WATCH_ROUND_FRESH_MS, 30 * 60 * 1000);
  const roundIsFresh = watchRoundIsFresh({
    receivedLiveListThisLaunch: false,
    liveAtMs: nowMs - WATCH_ROUND_FRESH_MS - 1,
    nowMs,
  });
  assert.equal(roundIsFresh, false);
  assert.equal(watchRoundIsFresh({ receivedLiveListThisLaunch: false, liveAtMs: 0, nowMs }), false);
  const stay = { ...live, roundIsFresh };
  assert.equal(watchShouldStartRoundWorkout(stay), false);
  // Splash plays while this is false.
  assert.equal(watchLiveHoleInProgress(stay), false);
  assert.equal(watchRecoveredWorkoutAction(roundIsFresh), 'end');
});

test('a saved round with liveAtMs inside 30 minutes is fresh', () => {
  assert.equal(
    watchRoundIsFresh({
      receivedLiveListThisLaunch: false,
      liveAtMs: nowMs - WATCH_ROUND_FRESH_MS,
      nowMs,
    }),
    true,
  );
  assert.equal(
    watchRoundIsFresh({
      receivedLiveListThisLaunch: false,
      liveAtMs: nowMs - 29 * 60 * 1000,
      nowMs,
    }),
    true,
  );
  // Phone clock slightly ahead of the watch still counts.
  assert.equal(
    watchRoundIsFresh({
      receivedLiveListThisLaunch: false,
      liveAtMs: nowMs + 5_000,
      nowMs,
    }),
    true,
  );
  const stay = { ...live, roundIsFresh: true };
  assert.equal(watchShouldStartRoundWorkout(stay), true);
  assert.equal(watchLiveHoleInProgress(stay), true);
});

test('a live list received this launch starts the workout', () => {
  const roundIsFresh = watchRoundIsFresh({
    receivedLiveListThisLaunch: true,
    liveAtMs: nowMs - 5 * 60 * 60 * 1000,
    nowMs,
  });
  assert.equal(roundIsFresh, true);
  assert.equal(watchShouldStartRoundWorkout({ ...live, roundIsFresh }), true);
  assert.equal(watchLiveHoleInProgress({ ...live, roundIsFresh }), true);
  // Finish, delete, and Home/Back still end it.
  assert.equal(watchShouldStartRoundWorkout({ ...live, roundIsFresh, roundLive: false }), false);
  assert.equal(watchShouldStartRoundWorkout({ ...live, roundIsFresh, roundComplete: true }), false);
  assert.equal(watchShouldStartRoundWorkout({ ...live, roundIsFresh, userLeftApp: true }), false);
  // Open putt sheet, no hole yet, still stays up once the list is fresh.
  assert.equal(
    watchShouldStartRoundWorkout({
      hasLiveHole: false,
      puttOpen: true,
      roundIsFresh,
    }),
    true,
  );
});

test('a recovered workout ends when the round is stale and stays when it is fresh', () => {
  assert.equal(watchRecoveredWorkoutAction(false), 'end');
  assert.equal(watchRecoveredWorkoutAction(true), 'keep');
});

test('a round end overrides a stale listSeq only before a live list this launch', () => {
  assert.equal(
    watchRoundEndOverridesStaleSeq({
      currentSeq: 40,
      incomingSeq: 1,
      roundLive: false,
      roundComplete: true,
      receivedLiveListThisLaunch: false,
    }),
    true,
  );
  assert.equal(
    watchRoundEndOverridesStaleSeq({
      currentSeq: 40,
      incomingSeq: 1,
      roundLive: false,
      roundComplete: true,
      receivedLiveListThisLaunch: true,
    }),
    false,
  );
  assert.equal(
    watchRoundEndOverridesStaleSeq({
      currentSeq: 40,
      incomingSeq: 41,
      roundLive: false,
      roundComplete: true,
      receivedLiveListThisLaunch: false,
    }),
    false,
  );
  assert.equal(
    watchRoundEndOverridesStaleSeq({
      currentSeq: 40,
      incomingSeq: 1,
      roundLive: true,
      roundComplete: false,
      receivedLiveListThisLaunch: false,
    }),
    false,
  );
});

test('the phone sends roundLive false once per idle launch, not while a round is open', () => {
  const ended = watchRoundEndedClubList();
  assert.equal(ended.roundLive, false);
  assert.equal(ended.roundComplete, true);
  assert.equal(ended.type, 'clubList');
  assert.deepEqual(ended.top3, []);
  assert.equal(ended.shotCount, 0);

  const launch = nextStaleWatchRoundClear({
    sentWhileIdle: false,
    activeRound: false,
    holeContextMounted: false,
    event: 'launch',
  });
  assert.equal(launch.send, true);
  assert.equal(launch.sentWhileIdle, true);

  const again = nextStaleWatchRoundClear({
    sentWhileIdle: launch.sentWhileIdle,
    activeRound: false,
    holeContextMounted: false,
    event: 'foreground',
  });
  assert.equal(again.send, false);

  const open = nextStaleWatchRoundClear({
    sentWhileIdle: true,
    activeRound: true,
    holeContextMounted: false,
    event: 'foreground',
  });
  assert.equal(open.send, false);
  assert.equal(open.sentWhileIdle, false);

  const holeUp = nextStaleWatchRoundClear({
    sentWhileIdle: false,
    activeRound: false,
    holeContextMounted: true,
    event: 'launch',
  });
  assert.equal(holeUp.send, false);
  assert.equal(holeUp.sentWhileIdle, false);

  const after = nextStaleWatchRoundClear({
    sentWhileIdle: open.sentWhileIdle,
    activeRound: false,
    holeContextMounted: false,
    event: 'foreground',
  });
  assert.equal(after.send, true);
});

test('Watch freshness, recovery, and the phone clear are wired', () => {
  const root = new URL('../../', import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
  const session = read('targets/watch/WatchClubSession.swift');
  const app = read('targets/watch/index.swift');
  const phone = read('src/services/watchClub.ts');
  const nearby = read('src/services/useWatchNearbyStart.ts');

  assert.match(session, /private static let roundFreshWindow: TimeInterval = 30 \* 60/);
  assert.match(session, /private var roundIsFresh: Bool \{/);
  assert.match(session, /receivedLiveListThisLaunch/);
  assert.match(session, /fromPhone && incomingLive && !incomingComplete/);
  assert.doesNotMatch(
    session.slice(session.indexOf('private func loadFromDefaults'), session.indexOf('private func closePuttForAdvance')),
    /fromPhone: true/,
  );
  assert.match(session, /applyClubList\(applicationContext, fromPhone: true\)/);
  assert.match(session, /applyClubList\(message, fromPhone: true\)/);
  assert.match(session, /applyClubList\(userInfo, fromPhone: true\)/);
  assert.match(session, /var liveHoleInProgress: Bool \{\n    roundLooksLive && roundIsFresh/);
  assert.match(session, /let next = roundLooksLive && roundIsFresh/);

  const scene = session.slice(session.indexOf('func noteScenePhase'), session.indexOf('func noteLuminanceReduced'));
  const inactive = scene.slice(scene.indexOf('phase == "inactive"'));
  assert.match(inactive, /roundLooksLive && roundIsFresh/);
  assert.match(inactive, /startRoundStay\(\)/);
  assert.doesNotMatch(inactive, /stopRoundStay/);

  const start = session.slice(session.indexOf('private func startRoundStay'), session.indexOf('private func requestGolfWorkoutAuthorization'));
  assert.match(start, /guard wantsStay, roundIsFresh else \{ return \}/);
  const authorized = start.slice(start.indexOf('case .sharingAuthorized:'), start.indexOf('@unknown default'));
  assert.match(authorized, /beginGolfWorkoutSession\(\)/);
  assert.doesNotMatch(authorized, /sceneIsActive/);

  const begin = session.slice(session.indexOf('private func beginGolfWorkoutSession'), session.indexOf('private func stopRoundStay'));
  assert.match(begin, /recoveringGolfWorkout/);
  assert.match(begin, /golf workout not started; recoverActiveWorkoutSession in progress/);
  assert.match(begin, /golf workout not started; a session is already running/);

  assert.match(app, /@WKApplicationDelegateAdaptor\(ShotTraxxWatchDelegate\.self\)/);
  assert.match(app, /func handleActiveWorkoutRecovery\(\)/);
  assert.match(app, /HKHealthStore\(\)\.recoverActiveWorkoutSession/);
  assert.match(app, /finishGolfWorkoutRecovery/);
  assert.match(session, /recovered golf workout kept; round is fresh/);
  assert.match(session, /recovered golf workout ended; round is not fresh/);
  assert.match(session, /delegate reattached; no builder/);
  assert.match(session, /round end applied despite older listSeq/);

  assert.match(phone, /watchRoundEndedClubList\(\)/);
  assert.match(phone, /nextStaleWatchRoundClear/);
  assert.match(phone, /noteWatchClubDatabase/);
  assert.match(phone, /getActiveRound\(db\)/);
  assert.match(phone, /requestStaleWatchRoundClear\('launch'\)/);
  assert.match(phone, /requestStaleWatchRoundClear\('foreground'\)/);
  assert.match(phone, /deliverClubList\(watchRoundEndedClubList\(\), null\)/);
  const clear = phone.slice(
    phone.indexOf('async function deliverStaleWatchRoundClear'),
    phone.indexOf('export function startWatchClubBridge'),
  );
  assert.doesNotMatch(clear, /endedRoundId/);
  const setCtx = phone.slice(phone.indexOf('export function setWatchClubContext'), phone.indexOf('function enqueueClubList'));
  assert.match(setCtx, /staleWatchClearSent = false/);
  assert.match(nearby, /noteWatchClubDatabase\(db\)/);

  assert.match(app, /onChange\(of: session\.liveHoleInProgress\)/);
});
