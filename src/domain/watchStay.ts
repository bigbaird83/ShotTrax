/** Keep ShotTraxx frontmost on Watch while a round is live. Idle must not dump to the clock. */

/** HKWorkoutSession (.golf, outdoor) while the round is live. Not a self-care extended runtime session. */
export function watchStaysFrontmostDuringRound(): true {
  return true;
}

export function watchStayUsesGolfWorkout(): true {
  return true;
}

export function watchStayUsesExtendedRuntime(): false {
  return false;
}

/** Watch Info.plist WKBackgroundModes. Workout processing keeps an HKWorkoutSession running. */
export function watchStayBackgroundMode(): 'workout-processing' {
  return 'workout-processing';
}

export function watchWorkoutActivityType(): 'golf' {
  return 'golf';
}

export function watchWorkoutLocationType(): 'outdoor' {
  return 'outdoor';
}

/** The session is ended without saving. Nothing is written to Health. */
export function watchWorkoutSavesToHealth(): false {
  return false;
}

/** Share this type only. Read nothing. */
export function watchHealthShareTypes(): readonly ['HKWorkoutType'] {
  return ['HKWorkoutType'];
}

export function watchHealthReadTypes(): readonly [] {
  return [];
}

export const WATCH_HEALTH_SHARE_USAGE =
  'ShotTraxx™ does not read your Health data. It uses Health only to keep your round running on your Apple Watch.';

export const WATCH_HEALTH_UPDATE_USAGE =
  'ShotTraxx™ uses a golf workout on your Apple Watch only to keep the round running. It does not save the round to Health.';

export function watchStayIdleDoesNotCountAsLeave(): true {
  return true;
}

export function watchStayWhenIdleWithoutTaps(): true {
  return true;
}

/** Home / Back — do not pull the player back. Wrist-down does not end the golf workout. */
export function watchStayAfterExplicitLeave(): false {
  return false;
}

export function watchStayAfterRoundEnds(): false {
  return false;
}

export function shouldWatchStayFrontmost(args: {
  hasLiveHole: boolean;
  puttOpen: boolean;
  userLeftApp?: boolean;
  roundLive?: boolean;
  roundComplete?: boolean;
}): boolean {
  if (args.userLeftApp) return false;
  if (args.roundLive === false) return false;
  return (args.hasLiveHole && args.roundComplete !== true) || args.puttOpen;
}
