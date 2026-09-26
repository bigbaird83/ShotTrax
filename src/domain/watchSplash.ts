/** Launch splash. A background process start must not play or time it out. */

export type WatchSplashScene = 'active' | 'inactive' | 'background';

/**
 * Background and inactive do not start the clip. The first active scene does.
 * After playback has started, leaving active dismisses it and it does not replay.
 * A fresh live round skips it.
 */
export function watchSplashPlayback(args: {
  scene: WatchSplashScene;
  /** Frame advance or the Reduce Motion hold has begun this process. */
  started: boolean;
  liveHoleInProgress: boolean;
}): 'skip-live' | 'pending' | 'start' | 'dismiss-left' | 'playing' {
  if (args.liveHoleInProgress && !args.started) return 'skip-live';
  if (!args.started) return args.scene === 'active' ? 'start' : 'pending';
  if (args.scene !== 'active') return 'dismiss-left';
  return 'playing';
}

/**
 * Logo still on screen. True from the first frame while the clip is still due,
 * including before the scene is active (playback is separate). Also true while
 * the scene is inactive or background and there is no fresh live round, so the
 * system snapshot is the logo. Active with the clip already finished is the
 * app underneath. A fresh live round never covers.
 */
export function watchLaunchCoverVisible(args: {
  scene: WatchSplashScene;
  /** Clip has not finished, been skipped, or been dismissed this process. */
  splashDue: boolean;
  liveHoleInProgress: boolean;
}): boolean {
  if (args.liveHoleInProgress) return false;
  if (args.splashDue) return true;
  return args.scene !== 'active';
}

/** Stills of the bundled clip, one SwiftUI Image at a time. Mirrors `frameCount` / `framesPerSecond`. */
export const WATCH_SPLASH_FRAME_COUNT = 37;
export const WATCH_SPLASH_FPS = 12;
/** Nanoseconds between frames. The first advance is the start of motion. Mirrors `frameIntervalNanoseconds`. */
export const WATCH_SPLASH_FRAME_INTERVAL_NS = Math.floor(1_000_000_000 / WATCH_SPLASH_FPS);
/** Motion has to begin by this long after the logo is up. */
export const WATCH_SPLASH_MOTION_DEADLINE_NS = 1_500_000_000;

/**
 * Frames advance only after the first active scene, and not for Reduce Motion
 * or once the splash is leaving. A background launch stays on frame 0.
 */
export function watchSplashFramesAdvance(args: {
  scene: WatchSplashScene;
  started: boolean;
  reduceMotion: boolean;
  dismissing: boolean;
}): boolean {
  if (!args.started || args.reduceMotion || args.dismissing) return false;
  return args.scene === 'active';
}

/**
 * Index of the one image on screen. Frame 0 is the still. Elapsed is measured
 * from the moment frames are allowed to advance.
 */
export function watchSplashFrameIndex(args: {
  advancing: boolean;
  elapsedNs: number;
  frameCount?: number;
  frameIntervalNs?: number;
}): number {
  const frameCount = args.frameCount ?? WATCH_SPLASH_FRAME_COUNT;
  const interval = args.frameIntervalNs ?? WATCH_SPLASH_FRAME_INTERVAL_NS;
  if (!args.advancing || frameCount <= 0 || interval <= 0) return 0;
  const steps = Math.floor(args.elapsedNs / interval);
  if (steps <= 0) return 0;
  return Math.min(frameCount - 1, steps);
}

/** True once the last frame has been held for one interval. */
export function watchSplashClipFinished(args: {
  advancing: boolean;
  elapsedNs: number;
  frameCount?: number;
  frameIntervalNs?: number;
}): boolean {
  if (!args.advancing) return false;
  const frameCount = args.frameCount ?? WATCH_SPLASH_FRAME_COUNT;
  const interval = args.frameIntervalNs ?? WATCH_SPLASH_FRAME_INTERVAL_NS;
  return args.elapsedNs >= frameCount * interval;
}

/** The first frame change lands inside the motion window. */
export function watchSplashMotionWithinDeadline(frameIntervalNs = WATCH_SPLASH_FRAME_INTERVAL_NS): boolean {
  return frameIntervalNs > 0 && frameIntervalNs <= WATCH_SPLASH_MOTION_DEADLINE_NS;
}

/** Fade after the clip ends or a tap. Mirrors `fadeNanoseconds`. */
export const WATCH_SPLASH_FADE_NS = 200_000_000;

/** Reduce Motion holds frame 0 this long. Mirrors `reduceMotionNanoseconds`. */
export const WATCH_SPLASH_REDUCE_MOTION_NS = 1_200_000_000;

/**
 * Hard ceiling from the first active run. Mirrors `safetyNanoseconds`.
 * Does not start in the background. Once dismissing, the timer is ignored.
 * The frame sequence and Reduce Motion both finish sooner.
 */
export const WATCH_SPLASH_SAFETY_NS = 5_000_000_000;

export function watchSplashSafetyDue(args: {
  /** `run()` has begun. That only happens after the first active scene. */
  playbackStarted: boolean;
  dismissing: boolean;
  elapsed: boolean;
}): boolean {
  if (!args.playbackStarted || args.dismissing) return false;
  return args.elapsed;
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
