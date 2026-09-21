import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('home-screen icon is the locked Build 36 night-green Shot/Traxx art; splash still says ShotTraxx', () => {
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: {
      icon: string;
      android: { adaptiveIcon: { foregroundImage: string; backgroundImage: string; monochromeImage: string } };
      web: { favicon: string };
      plugins: unknown[];
    };
  };
  assert.equal(app.expo.icon, './assets/images/icon.png');
  assert.equal(app.expo.android.adaptiveIcon.foregroundImage, './assets/images/android-icon-foreground.png');
  assert.equal(app.expo.android.adaptiveIcon.backgroundImage, './assets/images/android-icon-background.png');
  assert.equal(app.expo.android.adaptiveIcon.monochromeImage, './assets/images/android-icon-monochrome.png');
  assert.equal(app.expo.web.favicon, './assets/images/favicon.png');
  const splash = JSON.stringify(app.expo.plugins);
  assert.match(splash, /\.\/assets\/images\/splash-icon\.png/);

  const icon = readFileSync(new URL('../../assets/images/icon.png', import.meta.url));
  const splashIcon = readFileSync(new URL('../../assets/images/splash-icon.png', import.meta.url));
  assert.ok(icon.length > 0);
  assert.ok(splashIcon.length > 0);
  assert.notEqual(icon.equals(splashIcon), true);

  const branded = readFileSync(new URL('../ui/BrandedSplash.tsx', import.meta.url), 'utf8');
  assert.match(branded, /ShotTraxx/);
  assert.doesNotMatch(branded, /stacked Shot\/Traxx-only/);

  const watch = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(watch, /assets\/images\/icon\.png/);

  const iosDir = new URL('../../assets/images/ios/', import.meta.url);
  for (const name of [
    'icon-20@2x.png',
    'icon-20@3x.png',
    'icon-29@2x.png',
    'icon-29@3x.png',
    'icon-40@2x.png',
    'icon-40@3x.png',
    'icon-60@2x.png',
    'icon-60@3x.png',
    'icon-76.png',
    'icon-76@2x.png',
    'icon-83.5@2x.png',
    'icon-1024.png',
  ]) {
    const bytes = readFileSync(new URL(name, iosDir));
    assert.ok(bytes.length > 0, name);
  }

  const readme = readFileSync(new URL('../../assets/images/README.md', import.meta.url), 'utf8');
  assert.match(readme, /Build 36/);
  assert.match(readme, /illuminated pin/);
  assert.match(readme, /first frame of Doc’s 3s open clip/);
});
