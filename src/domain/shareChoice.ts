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

/** Whose card the scorecard share shows, on the image and on the link page. */
export type ScorecardAudience = 'group' | 'me';

export type ScorecardAudienceChoice = {
  audience: ScorecardAudience;
  label: string;
  /** Whole group is the default, and it is listed first. */
  default: boolean;
};

/**
 * Scorecard share asks Whole group / Just me only when the round has a partner.
 * No partners → null, and the share stays the single-player image with no extra prompt.
 * The live-board link is not part of this pick.
 */
export function planScorecardAudienceChoices(partnerCount: number): ScorecardAudienceChoice[] | null {
  if (!Number.isInteger(partnerCount) || partnerCount < 1) return null;
  return [
    { audience: 'group', label: COPY.shareWholeGroup, default: true },
    { audience: 'me', label: COPY.shareJustMe, default: false },
  ];
}

/**
 * What the next scoreboard publish should upload.
 * An explicit Just me / Whole group wins. Otherwise the stored choice wins.
 * With nothing stored, partners default to Whole group; a solo round stays Just me.
 */
export function shareAudienceForPublish(args: {
  explicit?: ScorecardAudience | null;
  stored?: ScorecardAudience | null;
  partnerCount: number;
}): ScorecardAudience {
  const partners = Number.isInteger(args.partnerCount) && args.partnerCount > 0;
  if (args.explicit === 'me') return 'me';
  if (args.explicit === 'group') return partners ? 'group' : 'me';
  if (args.stored === 'me') return 'me';
  if (args.stored === 'group') return partners ? 'group' : 'me';
  return partners ? 'group' : 'me';
}
