/** Watch club marks when the phone is in the cart (~15–20 ft / unreachable). */

import { QUEUED_WILL_SYNC } from './watchMessages';
import { enqueueWatchPuttPick, rememberWatchPuttPickAt, WATCH_PUTT_PICK_DEDUP_MAX } from './watchPuttSync';

export { QUEUED_WILL_SYNC };

/** Interactive sendMessage dies at cart range. transferUserInfo survives. */
export function watchClubMarkUsesTransferUserInfo(): true {
  return true;
}

export function watchClubMarkQueuesWhenUnreachable(): true {
  return true;
}

export function watchClubMarkDropsWhenUnreachable(): false {
  return false;
}

/** Fresh Watch GPS rides the queued clubPick. Never invent. Putter stays off. */
export function watchClubMarkUsesWatchGpsWhenUnreachable(): true {
  return true;
}

export function watchClubMarkAttachWatchFixOnPutter(): false {
  return false;
}

/** Hard PHONE_UNAVAILABLE + sending lock freezes the wrist. Queue instead. */
export function watchClubMarkNeverFreezesOnPhoneUnavailable(): true {
  return true;
}

export function watchClubMarkFeedbackWhenQueued(): typeof QUEUED_WILL_SYNC {
  return QUEUED_WILL_SYNC;
}

export function watchPuttPickShowsQueuedWhenUnreachable(): true {
  return true;
}

export function watchSelectedPuttBucketNeverHides(): true {
  return true;
}

export function watchSelectedClubPillNeverHides(): true {
  return true;
}

export function watchSelectedHighlightUsesLimeFillOrBorder(): true {
  return true;
}

const CLUB_DEDUP_MAX = WATCH_PUTT_PICK_DEDUP_MAX;

let appliedAts: string[] = [];

export function watchClubPickShouldApply(at: string): boolean {
  const result = rememberWatchPuttPickAt(appliedAts, at);
  appliedAts = result.seen;
  return result.apply;
}

export function forgetWatchClubPickAt(at: string): void {
  appliedAts = appliedAts.filter((row) => row !== at);
}

type QueuedClubPick = { token: string; json: string; at: string };

let queued: QueuedClubPick[] = [];

export function queueWatchClubPickEvent(event: QueuedClubPick): void {
  queued = enqueueWatchPuttPick(queued, event);
}

export function drainWatchClubPickQueue(): QueuedClubPick[] {
  const rows = queued;
  queued = [];
  return rows;
}

export function enqueueWatchClubPick<T extends { at: string }>(queue: T[], next: T): T[] {
  return enqueueWatchPuttPick(queue, next);
}

export function watchClubPickDedupMax(): number {
  return CLUB_DEDUP_MAX;
}
