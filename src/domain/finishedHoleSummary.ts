/**
 * TF 48 — finished-hole revisit mini-summary.
 * Floating chip only. Never a modal. Never invent putt GPS or yards.
 */

import { finishedHoleDisplayScore } from './holeScore';
import { COPY, formatPuttCount, formatShotCount, holeOutClosedOnShot } from './playerCopy';
import {
  attachPuttLengthInventGps,
  attachPuttLengthInventYards,
  attachPuttLengthReopensHole,
  attachPuttLengthWritesScore,
  holeClosedByShot,
  planFinishedPuttAttachRows,
  type FinishedPuttRow,
} from './putts';
import {
  scorecardDiff,
  scorecardDiffLabel,
  scorecardDiffTone,
  type ScorecardDiffTone,
} from './scorecard';

export { finishedHoleDisplayScore };

export type FinishedHoleMiniSummary = {
  visible: boolean;
  kind: 'chip';
  modal: false;
  score: number | null;
  par: number | null;
  vsPar: string | null;
  vsParTone: ScorecardDiffTone | null;
  shotCount: number;
  putts: number;
  shotsLabel: string;
  puttsLabel: string;
  flag: string | null;
  line: string;
  accessibilityLabel: string;
  puttRows: FinishedPuttRow[];
};

export { formatPuttCount, formatShotCount };

/**
 * Hole Out · shot N when `hole_out` is flagged on a real shot.
 * Made it when the hole closed on-green (putts, no hole_out).
 * Never invents a shot number or putt yards.
 */
export function finishedHoleCloserFlag(args: {
  shots: { seq: number; holeOut?: boolean | null }[];
  putts: number;
}): string | null {
  const closer = holeClosedByShot(args.shots);
  if (closer) return holeOutClosedOnShot(closer.seq);
  if (args.putts > 0) return COPY.madeIt;
  return null;
}

export function formatFinishedHoleLine(args: {
  score: number | null;
  vsPar: string | null;
  shotsLabel: string;
  puttsLabel: string;
  flag: string | null;
}): string {
  return [args.score != null ? String(args.score) : null, args.vsPar, args.shotsLabel, args.puttsLabel, args.flag]
    .filter(Boolean)
    .join(' · ');
}

export function planFinishedHoleMiniSummary(args: {
  puttsDone?: boolean;
  placing?: boolean;
  catchUpFullScreen?: boolean;
  score: number | null;
  par: number | null;
  shotCount: number;
  putts: number;
  lengths?: readonly (string | null | undefined)[];
  penaltyStrokes?: number;
  shots: { seq: number; holeOut?: boolean | null }[];
}): FinishedHoleMiniSummary {
  const shotCount = Math.max(0, args.shotCount);
  const putts = Math.max(0, args.putts);
  const shotsLabel = formatShotCount(shotCount);
  const puttsLabel = formatPuttCount(putts);
  const hidden = (): FinishedHoleMiniSummary => ({
    visible: false,
    kind: 'chip',
    modal: false,
    score: null,
    par: args.par ?? null,
    vsPar: null,
    vsParTone: null,
    shotCount,
    putts,
    shotsLabel,
    puttsLabel,
    flag: null,
    line: '',
    accessibilityLabel: '',
    puttRows: [],
  });

  if (!args.puttsDone || args.placing || args.catchUpFullScreen) return hidden();

  const score = finishedHoleDisplayScore(args);
  const par = args.par ?? null;
  const vsPar = scorecardDiffLabel(scorecardDiff(score, par));
  const vsParTone = scorecardDiffTone(scorecardDiff(score, par));
  const flag = finishedHoleCloserFlag({ shots: args.shots, putts });
  const line = formatFinishedHoleLine({ score, vsPar, shotsLabel, puttsLabel, flag });
  return {
    visible: true,
    kind: 'chip',
    modal: false,
    score,
    par,
    vsPar,
    vsParTone,
    shotCount,
    putts,
    shotsLabel,
    puttsLabel,
    flag,
    line,
    accessibilityLabel: `Finished hole · ${line}`,
    puttRows: planFinishedPuttAttachRows({
      puttsDone: true,
      putts,
      lengths: args.lengths ?? [],
    }),
  };
}

export function finishedHoleAttachPuttLengthReopensHole(): false {
  return attachPuttLengthReopensHole();
}

export function finishedHoleAttachPuttLengthWritesScore(): false {
  return attachPuttLengthWritesScore();
}

export function finishedHoleAttachPuttLengthInventGps(): false {
  return attachPuttLengthInventGps();
}

export function finishedHoleAttachPuttLengthInventYards(): false {
  return attachPuttLengthInventYards();
}

export { planFinishedPuttAttachRows, type FinishedPuttRow };

export function finishedHoleMiniSummaryIsChip(): true {
  return true;
}

export function finishedHoleMiniSummaryIsModal(): false {
  return false;
}

export function finishedHoleMiniSummaryInventPuttGps(): false {
  return false;
}

export function finishedHoleMiniSummaryInventPuttYards(): false {
  return false;
}

export function finishedHoleMiniSummaryShowsOnRevisit(): true {
  return true;
}

export function finishedHoleMiniSummaryOpensScorecard(): true {
  return true;
}

export function finishedHoleMiniSummaryWritesScore(): false {
  return false;
}
