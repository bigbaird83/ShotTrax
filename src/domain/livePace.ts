/**
 * Live follow scorecard: thru N, elapsed, rough time left.
 * Reads only posted scores and hole start/finish stamps. No GPS, no guesses.
 */

export type LivePaceHole = {
  hole: number;
  score: number | null;
  par: number | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type LivePace = {
  /** Holes with a posted score or a Made it / Hole Out stamp. */
  thru: number;
  holeCount: number;
  /** First hole start → now (or last finish once every hole is done). */
  elapsedMs: number | null;
  /** Mean start→finish of holes that carry both stamps. */
  avgHoleMs: number | null;
  /** avgHoleMs × holes left. Null until one hole has both stamps. */
  remainingMs: number | null;
  /** Holes that fed avgHoleMs. */
  timedHoles: number;
};

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function holeIsComplete(row: LivePaceHole): boolean {
  return row.completedAt != null || row.score != null;
}

/** Start → finish for one hole. Null when a stamp is missing or out of order. */
export function holeDurationMs(row: LivePaceHole): number | null {
  const start = timeMs(row.startedAt);
  const end = timeMs(row.completedAt);
  if (start == null || end == null || end < start) return null;
  return end - start;
}

export type HoleStartStampInput = {
  number: number;
  score: number | null;
  puttsDone: boolean;
  startedAt: string | null;
  completedAt: string | null;
};

function holeStampInputDone(row: HoleStartStampInput): boolean {
  return row.completedAt != null || row.puttsDone || row.score != null;
}

/**
 * True when opening `number` means the player is actually on it: it is not
 * started or finished yet, and every earlier hole is finished (Made it /
 * Hole Out, or a posted score). Peeking ahead at later holes is false.
 */
export function planHoleStartStamp(holes: HoleStartStampInput[], number: number): boolean {
  const target = holes.find((row) => row.number === number);
  if (!target || target.startedAt != null || holeStampInputDone(target)) return false;
  return holes.filter((row) => row.number < number).every(holeStampInputDone);
}

export function planLivePace(args: {
  holes: LivePaceHole[];
  nowMs: number;
  finished?: boolean;
}): LivePace {
  const holeCount = args.holes.length;
  const thru = args.holes.filter(holeIsComplete).length;
  const allDone = args.finished === true || (holeCount > 0 && thru >= holeCount);

  const durations = args.holes
    .map(holeDurationMs)
    .filter((ms): ms is number => ms != null);
  const avgHoleMs =
    durations.length === 0 ? null : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  const starts = args.holes.map((row) => timeMs(row.startedAt)).filter((ms): ms is number => ms != null);
  const ends = args.holes.map((row) => timeMs(row.completedAt)).filter((ms): ms is number => ms != null);
  const firstStart = starts.length === 0 ? null : Math.min(...starts);
  const lastEnd = ends.length === 0 ? null : Math.max(...ends);
  const endMs = allDone ? lastEnd : args.nowMs;
  const elapsedMs =
    firstStart == null || endMs == null || endMs < firstStart ? null : endMs - firstStart;

  const left = Math.max(0, holeCount - thru);
  const remainingMs = allDone ? 0 : avgHoleMs == null ? null : avgHoleMs * left;

  return { thru, holeCount, elapsedMs, avgHoleMs, remainingMs, timedHoles: durations.length };
}

/** "42m", "1h 05m". Under a minute is "<1m". Null is "—". */
export function formatPaceDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Local wall clock, e.g. "2:05 PM". Missing / bad stamp is "—". */
export function formatHoleClock(iso: string | null | undefined): string {
  const ms = timeMs(iso);
  if (ms == null) return '—';
  const d = new Date(ms);
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "Thru 7 · 1h 02m elapsed · ~1h 30m left". Drops parts that have no data. */
export function formatLivePaceLine(pace: LivePace, finished = false): string {
  const parts: string[] = [];
  parts.push(finished || (pace.holeCount > 0 && pace.thru >= pace.holeCount) ? 'Final' : `Thru ${pace.thru}`);
  if (pace.elapsedMs != null) parts.push(`${formatPaceDuration(pace.elapsedMs)} elapsed`);
  if (pace.remainingMs != null && pace.remainingMs > 0) {
    parts.push(`~${formatPaceDuration(pace.remainingMs)} left`);
  }
  return parts.join(' · ');
}

/** Posted total, and to-par only when every scored hole has a known par. */
export function planLiveScoreTotals(holes: LivePaceHole[]): {
  total: number | null;
  toPar: number | null;
} {
  const scored = holes.filter((row) => row.score != null && Number.isFinite(row.score));
  if (scored.length === 0) return { total: null, toPar: null };
  const total = scored.reduce((sum, row) => sum + (row.score as number), 0);
  const parKnown = scored.every((row) => row.par != null && Number.isFinite(row.par));
  const toPar = parKnown
    ? scored.reduce((sum, row) => sum + (row.score as number) - (row.par as number), 0)
    : null;
  return { total, toPar };
}

export function formatToPar(toPar: number | null): string | null {
  if (toPar == null) return null;
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : String(toPar);
}
