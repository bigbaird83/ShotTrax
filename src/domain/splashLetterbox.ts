/** Splash field sampled from the open clip's first-frame edges. */
export const SPLASH_BG = '#000101';

/** Portrait open frame. Contain on the phone — never cover or stretch. */
export const SPLASH_FRAME = { width: 784, height: 1168 } as const;

/** Portrait splash never uses cover or stretch. */
export const SPLASH_RESIZE_MODE = 'contain' as const;

/**
 * Fit the 784×1168 frame inside the viewport, centered.
 * Tall phones letterbox above and below; wide screens letterbox on the sides.
 * The bars are the opaque splash background, not a second copy of the art.
 */
export function splashLetterboxSize(viewportWidth: number, viewportHeight: number) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return { width: 0, height: 0 };
  }
  const widthScale = viewportWidth / SPLASH_FRAME.width;
  const heightScale = viewportHeight / SPLASH_FRAME.height;
  if (widthScale <= heightScale) {
    return { width: viewportWidth, height: SPLASH_FRAME.height * widthScale };
  }
  return { width: SPLASH_FRAME.width * heightScale, height: viewportHeight };
}
