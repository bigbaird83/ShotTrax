/**
 * Phone edits for one penalty step (hole screen and Shot review).
 *
 * Change reason keeps the stroke count and the posted hole score. The note
 * follows the add-penalty rule: a blank note is dropped, and Other shows that
 * note as the row label (formatPenaltyRow). Delete lowers the score by this
 * penalty's strokes and never below shots + putts + penalties still on the
 * hole. It does not guess par and does not renumber shots.
 *
 * Tombstones live only on this phone, in `deleted_penalty_ids`. Deleting
 * removes the hole_penalties row and remembers the id. A later Watch
 * penaltyPick with that id is already handled: insert adds no stroke and the
 * phone still replies ok. Tombstones are not written into the round-history
 * file or shots.csv, so they cannot change export counts. Restore does not
 * read or write them. An older backup still restores. A file that still lists
 * a penalty writes that row even when this phone has a tombstone (the file
 * wins). A file that omits the penalty does not recreate the tombstone.
 */

import { COPY } from './playerCopy';
import type { PenaltyReason } from './types';
import { isPenaltyReason } from './watchMessages';

/**
 * Blank notes are stored as null. Other uses a saved note as the whole label;
 * Water / OB / Unplayable keep "Reason · note" when a note is present.
 */
export function penaltyNoteForSave(reason: PenaltyReason, note: string | null | undefined): string | null {
  if (!isPenaltyReason(reason)) return null;
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

export function planChangePenaltyReason(args: {
  reason: string;
  note: string | null | undefined;
}):
  | { ok: false }
  | { ok: true; reason: PenaltyReason; note: string | null; strokesUnchanged: true; scoreUnchanged: true } {
  if (!isPenaltyReason(args.reason)) return { ok: false };
  return {
    ok: true,
    reason: args.reason,
    note: penaltyNoteForSave(args.reason, args.note),
    strokesUnchanged: true,
    scoreUnchanged: true,
  };
}

/** Two actions, plus Cancel. A penalty step is not a shot. */
export function penaltyStepActionSheet(): {
  title: typeof COPY.penalty;
  options: readonly [typeof COPY.changePenalty, typeof COPY.deletePenalty];
  cancel: typeof COPY.cancel;
  changeClub: false;
  moveSpot: false;
} {
  return {
    title: COPY.penalty,
    options: [COPY.changePenalty, COPY.deletePenalty],
    cancel: COPY.cancel,
    changeClub: false,
    moveSpot: false,
  };
}

export function penaltyEditOffersChangeClub(): false {
  return false;
}

export function penaltyEditOffersMoveSpot(): false {
  return false;
}
