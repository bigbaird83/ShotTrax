import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

test('TF 63: BrandedSplash plays Doc 3s muted open clip; Reduce Motion uses first-frame still', () => {
  const branded = readFileSync(new URL('../ui/BrandedSplash.tsx', import.meta.url), 'utf8');
  assert.match(branded, /splash-open-first-3s-v2\.mp4/);
  assert.match(branded, /splash-first-frame-v2\.png/);
  assert.match(branded, /\.muted\s*=\s*true/);
  assert.match(branded, /isReduceMotionEnabled/);
  assert.match(branded, /playToEnd/);
  assert.match(branded, /onDone/);
  assert.match(branded, /ShotTraxx/);
  assert.match(branded, /contentFit=\{SPLASH_RESIZE_MODE\}/);
  assert.match(branded, /nativeControls=\{false\}/);
  assert.doesNotMatch(branded, /Animated\.(sequence|spring|timing)/);
  assert.doesNotMatch(branded, /splash-open-10/);

  const clip = new URL('../../assets/splash/splash-open-first-3s-v2.mp4', import.meta.url);
  const still = new URL('../../assets/splash/splash-first-frame-v2.png', import.meta.url);
  const clipBytes = readFileSync(clip);
  const stillBytes = readFileSync(still);
  assert.ok(clipBytes.length > 80_000, '3s clip should be committed');
  assert.ok(clipBytes.length < 500_000, 'must be the 3s trim, not a 10s sting');
  assert.ok(stillBytes.length > 0);
  assert.equal(stillBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const clipStat = statSync(clip);
  assert.ok(clipStat.size > 80_000);

  const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /BrandedSplash/);
  assert.match(layout, /onSplashDone/);

  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: unknown[] };
  };
  const plugins = JSON.stringify(app.expo.plugins);
  assert.match(plugins, /\.\/assets\/images\/splash-icon\.png/);
  assert.match(plugins, /expo-video/);
});
