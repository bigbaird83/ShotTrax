/**
 * Watch Penalty button → one phone `hole_penalties` row.
 * The Watch does not write the database. It sends `penaltyPick` the same way
 * a club mark is sent: `transferUserInfo` plus a queue, and `sendMessage` when
 * the phone is reachable. Retry reuses the id so the phone cannot add a second stroke.
 * The penalty is always after the last shot on that hole. No earlier-shot picker.
 * It is not a swing: no GPS, no par guess, no yardage, no live-yard hold.
 */

import { defaultPenaltyAfterShot } from './penaltySteps';
import { formatPenaltyRow } from './penalty';
import type { PenaltyReason } from './types';
import { QUEUED_WILL_SYNC, type PenaltyPickMessage } from './watchMessages';

/** Short Watch line when the phone rejected the save. Retry stays up. */
export const WATCH_PENALTY_SAVE_FAILED = 'Couldn’t save';

/** Same words as a queued club mark. The stroke stays pending until the phone confirms. */
export const WATCH_PENALTY_QUEUED = QUEUED_WILL_SYNC;

export const WATCH_PENALTY_RETRY_ACTION = 'Retry';

export function formatWatchPenaltyFeedback(reason: PenaltyReason): string {
  return `${formatPenaltyRow({ strokes: 1, reason, note: null, kind: 'penalty' })} ✓`;
}

export type WatchPenaltyShot = { id?: string | null; seq?: number | null };

/**
 * One penalty stroke after the last shot. No shots yet → both attachment fields
 * stay null so the step is first. Never a lat/lng and never more than one stroke.
 */
export function planWatchPenaltyInsert(args: {
  id: string;
  reason: PenaltyReason;
  shots: readonly WatchPenaltyShot[] | null | undefined;
}): {
  id: string;
  strokes: 1;
  reason: PenaltyReason;
  kind: 'penalty';
  note: null;
  afterShotId: string | null;
  afterShotSeq: number | null;
} {
  const last = defaultPenaltyAfterShot(args.shots);
  const afterShotId = last && typeof last.id === 'string' && last.id.trim() ? last.id.trim() : null;
  const afterShotSeq =
    last && typeof last.seq === 'number' && Number.isInteger(last.seq) ? last.seq : null;
  return {
    id: args.id.trim(),
    strokes: 1,
    reason: args.reason,
    kind: 'penalty',
    note: null,
    afterShotId,
    afterShotSeq,
  };
}

export type QueuedWatchPenalty = { token: string; json: string; id: string };

let queued: QueuedWatchPenalty[] = [];

/** Same id from sendMessage and transferUserInfo both wait. Tokens differ, so both can be answered. */
export function queueWatchPenaltyEvent(event: QueuedWatchPenalty): void {
  if (!event.id || queued.some((row) => row.token === event.token && row.id === event.id)) return;
  queued = [...queued, event];
}

export function drainWatchPenaltyQueue(): QueuedWatchPenalty[] {
  const rows = queued;
  queued = [];
  return rows;
}

export function watchPenaltyQueueLength(): number {
  return queued.length;
}
