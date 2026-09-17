export type HoleScoreReconcile = {
  score: number | null;
  shotCount: number;
  penaltyStrokes: number;
  logged: number;
  mismatch: boolean;
};

/**
 * Scorecard score stays the source of truth. If the player also logged shots
 * and/or penalties, warn when those don't add up to the posted score.
 *
 * No warning when nothing is logged (score-only play) or when score is unset.
 */
export function reconcileHoleScore(args: {
  score: number | null;
  shotCount: number;
  penaltyStrokes: number;
}): HoleScoreReconcile {
  const shotCount = Math.max(0, args.shotCount);
  const penaltyStrokes = Math.max(0, args.penaltyStrokes);
  const logged = shotCount + penaltyStrokes;
  const mismatch = args.score != null && logged > 0 && args.score !== logged;
  return {
    score: args.score,
    shotCount,
    penaltyStrokes,
    logged,
    mismatch,
  };
}

export function scoreMismatchMessage(row: HoleScoreReconcile): string {
  return `Score ${row.score} doesn’t match ${row.shotCount} shots + ${row.penaltyStrokes} penalties.`;
}
