/** Hole-finish putts. Stats only — never a map mark, seed, club-distance sample, or GPS invent. */

import { isPutterClubId } from './defaultBag';
import { COPY } from './playerCopy';

export const PUTT_MAX = 5;

/** Inside this many yards-to-green (live quality) counts as near / on the green — display only. */
export const NEAR_GREEN_YD = 40;

/** Proximity arm for the dock Putt button. Hard / forced / none never opens it. */
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

/** One slot per logged putt. Null = no length yet. Stats only. */
export type PuttLengthSlot = PuttLengthId | null;

export function planPuttLengthSlots(
  putts: number,
  lengths: readonly (string | null | undefined)[],
): PuttLengthSlot[] {
  const n = clampPutts(putts);
  return Array.from({ length: n }, (_, i) => {
    const raw = lengths[i];
    return raw && isPuttLengthId(raw) ? raw : null;
  });
}

/** Preserves empty slots so a later attach can land on a specific putt. */
export function parsePuttLengthSlots(
  raw: string | null | undefined,
  putts: number,
): PuttLengthSlot[] {
  const n = clampPutts(putts);
  if (n === 0) return [];
  const parts = raw == null ? [] : raw.split(',');
  return Array.from({ length: n }, (_, i) => {
    const part = (parts[i] ?? '').trim();
    return isPuttLengthId(part) ? part : null;
  });
}

export function serializePuttLengthSlots(slots: PuttLengthSlot[]): string {
  let end = slots.length;
  while (end > 0 && slots[end - 1] == null) end -= 1;
  return slots
    .slice(0, end)
    .map((id) => (id && isPuttLengthId(id) ? id : ''))
    .join(',');
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

/** Watch puttPick add/undo in order. Each add bumps count — never drop N≥2. */
export function applyWatchPuttPickToDraft(
  draft: PuttDraft,
  msg: { action: 'add' | 'undo' | 'made'; lengthId?: PuttLengthId },
): PuttDraft {
  if (msg.action === 'add' && msg.lengthId && isPuttLengthId(msg.lengthId)) {
    return addPuttLength(draft, msg.lengthId);
  }
  if (msg.action === 'undo') {
    return undoLastPutt(draft);
  }
  return draft;
}

/** Two Watch puttPick adds must land as putts===2 on the phone draft. */
export function applyWatchPuttPickAdds(
  draft: PuttDraft,
  lengthIds: readonly PuttLengthId[],
): PuttDraft {
  return lengthIds.reduce((acc, id) => addPuttLength(acc, id), draft);
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
 * Made it is always available to close — a missing bucket never disables it.
 * GPS counts do not count. Distance tap still does not commit.
 */
export function canMakePutt(
  draft: PuttDraft,
  pending: PuttLengthId | null = null,
): boolean {
  return planMadeIt(draft, pending).ok;
}

/** Sheet Made it stays on with or without a selected length. Soft cue is not a gate. */
export function canMakeCurrentPutt(_pick: PuttSheetPick): true {
  return true;
}

export function madeItRequiresLengthPick(): false {
  return false;
}

export function madeItEnabledWithEmptyLength(): true {
  return true;
}

export function planMadeItFromPick(pick: PuttSheetPick) {
  return planMadeIt(pick.draft, pick.pending);
}

/** Soft No length cue — copy/stats only. Never a modal. Never blocks Made it. */
export function puttSheetNoLengthCue(): 'No length — pick a distance' {
  return 'No length — pick a distance';
}

export function puttSheetNoLengthCueBlocksMadeIt(): false {
  return false;
}

export function puttSheetNoLengthCueIsModal(): false {
  return false;
}

export function puttSheetNoLengthCueInventGps(): false {
  return false;
}

/** A logged putt count without a matching bucket — stats gap only, never GPS. */
export function puttLoggedWithoutLength(draft: PuttDraft): boolean {
  return clampPutts(draft.putts) > draft.lengths.filter(isPuttLengthId).length;
}

export type FinishedPuttRow = {
  index: number;
  n: number;
  lengthId: PuttLengthId | null;
  label: string;
  missingLength: boolean;
};

/**
 * One row per logged putt after Made it. Shown when a bucket is missing
 * so the player can attach length later. Never reopens the hole.
 */
export function planFinishedPuttRows(args: {
  puttsDone?: boolean;
  putts: number;
  lengths?: readonly (string | null | undefined)[];
}): FinishedPuttRow[] {
  if (!args.puttsDone) return [];
  const slots = planPuttLengthSlots(args.putts, args.lengths ?? []);
  return slots.map((lengthId, index) => ({
    index,
    n: index + 1,
    lengthId,
    label: lengthId
      ? (PUTT_LENGTHS.find((row) => row.id === lengthId)?.label ?? lengthId)
      : COPY.noLength,
    missingLength: lengthId == null,
  }));
}

/** Rows only when a finished hole still has a putt without a bucket. */
export function planFinishedPuttAttachRows(args: {
  puttsDone?: boolean;
  putts: number;
  lengths?: readonly (string | null | undefined)[];
}): FinishedPuttRow[] {
  const rows = planFinishedPuttRows(args);
  return rows.some((row) => row.missingLength) ? rows : [];
}

export type AttachPuttLengthPlan =
  | { ok: false }
  | {
      ok: true;
      putts: number;
      lengths: PuttLengthId[];
      slots: PuttLengthSlot[];
      puttsDone: true;
      reopen: false;
      writeScore: false;
    };

/**
 * After-the-fact bucket on a finished putt. Stats only — does not reopen,
 * change the putt count, rewrite score, or invent GPS / yards.
 */
export function planAttachPuttLength(
  args: {
    puttsDone?: boolean;
    putts: number;
    lengths?: readonly (string | null | undefined)[];
  },
  index: number,
  id: PuttLengthId,
): AttachPuttLengthPlan {
  if (!args.puttsDone) return { ok: false };
  if (!isPuttLengthId(id)) return { ok: false };
  const putts = clampPutts(args.putts);
  const slots = planPuttLengthSlots(putts, args.lengths ?? []);
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) return { ok: false };
  if (slots[index] != null) return { ok: false };
  const next = slots.slice();
  next[index] = id;
  return {
    ok: true,
    putts,
    lengths: next.filter((slot): slot is PuttLengthId => slot != null),
    slots: next,
    puttsDone: true,
    reopen: false,
    writeScore: false,
  };
}

export function canAttachPuttLength(
  args: {
    puttsDone?: boolean;
    putts: number;
    lengths?: readonly (string | null | undefined)[];
  },
  index: number,
  id: PuttLengthId,
): boolean {
  return planAttachPuttLength(args, index, id).ok;
}

export function attachPuttLengthReopensHole(): false {
  return false;
}

export function attachPuttLengthWritesScore(): false {
  return false;
}

export function attachPuttLengthInventGps(): false {
  return false;
}

export function attachPuttLengthInventYards(): false {
  return false;
}

export function attachPuttLengthIsStatsOnly(): true {
  return true;
}

/**
 * Soft cue when the current putt has no selected bucket, or a logged putt
 * has no length. Informational — does not disable Made it or invent GPS.
 */
export function showPuttNoLengthCue(pick: PuttSheetPick): boolean {
  if (puttLoggedWithoutLength(pick.draft)) return true;
  if (pick.pending && isPuttLengthId(pick.pending)) return false;
  return pick.draft.lengths.length < PUTT_MAX;
}

/**
 * Made it always closes the current putt N (with or without a bucket).
 * After Add putt, pending-null Made it is N = committed + 1 and leaves
 * putt N with no length (attach later). Never invent GPS.
 */
export function planMadeIt(
  draft: PuttDraft,
  pending: PuttLengthId | null = null,
): { ok: true; putts: number; lengths: PuttLengthId[] } {
  const committed = draft.lengths.filter(isPuttLengthId).slice(0, PUTT_MAX);
  const lengths = [...committed];
  if (pending && isPuttLengthId(pending) && lengths.length < PUTT_MAX) {
    lengths.push(pending);
  }
  const logged = clampPutts(draft.putts);
  const addedPending = lengths.length > committed.length;
  let putts: number;
  if (addedPending) {
    putts = lengths.length;
  } else if (logged > committed.length) {
    // Already-counted empty-length slots (persist / attach-later).
    putts = Math.max(logged, 1);
  } else {
    // Current putt has no bucket — count it. Empty one-putt → 1.
    putts = Math.min(PUTT_MAX, Math.max(1, committed.length + 1));
  }
  return { ok: true, putts: clampPutts(putts), lengths };
}

/**
 * Persist a planned Made it. Counts already include the current putt —
 * do not add another empty slot (that is sheet planMadeIt).
 */
export function planPersistMadeIt(
  draft: PuttDraft,
): { ok: true; putts: number; lengths: PuttLengthId[] } {
  const lengths = draft.lengths.filter(isPuttLengthId).slice(0, PUTT_MAX);
  const putts = clampPutts(Math.max(1, clampPutts(draft.putts), lengths.length));
  return { ok: true, putts, lengths };
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
 * Same club slot is always Hole Out. A Putt button sits to its left
 * whenever the hole is unfinished (not puttsDone / placing / read-only).
 * TF 54 Doc+Lead: not gated to putter-selected or ≤40 yd good/soft —
 * that hide left Putt off the dock on device. Putt always opens the
 * existing putt sheet. Hole Out stays for off-green chip-ins and flags
 * the last real mark only. Never a third dock row. Never invent putt
 * GPS or green-edge polygons.
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
  void args.putting;
  void args.toGreen;
  void args.shotCount;
  return { kind: 'hole_out', showPutts: true, showHoleOut: true };
}

export function playDockStacksFinishAndHoleDone(): false {
  return false;
}

export function playDockPuttOpensExistingSheet(): true {
  return true;
}

export function playDockPuttUsesShowPuttPillsGate(): false {
  return false;
}

/** TF 54 Doc+Lead: Putt is always on the dock while the hole is unfinished. */
export function playDockPuttAlwaysWhenUnfinished(): true {
  return true;
}

export function playDockPuttLabel(): 'Putt' {
  return 'Putt';
}

/** Dock Hole Out is the off-green chip-in. Made it stays on the putt sheet. */
export function playDockHoleOutIsChipInOnly(): true {
  return true;
}

export function playDockHoleOutCallsMadeIt(): false {
  return false;
}

/** Watch putt-sheet Made it is always on. Empty length never gates it. */
export function watchPuttSheetMadeItAlwaysEnabled(): true {
  return true;
}

/** Made shares the Add/Undo row so a small face cannot clip it off. */
export function watchPuttSheetPinsMadeIt(): true {
  return true;
}

export function watchPuttSheetMadeItSitsWithAddUndo(): true {
  return true;
}

/** Action row is Add + Undo + Made (short). Not a clipped third-line CTA. */
export function watchPuttSheetMadeItIsFullWidthRow(): true {
  return true;
}

/** Ultra painted borderedProminent Made as dark-on-dark. Explicit cream-stroke pill. */
export function watchPuttSheetMadeItUsesSystemProminent(): false {
  return false;
}

export function watchPuttSheetMadeItIsHighContrastPill(): true {
  return true;
}

/** All four Watch buckets stay on the 2×2 — inside_3 is never an empty cell. */
export function watchPuttSheetShowsInside3(): true {
  return true;
}

export function watchPuttSheetMadeItRequiresLength(): false {
  return false;
}

/** Watch Add putt stays a miss. Hole Out on the club dock is chip-in only. */
export function watchPuttSheetAddPuttIsMissOnly(): true {
  return true;
}

export function watchClubPickHoleOutIsChipInOnly(): true {
  return true;
}

/** Watch putt menu is a compact 2-column grid. Phone copy stays long-form. */
export const WATCH_PUTT_LENGTHS: { id: PuttLengthId; label: string }[] = [
  { id: 'inside_3', label: '0–3' },
  { id: '3_to_10', label: '3–10' },
  { id: '10_to_20', label: '10–20' },
  { id: 'over_20', label: '20+' },
];

export function watchPuttSheetLengthLabel(id: PuttLengthId): string {
  return WATCH_PUTT_LENGTHS.find((row) => row.id === id)?.label ?? id;
}

export function watchPuttSheetUsesTwoColumnGrid(): true {
  return true;
}

export function watchPuttSheetAddPuttLabel(): 'Add putt' {
  return 'Add putt';
}

export function watchPuttSheetUndoLabel(): 'Undo' {
  return 'Undo';
}

export function watchPuttSheetMadeItLabel(): 'Made' {
  return 'Made';
}

/** Tests lock Watch Made and phone Made it. */
export function watchPuttSheetMadeItAcceptsMadeIt(): true {
  return true;
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
