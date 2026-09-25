import { fillEstimatedCarries, type CarryClub } from './carryFill';
import { isPutterClubId, stockAvgCarryForSuggestion, typicalCarrySeedForClub } from './defaultBag';
import { COPY } from './playerCopy';

/** Live average replaces typed / estimated / seed at this many kept closed shots. */
export const MIN_LIVE_SAMPLES_FOR_BAG = 5;

/**
 * Where the one bag number came from.
 * live → ≥5 kept closed shots. typed → the player's number. estimated → carryFill
 * from typed neighbors. seed → STOCK_AVG_CARRY until live GPS exists.
 */
export type BagCarryKind = 'live' | 'typed' | 'estimated' | 'seed';

export type BagCarry = {
  yards: number | null;
  kind: BagCarryKind | null;
  /** Kept live samples, even below five. Putter is always 0. */
  count: number;
  /** Typed yards may be edited only while the club is not live yet. Putter never. */
  editable: boolean;
};

function positive(yards: number | null | undefined): yards is number {
  return yards != null && Number.isFinite(yards) && yards > 0;
}

/**
 * THE carry for one club. Bag row, Club data, Suggested top-3, the play wheel
 * and the Watch all read this — never a second number.
 * 1. ≥5 kept live samples → live average (overwrites typed / estimate / seed)
 * 2. typed
 * 3. carryFill estimate
 * 4. typical-carry seed (stock clubs only)
 * Putter: no carry, no average.
 */
export function resolveBagCarry(args: {
  id: string;
  liveCount: number;
  liveAvgYards: number | null;
  typedYards: number | null;
  estimatedYards: number | null;
}): BagCarry {
  if (isPutterClubId(args.id)) return { yards: null, kind: null, count: 0, editable: false };
  const count = Number.isFinite(args.liveCount) ? Math.max(0, args.liveCount) : 0;
  if (count >= MIN_LIVE_SAMPLES_FOR_BAG && positive(args.liveAvgYards)) {
    return { yards: Math.round(args.liveAvgYards), kind: 'live', count, editable: false };
  }
  if (positive(args.typedYards)) {
    return { yards: Math.round(args.typedYards), kind: 'typed', count, editable: true };
  }
  if (positive(args.estimatedYards)) {
    return { yards: Math.round(args.estimatedYards), kind: 'estimated', count, editable: true };
  }
  const seed = stockAvgCarryForSuggestion(args.id);
  if (positive(seed)) return { yards: seed, kind: 'seed', count, editable: true };
  return { yards: null, kind: null, count, editable: true };
}

export type BagLive = { count: number; avgYards: number };

/** True once a club's samples have replaced its typed / estimated / seed carry. */
export function clubIsLive(live: BagLive | null | undefined): boolean {
  return live != null && live.count >= MIN_LIVE_SAMPLES_FOR_BAG && positive(live.avgYards);
}

/**
 * Resolve the whole bag at once. carryFill only estimates clubs that are
 * still missing live + typed; a live club is never re-estimated from neighbors.
 */
export function resolveBagCarries(
  clubs: CarryClub[],
  live: ReadonlyMap<string, BagLive> | Readonly<Record<string, BagLive>> = new Map(),
): Map<string, BagCarry & { typedYards: number | null; estimatedYards: number | null }> {
  const liveFor = (id: string): BagLive | undefined =>
    live instanceof Map ? live.get(id) : (live as Readonly<Record<string, BagLive>>)[id];
  const filled = fillEstimatedCarries(clubs);
  const out = new Map<string, BagCarry & { typedYards: number | null; estimatedYards: number | null }>();
  for (const club of clubs) {
    const row = liveFor(club.id);
    const typedYards = typicalCarrySeedForClub(club);
    const fill = filled.get(club.id);
    const estimatedYards =
      !clubIsLive(row) && typedYards == null && fill?.source === 'estimated' ? fill.yards : null;
    out.set(club.id, {
      ...resolveBagCarry({
        id: club.id,
        liveCount: row?.count ?? 0,
        liveAvgYards: row?.avgYards ?? null,
        typedYards,
        estimatedYards,
      }),
      typedYards,
      estimatedYards,
    });
  }
  return out;
}

/** Bag row chip. Live shows no chip; typed shows just the number. */
export function bagCarryChip(kind: BagCarryKind | null): 'estimated' | 'seed' | null {
  if (kind === 'estimated') return 'estimated';
  if (kind === 'seed') return 'seed';
  return null;
}

/** Typed edits are blocked once the club is live. No reset-samples flow exists. */
export function canEditTypedCarry(carry: Pick<BagCarry, 'editable'>): boolean {
  return carry.editable;
}

function shotCount(count: number): string {
  return `${count} shot${count === 1 ? '' : 's'}`;
}

/**
 * Club data / Averages meta line. Live → "12 shots". Otherwise the source,
 * plus the samples so far (they replace it at five).
 */
export function clubCarryMeta(carry: Pick<BagCarry, 'kind' | 'count'>): string {
  if (carry.kind === 'live') return shotCount(carry.count);
  const source =
    carry.kind === 'estimated'
      ? COPY.estimated
      : carry.kind === 'typed'
        ? COPY.typedCarry
        : carry.kind === 'seed'
          ? COPY.typicalCarry
          : null;
  if (source == null) return carry.count > 0 ? shotCount(carry.count) : COPY.noClosedShots;
  return carry.count > 0 ? `${source} · ${shotCount(carry.count)}` : source;
}
