import { planDeleteShot } from './deleteShot';
import type { Shot } from './types';
import { planUndoLastShot } from './undoLastShot';

/**
 * A Soft GPS club mark is a live club tap saved at soft accuracy (15–25 m).
 * `startFixQuality` is the tap itself. A later close can worsen `fixQuality`
 * without turning a good tap into a soft mark, and a soft end does not make
 * a good tap undoable here.
 * Placed, no-GPS, good, forced, and mark-without-club rows are not this.
 */
export function isSoftGpsClubMark(
  shot: Pick<Shot, 'source' | 'startFixQuality' | 'clubId' | 'startLat' | 'startLng'>,
): boolean {
  return (
    shot.source === 'gps' &&
    shot.startFixQuality === 'soft' &&
    typeof shot.clubId === 'string' &&
    shot.clubId.length > 0 &&
    shot.startLat != null &&
    shot.startLng != null
  );
}

export type SoftGpsUndoPlan = {
  deleteShotId: string;
  reopenShotId: string | null;
  nextLastClubId: string | null;
  /** Every other mark on the hole. Empty only when this was the only mark. */
  keepShotIds: string[];
  /**
   * The soft mark is the newest row, so the existing undo-last mutation applies
   * (delete it and reopen the prior GPS shot that tap closed).
   */
  usesUndoLast: boolean;
};

/**
 * Drop only the most recent Soft GPS club mark.
 * Earlier marks stay. A newer non-soft mark stays.
 * Does not invent coordinates, yards, par, greens, or a round.
 */
export function planUndoLastSoftGpsClubMark(shots: Shot[]): SoftGpsUndoPlan | null {
  const ordered = [...shots].sort((a, b) => a.seq - b.seq);
  let index = -1;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (isSoftGpsClubMark(ordered[i])) {
      index = i;
      break;
    }
  }
  if (index < 0) return null;
  const target = ordered[index];
  const keep = ordered.filter((shot) => shot.id !== target.id);
  const isLast = index === ordered.length - 1;
  if (isLast) {
    const undo = planUndoLastShot(ordered);
    if (!undo || undo.deleteShotId !== target.id) return null;
    return {
      deleteShotId: target.id,
      reopenShotId: undo.reopenShotId,
      nextLastClubId: undo.nextLastClubId,
      keepShotIds: keep.map((shot) => shot.id),
      usesUndoLast: true,
    };
  }
  const drop = planDeleteShot(ordered, target.id);
  if (!drop.ok) return null;
  if (drop.remaining.length !== keep.length) return null;
  return {
    deleteShotId: target.id,
    reopenShotId: null,
    nextLastClubId: drop.nextLastClubId,
    keepShotIds: drop.remaining.map((shot) => shot.id),
    usesUndoLast: false,
  };
}

export function undoLastSoftGpsClubMarkStartsRound(): false {
  return false;
}

/** Never wipes the hole unless the soft mark is the only row. */
export function undoLastSoftGpsClubMarkClearsHole(): false {
  return false;
}

/**
 * Watch club taps become phone shots. The watch has no shot list to undo.
 * Phone undo updates `lastClubId`; the existing clubList push carries that
 * back. No watch undo message — that path also starts rounds.
 */
export function undoLastSoftGpsClubMarkScope(): 'phone' {
  return 'phone';
}
