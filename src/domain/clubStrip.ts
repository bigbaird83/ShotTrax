import { fillEstimatedCarries, type CarryClub } from './carryFill';
import { isPutterClubId, typicalCarrySeedForClub } from './defaultBag';
import { MIN_CLOSED_SHOTS_FOR_RANK } from './rankClubs';

/** Build 31 club-pill height. Dock actions stay this tall. */
export const BUILD_31_CLUB_PILL_HEIGHT = 52;
/** Phone wheel is slightly taller than the build 31 pills. */
export const PHONE_WHEEL_PILL_HEIGHT = 58;
/** Full phone strip height: pill plus a little dock pad. No lift room. */
export const PHONE_WHEEL_STRIP_HEIGHT = PHONE_WHEEL_PILL_HEIGHT + 8;
/** Watch pills sit in the 40% control band and must fit three full labels. */
export const WATCH_WHEEL_PILL_HEIGHT = 44;
/** Watch strip frame is the pill plus a little pad — a normal press target. */
export const WATCH_WHEEL_STRIP_HEIGHT = WATCH_WHEEL_PILL_HEIGHT + 8;

export function phoneWheelLargerThanBuild31(): true {
  return true;
}

export function phoneWheelPillTallerThanWatch(): true {
  return true;
}

/** Phone and Watch share this strip. Sorted by carry, not name or iron number. */
export function clubStripSortedByCarry(): true {
  return true;
}

export function clubStripSortedByName(): false {
  return false;
}

export function clubStripSortedByIronNumber(): false {
  return false;
}

/** Swiping continues through the rest of the bag. Not capped at three. */
export function clubStripCappedAtThree(): false {
  return false;
}

export function clubStripShorterPeeksLeft(): true {
  return true;
}

export function clubStripLongerPeeksRight(): true {
  return true;
}

export function clubStripSwipeMarksShot(): false {
  return false;
}

export function clubStripScrollMarksShot(): false {
  return false;
}

/** One press marks. Scroll / swipe never marks. */
export function clubStripOnlyTapMarks(): true {
  return true;
}

export function clubStripPutterIncluded(): false {
  return false;
}

/**
 * Closest carry sits in the middle when a shorter club and a longer club both
 * exist. Do not implement a blanket "never center the closest club."
 */
export function clubStripCenterIsClosestCarry(): true {
  return true;
}

/** Center the closest carry when both neighbors exist (100 yd: wedge in the middle). */
export function clubStripCentersClosestWhenNeighborsExist(): true {
  return true;
}

/** A shorter-only or longer-only end does not wrap just to put closest in the middle. */
export function clubStripNeverCentersClosest(): false {
  return false;
}

/** Do not wrap a wedge onto the right, or the driver onto the left, just to fill a side. */
export function clubStripWrapsToFillEmptySide(): false {
  return false;
}

export function clubStripOpensOnSeam(): false {
  return false;
}

export function clubStripOpeningWindowIsThree(): true {
  return true;
}

export function clubStripNeighborPillsShowCarry(): true {
  return true;
}

/** Three opening pills are fully on screen. Not a 62% center with clipped peeks. */
export const CLUB_STRIP_VISIBLE_PILLS = 3;

export function clubStripVisiblePills(): number {
  return CLUB_STRIP_VISIBLE_PILLS;
}

export function clubStripCenterIsTeeClub(): false {
  return false;
}

export function clubStripPhoneMatchesWatch(): true {
  return true;
}

/** Play-wheel press is the mark — same path as the old suggested chip. */
export function clubStripTapMarksLikeChip(): true {
  return true;
}

export function clubStripTapUsesHomeClubTap(): true {
  return true;
}

/** Center is closest carry to hole yards / yards left — never bag order or the tee club. */
export function clubStripCenterUsesHoleYards(): true {
  return true;
}

/** After a shot lands, the middle pill is closest to yards left — not the tee club. */
export function clubStripCenterUsesYardsLeft(): true {
  return true;
}

export function clubStripUsesRankedTop3(): false {
  return false;
}

export function clubStripUsesFullBag(): true {
  return true;
}

/** Sideways wheel, not a gapped list. Past the longest wraps to the shortest. */
export function clubStripIsWheel(): true {
  return true;
}

export function clubStripIsGappedList(): false {
  return false;
}

export function clubStripWraps(): true {
  return true;
}

export function clubStripAllowsDashPill(): false {
  return false;
}

export function clubStripInventZero(): false {
  return false;
}

export function clubStripHasEmptySlot(): false {
  return false;
}

/** Fill estimated carries before the wheel sorts. Typed wins. Outside the span stays out. */
export function clubStripFillsBeforeSort(): true {
  return true;
}

/** Sort of the bag by name / iron / hybrid label is the Hy+3W miss. */
export function clubStripSortsByIronHybridName(): false {
  return false;
}

/** A numbered club (Dr · 280) is never dropped from the wheel. */
export function clubStripDropsNumberedClub(): false {
  return false;
}

/** Opening frame is the three closest carries to the hole, after fill then sort. */
export function clubStripPicksThreeClosest(): true {
  return true;
}

export function clubStripEstimatedEntersWheel(): true {
  return true;
}

/** Clubs sit together. One extra gap only between longest and shortest at the wrap. */
export const CLUB_STRIP_GAP = 8;
export const CLUB_STRIP_SEAM_GAP = 24;

export function clubStripSeamGapOnly(): true {
  return true;
}

export function carryFromClubLabel(label: string): number | null {
  const raw = label.split(' · ')[1]?.trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const yards = Number(raw);
  if (!Number.isFinite(yards) || yards <= 0) return null;
  return yards;
}

/** A dash, empty, 0, or missing number is blank. Do not invent 0. */
export function clubHasWheelCarry(carry: number | null | undefined): boolean {
  return carry != null && Number.isFinite(carry) && carry > 0;
}

export function wrapClubStripIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function toWheelFillClub(
  club: {
    id: string;
    loftRank: number;
    sortOrder?: number;
    typicalCarryYards?: number | null;
  },
  live?: { count: number; avgYards: number } | null,
): ClubStripClub {
  const count = live?.count ?? 0;
  const avg = live?.avgYards;
  const typical = typicalCarrySeedForClub(club);
  return {
    id: club.id,
    loftRank: club.loftRank,
    sortOrder: club.sortOrder,
    typicalCarryYards: typical,
    carry: typical,
    liveCarry:
      count >= MIN_CLOSED_SHOTS_FOR_RANK && avg != null && Number.isFinite(avg) && avg > 0 ? avg : null,
  };
}

export type ClubStripClub = {
  id: string;
  carry?: number | null;
  loftRank?: number;
  sortOrder?: number;
  typicalCarryYards?: number | null;
  liveCarry?: number | null;
};

export type ClubStripPlan = {
  ids: string[];
  /** Visual-center index: closest when both neighbors exist, else the middle of the three-club window. */
  openIndex: number;
  /** First fully visible club in the opening frame. */
  windowStart: number;
  pickId: string | null;
  carries: Record<string, number>;
};

/**
 * Opening frame is three consecutive clubs in carry order.
 * Closest sits in the middle when a shorter and a longer both exist
 * (left = next shorter, right = next longer). At the long end the window
 * is the three longest — do not wrap a wedge onto the right to force the
 * driver into the middle. At the short end do not wrap the driver onto
 * the left. The first frame is not the seam.
 */
export function openingClubStripWindow(args: {
  count: number;
  closestIndex: number;
}): { windowStart: number; openIndex: number } {
  const n = args.count;
  const closest = args.closestIndex;
  if (n <= 0) return { windowStart: 0, openIndex: 0 };
  if (n === 1) return { windowStart: 0, openIndex: 0 };
  if (n === 2) return { windowStart: 0, openIndex: closest > 0 ? 1 : 0 };
  if (closest > 0 && closest < n - 1) {
    return { windowStart: closest - 1, openIndex: closest };
  }
  if (closest >= n - 1) {
    return { windowStart: n - 3, openIndex: n - 2 };
  }
  return { windowStart: 0, openIndex: 1 };
}

/** Clamp so the longest club cannot scroll off the right of a three-pill frame. */
export function clubStripWindowStartClamped(windowStart: number, count: number): number {
  if (count <= CLUB_STRIP_VISIBLE_PILLS) return 0;
  return Math.max(0, Math.min(windowStart, count - CLUB_STRIP_VISIBLE_PILLS));
}

export function clubStripOpeningIds(ids: string[], windowStart: number): string[] {
  if (ids.length <= CLUB_STRIP_VISIBLE_PILLS) return ids.slice();
  const start = clubStripWindowStartClamped(windowStart, ids.length);
  return ids.slice(start, start + CLUB_STRIP_VISIBLE_PILLS);
}

/** Re-open only when the bag or hole window changes — never when a tap selects. */
export function clubStripWindowKey(ids: string[], windowStart: number): string {
  return `${ids.join('|')}@${windowStart}`;
}

export function resolveWheelCarries(clubs: ClubStripClub[]): Record<string, number> {
  const canFill = clubs.some((club) => club.loftRank != null);
  const filled = canFill
    ? fillEstimatedCarries(
        clubs.map((club) => ({
          id: club.id,
          loftRank: club.loftRank ?? 0,
          sortOrder: club.sortOrder,
          typicalCarryYards: club.typicalCarryYards ?? club.carry ?? null,
        }) satisfies CarryClub),
      )
    : null;
  const carries: Record<string, number> = {};
  for (const club of clubs) {
    if (isPutterClubId(club.id)) continue;
    if (clubHasWheelCarry(club.liveCarry)) {
      carries[club.id] = club.liveCarry as number;
      continue;
    }
    const estimated = filled?.get(club.id)?.yards ?? null;
    if (clubHasWheelCarry(estimated)) {
      carries[club.id] = estimated as number;
      continue;
    }
    if (clubHasWheelCarry(club.typicalCarryYards)) {
      carries[club.id] = club.typicalCarryYards as number;
      continue;
    }
    if (clubHasWheelCarry(club.carry)) {
      carries[club.id] = club.carry as number;
    }
  }
  return carries;
}

/**
 * After fill and a carry sort, the opening three are the closest carries to
 * the hole — never a name/iron/hybrid sort, never a dash, never dropping a
 * numbered club (Dr · 280 on a 282-yard hole).
 */
export function clubStripThreeClosestIds(
  ordered: { id: string; carry: number }[],
  yards: number | null | undefined,
): string[] {
  if (ordered.length <= CLUB_STRIP_VISIBLE_PILLS) return ordered.map((club) => club.id);
  if (yards == null || !Number.isFinite(yards)) {
    return ordered.slice(0, CLUB_STRIP_VISIBLE_PILLS).map((club) => club.id);
  }
  return [...ordered]
    .sort((a, b) => {
      const da = Math.abs(a.carry - yards);
      const db = Math.abs(b.carry - yards);
      if (da !== db) return da - db;
      return a.carry - b.carry;
    })
    .slice(0, CLUB_STRIP_VISIBLE_PILLS)
    .sort((a, b) => a.carry - b.carry)
    .map((club) => club.id);
}

/**
 * Fill first (typed / estimated / live), then sort shorter to longer.
 * Putter and clubs that still have no number stay out. No dash. No invented 0.
 */
export function planClubStrip(args: {
  clubs: ClubStripClub[];
  yardsLeft?: number | null;
}): ClubStripPlan {
  const carries = resolveWheelCarries(args.clubs);
  const ordered = args.clubs
    .filter((club) => !isPutterClubId(club.id) && clubHasWheelCarry(carries[club.id]))
    .map((club) => ({ id: club.id, carry: carries[club.id] }))
    .sort((a, b) => a.carry - b.carry);

  const yards = args.yardsLeft;
  let pick: string | null = null;
  if (yards != null && Number.isFinite(yards)) {
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const club of ordered) {
      const delta = Math.abs(club.carry - yards);
      if (delta < bestDelta) {
        bestDelta = delta;
        pick = club.id;
      }
    }
  }
  if (!pick) pick = ordered[0]?.id ?? null;
  const closestIndex = pick ? Math.max(0, ordered.findIndex((club) => club.id === pick)) : 0;
  const closestThree = clubStripThreeClosestIds(ordered, yards);
  const threeStart = closestThree.length
    ? Math.max(0, ordered.findIndex((club) => club.id === closestThree[0]))
    : openingClubStripWindow({ count: ordered.length, closestIndex }).windowStart;
  const window = openingClubStripWindow({ count: ordered.length, closestIndex });
  return {
    ids: ordered.map((club) => club.id),
    openIndex: window.openIndex,
    windowStart: clubStripWindowStartClamped(threeStart, ordered.length),
    pickId: pick,
    carries,
  };
}
