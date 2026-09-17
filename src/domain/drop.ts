import type { PenaltyReason } from './types';

export type DropKind = 'drop' | 'penalty';

/**
 * A drop relocates the ball (GPS) and adds a penalty stroke.
 * It is never a distance shot — no averages / top-3 sample.
 */
export function planDrop(args: {
  reason: PenaltyReason;
  note?: string | null;
  strokes?: number;
}): {
  kind: 'drop';
  strokes: number;
  reason: PenaltyReason;
  note: string | null;
  isDistanceShot: false;
} {
  const strokes = args.strokes == null ? 1 : Math.min(5, Math.max(1, Math.floor(args.strokes)));
  return {
    kind: 'drop',
    strokes,
    reason: args.reason,
    note: args.note?.trim() || null,
    isDistanceShot: false,
  };
}

export function formatDropRow(args: {
  kind?: DropKind | null;
  strokes: number;
  reasonLabel: string;
  note: string | null;
}): string {
  const note = args.note?.trim();
  const body = note ? `${args.reasonLabel} · ${note}` : args.reasonLabel;
  if (args.kind === 'drop') return `Drop +${args.strokes} · ${body}`;
  return `+${args.strokes} ${body}`;
}
