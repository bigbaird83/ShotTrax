import type { ColorThemeId } from './colorTheme';

/** Bright outdoor sun. Indoor or shade stays on the saved theme. */
export const BRIGHT_OUTDOOR_LUX = 20_000;

export type AmbientLightQuality = 'good' | 'messy' | 'unavailable';

export type AmbientLightReading = {
  lux: number | null;
  quality: AmbientLightQuality;
};

export function unavailableAmbientLight(): AmbientLightReading {
  return { lux: null, quality: 'unavailable' };
}

/**
 * Play-only high-contrast when the phone reports a clean bright outdoor reading.
 * Unavailable or messy readings park the auto flip — Settings still has the preset.
 */
export function shouldAutoFlipPlayHighContrast(reading: AmbientLightReading): boolean {
  if (reading.quality !== 'good') return false;
  if (reading.lux == null || !Number.isFinite(reading.lux) || reading.lux < 0) return false;
  return reading.lux >= BRIGHT_OUTDOOR_LUX;
}

/** Saved home theme is unchanged. Play may overlay high-contrast. */
export function playThemeId(args: {
  saved: ColorThemeId;
  ambient: AmbientLightReading;
}): ColorThemeId {
  return shouldAutoFlipPlayHighContrast(args.ambient) ? 'high-contrast' : args.saved;
}

export function playAutoFlipWritesSavedTheme(): false {
  return false;
}

export function playThemeRemountsMap(): false {
  return false;
}

export function playThemeRerunsCourseCardCamera(): false {
  return false;
}

export function playThemeShowsUserLocation(): false {
  return false;
}
