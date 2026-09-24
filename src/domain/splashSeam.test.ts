import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { patchSplashStoryboard } = require('../../plugins/withSplashContain.js') as {
  patchSplashStoryboard: (xml: string) => string;
};

test('splash seam: video has no still behind it, and the launch image keeps the 784×1168 aspect', () => {
  const branded = readFileSync(new URL('../ui/BrandedSplash.tsx', import.meta.url), 'utf8');
  const video = branded.slice(branded.indexOf('function VideoSplash'), branded.indexOf('const styles'));
  assert.ok(video.includes('function VideoSplash'));
  assert.match(video, /SplashStage/);
  assert.match(video, /contentFit=\{SPLASH_RESIZE_MODE\}/);
  assert.doesNotMatch(video, /<Image/);
  assert.match(branded, /splashLetterboxSize/);
  assert.match(branded, /backgroundColor: SPLASH_BG/);

  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.match(app, /plugins\/withSplashContain/);
  assert.match(app, /enableFullScreenImage_legacy": true/);
  assert.match(app, /"resizeMode": "contain"/);

  const storyboard = `
    <imageView contentMode="scaleAspectFill" image="SplashScreenLegacy" id="EXPO-SplashScreen">
      <rect key="frame" x="0.0" y="0.0" width="414" height="736"/>
    </imageView>
    <image name="SplashScreenLegacy" width="414" height="736"/>
  `;
  const patched = patchSplashStoryboard(storyboard);
  assert.match(patched, /contentMode="scaleAspectFit"/);
  assert.doesNotMatch(patched, /scaleAspectFill/);
  assert.match(patched, /name="SplashScreenLegacy" width="784" height="1168"/);
  assert.match(patched, /width="414" height="736"/); // image view frame can stay; constraints pin the edges
});
