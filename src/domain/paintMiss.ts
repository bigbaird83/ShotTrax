import type { PaintResultWinner } from './courseCard';
import { COPY } from './playerCopy';

export type PaintMissNotice = {
  /** Amber toast. HARD-MISS catalog-only stays quiet. */
  loud: boolean;
  title: string;
  detail: string | null;
  testID: 'paint-miss-banner' | 'hard-miss-banner';
};

/**
 * Banner for a paint miss. No coordinates.
 *
 * A sane hit — including last paint from cache — hides the banner.
 * Thunderbird-class HARD-MISS is catalog-only and quiet.
 * Worker down, or a resolve that did not pass the existing gates, is loud.
 * Unknown paint (no result yet, not unresolved) stays blank.
 */
export function planPaintMissBanner(args: {
  paintResult?: PaintResultWinner | null;
  hardMiss?: boolean;
  /** Detail never arrived, or this hole has no sane tee and green. */
  unresolved?: boolean;
}): PaintMissNotice | null {
  if (args.paintResult?.ok) return null;
  if (args.hardMiss) {
    return {
      loud: false,
      title: COPY.catalogOnlyHardMiss,
      detail: COPY.hardMissNeedPinsDetail,
      testID: 'hard-miss-banner',
    };
  }
  if (args.paintResult?.ok === false || args.unresolved) {
    return {
      loud: true,
      title: COPY.paintMissLoud,
      detail: COPY.paintMissLoudDetail,
      testID: 'paint-miss-banner',
    };
  }
  return null;
}

export function paintMissBannerInventsCoords(): false {
  return false;
}
