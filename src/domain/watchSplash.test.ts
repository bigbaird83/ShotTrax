import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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
  assert.match(app, /onChange\(of: session\.liveHoleInProgress\) \{ _, live in\s*[^}]*if live \{ showSplash = false \}/);
  const session = read('targets/watch/WatchClubSession.swift');
  assert.match(session, /var liveHoleInProgress: Bool \{\n    roundLooksLive && roundIsFresh/);
  assert.match(session, /var roundLooksLive: Bool \{\n    !userLeftApp && list\.roundLive && \(\(hasLiveHole && !list\.roundComplete\) \|\| putt\.open\)/);
  assert.match(app, /ZStack \{\s*ContentView\(\)[\s\S]*if showSplash \{\s*WatchSplash \{ showSplash = false \}/);

  const splash = read('targets/watch/WatchSplash.swift');
  assert.match(splash, /static let resource = "WatchSplash"/);
  assert.match(splash, /static let fileExtension = "mov"/);
  assert.match(splash, /isMuted = true/);
  // Contain on the Watch too — never fill or crop the owner art.
  assert.match(splash, /contentMode: \.fit/);
  assert.doesNotMatch(splash, /contentMode: \.fill/);
  // Tap skips; end, failure, missing file and a safety timeout all dismiss.
  assert.match(splash, /onTapGesture \{ dismiss\(fade: true\) \}/);
  assert.match(splash, /AVPlayerItemDidPlayToEndTime/);
  assert.match(splash, /AVPlayerItemFailedToPlayToEndTime/);
  assert.match(splash, /safetyNanoseconds/);
  assert.match(splash, /accessibilityReduceMotion/);
});

test('Watch target links the video frameworks the splash imports', () => {
  const config = read('targets/watch/expo-target.config.js');
  assert.match(config, /'AVFoundation'/);
  assert.match(config, /'AVKit'/);
});
