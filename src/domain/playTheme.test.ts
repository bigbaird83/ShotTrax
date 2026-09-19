import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_COLOR_THEME } from './colorTheme';
import {
  BRIGHT_OUTDOOR_LUX,
  playAutoFlipWritesSavedTheme,
  playThemeId,
  playThemeRemountsMap,
  playThemeRerunsCourseCardCamera,
  playThemeShowsUserLocation,
  shouldAutoFlipPlayHighContrast,
  unavailableAmbientLight,
} from './playTheme';

test('play auto-flips to high-contrast only on a clean bright outdoor reading', () => {
  assert.equal(shouldAutoFlipPlayHighContrast(unavailableAmbientLight()), false);
  assert.equal(shouldAutoFlipPlayHighContrast({ lux: null, quality: 'messy' }), false);
  assert.equal(shouldAutoFlipPlayHighContrast({ lux: 80_000, quality: 'messy' }), false);
  assert.equal(shouldAutoFlipPlayHighContrast({ lux: 500, quality: 'good' }), false);
  assert.equal(shouldAutoFlipPlayHighContrast({ lux: BRIGHT_OUTDOOR_LUX, quality: 'good' }), true);
  assert.equal(playThemeId({ saved: 'light', ambient: unavailableAmbientLight() }), 'light');
  assert.equal(
    playThemeId({ saved: 'light', ambient: { lux: 90_000, quality: 'good' } }),
    'high-contrast',
  );
  assert.equal(playAutoFlipWritesSavedTheme(), false);
  assert.equal(DEFAULT_COLOR_THEME, 'dark-lime');
});

test('Signal Lab: play theme swap does not remount the map or re-run the hole camera', () => {
  assert.equal(playThemeRemountsMap(), false);
  assert.equal(playThemeRerunsCourseCardCamera(), false);
  assert.equal(playThemeShowsUserLocation(), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(hole, /playThemeId/);
  assert.doesNotMatch(hole, /setColorTheme/);
  assert.doesNotMatch(playMap, /key=\{/);
  assert.doesNotMatch(playMap, /themeId|high-contrast|playTheme/);
  assert.match(
    playMap,
    /frameEpoch=\{catchUpFullScreen \? 'catchup' : `play-\$\{hole\.number\}-\$\{playFrameNonce\}`\}/,
  );
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
});
