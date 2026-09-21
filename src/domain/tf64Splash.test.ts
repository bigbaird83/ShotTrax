import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('TF 64: Expo splash + BrandedSplash stills are the first frame of Doc’s 3s clip', () => {
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: unknown[] };
  };
  const splashPlugin = (app.expo.plugins as unknown[]).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  ) as [string, { image: string; backgroundColor: string; dark?: { image: string; backgroundColor: string } }];
  assert.ok(splashPlugin);
  assert.equal(splashPlugin[1].image, './assets/images/splash-icon.png');
  assert.equal(splashPlugin[1].backgroundColor, '#000000');
  assert.equal(splashPlugin[1].dark?.image, './assets/images/splash-icon.png');
  assert.equal(splashPlugin[1].dark?.backgroundColor, '#000000');

  const splashIcon = readFileSync(new URL('../../assets/images/splash-icon.png', import.meta.url));
  const still = readFileSync(new URL('../../assets/splash/splash-first-frame-v2.png', import.meta.url));
  assert.equal(splashIcon.equals(still), true, 'native splash and Reduce Motion still must be the same first frame');

  const { width, height } = pngSize(splashIcon);
  assert.equal(width, 960);
  assert.equal(height, 960);

  const branded = readFileSync(new URL('../ui/BrandedSplash.tsx', import.meta.url), 'utf8');
  assert.match(branded, /First frame of the 3s clip/);
  assert.match(branded, /<Image source=\{OPEN_STILL\}/);
  assert.doesNotMatch(branded, /Last frame of the 3s clip/);

  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(readme, /first frame of the 3s clip/);
  assert.doesNotMatch(readme, /last-frame still/);
});
