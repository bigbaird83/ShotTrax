/** History list row: date, course, tees played, score. */

export type HistoryRow = {
  date: string;
  courseName: string;
  tees: string;
  score: string;
  relative: string;
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
}): HistoryRow {
  return {
    date: formatHistoryDate(args.startedAt),
    courseName: formatHistoryCourse(args.courseName),
    tees: formatHistoryTees(args.teeName),
    score: formatHistoryScoreLabel(args.score),
    relative: formatHistoryRelativeDay(args.startedAt, args.nowMs),
  };
}
