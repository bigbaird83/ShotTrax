import { COPY } from './playerCopy';

/** History list row: date, course, tees played, score. */

export type HistoryRow = {
  date: string;
  courseName: string;
  tees: string;
  score: string;
  relative: string;
  /** 'Test' on a yard-test round. Null on every other round. */
  testLabel: string | null;
};

export function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatHistoryCourse(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : 'Round';
}

export function formatHistoryTees(teeName: string | null | undefined): string {
  const trimmed = teeName?.trim();
  return trimmed ? trimmed : '—';
}

export function formatHistoryScore(total: number | null | undefined): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  return total;
}

export function formatHistoryScoreLabel(total: number | null | undefined): string {
  const score = formatHistoryScore(total);
  return score == null ? '—' : String(score);
}

function utcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Today / Yesterday / Mon — sits beside the score. */
export function formatHistoryRelativeDay(iso: string, nowMs: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffDays = Math.round((utcDay(nowMs) - utcDay(d.getTime())) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function formatHistoryRow(args: {
  startedAt: string;
  courseName: string | null;
  teeName: string | null;
  score: number | null;
  nowMs?: number;
  test?: boolean;
}): HistoryRow {
  return {
    date: formatHistoryDate(args.startedAt),
    courseName: formatHistoryCourse(args.courseName),
    tees: formatHistoryTees(args.teeName),
    score: formatHistoryScoreLabel(args.score),
    relative: formatHistoryRelativeDay(args.startedAt, args.nowMs),
    testLabel: args.test ? COPY.testRound : null,
  };
}

/**
 * Left swipe reveals Edit and Delete together. It does not delete by itself.
 * A short left swipe still snaps fully open. There is no half-open rest.
 */
export const HISTORY_SWIPE_OPEN_PX = 16;
export const HISTORY_SWIPE_EDIT_PX = 112;
export const HISTORY_SWIPE_DELETE_PX = 72;
export const HISTORY_SWIPE_REVEAL_PX = HISTORY_SWIPE_EDIT_PX + HISTORY_SWIPE_DELETE_PX;

/** Edit label and the delete control both fit inside the open reveal. */
export function historySwipeRevealFitsActions(): true {
  return true;
}

export function historySwipeShouldOpen(dx: number, dy: number): boolean {
  if (Math.abs(dy) > Math.abs(dx)) return false;
  return dx <= -HISTORY_SWIPE_OPEN_PX;
}

export function historySwipeShouldClose(dx: number, dy: number): boolean {
  if (Math.abs(dy) > Math.abs(dx)) return false;
  return dx >= HISTORY_SWIPE_OPEN_PX;
}

/** Open rest is the full Edit+Delete reveal. Closed rest is 0. Never a partial. */
export function historySwipeRestOffset(open: boolean): number {
  return open ? -HISTORY_SWIPE_REVEAL_PX : 0;
}

/**
 * Release always snaps fully open or fully closed.
 * A short left swipe opens both actions. It does not bounce shut on the delete sliver.
 */
export function historySwipeSnap(args: { dx: number; dy: number; open: boolean }): 'open' | 'closed' {
  if (args.open) return historySwipeShouldClose(args.dx, args.dy) ? 'closed' : 'open';
  return historySwipeShouldOpen(args.dx, args.dy) ? 'open' : 'closed';
}

export function historyDeleteRequiresConfirm(): true {
  return true;
}

/** Hard press on a history row asks to delete, same confirm as the swipe ✕. */
export const HISTORY_LONG_PRESS_DELETE_MS = 500;

export function historyLongPressDeletes(): true {
  return true;
}

export function historyDeletePrompt(): {
  title: typeof COPY.deleteRound;
  body: typeof COPY.deleteRoundConfirm;
  cancelIsDefault: true;
} {
  return {
    title: COPY.deleteRound,
    body: COPY.deleteRoundConfirm,
    cancelIsDefault: true,
  };
}

/** Finished rounds open for edit from history. Live rounds already do. */
export function pastRoundEditAnytime(): true {
  return true;
}

export function pastRoundEditRequested(edit: string | string[] | null | undefined): boolean {
  const value = Array.isArray(edit) ? edit[0] : edit;
  return value === '1';
}

/** Finished + explicit Edit: existing marks only. */
export function pastRoundMarksOnly(args: { finished: boolean; editRequested: boolean }): boolean {
  return pastRoundEditAnytime() && args.finished && args.editRequested;
}

/** New shots stay off in past-round edit. */
export function pastRoundCanAddShot(marksOnly: boolean): boolean {
  return !marksOnly;
}

export function pastRoundEditInventsShots(): false {
  return false;
}

export function pastRoundEditInventsPaint(): false {
  return false;
}

/** Past-round edit shows stored tee/green only. */
export function pastRoundStoredPaintOnly(marksOnly: boolean): boolean {
  return marksOnly && !pastRoundEditInventsPaint();
}

export function pastRoundHoleHref(roundId: string, holeNumber: number): string {
  return `/round/${roundId}/hole/${holeNumber}?edit=1`;
}
