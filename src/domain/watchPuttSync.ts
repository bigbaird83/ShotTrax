/** Watch → phone putt taps. Cart / unreachable must not drop puttPick. */

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
