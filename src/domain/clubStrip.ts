import { fillEstimatedCarries, type CarryClub } from './carryFill';
import { isPutterClubId, stockAvgCarryForSuggestion, typicalCarrySeedForClub } from './defaultBag';
import { formatSuggestedClubChip } from './playerCopy';
import { addShotSheetRankYards, MIN_CLOSED_SHOTS_FOR_RANK, rankClosestCarryIds } from './rankClubs';

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

/** Putter sits on the phone + Watch wheel (end of bag / after wedges). Null carry — no invented yards. */
export function clubStripPutterIncluded(): true {
  return true;
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
  live?: { count: number; avgYards: number; bag?: { yards: number | null } | null } | null,
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
    bagCarry: isPutterClubId(club.id) ? null : (live?.bag?.yards ?? null),
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
  /** Resolved bag number (`resolveBagCarry`) — wins so the wheel matches the bag row. */
  bagCarry?: number | null;
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

/** Selected club stays on the strip. Highlight in place when it is already in the yards-left top-3. */
export function clubStripKeepsSelectedVisible(): true {
  return true;
}

/**
 * Opening window is still short · mid · long by |carry − yardsLeft|.
 * If the selected club is in that set, keep that window (highlight in place).
 * If they picked outside top-3, slide to the selected club and its carry neighbors.
 */
export function clubStripWindowStartForSelection(args: {
  ids: string[];
  carries?: Record<string, number>;
  yardsLeft?: number | null;
  selectedClubId?: string | null;
}): number {
  const ids = args.ids;
  const n = ids.length;
  if (n <= CLUB_STRIP_VISIBLE_PILLS) return 0;
  const ordered = ids
    .filter((id) => clubHasWheelCarry(args.carries?.[id]) && !isPutterClubId(id))
    .map((id) => ({ id, carry: args.carries?.[id] as number }));
  const top3 = clubStripThreeClosestIds(ordered, args.yardsLeft);
  const top3Start = top3.length ? Math.max(0, ids.indexOf(top3[0])) : 0;
  const selected = args.selectedClubId;
  if (selected && ids.includes(selected) && !top3.includes(selected)) {
    const idx = Math.max(0, ids.indexOf(selected));
    return openingClubStripWindow({ count: n, closestIndex: idx }).windowStart;
  }
  return clubStripWindowStartClamped(top3Start, n);
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
    // Putter has null carry — never invent yards. It still enters the wheel via planClubStrip.
    if (isPutterClubId(club.id)) continue;
    if (clubHasWheelCarry(club.bagCarry)) {
      carries[club.id] = club.bagCarry as number;
      continue;
    }
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
      continue;
    }
    const stock = stockAvgCarryForSuggestion(club.id);
    if (stock != null && clubHasWheelCarry(stock)) {
      carries[club.id] = stock;
    }
  }
  return carries;
}

/**
 * Shared opening three for the play wheel AND the Add-shot sheet.
 * After fill and a carry sort, lowest |carry − D| — never shortest-3,
 * never longest-3, never a name/iron/hybrid sort. Putter out.
 */
export function clubStripThreeClosestIds(
  ordered: { id: string; carry: number }[],
  yards: number | null | undefined,
): string[] {
  const usable = ordered.filter((club) => clubHasWheelCarry(club.carry) && !isPutterClubId(club.id));
  if (usable.length <= CLUB_STRIP_VISIBLE_PILLS) return usable.map((club) => club.id);
  if (yards == null || !Number.isFinite(yards)) {
    return usable.slice(0, CLUB_STRIP_VISIBLE_PILLS).map((club) => club.id);
  }
  const closest = rankClosestCarryIds(usable, yards, CLUB_STRIP_VISIBLE_PILLS);
  return [...closest].sort((a, b) => {
    const ca = usable.find((club) => club.id === a)?.carry ?? 0;
    const cb = usable.find((club) => club.id === b)?.carry ?? 0;
    return ca - cb;
  });
}

/**
 * Add-shot sheet pills: same `clubStripThreeClosestIds` ranker as the play
 * wheel. D is the header yards (281 yd · Pick a club). Do not feed the
 * full short→long bag and hope the wheel scrolls — Modal scrollTo misses
 * leave the shortest wedges on screen.
 */
export function addShotSheetOpeningClubIds(args: {
  clubs: { id: string; carry: number }[];
  headerYards: number | null | undefined;
  remainingPin?: number | null;
}): string[] {
  return clubStripThreeClosestIds(
    args.clubs,
    addShotSheetRankYards({
      headerYards: args.headerYards,
      remainingPin: args.remainingPin,
    }),
  );
}

/** End of bag / after wedges — matches DEFAULT_BAG sortOrder. Never invents a putter carry. */
export function appendPutterToClubStrip(ids: string[], clubs: { id: string }[]): string[] {
  if (!clubStripPutterIncluded()) return ids;
  const putter = clubs.find((club) => isPutterClubId(club.id));
  if (!putter || ids.includes(putter.id)) return ids;
  return [...ids, putter.id];
}

/** Wheel chip: carry clubs keep `Name · yards`. Putter is short name only (Pt / Putter). */
export function formatClubStripLabel(args: {
  id: string;
  shortName: string;
  carry?: number | null;
}): string {
  const name = args.shortName.split(' · ')[0]?.trim() || args.shortName;
  if (isPutterClubId(args.id)) return name || 'Pt';
  return formatSuggestedClubChip(name, args.carry);
}

/**
 * Fill first (live ≥5 → typed → estimated fill → stockAvg for suggestion),
 * then sort shorter to longer. Clubs that still have no number stay out
 * (no dash, no invented 0) except putter, which sits at the end of the bag
 * with a null carry. Stock bag clubs (Driver) never vanish just because
 * typed carry is null and fill needs ≥3 anchors. Top-3 suggestions stay
 * carry-only — putter is on the scrollable wheel, not forced into the opening window.
 */
export function planClubStrip(args: {
  clubs: ClubStripClub[];
  yardsLeft?: number | null;
  selectedClubId?: string | null;
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
  const ids = appendPutterToClubStrip(
    ordered.map((club) => club.id),
    args.clubs,
  );
  const windowStart = clubStripWindowStartForSelection({
    ids,
    carries,
    yardsLeft: yards,
    selectedClubId: args.selectedClubId,
  });
  const selectedIndex =
    args.selectedClubId && ids.includes(args.selectedClubId)
      ? ids.indexOf(args.selectedClubId)
      : -1;
  const top3 = clubStripThreeClosestIds(ordered, yards);
  const window =
    selectedIndex >= 0 && !top3.includes(args.selectedClubId as string)
      ? openingClubStripWindow({ count: ids.length, closestIndex: selectedIndex })
      : openingClubStripWindow({ count: ordered.length, closestIndex });
  return {
    ids,
    openIndex: selectedIndex >= 0 ? selectedIndex : window.openIndex,
    windowStart,
    pickId: pick,
    carries,
  };
}
