import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { watchLocationAuthorizationWaitsForSplash, watchSplashPlayback } from './watchSplash';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('Watch splash clip ships in the Watch target with no audio track', () => {
  const clip = readFileSync(new URL('targets/watch/WatchSplash.mov', root));
  assert.ok(clip.length > 0);
  assert.ok(clip.length < 2_000_000, 'keep the Watch bundle small');
  assert.equal(clip.subarray(4, 8).toString('latin1'), 'ftyp');
  assert.equal(clip.includes(Buffer.from('avc1')), true);
  // Handler type for an audio track. Stripped so the splash never touches audio.
  assert.equal(clip.includes(Buffer.from('soun')), false);
});

test('Watch splash plays over the app on cold start and never blocks it', () => {
  const app = read('targets/watch/index.swift');
  // Skipped on a relaunch mid-round, and cut short if a round goes live.
  assert.match(app, /@State private var showSplash = !WatchClubSession\.shared\.liveHoleInProgress/);
  assert.match(app, /onChange\(of: session\.liveHoleInProgress\) \{ _, live in\s*[^}]*if live \{ skipSplashForLiveRound\(\) \}/);
  const session = read('targets/watch/WatchClubSession.swift');
  assert.match(session, /var liveHoleInProgress: Bool \{\n    roundLooksLive && roundIsFresh/);
  assert.match(session, /var roundLooksLive: Bool \{\n    !userLeftApp && list\.roundLive && \(\(hasLiveHole && !list\.roundComplete\) \|\| putt\.open\)/);
  assert.match(app, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(app, /ZStack \{\s*ContentView\(\)[\s\S]*if showSplash \{\s*WatchSplash\(scenePhase: scenePhase\)/);

  const splash = read('targets/watch/WatchSplash.swift');
  assert.match(splash, /static let resource = "WatchSplash"/);
  assert.match(splash, /static let fileExtension = "mov"/);
  assert.match(splash, /static let firstFrame = "WatchSplashFirstFrame"/);
  assert.match(splash, /isMuted = true/);
  // Contain on the Watch too — never fill or crop the owner art.
  assert.match(splash, /contentMode: \.fit/);
  assert.doesNotMatch(splash, /contentMode: \.fill/);
  // Tap skips; end, failure, missing file and a safety timeout all dismiss.
  assert.match(splash, /onTapGesture \{ dismiss\(fade: true, reason: "tap"\) \}/);
  assert.match(splash, /AVPlayerItemDidPlayToEndTime/);
  assert.match(splash, /AVPlayerItemFailedToPlayToEndTime/);
  assert.match(splash, /safetyNanoseconds/);
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
  // Player and timers start only after the scene is active.
  const apply = splash.slice(splash.indexOf('private func applyPhase'), splash.indexOf('private func run'));
  assert.match(apply, /phase == \.active/);
  assert.ok(apply.indexOf('playbackStarted = true') > apply.indexOf('phase == .active'));
  assert.match(apply, /splash pending/);
  const run = splash.slice(splash.indexOf('private func run'), splash.indexOf('private func dismiss'));
  assert.ok(run.indexOf('next.play()') > run.indexOf('playback started'));
  assert.match(splash, /Image\(uiImage: poster\)/);
  assert.match(splash, /VideoPlayer\(player: player\)/);
  assert.ok(splash.indexOf('Image(uiImage: poster)') < splash.indexOf('VideoPlayer(player: player)'));
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
  const png = readFileSync(new URL('targets/watch/WatchSplashFirstFrame.png', root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 784);
  assert.equal(png.readUInt32BE(20), 1168);
});

test('Watch target links the video frameworks the splash imports', () => {
  const config = read('targets/watch/expo-target.config.js');
  assert.match(config, /'AVFoundation'/);
  assert.match(config, /'AVKit'/);
});
