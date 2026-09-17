import type { PenaltyReason } from './types';

export const PENALTY_REASONS: { reason: PenaltyReason; label: string }[] = [
  { reason: 'water', label: 'Water' },
  { reason: 'ob', label: 'OB' },
  { reason: 'unplayable', label: 'Unplayable' },
  { reason: 'other', label: 'Other' },
];

export const MIN_PENALTY_STROKES = 1;
export const MAX_PENALTY_STROKES = 5;

export function clampPenaltyStrokes(n: number): number {
  if (!Number.isFinite(n)) return MIN_PENALTY_STROKES;
  return Math.min(MAX_PENALTY_STROKES, Math.max(MIN_PENALTY_STROKES, Math.floor(n)));
}

/**
 * Hole score is the scorecard source of truth. Adding a penalty bumps it by N
 * strokes (same base as the hole +/− control: current score, or course par if
 * unset). If par is also unknown (`par ?`), the bump starts from 0 — never invent par.
 *
 * A penalty is NOT a Shot for distance: it never goes through acceptFix,
 * haversine, club averages, or top-3 samples.
 */
export function scoreAfterPenalty(
  currentScore: number | null,
  par: number | null,
  strokes: number,
): number {
  const n = clampPenaltyStrokes(strokes);
  return (currentScore ?? par ?? 0) + n;
}

export function totalPenaltyStrokes(penalties: { strokes: number }[]): number {
  return penalties.reduce((sum, p) => sum + p.strokes, 0);
}

export function penaltyReasonLabel(reason: PenaltyReason): string {
  return PENALTY_REASONS.find((r) => r.reason === reason)?.label ?? 'Other';
}

export function formatPenaltyRow(penalty: {
  strokes: number;
  reason: PenaltyReason;
  note: string | null;
  kind?: 'drop' | 'penalty' | null;
}): string {
  const label = penaltyReasonLabel(penalty.reason);
  const note = penalty.note?.trim();
  const reasonText =
    penalty.reason === 'other' && note ? note : note ? `${label} · ${note}` : label;
  if (penalty.kind === 'drop') return `Drop +${penalty.strokes} · ${reasonText}`;
  return `+${penalty.strokes} ${reasonText}`;
}
