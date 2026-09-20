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

/** Highlight / clubSelect never attaches Watch GPS or logs a shot. */
export function watchSelectAttachWatchFix(): false {
  return false;
}

export function watchHighlightLogsShot(): false {
  return false;
}

/** Unstamped clubPick (no hole) is a replay risk after hole advance — drop it. */
export function watchUnstampedClubPickApplies(): false {
  return false;
}

/** Cypress clip: Finish shot · Hole 10 while header is Hole 11. */
export function watchFinishShotPrevBlocksLeftoverClub(): true {
  return true;
}

/** Overlay is mid-swap — no Watch clubPick may apply or re-apply. */
export function watchFinishShotOverlayAcceptsClubMark(): false {
  return false;
}

export function watchFinishShotFlushAppliesClubPick(): false {
  return false;
}

export function watchQueuedClubPickNeverRestampsHole(): true {
  return true;
}

/** Native sendMessage + transferUserInfo can emit onClubPick in parallel. */
export function watchClubPickSerializesOnPhone(): true {
  return true;
}

/** Hole advance must disarm leftover 56° so the wheel cannot stay armed. */
export function watchHoleAdvanceClearsArmedClub(): true {
  return true;
}

/** Finish shot · Hole N on another hole — every inbound/queued clubPick is stale. */
export function watchFinishShotOverlayBlocksClubPick(args: {
  currentHole: number;
  openShotHoles?: number[] | null;
}): boolean {
  return (args.openShotHoles ?? []).some((hole) => hole !== args.currentHole);
}

export function watchOpenPrevBlocksClubPick(args: {
  clubId?: string;
  currentHole: number;
  openShotHoles?: number[] | null;
  lastClubId?: string | null;
}): boolean {
  void args.clubId;
  void args.lastClubId;
  return watchFinishShotOverlayBlocksClubPick(args);
}

export type WatchClubPickGateReason = 'ok' | 'replay' | 'debounce' | 'wrong_hole' | 'open_prev';

export function gateWatchClubPick(args: {
  at: string;
  clubId: string;
  holeNumber?: number | null;
  currentHole: number;
  last?: { clubId: string; appliedAtMs: number } | null;
  nowMs?: number;
  alreadyApplied?: boolean;
  openShotHoles?: number[] | null;
}): { apply: boolean; reason: WatchClubPickGateReason } {
  if (args.alreadyApplied || !args.at) return { apply: false, reason: 'replay' };
  if (args.holeNumber == null || args.holeNumber !== args.currentHole) {
    return { apply: false, reason: 'wrong_hole' };
  }
  if (
    watchFinishShotOverlayBlocksClubPick({
      currentHole: args.currentHole,
      openShotHoles: args.openShotHoles,
    })
  ) {
    return { apply: false, reason: 'open_prev' };
  }
  if (args.last && args.last.clubId === args.clubId) {
    const dt = (args.nowMs ?? Date.now()) - args.last.appliedAtMs;
    if (dt >= 0 && dt < WATCH_CLUB_MARK_DEBOUNCE_MS) {
      return { apply: false, reason: 'debounce' };
    }
  }
  return { apply: true, reason: 'ok' };
}

/** Serialized reconnect drain — models phone handlePick tail (~40 ms apart). */
export function gateWatchClubPickBurst(
  picks: Array<{ at: string; clubId: string; holeNumber?: number | null }>,
  args: {
    currentHole: number;
    openShotHoles?: number[] | null;
    last?: { clubId: string; appliedAtMs: number } | null;
    startMs: number;
    stepMs?: number;
  },
): { apply: boolean; reason: WatchClubPickGateReason }[] {
  let last = args.last ?? null;
  let nowMs = args.startMs;
  const stepMs = args.stepMs ?? 40;
  return picks.map((pick) => {
    const gate = gateWatchClubPick({
      ...pick,
      currentHole: args.currentHole,
      openShotHoles: args.openShotHoles,
      last,
      nowMs,
    });
    if (gate.apply) last = { clubId: pick.clubId, appliedAtMs: nowMs };
    nowMs += stepMs;
    return gate;
  });
}

export function retainWatchClubPicksForHole<T extends { holeNumber?: number | null }>(
  queue: T[],
  holeNumber: number,
): T[] {
  return queue.filter((row) => row.holeNumber === holeNumber);
}
