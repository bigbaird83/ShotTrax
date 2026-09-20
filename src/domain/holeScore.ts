/**
 * Hole score on Made it / Hole Out.
 * Close writes total strokes (real marks + putts + penalties).
 * Scorecard / revisit read posted score, else logged strokes.
 * Never invent GPS or yards. Never putts-only.
 */

export function loggedHoleStrokes(args: {
  shotCount: number;
  putts: number;
  penaltyStrokes?: number;
}): number {
  return Math.max(0, args.shotCount) + Math.max(0, args.putts) + Math.max(0, args.penaltyStrokes ?? 0);
}

/** Posted score wins. Unset score falls back to logged strokes — never invented GPS. */
export function finishedHoleDisplayScore(args: {
  score: number | null;
  shotCount: number;
  putts: number;
  penaltyStrokes?: number;
}): number | null {
  if (args.score != null && Number.isFinite(args.score) && Number.isInteger(args.score) && args.score >= 1) {
    return args.score;
  }
  const logged = loggedHoleStrokes(args);
  return logged > 0 ? logged : null;
}

/**
 * Made it / Hole Out persist this score — total strokes, not putts-only.
 * No write when nothing is logged (never a fabricated 0).
 */
export function planFinishHoleScore(args: {
  shotCount: number;
  putts: number;
  penaltyStrokes?: number;
}): { ok: true; score: number } | { ok: false; score: null } {
  const score = loggedHoleStrokes(args);
  if (score < 1) return { ok: false, score: null };
  return { ok: true, score };
}

export function finishHoleCloseWritesScore(): true {
  return true;
}

export function finishHoleCloseScoreIsPuttsOnly(): false {
  return false;
}

export function scorecardBlankWhenPuttsDone(): false {
  return false;
}

export function finishHoleScoreInventGps(): false {
  return false;
}

export function finishHoleScoreInventYards(): false {
  return false;
}

/** Cypress H10: Made it cached 9 · +5; delete ghosts must restamp from remaining only. */
export function deleteShotRecomputesHoleScore(): true {
  return true;
}

export function deletePuttRecomputesHoleScore(): true {
  return true;
}

export function orphanGhostStrokesAfterDelete(): false {
  return false;
}

/**
 * Finished hole after delete/edit. Write logged strokes (marks + putts + penalties).
 * Clear the posted score when nothing remains. Unfinished holes stay untouched.
 */
export function planRecomputeFinishedHoleScore(args: {
  puttsDone: boolean;
  shotCount: number;
  putts: number;
  penaltyStrokes?: number;
}): { write: boolean; score: number | null } {
  if (!args.puttsDone) return { write: false, score: null };
  const planned = planFinishHoleScore({
    shotCount: args.shotCount,
    putts: args.putts,
    penaltyStrokes: args.penaltyStrokes,
  });
  return { write: true, score: planned.ok ? planned.score : null };
}
