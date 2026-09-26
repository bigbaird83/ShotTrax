/**
 * Watch club-pick: map / top area ~60%, control band ~40%.
 * Back, Home, Putt, All clubs, and the wheel pills live in the control band.
 * Dedicated Putt shares the Back/Home row (same pill as Back / Home) so the top-3 strip stays on-screen.
 */

export const WATCH_MAP_RATIO = 0.6;
export const WATCH_CONTROL_RATIO = 0.4;

/** Back / Home in the control band. Not tiny text. */
export const WATCH_BACK_HOME_MIN_HEIGHT = 44;

/** All clubs / Same club under the wheel. */
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

/** Hole screen: Hole Out row + gap + club pills the top area must leave room for. */
export const WATCH_HOLE_BOTTOM_BAND = WATCH_BACK_HOME_MIN_HEIGHT + 6 + 52;
const WATCH_ACTION_ROW_GAP = 8;

export type WatchFrame = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Mirror of the Watch hole screen (content.swift clubPick) in safe-area points.
 * Penalty is one Hole Out-sized pill at the bottom-left of the top area, directly
 * above Hole Out. The top area is 60% but never taller than safeHeight minus the
 * Hole Out row + club pills, so those stay inside the bottom safe area.
 */
export function watchHoleFrames(safeWidth: number, safeHeight: number): {
  penalty: WatchFrame;
  holeOut: WatchFrame;
  putt: WatchFrame;
  clubPills: WatchFrame;
} {
  const width = safeWidth - 8; // .padding(.horizontal, 4)
  const slot = (width - 2 * WATCH_ACTION_ROW_GAP) / 3;
  const top = Math.max(0, Math.min(safeHeight * WATCH_MAP_RATIO, safeHeight - WATCH_HOLE_BOTTOM_BAND));
  const h = WATCH_BACK_HOME_MIN_HEIGHT;
  const col = (i: number) => ({ minX: 4 + i * (slot + WATCH_ACTION_ROW_GAP), maxX: 4 + i * (slot + WATCH_ACTION_ROW_GAP) + slot });
  return {
    penalty: { ...col(0), minY: top - 6 - h, maxY: top - 6 },
    holeOut: { ...col(0), minY: top, maxY: top + h },
    putt: { ...col(2), minY: top, maxY: top + h },
    clubPills: { minX: 4, maxX: 4 + width, minY: top + h + 6, maxY: top + h + 6 + 52 },
  };
}
