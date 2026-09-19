/** One-time first-play tip. Three beats. Never blocks mark. */

export const FIRST_LAUNCH_TIP_SETTING_KEY = 'first_launch_mark_tip';

export const FIRST_LAUNCH_TIP_LINE = 'Pick a club → walk → press to mark';

export function firstLaunchTipBeats(): readonly ['Pick a club', 'walk', 'press to mark'] {
  return ['Pick a club', 'walk', 'press to mark'];
}

export function firstLaunchTipLine(): typeof FIRST_LAUNCH_TIP_LINE {
  return FIRST_LAUNCH_TIP_LINE;
}

export function firstLaunchTipSeenValue(): '1' {
  return '1';
}

export function isFirstLaunchTipSeen(seen: string | null | undefined): boolean {
  return seen === firstLaunchTipSeenValue();
}

/** Lead item 14: anyone who already has a round in history skips the tip. */
export function shouldSkipFirstLaunchTipForHistory(historyRoundCount: number): boolean {
  return historyRoundCount > 0;
}

export function firstLaunchTipIsDismissible(): true {
  return true;
}

export function firstLaunchTipBlocksMark(): false {
  return false;
}

export function firstLaunchTipShownOnce(): true {
  return true;
}

export function shouldShowFirstLaunchTip(args: {
  seen?: string | null;
  historyRoundCount: number;
}): boolean {
  if (isFirstLaunchTipSeen(args.seen)) return false;
  if (shouldSkipFirstLaunchTipForHistory(args.historyRoundCount)) return false;
  return true;
}

/** Other rounds besides the live first play count as history. */
export function firstLaunchTipHistoryRoundCount(args: {
  roundIds: readonly string[];
  currentRoundId?: string | null;
}): number {
  const current = args.currentRoundId?.trim() ?? '';
  return args.roundIds.filter((id) => id.trim() && id !== current).length;
}
