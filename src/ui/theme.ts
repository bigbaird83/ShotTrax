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
  /** Translucent glass over the map. Map stays visible behind the dock. */
  glass: string;
  onAccent: string;
  statusBar: 'light' | 'dark';
  /** Second accent. Primary buttons and tiles run lime → accent2. */
  accent2: string;
  /** Hero / live-card gradient stops and the text that sits on them. */
  hero1: string;
  hero2: string;
  heroText: string;
  /** Colored glow under primary buttons. */
  glow: string;
  /** High contrast: no gradients, no glow, heavier borders. */
  flat: boolean;
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
    glass: 'rgba(11,26,18,0.58)',
    onAccent: '#0B1A12',
    statusBar: 'light',
    accent2: '#6EE7A0',
    hero1: '#1F5230',
    hero2: '#0E2217',
    heroText: '#F4F1E8',
    glow: 'rgba(200,245,66,0.45)',
    flat: false,
  },
  midnight: {
    bg: '#0A1022',
    bgElevated: '#121A33',
    lime: '#4FD8FF',
    cream: '#EAF0FF',
    muted: '#8B97B8',
    amber: '#FFD166',
    orange: '#FF9F5A',
    red: '#FF6B6B',
    line: '#1F2A4A',
    good: '#5BE3A8',
    accentWash: '#16254A',
    overlay: 'rgba(10,16,34,0.88)',
    glass: 'rgba(10,16,34,0.58)',
    onAccent: '#06101F',
    statusBar: 'light',
    accent2: '#7B6CFF',
    hero1: '#23367A',
    hero2: '#0D1430',
    heroText: '#EAF0FF',
    glow: 'rgba(79,216,255,0.45)',
    flat: false,
  },
  sunset: {
    bg: '#1A0F1F',
    bgElevated: '#26162D',
    lime: '#FF9A4C',
    cream: '#FFF1E8',
    muted: '#B39AAE',
    amber: '#FFD166',
    orange: '#FF7A45',
    red: '#FF5C5C',
    line: '#3A2442',
    good: '#7EE0A1',
    accentWash: '#3A1E36',
    overlay: 'rgba(26,15,31,0.88)',
    glass: 'rgba(26,15,31,0.58)',
    onAccent: '#1A0F1F',
    statusBar: 'light',
    accent2: '#FF4D8D',
    hero1: '#6A2448',
    hero2: '#241028',
    heroText: '#FFF1E8',
    glow: 'rgba(255,120,90,0.45)',
    flat: false,
  },
  clubhouse: {
    bg: '#0E1C16',
    bgElevated: '#16291F',
    lime: '#E3B55B',
    cream: '#F5EEDC',
    muted: '#9AA894',
    amber: '#E3B55B',
    orange: '#E08A4A',
    red: '#E06A55',
    line: '#243A2E',
    good: '#86D39A',
    accentWash: '#2A3322',
    overlay: 'rgba(14,28,22,0.88)',
    glass: 'rgba(14,28,22,0.58)',
    onAccent: '#1A1406',
    statusBar: 'light',
    accent2: '#F6DD95',
    hero1: '#1F4632',
    hero2: '#0E1C16',
    heroText: '#F5EEDC',
    glow: 'rgba(227,181,91,0.4)',
    flat: false,
  },
  carbon: {
    bg: '#111214',
    bgElevated: '#1B1D21',
    lime: '#FF6A1A',
    cream: '#F2F2F2',
    muted: '#9097A0',
    amber: '#FFB020',
    orange: '#FF8A3D',
    red: '#FF4D4D',
    line: '#2A2D33',
    good: '#6BD68C',
    accentWash: '#2A1C12',
    overlay: 'rgba(17,18,20,0.88)',
    glass: 'rgba(17,18,20,0.58)',
    onAccent: '#140800',
    statusBar: 'light',
    accent2: '#FFB020',
    hero1: '#2E3138',
    hero2: '#141518',
    heroText: '#F2F2F2',
    glow: 'rgba(255,106,26,0.4)',
    flat: false,
  },
  links: {
    bg: '#F4EDE1',
    bgElevated: '#FFFBF4',
    lime: '#C8553D',
    cream: '#2B1E14',
    muted: '#7A6A5A',
    amber: '#B8860B',
    orange: '#C65A20',
    red: '#B8322A',
    line: '#E6D8C4',
    good: '#3E8E4F',
    accentWash: '#F6DDD2',
    overlay: 'rgba(244,237,225,0.92)',
    glass: 'rgba(244,237,225,0.62)',
    onAccent: '#FFFFFF',
    statusBar: 'dark',
    accent2: '#E88A4F',
    hero1: '#3F6B3A',
    hero2: '#27452A',
    heroText: '#FFF8EC',
    glow: 'rgba(200,85,61,0.3)',
    flat: false,
  },
  glacier: {
    bg: '#EEF3F8',
    bgElevated: '#FFFFFF',
    lime: '#2F6BFF',
    cream: '#0F1B2D',
    muted: '#5E6E84',
    amber: '#C98A00',
    orange: '#E0701F',
    red: '#D6453D',
    line: '#D6E0EC',
    good: '#1E9E62',
    accentWash: '#DCE7FF',
    overlay: 'rgba(238,243,248,0.92)',
    glass: 'rgba(238,243,248,0.62)',
    onAccent: '#FFFFFF',
    statusBar: 'dark',
    accent2: '#22C3E6',
    hero1: '#2F6BFF',
    hero2: '#1AA6D6',
    heroText: '#FFFFFF',
    glow: 'rgba(47,107,255,0.32)',
    flat: false,
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
    glass: 'rgba(246,243,234,0.62)',
    onAccent: '#122018',
    statusBar: 'dark',
    accent2: '#8CC63F',
    hero1: '#3D7A1A',
    hero2: '#1F4A12',
    heroText: '#FFFFFF',
    glow: 'rgba(79,138,18,0.35)',
    flat: false,
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
    glass: 'rgba(0,0,0,0.55)',
    onAccent: '#000000',
    statusBar: 'light',
    accent2: '#E6FF00',
    hero1: '#000000',
    hero2: '#000000',
    heroText: '#FFFFFF',
    glow: 'rgba(0,0,0,0)',
    flat: true,
  },
};

/** Default dark lime. Live screens read the selected preset from ColorThemeProvider. */
export const colors: ColorPalette = COLOR_THEMES[DEFAULT_COLOR_THEME];

export function paletteForTheme(id: ColorThemeId): ColorPalette {
  return COLOR_THEMES[id];
}

/** Layout L — type scale. Keep in sync across home, hole, sheets. */
export const type = {
  kicker: 11,
  title: 28,
  hole: 18,
  yards: 32,
  body: 15,
  meta: 13,
  tiny: 11,
  button: 16,
  chip: 15,
} as const;

export const tapTarget = 64;
export const thumbZoneMin = 72;
export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
} as const;
