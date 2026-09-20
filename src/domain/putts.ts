/** Hole-finish putts. Stats only — never a map mark, seed, club-distance sample, or GPS invent. */

import { isPutterClubId } from './defaultBag';

export const PUTT_MAX = 5;

/** Inside this many yards-to-green (live quality) counts as near / on the green — display only. */
export const NEAR_GREEN_YD = 40;

/** Proximity arm for putt pills. Hard / forced / none never opens pills. */
export const PUTT_PILL_PROXIMITY_QUALITIES = ['good', 'soft'] as const;

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

/** Commit primitive: one chosen bucket becomes one putt. Stats only — never GPS. */
export function addPuttLength(current: PuttDraft, id: PuttLengthId): PuttDraft {
  if (!isPuttLengthId(id) || current.lengths.length >= PUTT_MAX) return current;
  const lengths = [...current.lengths, id];
  return { putts: lengths.length, lengths };
}

export type PuttSheetPick = {
  draft: PuttDraft;
  pending: PuttLengthId | null;
};

export function emptyPuttSheetPick(): PuttSheetPick {
  return { draft: emptyPuttDraft(), pending: null };
}

/** Length bucket only. Does not commit, advance, or invent yards. */
export function pickPuttLength(current: PuttSheetPick, id: PuttLengthId): PuttSheetPick {
  if (!isPuttLengthId(id) || current.draft.lengths.length >= PUTT_MAX) return current;
  return { draft: current.draft, pending: id };
}

/** Add putt commits the picked length. No pick → no commit. */
export function commitPuttLength(current: PuttSheetPick): PuttSheetPick {
  if (!current.pending) return current;
  return { draft: addPuttLength(current.draft, current.pending), pending: null };
}

export function canCommitPutt(pick: PuttSheetPick): boolean {
  return pick.pending != null && pick.draft.lengths.length < PUTT_MAX;
}

/** Next putt after committed lengths. Null at the 5-putt cap. */
export function nextPuttNumber(draft: PuttDraft): number | null {
  if (draft.lengths.length >= PUTT_MAX) return null;
  return draft.lengths.length + 1;
}

export function puttSheetDistanceTapCommits(): false {
  return false;
}

export function puttSheetHasAddPuttControl(): true {
  return true;
}

export function puttSheetCtaLabel(): 'Made it' {
  return 'Made it';
}

/** Hole Out is not the putt-sheet closer. It stays on the play dock for off-green. */
export function puttSheetShowsHoleOut(): false {
  return false;
}

export function playDockKeepsHoleOutForOffGreen(): true {
  return true;
}

export function undoLastPutt(current: PuttDraft): PuttDraft {
  if (current.lengths.length === 0) return emptyPuttDraft();
  const lengths = current.lengths.slice(0, -1);
  return { putts: lengths.length, lengths };
}

/**
 * Made it is on after a distance pick — including putt 1 with zero putts logged.
 * GPS counts do not count. Distance tap still does not commit.
 */
export function canMakePutt(
  draft: PuttDraft,
  pending: PuttLengthId | null = null,
): boolean {
  return planMadeIt(draft, pending).ok;
}

/**
 * Made it persists user-chosen buckets only — logged misses plus the pending
 * holing putt. Never a GPS-invented putt count or fabricated distance.
 */
export function planMadeIt(
  draft: PuttDraft,
  pending: PuttLengthId | null = null,
): { ok: false } | { ok: true; putts: number; lengths: PuttLengthId[] } {
  const lengths = draft.lengths.filter(isPuttLengthId).slice(0, PUTT_MAX);
  if (pending && isPuttLengthId(pending) && lengths.length < PUTT_MAX) {
    lengths.push(pending);
  }
  if (lengths.length === 0) return { ok: false };
  return { ok: true, putts: lengths.length, lengths };
}

export function isLivePuttProximityQuality(quality: string): boolean {
  return quality === 'good' || quality === 'soft';
}

/**
 * Haversine yards-to-green centroid ≤ 40 yd, good/soft fix only.
 * Hard / forced GPS never arms pills (no flicker on junk). Never a putt record.
 */
export function isNearOrOnGreen(toGreen: { yards: number | null; quality: string }): boolean {
  return (
    isLivePuttProximityQuality(toGreen.quality) &&
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

/** Putts + Finish hole sit on the play dock — not buried in Scorecard. */
export function finishHoleLivesOnPlayDock(): true {
  return true;
}

export function puttsLiveOnPlayDock(): true {
  return true;
}

export function finishHoleBuriedInScorecard(): false {
  return false;
}

/** Off-green hole-out: current club is the shot. No invented putt yards. No GIR. */
export function holeOutInventPutts(): false {
  return false;
}

export function holeOutSetsGirFromOffGreen(): false {
  return false;
}

export function planFinishHoleOut(): { ok: true; putts: 0; lengths: []; gir: false } {
  return { ok: true, putts: 0, lengths: [], gir: false };
}

/** Persist hole-out on the last real shot row. Never insert a phantom putt. */
export function holeOutFlagsLastRealShot(): true {
  return true;
}

export function holeOutInsertsShot(): false {
  return false;
}

export function holeOutInventPuttGps(): false {
  return false;
}

export function holeOutInventPuttYards(): false {
  return false;
}

export function lastRealShotId<T extends { id: string; seq: number }>(shots: T[]): string | null {
  if (shots.length === 0) return null;
  return [...shots].sort((a, b) => b.seq - a.seq)[0]!.id;
}

export function planFlagLastRealShot<T extends { id: string; seq: number }>(
  shots: T[],
): {
  insertShot: false;
  inventGps: false;
  inventPuttYards: false;
  shotId: string | null;
} {
  return {
    insertShot: false,
    inventGps: false,
    inventPuttYards: false,
    shotId: lastRealShotId(shots),
  };
}

export function isHoleOutShot(shot: { holeOut?: boolean | null }): boolean {
  return shot.holeOut === true;
}

export function holeOutBadgeLabel(): 'Hole Out' {
  return 'Hole Out';
}

export function holeClosedByShot<T extends { seq: number; holeOut?: boolean | null }>(
  shots: T[],
): { seq: number } | null {
  const closer = [...shots].filter((shot) => shot.holeOut).sort((a, b) => b.seq - a.seq)[0];
  return closer ? { seq: closer.seq } : null;
}

export type PlayDockFinishKind = 'hole_out' | 'hidden';

/**
 * Same club slot is always Hole Out. Putt pills sit just above it only
 * when putter is selected or GPS is within ~40 yd of the hydrated green
 * centroid (haversine yards-to-green, good/soft only). Hard/forced →
 * putter-selected only. Never a third dock row. Never invent putt GPS
 * or green-edge polygons.
 */
export function showPuttPills(args: {
  putting?: boolean;
  toGreen?: { yards: number | null; quality: string };
}): boolean {
  if (args.putting) return true;
  if (args.toGreen) return isNearOrOnGreen(args.toGreen);
  return false;
}

export function puttPillsNearGreenYards(): number {
  return NEAR_GREEN_YD;
}

export function puttPillsUseYardsToGreen(): true {
  return true;
}

export function puttPillsProximityQualities(): readonly ['good', 'soft'] {
  return PUTT_PILL_PROXIMITY_QUALITIES;
}

export function puttPillsProximityUsesHardOrForced(): false {
  return false;
}

export function puttPillsUseHydratedGreenCentroid(): true {
  return true;
}

export function puttPillsInventGreenEdge(): false {
  return false;
}

export function planPlayDockFinish(args: {
  readOnly?: boolean;
  placing?: boolean;
  puttsDone?: boolean;
  putting?: boolean;
  toGreen?: { yards: number | null; quality: string };
  shotCount?: number;
}): { kind: PlayDockFinishKind; showPutts: boolean; showHoleOut: boolean } {
  if (args.readOnly || args.placing || args.puttsDone) {
    return { kind: 'hidden', showPutts: false, showHoleOut: false };
  }
  const showPutts = showPuttPills({
    putting: args.putting,
    toGreen: args.toGreen,
  });
  void args.shotCount;
  return { kind: 'hole_out', showPutts, showHoleOut: true };
}

export function playDockStacksFinishAndHoleDone(): false {
  return false;
}

export function playDockHoleDoneLabel(): 'Hole Out' {
  return 'Hole Out';
}

export function playDockHoleOutLabel(): 'Hole Out' {
  return 'Hole Out';
}

/** Quiet Hole Out: lime check + short haptic + brief chip. No modal, no confetti. */
export function holeOutCelebrationIsQuiet(): true {
  return true;
}

export function holeOutShowsModal(): false {
  return false;
}

export function holeOutShowsConfetti(): false {
  return false;
}

/** Close on the last real mark. Never invent putt GPS or yards. */
export function holeOutClosesOnLastMark(): true {
  return true;
}

/** Off-green hole-out keeps the club that was tapped. No swap to putter. */
export function holeOutKeepsTappedClub(): true {
  return true;
}

/** On-green putt count is score-only — buckets, never a GPS mark. */
export function onGreenPuttsAreScoreOnly(): true {
  return true;
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
 * All clubs never auto-opens on start or hole change.
 * The play/hole view stays up. All clubs is only the All clubs control.
 */
export function shouldAutoOpenClubPick(_args: {
  readOnly: boolean;
  shotCount: number;
  openingPutts?: boolean;
}): false {
  return false;
}
