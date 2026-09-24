/** Splash field sampled from the open clip's first-frame edges. */
export const SPLASH_BG = '#000101';

/** Square splash never uses cover or stretch. */
export const SPLASH_RESIZE_MODE = 'contain' as const;

/**
 * Size the 960² mark to the short viewport edge and center it.
 * Tall phones get black bars above/below; wide screens get bars on the sides.
 */
export function splashLetterboxSize(viewportWidth: number, viewportHeight: number) {
  const side = Math.min(viewportWidth, viewportHeight);
  return { width: side, height: side };
}
