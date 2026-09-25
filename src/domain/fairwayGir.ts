import { finishedHoleDisplayScore } from './holeScore';

/**
 * Fairway off the tee (par 4+) and greens in regulation.
 * Fairway is one player tap — never GPS or OSM guessed.
 * GIR is derived from the closed hole: strokes before putting ≤ par − 2.
 * Unknown stays null (no par, hole not closed, par 3 fairway) — never invented.
 */

export type FairwayResult = 'hit' | 'left' | 'right' | 'short';

export const FAIRWAY_RESULTS: readonly FairwayResult[] = ['left', 'hit', 'right', 'short'];

export function parseFairwayResult(value: unknown): FairwayResult | null {
  return value === 'hit' || value === 'left' || value === 'right' || value === 'short' ? value : null;
}

function validPar(par: number | null): par is number {
  return par != null && Number.isInteger(par) && par >= 3 && par <= 6;
}

/** Fairway only counts on par 4+. Par 3 or unknown par never asks. */
export function holeHasFairway(par: number | null): boolean {
  return validPar(par) && par >= 4;
}

/**
 * Show the one-tap Fairway row on play once the tee shot is in (a second
 * shot, a closed first shot, or a closed hole) and until it is answered.
 */
export function showFairwayPrompt(args: {
  par: number | null;
  fairway: FairwayResult | null;
  shotCount: number;
  firstShotClosed: boolean;
  puttsDone: boolean;
  readOnly: boolean;
}): boolean {
  if (args.readOnly || args.fairway != null || !holeHasFairway(args.par)) return false;
  return args.shotCount >= 2 || (args.shotCount >= 1 && args.firstShotClosed) || args.puttsDone;
}

/** Same tap again clears it (a mis-tap is one more tap away). */
export function nextFairwayValue(
  current: FairwayResult | null,
  tapped: FairwayResult,
): FairwayResult | null {
  return current === tapped ? null : tapped;
}

/**
 * Green in regulation from the posted (or logged) score and putts.
 * Only on a closed hole (Made it / Hole Out) with a real par.
 * A hole-out from off the green in regulation counts, same as tour stats.
 */
export function holeGir(args: {
  par: number | null;
  score: number | null;
  putts: number;
  puttsDone: boolean;
  shotCount?: number;
  penaltyStrokes?: number;
}): boolean | null {
  if (!args.puttsDone || !validPar(args.par)) return null;
  const score = finishedHoleDisplayScore({
    score: args.score,
    shotCount: args.shotCount ?? 0,
    putts: args.putts,
    penaltyStrokes: args.penaltyStrokes,
  });
  if (score == null) return null;
  const putts = Math.max(0, args.putts);
  if (putts > score) return null;
  return score - putts <= args.par - 2;
}

export type FairwayGirHoleIn = {
  par: number | null;
  score: number | null;
  putts: number;
  puttsDone: boolean;
  fairway: FairwayResult | null;
  shotCount?: number;
  penaltyStrokes?: number;
};

export type FairwayGirTotals = {
  fairwaysHit: number;
  /** Par 4+ holes with a fairway answer. */
  fairwayHoles: number;
  missLeft: number;
  missRight: number;
  missShort: number;
  greensHit: number;
  /** Closed holes with a real par. */
  greenHoles: number;
};

export function planFairwayGir(holes: readonly FairwayGirHoleIn[]): FairwayGirTotals {
  const totals: FairwayGirTotals = {
    fairwaysHit: 0,
    fairwayHoles: 0,
    missLeft: 0,
    missRight: 0,
    missShort: 0,
    greensHit: 0,
    greenHoles: 0,
  };
  for (const hole of holes) {
    if (holeHasFairway(hole.par) && hole.fairway != null) {
      totals.fairwayHoles += 1;
      if (hole.fairway === 'hit') totals.fairwaysHit += 1;
      if (hole.fairway === 'left') totals.missLeft += 1;
      if (hole.fairway === 'right') totals.missRight += 1;
      if (hole.fairway === 'short') totals.missShort += 1;
    }
    const gir = holeGir(hole);
    if (gir != null) {
      totals.greenHoles += 1;
      if (gir) totals.greensHit += 1;
    }
  }
  return totals;
}

export function sumFairwayGir(list: readonly FairwayGirTotals[]): FairwayGirTotals {
  return list.reduce<FairwayGirTotals>(
    (sum, row) => ({
      fairwaysHit: sum.fairwaysHit + row.fairwaysHit,
      fairwayHoles: sum.fairwayHoles + row.fairwayHoles,
      missLeft: sum.missLeft + row.missLeft,
      missRight: sum.missRight + row.missRight,
      missShort: sum.missShort + row.missShort,
      greensHit: sum.greensHit + row.greensHit,
      greenHoles: sum.greenHoles + row.greenHoles,
    }),
    planFairwayGir([]),
  );
}

/** `7/14 · 50%`. Nothing answered → `—`. */
export function formatHitRate(hit: number, of: number): string {
  if (of <= 0) return '—';
  return `${hit}/${of} · ${Math.round((hit / of) * 100)}%`;
}

/** `3 L · 2 R · 1 short`, only the misses that happened. Empty when none. */
export function formatFairwayMisses(totals: FairwayGirTotals): string {
  const parts: string[] = [];
  if (totals.missLeft > 0) parts.push(`${totals.missLeft} L`);
  if (totals.missRight > 0) parts.push(`${totals.missRight} R`);
  if (totals.missShort > 0) parts.push(`${totals.missShort} short`);
  return parts.join(' · ');
}

/** Scorecard glyphs. Blank when unknown or par 3. */
export function fairwayGlyph(par: number | null, fairway: FairwayResult | null): string {
  if (!holeHasFairway(par) || fairway == null) return '';
  if (fairway === 'hit') return '✓';
  if (fairway === 'left') return '←';
  if (fairway === 'right') return '→';
  return '↓';
}

export function girGlyph(gir: boolean | null): string {
  if (gir == null) return '';
  return gir ? '●' : '○';
}

export function fairwayLabel(result: FairwayResult): string {
  if (result === 'hit') return 'Hit';
  if (result === 'left') return '← Left';
  if (result === 'right') return 'Right →';
  return 'Short';
}
