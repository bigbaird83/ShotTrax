/**
 * Row B's middle slot. Mirrors the Watch: Retry while a penalty, an undo, or a
 * club change is still in the unconfirmed queue, otherwise Edit shot.
 * A phone `watchConfirm` removes that id. A second confirm for the same id
 * removes nothing else. `ok: false` removes nothing, so a failed or still-queued
 * row keeps Retry.
 */

/** One place to put "Undo" back on the Watch. */
export const WATCH_EDIT_SHOT_LABEL = 'Edit shot' as const;

export type WatchUnconfirmed =
  | { type: 'penaltyPick'; id: string }
  | { type: 'shotUndo'; id: string }
  | { type: 'shotClubChange'; id: string };

export function clearWatchUnconfirmed(
  queue: readonly WatchUnconfirmed[],
  confirm: { kind: 'penalty' | 'undo' | 'club'; id: string; ok: boolean },
): WatchUnconfirmed[] {
  if (confirm.ok !== true) return [...queue];
  const id = confirm.id.trim();
  if (!id) return [...queue];
  if (confirm.kind === 'penalty') {
    return queue.filter((row) => !(row.type === 'penaltyPick' && row.id === id));
  }
  if (confirm.kind === 'club') {
    return queue.filter((row) => !(row.type === 'shotClubChange' && row.id === id));
  }
  return queue.filter((row) => !(row.type === 'shotUndo' && row.id === id));
}

export function watchRowBMiddleSlot(queue: readonly WatchUnconfirmed[]): 'Retry' | typeof WATCH_EDIT_SHOT_LABEL {
  const pending = queue.some(
    (row) => row.type === 'penaltyPick' || row.type === 'shotUndo' || row.type === 'shotClubChange',
  );
  return pending ? 'Retry' : WATCH_EDIT_SHOT_LABEL;
}
