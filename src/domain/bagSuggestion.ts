import { shotsForClubAverage, type AverageShot } from './averages';
import { resolveBagCarry } from './bagDistance';
import { isPutterClubId } from './defaultBag';
import { yardsToNearestGreenPoint } from './yardsToNearestGreenPoint';

/**
 * How many of the most recent dropped shots must agree before the bag offers
 * a new typed carry. The 20% keep/drop rule in averages.ts is not involved.
 */
const SUGGESTION_SAMPLES = 5;

/** Each of those shots must sit within this fraction of their own mean. */
const SUGGESTION_TIGHT_RATIO = 0.1;

/** A cluster under half the typed (else estimated) baseline is not a full swing. */
const SUGGESTION_MIN_OF_BASELINE = 0.5;

/**
 * A start this close to the nearest saved green point (front, center, or back)
 * is a chip. Skipped when the shot has no start, or the hole has none of those
 * points — never estimate a green, never read an OSM outline.
 */
const GREEN_CHIP_YARDS = 30;

/** Settings row. Value is JSON `{ [clubId]: newestCandidateShotId }`. */
export const BAG_CARRY_SUGGESTION_DISMISS_KEY = 'bag_carry_suggestion_dismiss';

/**
 * One eligible shot, oldest first — the same list `listClubAverages` builds
 * (`includeInDistanceAverages` + `confirmUndoShotEntersAverage`).
 * Green points are the hole's saved front, center (`green_lat`/`green_lng`), and back.
 */
export type BagSuggestionShot = AverageShot & {
  id: string;
  startLat: number | null;
  startLng: number | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenLat: number | null;
  greenLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
};

export type BagCarrySuggestion = {
  yards: number;
  sampleCount: 5;
  /** Newest of the five candidates. Not now is stored as club id + this id. */
  newestShotId: string;
};

function positive(yards: number | null | undefined): yards is number {
  return yards != null && Number.isFinite(yards) && yards > 0;
}

/** Typed carry, else the carryFill estimate. Stock / seed yards are not a baseline. */
function suggestionBaseline(
  typedCarryYards: number | null,
  estimatedCarryYards: number | null,
): number | null {
  if (positive(typedCarryYards)) return typedCarryYards;
  if (positive(estimatedCarryYards)) return estimatedCarryYards;
  return null;
}

function pair(lat: number | null, lng: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function startsInsideGreenChip(shot: BagSuggestionShot): boolean {
  const yards = yardsToNearestGreenPoint(pair(shot.startLat, shot.startLng), {
    front: pair(shot.greenFrontLat, shot.greenFrontLng),
    center: pair(shot.greenLat, shot.greenLng),
    back: pair(shot.greenBackLat, shot.greenBackLng),
  });
  if (yards == null) return false;
  return yards < GREEN_CHIP_YARDS;
}

/**
 * Offer a new typed carry when real shots keep missing a wrong typed or
 * estimated number. Null unless the club is not live, the baseline is typed
 * or estimated (never stock seed), and the 5 most recent shots
 * `shotsForClubAverage` dropped are a tight cluster at least half that baseline.
 * Does not change the 20% rule. Returns null rather than inventing yards.
 */
export function suggestBagCarry(args: {
  clubId: string;
  shots: readonly BagSuggestionShot[];
  typedCarryYards: number | null;
  estimatedCarryYards: number | null;
}): BagCarrySuggestion | null {
  if (isPutterClubId(args.clubId)) return null;
  const baseline = suggestionBaseline(args.typedCarryYards, args.estimatedCarryYards);
  if (baseline == null) return null;

  const seed = {
    typedCarryYards: positive(args.typedCarryYards) ? args.typedCarryYards : null,
    estimatedCarryYards: positive(args.estimatedCarryYards) ? args.estimatedCarryYards : null,
  };
  const kept = shotsForClubAverage([...args.shots], seed);
  const liveAvg = kept.length > 0 ? kept.reduce((sum, shot) => sum + shot.yards, 0) / kept.length : null;
  const bag = resolveBagCarry({
    id: args.clubId,
    liveCount: kept.length,
    liveAvgYards: liveAvg,
    typedYards: seed.typedCarryYards,
    estimatedYards: seed.estimatedCarryYards,
  });
  if (bag.kind !== 'typed' && bag.kind !== 'estimated') return null;

  const keptIds = new Set(kept);
  const candidates = args.shots.filter((shot) => !keptIds.has(shot) && !startsInsideGreenChip(shot));
  if (candidates.length < SUGGESTION_SAMPLES) return null;
  const recent = candidates.slice(-SUGGESTION_SAMPLES);
  if (recent.some((shot) => !shot.id || !Number.isFinite(shot.yards))) return null;

  const mean = recent.reduce((sum, shot) => sum + shot.yards, 0) / recent.length;
  if (!(mean > 0) || mean < baseline * SUGGESTION_MIN_OF_BASELINE) return null;
  const band = mean * SUGGESTION_TIGHT_RATIO;
  if (recent.some((shot) => Math.abs(shot.yards - mean) > band)) return null;

  const newest = recent[recent.length - 1];
  if (!newest) return null;
  return {
    yards: Math.round(mean),
    sampleCount: SUGGESTION_SAMPLES,
    newestShotId: newest.id,
  };
}

function parseDismissals(raw: string | null | undefined): Record<string, string> {
  if (raw == null || raw === '') return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [clubId, shotId] of Object.entries(parsed)) {
      if (clubId && typeof shotId === 'string' && shotId) out[clubId] = shotId;
    }
    return out;
  } catch {
    return {};
  }
}

/** Hidden until a newer dropped shot replaces this candidate set. */
export function bagSuggestionIsDismissed(
  raw: string | null | undefined,
  clubId: string,
  newestShotId: string,
): boolean {
  return parseDismissals(raw)[clubId] === newestShotId;
}

/** Persist Not now for this club. A different newest shot id shows the line again. */
export function dismissBagSuggestion(
  raw: string | null | undefined,
  clubId: string,
  newestShotId: string,
): string {
  const next = parseDismissals(raw);
  next[clubId] = newestShotId;
  return JSON.stringify(next);
}
