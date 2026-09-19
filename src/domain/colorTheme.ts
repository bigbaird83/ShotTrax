/** Small Settings preset set. No custom color picker. */

export const COLOR_THEME_IDS = ['dark-lime', 'light', 'high-contrast'] as const;
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

export const DEFAULT_COLOR_THEME: ColorThemeId = 'dark-lime';

export const COLOR_THEME_SETTING_KEY = 'color_theme';

export const COLOR_THEME_LABELS: Record<ColorThemeId, string> = {
  'dark-lime': 'Dark lime',
  light: 'Light',
  'high-contrast': 'High contrast',
};

export function isColorThemeId(value: string | null | undefined): value is ColorThemeId {
  return value === 'dark-lime' || value === 'light' || value === 'high-contrast';
}

export function parseColorThemeId(raw: string | null | undefined): ColorThemeId {
  return isColorThemeId(raw) ? raw : DEFAULT_COLOR_THEME;
}

export function colorThemeSettingValue(id: ColorThemeId): string {
  return parseColorThemeId(id);
}

/** In-memory persist used by tests — same parse/store rule as Settings. */
export function persistColorTheme(
  store: Record<string, string>,
  id: ColorThemeId,
): ColorThemeId {
  const next = parseColorThemeId(id);
  store[COLOR_THEME_SETTING_KEY] = colorThemeSettingValue(next);
  return parseColorThemeId(store[COLOR_THEME_SETTING_KEY]);
}

export function loadColorTheme(store: Record<string, string | undefined>): ColorThemeId {
  return parseColorThemeId(store[COLOR_THEME_SETTING_KEY]);
}
