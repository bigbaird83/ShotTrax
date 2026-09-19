import { FIRST_LAUNCH_TIP_LINE } from './firstLaunchTip';

/** Fuller how-to. Replayable after first launch. The short tip still ships once. */

export const HOW_TO_TITLE = 'How to play';

export const HOW_TO_MARK_LINE = FIRST_LAUNCH_TIP_LINE;

export const HOW_TO_FINISH_LINE = 'Finish hole for a chip-in or hole-out off the green.';

export function howToTitle(): typeof HOW_TO_TITLE {
  return HOW_TO_TITLE;
}

export function howToMarkLine(): typeof HOW_TO_MARK_LINE {
  return HOW_TO_MARK_LINE;
}

export function howToFinishLine(): typeof HOW_TO_FINISH_LINE {
  return HOW_TO_FINISH_LINE;
}

export function howToBeats(): readonly [typeof HOW_TO_MARK_LINE, typeof HOW_TO_FINISH_LINE] {
  return [HOW_TO_MARK_LINE, HOW_TO_FINISH_LINE];
}

/** User opens it. Never auto-pops over first launch or play. */
export function howToAutoShows(): false {
  return false;
}

export function howToIsReplayable(): true {
  return true;
}

export function howToReplacesFirstLaunchTip(): false {
  return false;
}

export function howToIsModalSpam(): false {
  return false;
}
