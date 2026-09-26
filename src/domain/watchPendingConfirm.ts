/**
 * Row B's middle slot. Mirrors the Watch: Retry while a penalty or an undo is
 * still in the unconfirmed queue, otherwise Undo.
 * A phone `watchConfirm` removes that id. A second confirm for the same id
 * removes nothing else. `ok: false` removes nothing, so a failed or still-queued
 * row keeps Retry.
 */

export type WatchUnconfirmed = { type: 'penaltyPick'; id: string } | { type: 'shotUndo'; id: string };

export function clearWatchUnconfirmed(
  queue: readonly WatchUnconfirmed[],
  confirm: { kind: 'penalty' | 'undo'; id: string; ok: boolean },
): WatchUnconfirmed[] {
  if (confirm.ok !== true) return [...queue];
  const id = confirm.id.trim();
  if (!id) return [...queue];
  if (confirm.kind === 'penalty') {
    return queue.filter((row) => !(row.type === 'penaltyPick' && row.id === id));
  }
  return queue.filter((row) => !(row.type === 'shotUndo' && row.id === id));
}

export function watchRowBMiddleSlot(queue: readonly WatchUnconfirmed[]): 'Retry' | 'Undo' {
  const penaltyRetry = queue.some((row) => row.type === 'penaltyPick');
  const undoRetry = queue.some((row) => row.type === 'shotUndo');
  return penaltyRetry || undoRetry ? 'Retry' : 'Undo';
}
