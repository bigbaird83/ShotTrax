import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  COLOR_THEME_IDS,
  COLOR_THEME_LABELS,
  COLOR_THEME_SETTING_KEY,
  DEFAULT_COLOR_THEME,
  loadColorTheme,
  parseColorThemeId,
  persistColorTheme,
} from './colorTheme';

test('theme preference persists across three presets', () => {
  assert.deepEqual([...COLOR_THEME_IDS], ['dark-lime', 'light', 'high-contrast']);
  assert.equal(DEFAULT_COLOR_THEME, 'dark-lime');
  assert.equal(parseColorThemeId(null), 'dark-lime');
  assert.equal(parseColorThemeId('nope'), 'dark-lime');
  assert.equal(COLOR_THEME_LABELS['dark-lime'], 'Dark lime');
  assert.equal(COLOR_THEME_LABELS.light, 'Light');
  assert.equal(COLOR_THEME_LABELS['high-contrast'], 'High contrast');
  assert.equal(COPY.colorTheme, 'Color theme');
  assert.equal(COPY.themeDarkLime, 'Dark lime');
  assert.equal(COPY.themeLight, 'Light');
  assert.equal(COPY.themeHighContrast, 'High contrast');

  const store: Record<string, string> = {};
  for (const id of COLOR_THEME_IDS) {
    assert.equal(persistColorTheme(store, id), id);
    assert.equal(store[COLOR_THEME_SETTING_KEY], id);
    assert.equal(loadColorTheme(store), id);
  }
  assert.equal(loadColorTheme({}), 'dark-lime');

  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  assert.match(settings, /COLOR_THEME_IDS/);
  assert.match(settings, /COPY\.colorTheme/);
  assert.match(settings, /setColorTheme/);
  assert.doesNotMatch(settings, /ColorPicker|hex|HSL|custom color/i);
  assert.match(repo, /COLOR_THEME_SETTING_KEY/);
  assert.match(repo, /getColorTheme/);
  assert.match(repo, /setColorTheme/);
});
