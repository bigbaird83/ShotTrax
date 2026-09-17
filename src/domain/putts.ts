/** Hole-finish putts. Stats only — never a map mark, seed, or club-distance sample. */

export const PUTT_MAX = 5;

/** Inside this many yards-to-green (live quality) counts as near / on the green. */
export const NEAR_GREEN_YD = 40;

export const PUTT_LENGTH_IDS = ['inside_3', '3_to_10', '10_to_20', 'over_20'] as const;
export type PuttLengthId = (typeof PUTT_LENGTH_IDS)[number];

export const PUTT_LENGTHS: { id: PuttLengthId; label: string }[] = [
  { id: 'inside_3', label: '≤3′' },
  { id: '3_to_10', label: '3–10′' },
  { id: '10_to_20', label: '10–20′' },
  { id: 'over_20', label: '20′+' },
];

export function clampPutts(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PUTT_MAX, Math.round(n)));
}

export function isPuttLengthId(value: string): value is PuttLengthId {
  return (PUTT_LENGTH_IDS as readonly string[]).includes(value);
}

export function parsePuttLengths(raw: string | null | undefined): PuttLengthId[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(isPuttLengthId)
    .slice(0, PUTT_MAX);
}

export function serializePuttLengths(ids: PuttLengthId[]): string {
  return ids.filter(isPuttLengthId).slice(0, PUTT_MAX).join(',');
}

export function setPuttCount(
  current: { putts: number; lengths: PuttLengthId[] },
  next: number,
): { putts: number; lengths: PuttLengthId[] } {
  const putts = clampPutts(next);
  return { putts, lengths: current.lengths.slice(0, putts) };
}

/** One-tap length bucket adds a putt with that length (stats only). */
export function addPuttLength(
  current: { putts: number; lengths: PuttLengthId[] },
  id: PuttLengthId,
): { putts: number; lengths: PuttLengthId[] } {
  if (!isPuttLengthId(id) || current.putts >= PUTT_MAX) return current;
  return { putts: current.putts + 1, lengths: [...current.lengths, id] };
}

export function isNearOrOnGreen(toGreen: { yards: number | null; quality: string }): boolean {
  return (
    toGreen.quality !== 'none' &&
    toGreen.yards != null &&
    Number.isFinite(toGreen.yards) &&
    toGreen.yards <= NEAR_GREEN_YD
  );
}

/** After Hole done: next hole number, or summary when the card is finished. */
export function holeAfterDone(
  holeNumber: number,
  holeCount: number,
): { kind: 'hole'; holeNumber: number } | { kind: 'summary' } {
  if (!Number.isFinite(holeNumber) || !Number.isFinite(holeCount) || holeNumber >= holeCount) {
    return { kind: 'summary' };
  }
  return { kind: 'hole', holeNumber: holeNumber + 1 };
}
