/** Keep ShotTraxx frontmost on Watch while a round is live. Idle must not dump to the clock. */

/** WKExtendedRuntimeSession while hole / putt / club sheet is up. Not HealthKit / motion. */
export function watchStaysFrontmostDuringRound(): true {
  return true;
}

export function watchStayUsesExtendedRuntime(): true {
  return true;
}

export function watchStayWhenIdleWithoutTaps(): true {
  return true;
}

/** Crown / explicit leave / round over — do not pull the player back. */
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
}): boolean {
  if (args.userLeftApp) return false;
  return args.hasLiveHole || args.puttOpen;
}
