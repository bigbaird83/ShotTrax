/** Hole-finish putts. Stats only — never a map mark, seed, club-distance sample, or GPS invent. */

import { isPutterClubId } from './defaultBag';

export const PUTT_MAX = 5;

/** Inside this many yards-to-green (live quality) counts as near / on the green — display only. */
export const NEAR_GREEN_YD = 40;

export const PUTT_LENGTH_IDS = ['inside_3', '3_to_10', '10_to_20', 'over_20'] as const;
export type PuttLengthId = (typeof PUTT_LENGTH_IDS)[number];

export const PUTT_LENGTHS: { id: PuttLengthId; label: string }[] = [
  { id: 'inside_3', label: 'Under 3 ft' },
  { id: '3_to_10', label: '3–10' },
  { id: '10_to_20', label: '10–20' },
  { id: 'over_20', label: '20+' },
];

export type PuttDraft = {
  putts: number;
  lengths: PuttLengthId[];
};

export function emptyPuttDraft(): PuttDraft {
  return { putts: 0, lengths: [] };
}

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

export function setPuttCount(current: PuttDraft, next: number): PuttDraft {
  const putts = clampPutts(next);
  return { putts, lengths: current.lengths.slice(0, putts) };
}

/** One bucket tap adds one putt with that length (stats only). */
export function addPuttLength(current: PuttDraft, id: PuttLengthId): PuttDraft {
  if (!isPuttLengthId(id) || current.lengths.length >= PUTT_MAX) return current;
  const lengths = [...current.lengths, id];
  return { putts: lengths.length, lengths };
}

export function undoLastPutt(current: PuttDraft): PuttDraft {
  if (current.lengths.length === 0) return emptyPuttDraft();
  const lengths = current.lengths.slice(0, -1);
  return { putts: lengths.length, lengths };
}

/** Made it needs at least one user-chosen bucket. GPS counts do not count. */
export function canMakePutt(draft: PuttDraft): boolean {
  return planMadeIt(draft).ok;
}

/**
 * Made it persists only the buckets the player tapped — never a GPS-invented
 * putt count, never a fabricated distance.
 */
export function planMadeIt(
  draft: PuttDraft,
): { ok: false } | { ok: true; putts: number; lengths: PuttLengthId[] } {
  const lengths = draft.lengths.filter(isPuttLengthId);
  if (lengths.length === 0) return { ok: false };
  return { ok: true, putts: lengths.length, lengths };
}

export function isNearOrOnGreen(toGreen: { yards: number | null; quality: string }): boolean {
  return (
    toGreen.quality !== 'none' &&
    toGreen.yards != null &&
    Number.isFinite(toGreen.yards) &&
    toGreen.yards <= NEAR_GREEN_YD
  );
}

/**
 * Walking off the green / to the next tee never invents putts.
 * Near-green GPS is not a putt record.
 */
export function puttsFromWalkOff(_toGreen?: { yards: number | null; quality: string }): null {
  return null;
}

/** After Made it on the hole you are finishing: next hole, or summary after the last. */
export function holeAfterDone(
  holeNumber: number,
  holeCount: number,
): { kind: 'hole'; holeNumber: number } | { kind: 'summary' } {
  if (!Number.isFinite(holeNumber) || !Number.isFinite(holeCount) || holeNumber >= holeCount) {
    return { kind: 'summary' };
  }
  return { kind: 'hole', holeNumber: holeNumber + 1 };
}

export function finishPuttsChipLabel(holeNumber: number): string {
  return `Finish putts · Hole ${holeNumber}`;
}

/**
 * Putter tap opens the putt sheet (scoring / green play). Change-club relabel stays a club swap.
 * Never a GPS mark and never a Suggested / average sample.
 */
export function putterOpensPuttSheet(args: {
  clubId: string | null | undefined;
  relabel?: boolean;
}): boolean {
  if (args.relabel) return false;
  return isPutterClubId(args.clubId);
}

export type HolePuttStatus = {
  number: number;
  puttsDone: boolean;
  shotCount: number;
  puttCount: number;
};

/**
 * Play continues without inventing putts. A Finish-putts chip stays for holes you
 * left without Made it — never because GPS said you walked off the green.
 */
export function holesNeedingPutts(
  holes: HolePuttStatus[],
  currentHoleNumber: number,
): HolePuttStatus[] {
  return holes.filter((hole) => {
    if (hole.puttsDone) return false;
    if (hole.number === currentHoleNumber) return false;
    const played = hole.shotCount > 0 || hole.puttCount > 0;
    return played;
  });
}

/** Made it on a past hole (chip) stays put; Made it on the hole you are on advances. */
export function madeItAdvancesHole(args: {
  sheetHoleNumber: number;
  currentHoleNumber: number;
}): boolean {
  return args.sheetHoleNumber === args.currentHoleNumber;
}

/**
 * After Made it (or arriving on a fresh hole), Pick a club still marks GPS.
 * Opening the putt sheet skips this so Putter is never a silent mark.
 */
export function shouldAutoOpenClubPick(args: {
  readOnly: boolean;
  shotCount: number;
  openingPutts?: boolean;
}): boolean {
  if (args.readOnly || args.openingPutts) return false;
  return args.shotCount === 0;
}
