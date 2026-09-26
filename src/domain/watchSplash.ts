/** Launch clip. A background process start must not play or time it out. */

export type WatchSplashScene = 'active' | 'inactive' | 'background';

/**
 * Background and inactive do not start the clip. The first active scene does.
 * After playback has started, leaving active dismisses it and it does not replay.
 * A fresh live round skips it.
 */
export function watchSplashPlayback(args: {
  scene: WatchSplashScene;
  /** AVPlayer / Reduce Motion hold has begun this process. */
  started: boolean;
  liveHoleInProgress: boolean;
}): 'skip-live' | 'pending' | 'start' | 'dismiss-left' | 'playing' {
  if (args.liveHoleInProgress && !args.started) return 'skip-live';
  if (!args.started) return args.scene === 'active' ? 'start' : 'pending';
  if (args.scene !== 'active') return 'dismiss-left';
  return 'playing';
}

/**
 * When In Use waits while the splash overlay is up so the system sheet does
 * not cover the clip. A fresh live round skips the splash, so it does not wait.
 */
export function watchLocationAuthorizationWaitsForSplash(args: {
  splashShowing: boolean;
  liveHoleInProgress: boolean;
}): boolean {
  if (args.liveHoleInProgress) return false;
  return args.splashShowing;
}
