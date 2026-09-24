/**
 * Home screen summaries: greeting, live-round card, history ± par badge.
 * Posted scores only. A hole with no par never counts toward ± par.
 */

import { formatRunningParToPar } from './runningPar';

export type HomeSummaryHole = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
};

export type HomeRoundSummary = {
  /** Holes with a posted score. */
  thru: number;
  /** Sum of score − par over holes with both. Null when none. */
  toPar: number | null;
  toParLabel: string | null;
  putts: number;
  /** First hole without a score, else the last hole. Null for an empty card. */
  currentHole: number | null;
};

export type ToParTone = 'good' | 'warn' | 'bad' | 'none';

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function summarizeHomeRound(holes: HomeSummaryHole[]): HomeRoundSummary {
  let thru = 0;
  let putts = 0;
  let toPar: number | null = null;
  for (const hole of holes) {
    if (hole.score == null) continue;
    thru += 1;
    putts += hole.putts;
    if (hole.par != null) toPar = (toPar ?? 0) + hole.score - hole.par;
  }
  const open = holes.find((hole) => hole.score == null);
  return {
    thru,
    toPar,
    toParLabel: formatRunningParToPar(toPar),
    putts,
    currentHole: open?.number ?? holes[holes.length - 1]?.number ?? null,
  };
}

/** History badge color: ≤ +2 green, ≤ +6 amber, worse red. */
export function toParTone(toPar: number | null): ToParTone {
  if (toPar == null) return 'none';
  if (toPar <= 2) return 'good';
  if (toPar <= 6) return 'warn';
  return 'bad';
}
