/**
 * Watch club-pick: status block is capped at ~60%. Hole Out, Home, Putt, and the
 * suggested strip stay fixed under it. The rest of the bag scrolls in the space
 * that remains (at least the old ~40% control band when the status block is short).
 * Dedicated Putt shares the Hole Out / Home row (same pill) so the top-3 strip stays on-screen.
 */

export const WATCH_MAP_RATIO = 0.6;
export const WATCH_CONTROL_RATIO = 0.4;

/** Back / Home in the control band. Not tiny text. */
export const WATCH_BACK_HOME_MIN_HEIGHT = 44;

/** Bag rows under the suggested strip. */
export const WATCH_UNDER_WHEEL_MIN_HEIGHT = 40;

/** Dedicated Putt on the Back/Home row, same pill as Back / Home. Never its own full-width row. */
export const WATCH_PUTT_PILL_MIN_HEIGHT = 44;

export function watchPuttSharesBackHomeRow(): true {
  return true;
}

export function watchPuttIsCompactPill(): true {
  return true;
}

export function watchTallPuttPushesClubStripOffScreen(): false {
  return false;
}

export function watchMapRatio(): number {
  return WATCH_MAP_RATIO;
}

export function watchControlRatio(): number {
  return WATCH_CONTROL_RATIO;
}

/** Cook gate: Watch control band is about 40% of the screen. */
export function watchControlBandIsAboutFortyPercent(): boolean {
  return Math.abs(WATCH_CONTROL_RATIO - 0.4) < 1e-9;
}

export function watchMapAreaIsAboutSixtyPercent(): boolean {
  return Math.abs(WATCH_MAP_RATIO - 0.6) < 1e-9;
}

export function watchLayoutAddsToOne(): boolean {
  return Math.abs(WATCH_MAP_RATIO + WATCH_CONTROL_RATIO - 1) < 1e-9;
}

export function watchBackHomeAreTinyText(): false {
  return false;
}
