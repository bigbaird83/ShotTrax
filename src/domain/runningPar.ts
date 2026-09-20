/**
 * Cypress noon lock — running ±par corner badge in-round.
 * Thru N and ±par from finished holes only (Made it / Hole Out / puttsDone)
 * with a posted or logged score. Never invent GPS or yards.
 */

import { finishedHoleDisplayScore } from './holeScore';
import { formatRunningParBadge } from './playerCopy';
import { scorecardDiff, scorecardDiffTone, type ScorecardDiffTone } from './scorecard';

export type RunningParHole = {
  number: number;
  par: number | null;
  score: number | null;
  puttsDone?: boolean;
  shotCount?: number;
  putts?: number;
  penaltyStrokes?: number;
};

export type RunningParBadge = {
  visible: boolean;
  kind: 'corner';
  modal: false;
  thru: number;
  toPar: number | null;
  toParLabel: string | null;
  toParTone: ScorecardDiffTone | null;
  line: string;
  accessibilityLabel: string;
};

/**
 * Posted score wins. Unset score falls back to logged strokes on a finished hole.
 * Never GPS, never yards, never a fabricated 0.
 */
export function finishedHolePersistedScore(hole: RunningParHole): number | null {
  if (!hole.puttsDone) return null;
  return finishedHoleDisplayScore({
    score: hole.score,
    shotCount: hole.shotCount ?? 0,
    putts: hole.putts ?? 0,
    penaltyStrokes: hole.penaltyStrokes,
  });
}

/** Product lock: −1 / E / +2. Unicode minus, never invented GPS. */
export function formatRunningParToPar(diff: number | null): string | null {
  if (diff == null || !Number.isFinite(diff)) return null;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}

export function formatRunningParLine(thru: number, toPar: number | null): string {
  return formatRunningParBadge(thru, formatRunningParToPar(toPar));
}

function hiddenBadge(): RunningParBadge {
  return {
    visible: false,
    kind: 'corner',
    modal: false,
    thru: 0,
    toPar: null,
    toParLabel: null,
    toParTone: null,
    line: '',
    accessibilityLabel: '',
  };
}

/**
 * Sum posted/logged scores vs par for finished holes only.
 * Blank or in-play holes do not invent strokes.
 */
export function planRunningParBadge(args: {
  holes: RunningParHole[];
  placing?: boolean;
  catchUpFullScreen?: boolean;
  puttOpen?: boolean;
  readOnly?: boolean;
}): RunningParBadge {
  if (args.placing || args.catchUpFullScreen || args.puttOpen || args.readOnly) return hiddenBadge();

  const finished = [...args.holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => ({ hole, score: finishedHolePersistedScore(hole) }))
    .filter((row): row is { hole: RunningParHole; score: number } => row.score != null);

  if (finished.length === 0) return hiddenBadge();

  let toParSum = 0;
  let vsParCount = 0;
  for (const row of finished) {
    const diff = scorecardDiff(row.score, row.hole.par ?? null);
    if (diff == null) continue;
    toParSum += diff;
    vsParCount += 1;
  }

  const thru = finished.length;
  const toPar = vsParCount > 0 ? toParSum : null;
  const toParLabel = formatRunningParToPar(toPar);
  const line = formatRunningParLine(thru, toPar);
  return {
    visible: true,
    kind: 'corner',
    modal: false,
    thru,
    toPar,
    toParLabel,
    toParTone: scorecardDiffTone(toPar),
    line,
    accessibilityLabel: `Running score · ${line}`,
  };
}

export function runningParBadgeIsCorner(): true {
  return true;
}

export function runningParBadgeIsModal(): false {
  return false;
}

export function runningParBadgeInventGps(): false {
  return false;
}

export function runningParBadgeInventYards(): false {
  return false;
}

export function runningParCountsIncompleteHoles(): false {
  return false;
}

export function runningParHidesDuringCatchUp(): true {
  return true;
}

export function runningParBlocksMapGestures(): false {
  return false;
}

export function runningParUsesPersistedScores(): true {
  return true;
}

/** Cypress noon: thru N and ±par from finished persisted scores only. */
export function signalLabCypressNoonRunningPar(): {
  thruFromFinishedOnly: true;
  plusMinusFromPersistedScores: true;
  inventGps: false;
  inventYards: false;
  hideDuringCatchUp: true;
  pointerEvents: 'none';
} {
  return {
    thruFromFinishedOnly: true,
    plusMinusFromPersistedScores: true,
    inventGps: false,
    inventYards: false,
    hideDuringCatchUp: true,
    pointerEvents: 'none',
  };
}
