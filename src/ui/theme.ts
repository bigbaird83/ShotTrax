import type { ColorThemeId } from '../domain/colorTheme';
import { DEFAULT_COLOR_THEME } from '../domain/colorTheme';

export type ColorPalette = {
  bg: string;
  bgElevated: string;
  lime: string;
  cream: string;
  muted: string;
  amber: string;
  orange: string;
  red: string;
  line: string;
  good: string;
  accentWash: string;
  overlay: string;
  onAccent: string;
  statusBar: 'light' | 'dark';
};

export const COLOR_THEMES: Record<ColorThemeId, ColorPalette> = {
  'dark-lime': {
    bg: '#0B1A12',
    bgElevated: '#13261B',
    lime: '#C8F542',
    cream: '#F4F1E8',
    muted: '#8A9A8E',
    amber: '#F5C542',
    orange: '#F57A3D',
    red: '#E85D4C',
    line: '#1E3A28',
    good: '#7DCF7A',
    accentWash: '#1C3A24',
    overlay: 'rgba(11,26,18,0.88)',
    onAccent: '#0B1A12',
    statusBar: 'light',
  },
  light: {
    bg: '#F6F3EA',
    bgElevated: '#FFFFFF',
    lime: '#4F8A12',
    cream: '#122018',
    muted: '#5A6B5E',
    amber: '#B8860B',
    orange: '#C65A20',
    red: '#C0392B',
    line: '#C9D2C8',
    good: '#2E7D32',
    accentWash: '#E7F4C8',
    overlay: 'rgba(246,243,234,0.92)',
    onAccent: '#122018',
    statusBar: 'dark',
  },
  'high-contrast': {
    bg: '#000000',
    bgElevated: '#000000',
    lime: '#E6FF00',
    cream: '#FFFFFF',
    muted: '#E8E8E8',
    amber: '#FFE600',
    orange: '#FF7A00',
    red: '#FF2D2D',
    line: '#FFFFFF',
    good: '#00FF6A',
    accentWash: '#1A1A00',
    overlay: 'rgba(0,0,0,0.92)',
    onAccent: '#000000',
    statusBar: 'light',
  },
};

/** Default dark lime. Live screens read the selected preset from ColorThemeProvider. */
export const colors: ColorPalette = COLOR_THEMES[DEFAULT_COLOR_THEME];

export function paletteForTheme(id: ColorThemeId): ColorPalette {
  return COLOR_THEMES[id];
}

/** Layout L — type scale. Keep in sync across home, hole, sheets. */
export const type = {
  kicker: 12,
  title: 34,
  hole: 28,
  yards: 44,
  body: 16,
  meta: 14,
  tiny: 12,
  button: 20,
  chip: 16,
} as const;

export const tapTarget = 64;
export const thumbZoneMin = 72;
export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
} as const;
