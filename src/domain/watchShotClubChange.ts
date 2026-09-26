/**
 * Watch Change club → the phone's club-only edit on the last shot of this hole.
 * The Watch does not write the database. It sends `shotClubChange` on the same
 * stable-id queue as shotUndo. A resend reuses the id and cannot change a
 * different shot. Putts and penalties are never touched. Not a swing: no GPS,
 * no yardage, no live-yard hold. Yard Test rounds stay out of club averages
 * because the phone's existing club-change path only updates `club_id`.
 */

import type { Shot } from './types';
import { isPutterClubId } from './defaultBag';

/** Success flash on the Watch. */
export const WATCH_CLUB_CHANGED = 'Club changed ✓';
/** The id was already applied, or this shot is no longer the last one. Nothing changes. */
export const WATCH_CLUB_CHANGE_UNCHANGED = 'Not changed · shot moved';
/** Phone could not save. Retry stays up and resends the same id. */
export const WATCH_CLUB_CHANGE_FAILED = 'Couldn’t change club';

export type WatchShotClubChangeDecision =
  | { action: 'apply'; feedback: typeof WATCH_CLUB_CHANGED }
  | { action: 'skip'; feedback: typeof WATCH_CLUB_CHANGE_UNCHANGED };

const appliedIds = new Set<string>();

export function watchClubChangeAlreadyApplied(id: string): boolean {
  return appliedIds.has(id.trim());
}

export function rememberWatchClubChange(id: string): void {
  const trimmed = id.trim();
  if (trimmed) appliedIds.add(trimmed);
}

export function resetWatchClubChanges(): void {
  appliedIds.clear();
}

/**
 * Change the club only while `shotId` is still the last shot on the phone's
 * current hole and this id has not been applied. Otherwise reply ok and
 * change nothing — a resend can never land on a newer shot.
 */
export function planWatchShotClubChange(args: {
  id: string;
  shotId: string;
  clubId: string;
  holeNumber: number;
  currentHole: number;
  shots: readonly Shot[];
  alreadyApplied?: boolean;
}): WatchShotClubChangeDecision {
  if (args.alreadyApplied || watchClubChangeAlreadyApplied(args.id)) {
    return { action: 'skip', feedback: WATCH_CLUB_CHANGE_UNCHANGED };
  }
  if (args.holeNumber !== args.currentHole || !args.clubId || isPutterClubId(args.clubId)) {
    return { action: 'skip', feedback: WATCH_CLUB_CHANGE_UNCHANGED };
  }
  const ordered = [...args.shots].sort((a, b) => a.seq - b.seq);
  const last = ordered[ordered.length - 1];
  if (!last || last.id !== args.shotId) {
    return { action: 'skip', feedback: WATCH_CLUB_CHANGE_UNCHANGED };
  }
  return { action: 'apply', feedback: WATCH_CLUB_CHANGED };
}

/** Change club is not a swing: it never starts the 30s yardage hold. */
export function watchShotClubChangeStartsShotHold(): false {
  return false;
}

/** Putts and penalties have their own rows. Change club never edits them. */
export function watchShotClubChangeTouchesPuttsOrPenalties(): false {
  return false;
}

export type QueuedWatchShotClubChange = { token: string; json: string; id: string };

let queued: QueuedWatchShotClubChange[] = [];

export function queueWatchShotClubChangeEvent(event: QueuedWatchShotClubChange): void {
  if (!event.id || queued.some((row) => row.token === event.token && row.id === event.id)) return;
  queued = [...queued, event];
}

export function drainWatchShotClubChangeQueue(): QueuedWatchShotClubChange[] {
  const rows = queued;
  queued = [];
  return rows;
}
