import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function splashPlugin() {
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: unknown[] };
  };
  const plugin = (app.expo.plugins as unknown[]).find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen',
  ) as [
    string,
    {
      image: string;
      resizeMode: string;
      backgroundColor: string;
      dark?: { image: string; resizeMode?: string; backgroundColor: string };
    },
  ];
  assert.ok(plugin);
  return plugin[1];
}

test('TF 65: attached v2 square clip + first-frame still, contain + black letterbox, never cover', () => {
  const branded = readFileSync(new URL('../ui/BrandedSplash.tsx', import.meta.url), 'utf8');
  assert.match(branded, /splash-open-first-3s-v2\.mp4/);
  assert.match(branded, /splash-first-frame-v2\.png/);
  assert.match(branded, /splashLetterboxSize/);
  assert.match(branded, /SPLASH_RESIZE_MODE/);
  assert.match(branded, /contentFit=\{SPLASH_RESIZE_MODE\}/);
  assert.match(branded, /resizeMode=\{SPLASH_RESIZE_MODE\}/);
  assert.match(branded, /\.muted\s*=\s*true/);
  assert.match(branded, /isReduceMotionEnabled/);
  assert.doesNotMatch(branded, /contentFit="cover"/);
  assert.doesNotMatch(branded, /resizeMode="cover"/);
  assert.doesNotMatch(branded, /resizeMode="stretch"/);
  assert.doesNotMatch(branded, /contentFit="fill"/);
  assert.doesNotMatch(branded, /splash-open-3s\.mp4/);
  assert.doesNotMatch(branded, /splash-open-still\.png/);
  assert.doesNotMatch(branded, /Last frame of the 3s clip/);

  const clip = new URL('../../assets/splash/splash-open-first-3s-v2.mp4', import.meta.url);
  const still = new URL('../../assets/splash/splash-first-frame-v2.png', import.meta.url);
  const splashIcon = new URL('../../assets/images/splash-icon.png', import.meta.url);
  const clipBytes = readFileSync(clip);
  const stillBytes = readFileSync(still);
  const iconBytes = readFileSync(splashIcon);
  assert.ok(clipBytes.length > 80_000, '3s clip should be committed');
  assert.ok(clipBytes.length < 500_000, 'must be the 3s trim, not a 10s sting');
  assert.ok(statSync(clip).size > 80_000);
  assert.equal(stillBytes.equals(iconBytes), true, 'Expo splash and JS still must be the same frame 0');
  const { width, height } = pngSize(stillBytes);
  assert.equal(width, 960);
  assert.equal(height, 960);

  const expo = splashPlugin();
  assert.equal(expo.image, './assets/images/splash-icon.png');
  assert.equal(expo.resizeMode, 'contain');
  assert.equal(expo.backgroundColor, '#000000');
  assert.equal(expo.dark?.image, './assets/images/splash-icon.png');
  assert.equal(expo.dark?.resizeMode, 'contain');
  assert.equal(expo.dark?.backgroundColor, '#000000');
  assert.notEqual(expo.resizeMode, 'cover');
  assert.notEqual(expo.dark?.resizeMode, 'cover');

  const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /BrandedSplash/);

  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(readme, /contain.+black letterbox/);
  assert.match(readme, /splash-open-first-3s-v2\.mp4/);
  assert.doesNotMatch(readme, /last-frame still/);
});
