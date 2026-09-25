/**
 * Display order for a hole's shots and penalty strokes.
 * Does not score, renumber, or write. A penalty is never a swing.
 *
 * Stored penalties have `createdAt` and no after-shot index. When that time
 * parses, the penalty sits after the latest shot whose `startedAt` (or
 * `endedAt` if the start is missing) is at or before it. An explicit
 * `afterShotId` / `afterShotSeq` on the row wins over the timestamp. If the
 * row has neither a usable attachment nor a usable time, it goes at the end
 * of that hole's shots.
 */

import type { PenaltyReason } from './types';
import { formatPenaltyRow } from './penalty';
import { COPY, formatPuttCount, formatShotCount } from './playerCopy';

export type HoleStepShot = {
  id?: string | null;
  seq?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type HoleStepPenalty = {
  id?: string | null;
  strokes?: number | null;
  reason?: string | null;
  note?: string | null;
  kind?: string | null;
  createdAt?: string | null;
  /** Not stored today. Used when a row carries an attachment. */
  afterShotId?: string | null;
  /** Not stored today. Used when a row carries an after-shot seq. */
  afterShotSeq?: number | null;
};

export type OrderedHoleStep =
  | { kind: 'shot'; id: string; sourceIndex: number }
  | { kind: 'penalty'; id: string; label: string; strokes: number; sourceIndex: number };

function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function shotTime(shot: HoleStepShot): number | null {
  return parseTime(shot.startedAt) ?? parseTime(shot.endedAt);
}

function asReason(reason: string | null | undefined): PenaltyReason {
  if (reason === 'water' || reason === 'ob' || reason === 'unplayable' || reason === 'other') return reason;
  return 'other';
}

function penaltyStrokeCount(penalty: HoleStepPenalty): number {
  const strokes = penalty.strokes;
  if (typeof strokes !== 'number' || !Number.isFinite(strokes)) return 0;
  return strokes;
}

/** Same words the penalty row already uses. Never a club or a yardage. */
export function penaltyStepLabel(penalty: HoleStepPenalty): string {
  return formatPenaltyRow({
    strokes: penaltyStrokeCount(penalty),
    reason: asReason(penalty.reason),
    note: typeof penalty.note === 'string' ? penalty.note : null,
    kind: penalty.kind === 'drop' ? 'drop' : 'penalty',
  });
}

/**
 * `null` when there is nothing to say, so the count line can omit the piece.
 * The number is penalty strokes, so shots + penalties + putts can add up.
 */
export function formatPenaltyCount(strokes: number | null | undefined): string | null {
  if (typeof strokes !== 'number' || !Number.isFinite(strokes)) return null;
  const count = Math.max(0, Math.round(strokes));
  if (count === 0) return null;
  return count === 1 ? '1 penalty' : `${count} penalties`;
}

/** Shot · penalty · putt pieces. Yards stay with the caller. */
export function formatHoleCountLine(args: {
  shotCount: number;
  penaltyStrokes?: number | null;
  puttCount: number;
  /** Summary hides "0 putts". The finished-hole chip always shows putts. */
  omitZeroPutts?: boolean;
}): string {
  const penalty = formatPenaltyCount(args.penaltyStrokes ?? 0);
  const puttCount = typeof args.puttCount === 'number' && Number.isFinite(args.puttCount) ? args.puttCount : 0;
  const showPutts = args.omitZeroPutts ? puttCount > 0 : true;
  return [formatShotCount(args.shotCount), penalty, showPutts ? formatPuttCount(puttCount) : null]
    .filter(Boolean)
    .join(' · ');
}

/** Round-screen chip text for a real shot: `1 8i · 170 yd`. */
export function formatShotStepChip(args: {
  seq: number;
  clubShortName?: string | null;
  source?: string | null;
  fixQuality?: string | null;
  endedAt?: string | null;
  distanceYards?: number | null;
}): string {
  const noGps = args.source === 'no_gps' || args.fixQuality === 'none';
  const yards = noGps
    ? COPY.logged
    : args.endedAt == null
      ? COPY.inPlay
      : `${args.distanceYards ?? '—'} yd`;
  const seq = typeof args.seq === 'number' && Number.isFinite(args.seq) ? args.seq : '—';
  return `${seq} ${args.clubShortName ?? 'Club'} · ${yards}`;
}

function anchorAfterShot(penalty: HoleStepPenalty, shots: readonly HoleStepShot[]): number {
  const afterId = typeof penalty.afterShotId === 'string' ? penalty.afterShotId.trim() : '';
  if (afterId) {
    const found = shots.findIndex((shot) => shot.id === afterId);
    if (found >= 0) return found;
  }
  if (typeof penalty.afterShotSeq === 'number' && Number.isFinite(penalty.afterShotSeq)) {
    const found = shots.findIndex((shot) => shot.seq === penalty.afterShotSeq);
    if (found >= 0) return found;
  }
  const at = parseTime(penalty.createdAt);
  if (at == null) return shots.length - 1;
  let anchor = -1;
  let anyShotTime = false;
  for (let i = 0; i < shots.length; i++) {
    const time = shotTime(shots[i]);
    if (time == null) continue;
    anyShotTime = true;
    if (time <= at) anchor = i;
  }
  if (!anyShotTime) return shots.length - 1;
  return anchor;
}

/**
 * Shots stay in the order given (seq order from the hole). Penalties are
 * inserted around them. Every penalty is returned; none are dropped.
 */
export function orderHoleSteps(
  shots: readonly HoleStepShot[] | null | undefined,
  penalties: readonly HoleStepPenalty[] | null | undefined,
): OrderedHoleStep[] {
  const shotList = Array.isArray(shots) ? shots : [];
  const penaltyList = Array.isArray(penalties) ? penalties : [];
  const buckets: { penalty: HoleStepPenalty; index: number }[][] = Array.from(
    { length: shotList.length + 1 },
    () => [],
  );
  for (let index = 0; index < penaltyList.length; index++) {
    const penalty = penaltyList[index];
    const anchor = anchorAfterShot(penalty, shotList);
    buckets[anchor + 1].push({ penalty, index });
  }
  for (const bucket of buckets) {
    bucket.sort((a, b) => {
      const aTime = parseTime(a.penalty.createdAt);
      const bTime = parseTime(b.penalty.createdAt);
      const aKey = aTime ?? Number.POSITIVE_INFINITY;
      const bKey = bTime ?? Number.POSITIVE_INFINITY;
      if (aKey !== bKey) return aKey - bKey;
      return a.index - b.index;
    });
  }

  const steps: OrderedHoleStep[] = [];
  const pushPenalty = (row: { penalty: HoleStepPenalty; index: number }) => {
    const id = typeof row.penalty.id === 'string' && row.penalty.id.trim() ? row.penalty.id : `penalty-${row.index}`;
    steps.push({
      kind: 'penalty',
      id,
      label: penaltyStepLabel(row.penalty),
      strokes: penaltyStrokeCount(row.penalty),
      sourceIndex: row.index,
    });
  };
  const pushShot = (shot: HoleStepShot, index: number) => {
    const id = typeof shot.id === 'string' && shot.id.trim() ? shot.id : `shot-${index}`;
    steps.push({ kind: 'shot', id, sourceIndex: index });
  };

  for (const row of buckets[0]) pushPenalty(row);
  for (let i = 0; i < shotList.length; i++) {
    pushShot(shotList[i], i);
    for (const row of buckets[i + 1]) pushPenalty(row);
  }
  return steps;
}

/** Penalties that did not land in the ordered list. Callers keep the old tag for these. */
export function penaltiesMissingFromSteps<T>(
  penalties: readonly T[] | null | undefined,
  steps: readonly OrderedHoleStep[] | null | undefined,
): T[] {
  const list = Array.isArray(penalties) ? penalties : [];
  const shown = new Set(
    (Array.isArray(steps) ? steps : [])
      .filter((step): step is Extract<OrderedHoleStep, { kind: 'penalty' }> => step.kind === 'penalty')
      .map((step) => step.sourceIndex),
  );
  return list.filter((_, index) => !shown.has(index));
}
