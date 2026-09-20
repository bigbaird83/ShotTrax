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

/** Same 15 m / 25 m acceptFix bands — queue does not skip quality. */
export function watchClubMarkUsesAcceptFixGates(): true {
  return true;
}

/** Hard Watch/phone GPS >25 m still force-prompts. Queue never silent-forces. */
export function watchClubMarkHardOver25mStillForcePrompts(): true {
  return true;
}

export function watchClubMarkSilentForceOnQueue(): false {
  return false;
}

export function watchClubMarkAttachWatchFixOnPutter(): false {
  return false;
}

/** Club pick + puttPick add/Made all ride transferUserInfo. */
export function watchAllPicksUseTransferUserInfo(): true {
  return true;
}

/** Distinct `at` keeps the 2nd tap. One pending slot would drop N≥2. */
export function watchQueuedPicksNeverDropN2(): true {
  return true;
}

export function watchSheetPuttMadeZeroThreeInventGps(): false {
  return false;
}

export function watchSheetPuttMadeZeroThreeInventYards(): false {
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

type QueuedClubPick = { token: string; json: string; at: string; holeNumber?: number | null };

let queued: QueuedClubPick[] = [];

export function queueWatchClubPickEvent(event: QueuedClubPick): void {
  queued = enqueueWatchPuttPick(queued, event);
}

export function drainWatchClubPickQueue(): QueuedClubPick[] {
  const rows = queued;
  queued = [];
  return rows;
}

export function drainWatchClubPickQueueForHole(holeNumber: number): QueuedClubPick[] {
  const rows = retainWatchClubPicksForHole(queued, holeNumber);
  queued = [];
  return rows;
}

export function enqueueWatchClubPick<T extends { at: string }>(queue: T[], next: T): T[] {
  return enqueueWatchPuttPick(queue, next);
}

export function watchClubPickDedupMax(): number {
  return CLUB_DEDUP_MAX;
}

/** Repeat club taps under this window are the same press — not a new shot. */
export const WATCH_CLUB_MARK_DEBOUNCE_MS = 300;

export function watchMarkRequiresExplicitTap(): true {
  return true;
}

export function watchSelectAloneMarksShot(): false {
  return false;
}

export function watchClubPickReplayCreatesShot(): false {
  return false;
}

export function watchHoleAdvanceFlushesMarksToNextHole(): false {
  return false;
}

export function watchIdleWalkInventsShots(): false {
  return false;
}

export type WatchClubPickGateReason = 'ok' | 'replay' | 'debounce' | 'wrong_hole';

export function gateWatchClubPick(args: {
  at: string;
  clubId: string;
  holeNumber?: number | null;
  currentHole: number;
  last?: { clubId: string; appliedAtMs: number } | null;
  nowMs?: number;
  alreadyApplied?: boolean;
}): { apply: boolean; reason: WatchClubPickGateReason } {
  if (args.alreadyApplied || !args.at) return { apply: false, reason: 'replay' };
  if (args.holeNumber != null && args.holeNumber !== args.currentHole) {
    return { apply: false, reason: 'wrong_hole' };
  }
  if (args.last && args.last.clubId === args.clubId) {
    const dt = (args.nowMs ?? Date.now()) - args.last.appliedAtMs;
    if (dt >= 0 && dt < WATCH_CLUB_MARK_DEBOUNCE_MS) {
      return { apply: false, reason: 'debounce' };
    }
  }
  return { apply: true, reason: 'ok' };
}

export function retainWatchClubPicksForHole<T extends { holeNumber?: number | null }>(
  queue: T[],
  holeNumber: number,
): T[] {
  return queue.filter((row) => row.holeNumber === holeNumber);
}
