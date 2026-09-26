/**
 * Watch Undo → the phone's Undo last shot on that hole.
 * The Watch does not write the database. It sends `shotUndo` the same way as a
 * penalty: `transferUserInfo` plus a queue, and `sendMessage` when the phone is
 * reachable. Retry reuses the id. The message names the shot to remove, so a
 * late or repeated delivery can never remove a second shot.
 * Shots only: putts (hole count) and penalties (their own rows) are never touched.
 * It is not a swing: no GPS, no yardage, no live-yard hold.
 */

import { planUndoLastShot, type UndoPlan } from './undoLastShot';
import type { Shot } from './types';

/** Success flash on the Watch after Delete shot. The ✓ shows it in lime like a club mark. */
export const WATCH_SHOT_DELETED = 'Shot deleted ✓';
/** Same flash. Delete shot is the Watch's undo of the last shot. */
export const WATCH_SHOT_UNDONE = WATCH_SHOT_DELETED;
/** The shot was already removed (an earlier delivery, or deleted on the phone). */
export const WATCH_SHOT_ALREADY_UNDONE = 'Already undone ✓';
/** A newer shot or another hole is in the way. Nothing is removed. */
export const WATCH_SHOT_UNDO_SKIPPED = 'Not undone · shot changed';
/** Phone could not save. Retry stays up and resends the same id. */
export const WATCH_SHOT_UNDO_FAILED = 'Couldn’t undo';

/** The shot the phone's Undo last shot would remove. The Watch sends it back on Undo. */
export function watchLastShotId(shots: readonly Shot[] | null | undefined): string | null {
  return shots && shots.length > 0 ? (planUndoLastShot([...shots])?.deleteShotId ?? null) : null;
}

/** Last shot plus the club Change club should highlight. */
export function watchNamedLastShot(shots: readonly Shot[] | null | undefined): {
  lastShotId: string | null;
  lastShotClubId: string | null;
} {
  const lastShotId = watchLastShotId(shots);
  if (!lastShotId || !shots) return { lastShotId: null, lastShotClubId: null };
  const shot = shots.find((row) => row.id === lastShotId);
  return { lastShotId, lastShotClubId: shot?.clubId ?? null };
}

/**
 * How the Watch applies `lastShotId` / `lastShotClubId`.
 * A named id wins. An explicit empty string means this hole has no shot.
 * A missing key keeps the shot on the same hole (a yard refresh must not gray
 * Edit shot) and clears it when the hole number changes, so hole N's shot is
 * never left armed on hole N+1.
 */
export function resolveWatchLastShotId(args: {
  previousHole: number;
  previousId: string | null;
  nextHole: number;
  /** undefined = key omitted. null or '' = the phone says there is no shot. */
  incoming: string | null | undefined;
}): string | null {
  if (args.incoming === undefined) {
    const holeChanged = args.previousHole > 0 && args.nextHole !== args.previousHole;
    return holeChanged ? null : args.previousId;
  }
  const named = (args.incoming ?? '').trim();
  return named || null;
}

/**
 * A club list with a lower generation than the one already on the Watch is a
 * late Hole Out placeholder or complication transfer. Applying it rewinds the
 * hole and drops the last shot.
 */
export function watchClubListIsStale(args: { currentSeq: number; incomingSeq: number }): boolean {
  return args.currentSeq > 0 && args.incomingSeq < args.currentSeq;
}

export type WatchShotUndoDecision =
  /** Run the phone's Undo last shot. */
  | { action: 'undo'; plan: UndoPlan; feedback: typeof WATCH_SHOT_UNDONE }
  /** The target shot is gone. Reply ok so the Watch stops resending. */
  | { action: 'done'; feedback: typeof WATCH_SHOT_ALREADY_UNDONE }
  /** A newer shot, or the phone is on another hole. Reply ok and remove nothing. */
  | { action: 'skip'; feedback: typeof WATCH_SHOT_UNDO_SKIPPED };

/**
 * Remove the shot only while it is still the last shot on the phone's current hole.
 * Never an earlier hole, never a middle shot, never a second shot on a resend.
 */
export function planWatchShotUndo(args: {
  shotId: string;
  holeNumber: number;
  currentHole: number;
  shots: readonly Shot[];
}): WatchShotUndoDecision {
  if (args.holeNumber !== args.currentHole) {
    return { action: 'skip', feedback: WATCH_SHOT_UNDO_SKIPPED };
  }
  if (!args.shots.some((shot) => shot.id === args.shotId)) {
    return { action: 'done', feedback: WATCH_SHOT_ALREADY_UNDONE };
  }
  const plan = planUndoLastShot([...args.shots]);
  if (!plan || plan.deleteShotId !== args.shotId) {
    return { action: 'skip', feedback: WATCH_SHOT_UNDO_SKIPPED };
  }
  return { action: 'undo', plan, feedback: WATCH_SHOT_UNDONE };
}

/** Undo on the Watch is not a swing: it never starts the 30s yardage hold. */
export function watchShotUndoStartsShotHold(): false {
  return false;
}

/** Putts and penalties have their own undo. The Watch Undo never removes them. */
export function watchShotUndoTouchesPuttsOrPenalties(): false {
  return false;
}

export type QueuedWatchShotUndo = { token: string; json: string; id: string };

let queued: QueuedWatchShotUndo[] = [];

/** Phone not ready yet (no play screen). Same id from both channels waits once per token. */
export function queueWatchShotUndoEvent(event: QueuedWatchShotUndo): void {
  if (!event.id || queued.some((row) => row.token === event.token && row.id === event.id)) return;
  queued = [...queued, event];
}

export function drainWatchShotUndoQueue(): QueuedWatchShotUndo[] {
  const rows = queued;
  queued = [];
  return rows;
}
