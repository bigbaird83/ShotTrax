/** Watch → phone putt taps. Cart / unreachable must not drop puttPick. */

import { holeAfterDone } from './putts';
import type { PuttLengthId } from './putts';
import { puttSheetPayload, type ClubListMessage, type PuttSheetMessage } from './watchMessages';

export const WATCH_PUTT_PICK_DEDUP_MAX = 48;

export type WatchPuttPickQueueRow = {
  at: string;
  action: 'add' | 'undo' | 'made';
};

/** Interactive sendMessage is not enough — phone in the cart is often unreachable. */
export function watchPuttPickUsesTransferUserInfo(): true {
  return true;
}

export function watchPuttPickQueuesWhenUnreachable(): true {
  return true;
}

export function watchPuttPickDropsWhenUnreachable(): false {
  return false;
}

/** One pendingClubPick slot overwrites Add then Made it. Queue every tap. */
export function watchPuttPickSinglePendingSlot(): false {
  return false;
}

export function watchPuttPickDedupesByAt(): true {
  return true;
}

export function watchPuttPickKeepsMadeLengthId(): true {
  return true;
}

/** Add / Undo / Made it change phone count + lengths. Length pick rides on Made it `lengthId`. */
export function watchPuttActionsMustReachPhone(): readonly ['add', 'undo', 'made'] {
  return ['add', 'undo', 'made'];
}

/** Rapid Watch adds share one handler — serialize so N≥2 cannot race a stale draft. */
export function watchPuttPickSerializesOnPhone(): true {
  return true;
}

/** Same-millisecond Add taps must not share `at` or the 2nd is silently dropped. */
export function watchPuttPickUsesUniqueAt(): true {
  return true;
}

export function watchPuttAddsNeverDropAfterFirst(): true {
  return true;
}

/** add, undo, and Made all ride sendPuttPickReliable → transferUserInfo + queue. */
export function watchPuttPickMadeUsesTransferUserInfo(): true {
  return true;
}

export function enqueueWatchPuttPick<T extends { at: string }>(queue: T[], next: T): T[] {
  if (!next.at || queue.some((row) => row.at === next.at)) return queue;
  return [...queue, next];
}

export function rememberWatchPuttPickAt(
  seen: string[],
  at: string,
): { apply: boolean; seen: string[] } {
  if (!at) return { apply: true, seen };
  if (seen.includes(at)) return { apply: false, seen };
  const next = [...seen, at];
  if (next.length > WATCH_PUTT_PICK_DEDUP_MAX) next.shift();
  return { apply: true, seen: next };
}

let appliedAts: string[] = [];

/** True the first time this Watch tap `at` is seen. sendMessage + userInfo share `at`. */
export function watchPuttPickShouldApply(at: string): boolean {
  const result = rememberWatchPuttPickAt(appliedAts, at);
  appliedAts = result.seen;
  return result.apply;
}

export function forgetWatchPuttPickAt(at: string): void {
  appliedAts = appliedAts.filter((row) => row !== at);
}

type QueuedPuttPick = { token: string; json: string; at: string };

let queued: QueuedPuttPick[] = [];

export function queueWatchPuttPickEvent(event: QueuedPuttPick): void {
  queued = enqueueWatchPuttPick(queued, event);
}

export function drainWatchPuttPickQueue(): QueuedPuttPick[] {
  const rows = queued;
  queued = [];
  return rows;
}

export type WatchMadeItAdvance = {
  /** Always closed (`done`) so the Watch leaves the putt sheet. */
  puttSheet: PuttSheetMessage;
  /** Hole N+1 (yards unknown until the new hole's fix), or the last hole with `roundComplete`. */
  clubList: ClubListMessage;
};

/**
 * Made it / Hole Out on hole N (Watch `puttPick` made or the phone button).
 * Pushed right away so the wrist moves to Hole N+1 Suggested clubs — the new
 * hole screen's own clubList follows with real yards. Bag, labels, and top-3
 * ride over from the last clubList. Yards are none — never carried from hole N.
 * Last hole → `roundComplete`, never the old putt sheet.
 */
export function planWatchMadeItAdvance(args: {
  holeNumber: number;
  holeCount: number;
  lengths: PuttLengthId[];
  last: ClubListMessage | null;
  /**
   * Shots already on the destination hole. The phone names the count and the
   * last shot. Zero (the default) means that hole has none.
   */
  nextShotCount?: number | null;
  nextLastShotId?: string | null;
  nextLastShotClubId?: string | null;
}): WatchMadeItAdvance {
  const puttSheet = puttSheetPayload({
    open: false,
    holeNumber: args.holeNumber,
    lengths: args.lengths,
    done: true,
  });
  const dest = holeAfterDone(args.holeNumber, args.holeCount);
  const nextShotCount =
    args.nextShotCount == null || !Number.isFinite(args.nextShotCount)
      ? args.nextLastShotId?.trim()
        ? 1
        : 0
      : Math.max(0, Math.round(args.nextShotCount));
  const nextLastShotId = nextShotCount > 0 ? (args.nextLastShotId?.trim() ?? '') : '';
  const nextLastShotClubId = nextLastShotId ? (args.nextLastShotClubId?.trim() ?? '') : '';
  const base: ClubListMessage = {
    type: 'clubList',
    top3: args.last?.top3 ?? [],
    bag: args.last?.bag ?? [],
    labels: args.last?.labels ?? {},
    holeNumber: dest.kind === 'hole' ? dest.holeNumber : args.holeNumber,
    yardsToGreen: null,
    yardsQuality: 'none',
    complicationYards: null,
    complicationQuality: 'none',
    shotCount: nextShotCount,
    lastShotId: nextLastShotId,
    lastShotClubId: nextLastShotClubId,
  };
  if (dest.kind === 'summary') base.roundComplete = true;
  return { puttSheet, clubList: base };
}
