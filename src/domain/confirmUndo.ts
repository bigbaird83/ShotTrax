/** After Confirm saves a shot, Undo is up for this long. Then the shot sticks. */
export const CONFIRM_UNDO_MS = 5000;

export function confirmUndoWindowMs(): typeof CONFIRM_UNDO_MS {
  return CONFIRM_UNDO_MS;
}

/** Undo lives in the header overlay. Not a dock button or a third row. */
export function confirmUndoIsDockRow(): false {
  return false;
}

/** During the window the shot is on the hole, but it is not an average sample. */
export function confirmUndoEntersAverage(): false {
  return false;
}

/** The pending Confirm shot is not one of the five that replace the seed. */
export function confirmUndoCountsTowardSeedFive(): false {
  return false;
}

/** Chip yards during Undo waits for the next build. Do not add that label. */
export function confirmUndoShowsChipYards(): false {
  return false;
}

export type ConfirmUndoWindow = {
  shotId: string;
  expiresAt: number;
};

export function planConfirmUndo(shotId: string, nowMs: number): ConfirmUndoWindow {
  return { shotId, expiresAt: nowMs + CONFIRM_UNDO_MS };
}

export function confirmUndoIsLive(window: ConfirmUndoWindow | null, nowMs: number): boolean {
  if (!window) return false;
  return nowMs < window.expiresAt;
}

/** After the window, removing the shot uses Delete this shot? Cancel default. */
export function confirmUndoUsesDeleteConfirm(
  window: ConfirmUndoWindow | null,
  nowMs: number,
): boolean {
  return !confirmUndoIsLive(window, nowMs);
}

/** ISO time when a just-confirmed shot may enter averages / the seed-five. */
export function confirmUndoAverageEligibleAt(nowMs: number): string {
  return new Date(nowMs + CONFIRM_UNDO_MS).toISOString();
}

/**
 * Null / blank / unparsable → already eligible (live GPS and older rows).
 * During the 5s Confirm Undo window this is false — as if Confirm never happened.
 */
export function confirmUndoShotEntersAverage(
  eligibleAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (eligibleAt == null || eligibleAt === '') return true;
  const at = Date.parse(eligibleAt);
  if (!Number.isFinite(at)) return true;
  return nowMs >= at;
}
