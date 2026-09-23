import { COPY } from './playerCopy';

/**
 * Menu Share / scorecard Share open a two-way pick:
 * the scorecard image, or the live board (code + link).
 */
export type ShareKind = 'scorecard' | 'live';

export type ShareChoice = { kind: ShareKind; label: string };

export function planShareChoices(): ShareChoice[] {
  return [
    { kind: 'scorecard', label: COPY.shareScorecard },
    { kind: 'live', label: COPY.shareLiveRound },
  ];
}

/** Tapping Share only opens the pick. It never opens the share sheet by itself. */
export function shareTapOpensChoice(): true {
  return true;
}

/** Anything unknown falls back to the scorecard — never the live link by accident. */
export function shareKindOrScorecard(kind: ShareKind | null | undefined): ShareKind {
  return kind === 'live' ? 'live' : 'scorecard';
}
