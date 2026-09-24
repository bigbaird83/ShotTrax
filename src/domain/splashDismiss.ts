/** Fade after the clip ends or a tap. */
export const SPLASH_FADE_MS = 200;

/** Hard stop so a failed video cannot leave the overlay up. */
export const SPLASH_SAFETY_MS = 5000;

export type SplashDismissEvent = 'end' | 'tap' | 'timeout' | 'error';

/**
 * End and tap fade the overlay out. Timeout and playback errors remove it
 * immediately so the app cannot stay covered.
 */
export function planSplashDismiss(
  event: SplashDismissEvent,
  alreadyDismissing: boolean,
): { dismiss: boolean; fadeMs: number } {
  if (alreadyDismissing) return { dismiss: false, fadeMs: 0 };
  if (event === 'timeout' || event === 'error') return { dismiss: true, fadeMs: 0 };
  return { dismiss: true, fadeMs: SPLASH_FADE_MS };
}

/** Cold start only. Resume from background must not play the clip again. */
export function shouldPlaySplash(input: {
  isColdStart: boolean;
  returningFromBackground: boolean;
  alreadyDismissed: boolean;
}): boolean {
  if (input.alreadyDismissed) return false;
  if (input.returningFromBackground) return false;
  return input.isColdStart;
}
