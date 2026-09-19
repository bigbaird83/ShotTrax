import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('home-screen icon is the locked A5 art; splash still says ShotTraxx', () => {
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
});
