import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import {
  watchLaunchCoverVisible,
  watchLocationAuthorizationWaitsForSplash,
  watchSplashClipFinished,
  watchSplashFrameIndex,
  watchSplashFramesAdvance,
  watchSplashMotionWithinDeadline,
  watchSplashPlayback,
  watchSplashSafetyDue,
  WATCH_SPLASH_FADE_NS,
  WATCH_SPLASH_FPS,
  WATCH_SPLASH_FRAME_COUNT,
  WATCH_SPLASH_FRAME_INTERVAL_NS,
  WATCH_SPLASH_MOTION_DEADLINE_NS,
  WATCH_SPLASH_REDUCE_MOTION_NS,
  WATCH_SPLASH_SAFETY_NS,
} from './watchSplash';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

function jpegSize(buf: Buffer): { width: number; height: number } {
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  throw new Error('jpeg has no start-of-frame marker');
}

test('Watch splash ships as contained JPEG frames and not a movie', () => {
  assert.equal(existsSync(new URL('targets/watch/WatchSplash.mov', root)), false);
  const catalog = new URL('targets/watch/Assets.xcassets/', root);
  const sets = readdirSync(catalog).filter((name) => /^WatchSplashFrame\d+\.imageset$/.test(name)).sort();
  assert.equal(sets.length, WATCH_SPLASH_FRAME_COUNT);
  assert.equal(sets[0], 'WatchSplashFrame00.imageset');
  assert.equal(sets[sets.length - 1], `WatchSplashFrame${String(WATCH_SPLASH_FRAME_COUNT - 1).padStart(2, '0')}.imageset`);
  let total = 0;
  for (let i = 0; i < sets.length; i += 1) {
    const name = `WatchSplashFrame${String(i).padStart(2, '0')}`;
    const jpg = readFileSync(new URL(`${name}.imageset/${name}.jpg`, catalog));
    const size = jpegSize(jpg);
    assert.equal(size.width, 345);
    assert.equal(size.height, 514);
    const contents = read(`targets/watch/Assets.xcassets/${name}.imageset/Contents.json`);
    assert.match(contents, new RegExp(`${name}\\.jpg`));
    total += jpg.length;
  }
  assert.ok(total < 2_000_000, `splash frames are ${total} bytes`);
  assert.ok(Math.abs(345 / 514 - 392 / 584) < 0.001);
  assert.equal(WATCH_SPLASH_FPS, 12);
  assert.equal(WATCH_SPLASH_FRAME_COUNT, 37);
  assert.equal(WATCH_SPLASH_FRAME_INTERVAL_NS, Math.floor(1_000_000_000 / WATCH_SPLASH_FPS));
  assert.equal(statSync(new URL('targets/watch/Assets.xcassets/WatchSplashFrame00.imageset/WatchSplashFrame00.jpg', root)).size > 0, true);
});

test('Watch splash plays over the app on cold start and never blocks it', () => {
  const app = read('targets/watch/index.swift');
  // Skipped on a relaunch mid-round, and cut short if a round goes live.
  assert.match(app, /@State private var splashDue = !WatchClubSession\.shared\.liveHoleInProgress/);
  assert.match(app, /onChange\(of: session\.liveHoleInProgress\) \{ _, live in\s*[^}]*if live \{\s*[^}]*skipSplashForLiveRound\(\)/);
  const session = read('targets/watch/WatchClubSession.swift');
  assert.match(session, /var liveHoleInProgress: Bool \{\n    roundLooksLive && roundIsFresh/);
  assert.match(session, /var roundLooksLive: Bool \{\n    !userLeftApp && list\.roundLive && \(\(hasLiveHole && !list\.roundComplete\) \|\| putt\.open\)/);
  assert.match(app, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(app, /ZStack \{\s*ContentView\(\)[\s\S]*if showLaunchCover \{\s*if splashDue \{\s*WatchSplash\(scenePhase: scenePhase\)/);
  assert.match(app, /WatchSplashCover\(\)/);
  assert.match(app, /backgroundTask\(\.snapshot\)/);
  assert.match(app, /raiseSnapshotCover\(\)/);
  assert.match(app, /SnapshotResponse\(\s*restoredDefaultState: true/);
  const coverRule = app.slice(app.indexOf('private var showLaunchCover'), app.indexOf('var body: some View'));
  assert.match(coverRule, /if session\.liveHoleInProgress \{ return false \}/);
  assert.match(coverRule, /if splashDue \{ return true \}/);
  assert.match(coverRule, /if scenePhase != \.active \{ return true \}/);
  assert.ok(coverRule.indexOf('if splashDue { return true }') < coverRule.indexOf('if scenePhase != .active { return true }'));
  assert.match(coverRule, /return false/);

  const splash = read('targets/watch/WatchSplash.swift');
  assert.match(splash, /static let firstFrame = "WatchSplashFirstFrame"/);
  assert.match(splash, /static let frameCount = 37/);
  assert.match(splash, /static let framesPerSecond = 12/);
  assert.match(splash, /frameIntervalNanoseconds: UInt64 = 1_000_000_000 \/ UInt64\(framesPerSecond\)/);
  // Contain on the Watch too — never fill or crop the owner art.
  assert.match(splash, /contentMode: \.fit/);
  assert.doesNotMatch(splash, /contentMode: \.fill/);
  // Tap skips; end, failure, missing frames and a safety timeout all dismiss.
  assert.match(splash, /onTapGesture \{ dismiss\(fade: true, reason: "tap"\) \}/);
  assert.match(splash, /safetyNanoseconds/);
  assert.match(splash, /safetyNanoseconds: UInt64 = 5_000_000_000/);
  assert.match(splash, /fadeNanoseconds: UInt64 = 200_000_000/);
  assert.match(splash, /accessibilityReduceMotion/);
  assert.match(splash, /reduceMotionNanoseconds: UInt64 = 1_200_000_000/);
  assert.match(splash, /splash pending \(scene not active\)/);
  assert.match(splash, /playback started/);
  assert.match(splash, /resource missing/);
  assert.match(splash, /reduce motion still/);
  assert.match(app, /skipped for live round/);
  assert.match(splash, /dismissed \(reason:/);
  assert.match(splash, /reason: "scene left"/);
  assert.match(splash, /reason: "safety"/);
  assert.match(splash, /reason: "failed"/);
  assert.match(splash, /reason: "ended"/);
  // Frames and timers start only after the scene is active.
  const apply = splash.slice(splash.indexOf('private func applyPhase'), splash.indexOf('private func run'));
  assert.match(apply, /phase == \.active/);
  assert.ok(apply.indexOf('playbackStarted = true') > apply.indexOf('phase == .active'));
  assert.match(apply, /splash pending/);
  const run = splash.slice(splash.indexOf('private func run'), splash.indexOf('private func advanceFrames'));
  assert.match(run, /startSafety\(\)/);
  assert.ok(run.indexOf('startSafety()') < run.indexOf('if reduceMotion'));
  assert.match(run, /reduceMotionNanoseconds/);
  assert.match(run, /reason: "failed"/);
  assert.match(run, /playback started/);
  assert.ok(run.indexOf('if reduceMotion') < run.indexOf('playback started'));
  const advance = splash.slice(splash.indexOf('private func advanceFrames'), splash.indexOf('private func startSafety'));
  assert.match(advance, /frameIntervalNanoseconds/);
  assert.ok(advance.indexOf('frameIntervalNanoseconds') < advance.indexOf('frameIndex = index'));
  assert.doesNotMatch(advance, /1_500_000_000/);
  const safety = splash.slice(splash.indexOf('private func startSafety'), splash.indexOf('private func dismiss'));
  assert.match(safety, /safetyNanoseconds/);
  assert.match(safety, /dismiss\(fade: false, reason: "safety"\)/);
  assert.match(splash, /392×584/);
  assert.match(splash, /392\.0 \/ 584\.0/);
  assert.match(splash, /static let poster: UIImage = loadPoster\(\) \?\? UIImage\(\)/);
  assert.match(splash, /struct WatchSplashCover/);
  assert.match(splash, /Image\(uiImage: poster\)/);
  const splashType = splash.indexOf('struct WatchSplash: View');
  const body = splash.slice(splash.indexOf('var body: some View', splashType), splash.indexOf('.onTapGesture'));
  assert.match(body, /Image\(WatchSplashClip\.frameName\(frameIndex\)\)/);
  assert.match(body, /\.resizable\(\)\s+\.aspectRatio\(WatchSplashClip\.aspectRatio, contentMode: \.fit\)/);
  const appear = splash.slice(splash.indexOf('.onAppear'), splash.indexOf('.onChange(of: scenePhase)'));
  assert.doesNotMatch(appear, /loadPoster|poster =/);
  assert.doesNotMatch(splash, /@State private var poster/);
  assert.equal(WATCH_SPLASH_FADE_NS, 200_000_000);
  assert.equal(WATCH_SPLASH_REDUCE_MOTION_NS, 1_200_000_000);
  assert.equal(WATCH_SPLASH_SAFETY_NS, 5_000_000_000);
  assert.ok(WATCH_SPLASH_FRAME_INTERVAL_NS <= WATCH_SPLASH_MOTION_DEADLINE_NS);
  assert.ok(WATCH_SPLASH_FRAME_COUNT * WATCH_SPLASH_FRAME_INTERVAL_NS < WATCH_SPLASH_SAFETY_NS);
});

test('splash draws one frame on an unconditional background and does not use AVKit', () => {
  const splash = read('targets/watch/WatchSplash.swift');
  assert.doesNotMatch(splash, /VideoPlayer/);
  assert.doesNotMatch(splash, /AVPlayer/);
  assert.doesNotMatch(splash, /AVKit/);
  assert.doesNotMatch(splash, /AVFoundation/);
  assert.doesNotMatch(splash, /SplashPlaybackBox/);
  assert.doesNotMatch(splash, /concealedPlayerOpacity/);
  const splashType = splash.indexOf('struct WatchSplash: View');
  const body = splash.slice(splash.indexOf('var body: some View', splashType), splash.indexOf('.onTapGesture'));
  assert.match(
    body,
    /WatchSplashClip\.background\s+\.frame\(maxWidth: \.infinity, maxHeight: \.infinity\)\s+\.ignoresSafeArea\(\)/,
  );
  assert.doesNotMatch(body, /\bif\b/);
  assert.equal(body.indexOf('WatchSplashClip.background') < body.indexOf('Image(WatchSplashClip.frameName(frameIndex))'), true);
  const config = read('targets/watch/expo-target.config.js');
  assert.doesNotMatch(config, /AVFoundation|AVKit/);
});

test('background launch does not start the splash until the first active scene', () => {
  assert.equal(
    watchSplashPlayback({ scene: 'background', started: false, liveHoleInProgress: false }),
    'pending',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'inactive', started: false, liveHoleInProgress: false }),
    'pending',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'active', started: false, liveHoleInProgress: false }),
    'start',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'active', started: true, liveHoleInProgress: false }),
    'playing',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'background', started: true, liveHoleInProgress: false }),
    'dismiss-left',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'inactive', started: true, liveHoleInProgress: false }),
    'dismiss-left',
  );
  // A later active does not start it again once it has been dismissed by leaving.
  assert.equal(
    watchSplashPlayback({ scene: 'active', started: true, liveHoleInProgress: false }),
    'playing',
  );
  assert.equal(
    watchSplashFramesAdvance({ scene: 'background', started: false, reduceMotion: false, dismissing: false }),
    false,
  );
  assert.equal(
    watchSplashFramesAdvance({ scene: 'active', started: false, reduceMotion: false, dismissing: false }),
    false,
  );
  assert.equal(
    watchSplashFramesAdvance({ scene: 'active', started: true, reduceMotion: false, dismissing: false }),
    true,
  );
  assert.equal(watchSplashFrameIndex({ advancing: false, elapsedNs: WATCH_SPLASH_FRAME_INTERVAL_NS }), 0);
});

test('the logo cover is up before playback, and the snapshot is the logo unless a live round is on the hole', () => {
  assert.equal(
    watchLaunchCoverVisible({ scene: 'background', splashDue: true, liveHoleInProgress: false }),
    true,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'inactive', splashDue: true, liveHoleInProgress: false }),
    true,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'active', splashDue: true, liveHoleInProgress: false }),
    true,
  );
  assert.equal(
    watchSplashPlayback({ scene: 'background', started: false, liveHoleInProgress: false }),
    'pending',
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'background', splashDue: false, liveHoleInProgress: false }),
    true,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'inactive', splashDue: false, liveHoleInProgress: false }),
    true,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'active', splashDue: false, liveHoleInProgress: false }),
    false,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'active', splashDue: true, liveHoleInProgress: true }),
    false,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'background', splashDue: false, liveHoleInProgress: true }),
    false,
  );
  assert.equal(
    watchLaunchCoverVisible({ scene: 'background', splashDue: true, liveHoleInProgress: true }),
    false,
  );

  const session = read('targets/watch/WatchClubSession.swift');
  const raise = session.slice(session.indexOf('func raiseSnapshotCover'), session.indexOf('func lowerSnapshotCover'));
  assert.match(raise, /guard !liveHoleInProgress else \{ return \}/);
  assert.match(raise, /snapshot cover/);
  const app = read('targets/watch/index.swift');
  assert.match(app, /phase == \.active \{\s*session\.lowerSnapshotCover\(\)/);
  assert.match(app, /session\.raiseSnapshotCover\(\)/);
});

test('a fresh live round skips the splash and does not hold the location prompt', () => {
  assert.equal(
    watchSplashPlayback({ scene: 'active', started: false, liveHoleInProgress: true }),
    'skip-live',
  );
  assert.equal(
    watchSplashPlayback({ scene: 'background', started: false, liveHoleInProgress: true }),
    'skip-live',
  );
  assert.equal(watchLocationAuthorizationWaitsForSplash({ splashShowing: true, liveHoleInProgress: false }), true);
  assert.equal(watchLocationAuthorizationWaitsForSplash({ splashShowing: false, liveHoleInProgress: false }), false);
  assert.equal(watchLocationAuthorizationWaitsForSplash({ splashShowing: true, liveHoleInProgress: true }), false);
  assert.equal(watchLocationAuthorizationWaitsForSplash({ splashShowing: false, liveHoleInProgress: true }), false);

  const app = read('targets/watch/index.swift');
  const session = read('targets/watch/WatchClubSession.swift');
  assert.match(app, /if !WatchClubSession\.shared\.liveHoleInProgress \{\s*WatchClubSession\.shared\.prepareLaunchSplash\(\)/);
  const ask = session.slice(
    session.indexOf('private func requestLiveLocationAuthorizationIfNeeded'),
    session.indexOf('private func syncLiveLocation'),
  );
  assert.match(ask, /guard !splashShowing else/);
  assert.ok(ask.indexOf('guard !splashShowing else') < ask.indexOf('location.requestWhenInUseAuthorization()'));
  assert.doesNotMatch(ask, /requestAuthorization\(toShare:/);
  const finish = session.slice(session.indexOf('func splashDidFinish'), session.indexOf('private func requestLiveLocationAuthorizationIfNeeded'));
  assert.match(finish, /splashShowing = false/);
  assert.match(finish, /requestLiveLocationAuthorizationIfNeeded\(\)/);
  const png = readFileSync(
    new URL('targets/watch/Assets.xcassets/WatchSplashFirstFrame.imageset/WatchSplashFirstFrame.png', root),
  );
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  // Contained on the largest Apple Watch screen (Ultra 3, 422×514). Same aspect as the 392×584 clip.
  assert.equal(png.readUInt32BE(16), 345);
  assert.equal(png.readUInt32BE(20), 514);
  assert.equal(png[24], 8);
  assert.equal(png[25], 2);
  assert.ok(png.length < 150_000, `poster is ${png.length} bytes`);
  assert.ok(Math.abs(345 / 514 - 392 / 584) < 0.001);
  assert.equal(existsSync(new URL('targets/watch/WatchSplashFirstFrame.png', root)), false);
  const catalog = read('targets/watch/Assets.xcassets/WatchSplashFirstFrame.imageset/Contents.json');
  assert.match(catalog, /WatchSplashFirstFrame\.png/);
  assert.match(read('targets/watch/WatchSplash.swift'), /UIImage\(named: firstFrame\)/);
});

test('frames advance from the still on an active scene and finish before the safety ceiling', () => {
  assert.equal(
    watchSplashFramesAdvance({ scene: 'active', started: true, reduceMotion: true, dismissing: false }),
    false,
  );
  assert.equal(
    watchSplashFramesAdvance({ scene: 'active', started: true, reduceMotion: false, dismissing: true }),
    false,
  );
  assert.equal(
    watchSplashFramesAdvance({ scene: 'inactive', started: true, reduceMotion: false, dismissing: false }),
    false,
  );
  const interval = WATCH_SPLASH_FRAME_INTERVAL_NS;
  assert.equal(watchSplashFrameIndex({ advancing: true, elapsedNs: 0 }), 0);
  assert.equal(watchSplashFrameIndex({ advancing: true, elapsedNs: interval - 1 }), 0);
  assert.equal(watchSplashFrameIndex({ advancing: true, elapsedNs: interval }), 1);
  assert.equal(
    watchSplashFrameIndex({ advancing: true, elapsedNs: (WATCH_SPLASH_FRAME_COUNT - 1) * interval }),
    WATCH_SPLASH_FRAME_COUNT - 1,
  );
  assert.equal(
    watchSplashFrameIndex({ advancing: true, elapsedNs: WATCH_SPLASH_FRAME_COUNT * interval }),
    WATCH_SPLASH_FRAME_COUNT - 1,
  );
  assert.equal(watchSplashClipFinished({ advancing: false, elapsedNs: WATCH_SPLASH_FRAME_COUNT * interval }), false);
  assert.equal(
    watchSplashClipFinished({ advancing: true, elapsedNs: WATCH_SPLASH_FRAME_COUNT * interval - 1 }),
    false,
  );
  assert.equal(watchSplashClipFinished({ advancing: true, elapsedNs: WATCH_SPLASH_FRAME_COUNT * interval }), true);
  assert.equal(watchSplashMotionWithinDeadline(), true);
  assert.equal(watchSplashMotionWithinDeadline(WATCH_SPLASH_MOTION_DEADLINE_NS + 1), false);
  assert.equal(WATCH_SPLASH_MOTION_DEADLINE_NS, 1_500_000_000);
  assert.ok(interval <= WATCH_SPLASH_MOTION_DEADLINE_NS);
  assert.equal(watchSplashSafetyDue({ playbackStarted: false, dismissing: false, elapsed: true }), false);
  assert.equal(watchSplashSafetyDue({ playbackStarted: true, dismissing: true, elapsed: true }), false);
  assert.equal(watchSplashSafetyDue({ playbackStarted: true, dismissing: false, elapsed: false }), false);
  assert.equal(watchSplashSafetyDue({ playbackStarted: true, dismissing: false, elapsed: true }), true);
  assert.equal(WATCH_SPLASH_SAFETY_NS, 5_000_000_000);
  assert.ok(WATCH_SPLASH_REDUCE_MOTION_NS < WATCH_SPLASH_SAFETY_NS);
  assert.ok(WATCH_SPLASH_FRAME_COUNT * interval + WATCH_SPLASH_FADE_NS < WATCH_SPLASH_SAFETY_NS);
});

test('a splash that never finishes still dismisses on the safety ceiling', () => {
  const splash = read('targets/watch/WatchSplash.swift');
  assert.match(splash, /safetyNanoseconds: UInt64 = 5_000_000_000/);
  assert.match(splash, /reason: "safety"/);
  const reduce = splash.slice(splash.indexOf('if reduceMotion'), splash.indexOf('playback started'));
  assert.match(reduce, /reduceMotionNanoseconds/);
  assert.doesNotMatch(reduce, /safetyNanoseconds/);
  const safety = splash.slice(splash.indexOf('private func startSafety'), splash.indexOf('private func dismiss'));
  assert.match(safety, /safetyNanoseconds/);
  assert.match(safety, /guard !dismissing else \{ return \}/);
  assert.match(safety, /dismiss\(fade: false, reason: "safety"\)/);
  assert.doesNotMatch(splash, /stallNanoseconds/);
  assert.doesNotMatch(splash, /lateNanoseconds/);
  assert.doesNotMatch(splash, /playRetryNanoseconds/);
});
