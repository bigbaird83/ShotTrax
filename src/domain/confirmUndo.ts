/** After Confirm saves a shot, Undo is up for this long. Then the shot sticks. */
export const CONFIRM_UNDO_MS = 5000;

export function confirmUndoWindowMs(): typeof CONFIRM_UNDO_MS {
  return CONFIRM_UNDO_MS;
}

/** Undo lives in the header overlay. Not a dock button or a third row. */
export function confirmUndoIsDockRow(): false {
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
