import { formatPuttCount } from './playerCopy';

/**
 * Putts already stored on a hole, for the shot-review list.
 * Reads the count the putt sheet / Made it flow and the watch putt sync persist.
 * Does not score, write the round, or invent a location.
 *
 * A missing hole or a missing count is null — not zero.
 * Zero is a stored zero (Hole Out, or putts left unset).
 */
export function shotReviewEnteredPuttCount(
  hole: { putts?: number | null } | null | undefined,
): number | null {
  if (hole == null || hole.putts == null) return null;
  if (typeof hole.putts !== 'number' || !Number.isFinite(hole.putts)) return null;
  return Math.max(0, Math.round(hole.putts));
}

/**
 * One text line under the GPS shots: "+ 1 putt" or "+ 3 putts".
 * Nothing when no putts were entered — zero, missing data, or a sheet that
 * was never finished with Made it. Never a map pin or a yard number.
 */
export function shotReviewPuttSummaryLine(
  hole: { putts?: number | null; puttsDone?: boolean } | null | undefined,
): string | null {
  if (hole != null && hole.puttsDone === false) return null;
  const count = shotReviewEnteredPuttCount(hole);
  if (count == null || count <= 0) return null;
  return `+ ${formatPuttCount(count)}`;
}
