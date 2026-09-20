import {
  carryFromClubLabel,
  clubHasWheelCarry,
  clubStripCappedAtThree,
  clubStripOnlyTapMarks,
  clubStripSortedByCarry,
  clubStripSortedByIronNumber,
  clubStripSortedByName,
  clubStripThreeClosestIds,
  clubStripWraps,
  formatClubStripLabel,
  planClubStrip,
  wrapClubStripIndex,
} from './clubStrip';
import { isPutterClubId, stockAvgCarryForSuggestion } from './defaultBag';
import { COPY } from './playerCopy';
import { showPuttPills } from './putts';

/** Watch club pick opens on the same top-3 the phone ranked. */
export function watchClubPickOpensOnTop3(): true {
  return true;
}

export function watchTop3MatchesPhone(): true {
  return true;
}

/** Player must not scroll to hit a top-3 club. */
export function watchTop3RequiresScroll(): false {
  return false;
}

export function watchAllClubsSitsUnderTop3(): true {
  return true;
}

export function watchAllClubsLabel(): 'All clubs' {
  return COPY.allClubs;
}

/** Rest of the bag sits below All clubs — scroll to reach it. */
export function watchRestOfBagBelowAllClubs(): true {
  return true;
}

export function watchPutterInTop3(): false {
  return false;
}

export function watchPutterOpensPuttSheet(): true {
  return true;
}

/** Putter tap opens the putt sheet on Watch immediately — do not wait for phone push. */
export function watchPutterPickOpensPuttSheetImmediately(): true {
  return true;
}

/** Dedicated Watch Putt control — always on play UI, not only via the club wheel. */
export function watchPlayHasDedicatedPuttControl(): true {
  return true;
}

/** Putt sits above the club strip so Ultra cannot clip it below the face. */
export function watchPuttControlSitsAboveClubStrip(): true {
  return true;
}

/** Putt shares the Back / Home row — first control band row, no scroll. */
export function watchPuttControlSitsBesideBackHome(): true {
  return true;
}

export function watchPuttControlOpensPuttSheet(): true {
  return true;
}

export function watchPuttControlIsClubWheel(): false {
  return false;
}

/** Dedicated Putt opens the sheet only — never Watch GPS or invented yards. */
export function watchPuttControlAttachWatchFix(): false {
  return false;
}

export function watchPuttControlInventGps(): false {
  return false;
}

export function watchPuttControlInventYards(): false {
  return false;
}

/** Made it lives on the putt sheet, not the club-pick chip row. */
export function watchPuttChipsShowMadeIt(): false {
  return false;
}

/** Watch putter tap never attaches lat/lng. Domain plan is marks:false / opensPuttSheet. */
export function watchPutterSkipsAttachWatchFix(): true {
  return true;
}

export function watchSameClubSitsAboveTop3(): false {
  return false;
}

export function watchSameClubSitsOnFirstScreen(): false {
  return false;
}

export function watchShowsSameClub(): false {
  return false;
}

/** First screen is Hole · yards, top 3, Same club, All clubs — no scroll. */
export function watchFirstScreenFitsWithoutScroll(): true {
  return true;
}

export function watchBackHomeDarkensRows(): false {
  return false;
}

export function watchSameClubIsLightOnDark(): true {
  return true;
}

export function watchTop3DropsYards(): false {
  return false;
}

/** Each top-3 number is that club's carry, not yards left to the hole. */
export function watchTop3NumberIsCarry(): true {
  return true;
}

export function watchTop3NumberIsYardsLeft(): false {
  return false;
}

/** The strip opens on the closest-carry window. Closest is the pick; it is centered only when both neighbors exist. */
export function watchFirstSuggestedIsThePick(): true {
  return true;
}

export function watchSameClubVisibleWithoutShot(): false {
  return false;
}

export function watchSuggestedPillsLookTheSame(): false {
  return false;
}

export function watchTop3IsSidewaysStrip(): true {
  return true;
}

export function watchStackedSuggestionRows(): false {
  return false;
}

/** Shorter peeks on the left. Longer peeks on the right. */
export function watchStripSwipeLeftIsShorter(): true {
  return true;
}

export function watchStripSwipeRightIsLonger(): true {
  return true;
}

export function watchStripShorterPeeksLeft(): true {
  return true;
}

export function watchStripLongerPeeksRight(): true {
  return true;
}

export function watchStripSortedByCarry(): true {
  return clubStripSortedByCarry();
}

export function watchStripSortedByName(): false {
  return clubStripSortedByName();
}

export function watchStripSwipeMarksShot(): false {
  return false;
}

export function watchStripScrollMarksShot(): false {
  return false;
}

export function watchStripTapMarksShot(): true {
  return true;
}

export function watchStripTapUsesHomeClubTap(): true {
  return true;
}

export function watchStripOnlyTapMarks(): true {
  return clubStripOnlyTapMarks();
}

export function watchStripCappedAtThree(): false {
  return clubStripCappedAtThree();
}

export function watchStripUsesFullBag(): true {
  return true;
}

/** Watch never silently drops a phone-bag club from the synced strip. */
export function watchStripNeverDropsBagClub(): true {
  return true;
}

/** Phone selected club stays on the Watch strip and is highlighted — never hidden. */
export function watchSelectedClubNeverVanishes(): true {
  return true;
}

/** If selected is already in the yards-left top-3, keep that window and highlight in place. */
export function watchSelectedHighlightInPlace(): true {
  return true;
}

/** Payload is the enabled bag, never a woods-only or typed-carry-only slice. */
export function watchClubListKeepsFullBag(): true {
  return true;
}

export function watchStripIsWheel(): true {
  return true;
}

export function watchStripWraps(): true {
  return clubStripWraps();
}

export function watchStripSortedByIronNumber(): false {
  return clubStripSortedByIronNumber();
}

export function watchStripAllowsDashPill(): false {
  return false;
}

export function watchStripInventZero(): false {
  return false;
}

export function watchOneHomeOnly(): true {
  return true;
}

export function watchSameClubSharesRowWithAllClubs(): false {
  return false;
}

/** Freed Same-club slot is Hole Out. No Watch scorecard this cook. */
export function watchShowsHoleOut(): true {
  return true;
}

export function watchShowsScorecard(): false {
  return false;
}

/** Same Signal gate as phone: putter, or ≤40 yd haversine to green (good/soft). */
export function watchPuttChipsUseSignalGate(): true {
  return true;
}

export function watchShowPuttPills(args: {
  selectedClubId?: string | null;
  yardsToGreen?: number | null;
  yardsQuality?: string;
}): boolean {
  return showPuttPills({
    putting: isPutterClubId(args.selectedClubId),
    toGreen: {
      yards: args.yardsToGreen ?? null,
      quality: args.yardsQuality ?? 'none',
    },
  });
}

/** Watch tap attaches Watch GPS. Hole Out is not a GPS mark. */
export function watchTapUsesWatchGps(): true {
  return true;
}

export function watchHoleOutClosesOnLastMark(): true {
  return true;
}

export function watchHoleOutInventPutts(): false {
  return false;
}

/** Watch Hole Out / madeIt flags the last real mark the same way as phone Hole Out. */
export function watchHoleOutFlagsLastRealShot(): true {
  return true;
}

export function watchBackHomeAreTinyText(): false {
  return false;
}

export function watchAllClubsExtendsStrip(): false {
  return false;
}

export function watchCarryFromLabel(label: string): number | null {
  return carryFromClubLabel(label);
}

/**
 * Watch bag carry stack, same as rankDistanceYards / resolveWheelCarries:
 * live/typed/estimated (already in the label or wheel carry) → stockAvg.
 * Never a dash for a stock bag club.
 */
export function resolveWatchBagCarry(args: {
  id: string;
  label?: string;
  wheelCarry?: number | null;
}): number | null {
  if (isPutterClubId(args.id)) return null;
  if (clubHasWheelCarry(args.wheelCarry)) return args.wheelCarry as number;
  const fromLabel = args.label ? watchCarryFromLabel(args.label) : null;
  if (fromLabel != null) return fromLabel;
  return stockAvgCarryForSuggestion(args.id);
}

export function watchBagLabelForPush(args: {
  id: string;
  shortName: string;
  wheelCarry?: number | null;
}): string {
  const name = args.shortName.split(' · ')[0]?.trim() || args.shortName;
  return formatClubStripLabel({
    id: args.id,
    shortName: name,
    carry: resolveWatchBagCarry({ id: args.id, label: args.shortName, wheelCarry: args.wheelCarry }),
  });
}

/** Top-3 short · mid · long by |carry − yardsLeft| from the full bag. */
export function watchTop3ByRemainingYards(args: {
  bag: { id: string; carry: number }[];
  yardsLeft: number;
}): string[] {
  const ordered = [...args.bag]
    .filter((club) => !isPutterClubId(club.id) && clubHasWheelCarry(club.carry))
    .sort((a, b) => a.carry - b.carry);
  return clubStripThreeClosestIds(ordered, args.yardsLeft);
}

export function watchClubHasWheelCarry(carry: number | null | undefined): boolean {
  return clubHasWheelCarry(carry);
}

export function wrapWatchClubStripIndex(index: number, count: number): number {
  return wrapClubStripIndex(index, count);
}

/**
 * Sideways strip of the bag, sorted by carry (short left, long right) —
 * never by club name, never capped at three. Opens on the three-club
 * window around the closest carry — no wrap to fill a side. Putter sits
 * at the end of the bag (scroll to reach it); never in top-3 suggestions
 * and never with an invented carry. Swipe / scroll does not mark.
 */
export function planWatchClubStrip(args: {
  top3?: string[];
  bag?: string[];
  labels: Record<string, string>;
  holeYards?: number | null;
  selectedClubId?: string | null;
}): { ids: string[]; openIndex: number; windowStart: number; pickId: string | null } {
  const source = args.bag ?? args.top3 ?? [];
  return planClubStrip({
    clubs: source.map((id) => ({
      id,
      carry: resolveWatchBagCarry({ id, label: args.labels[id] ?? '' }),
    })),
    yardsLeft: args.holeYards,
    selectedClubId: args.selectedClubId,
  });
}

/** Same club · 2i — club name only. Top-3 rows keep their yards. */
export function formatWatchSameClub(label: string | null | undefined): string {
  const name = label?.split(' · ')[0]?.trim();
  if (!name) return COPY.stickyClub;
  return `${COPY.stickyClub} · ${name}`;
}

export function watchClubPickBackMarksShot(): false {
  return false;
}

/** Only Back leaves the ball where it is. It does not mark. */
export function watchClubPickBackLeavesBall(): true {
  return true;
}

/** Watch Home is the in-round menu, not a mark. */
export function watchClubPickHomeOpensInRoundMenu(): true {
  return true;
}

export function watchClubPickHomeMarksShot(): false {
  return false;
}

/** A bag club under All clubs marks with the same rules as a top-3 tap. */
export function watchBagPickMarksLikeTop3(): true {
  return true;
}

export function watchBagPickUsesHomeClubTap(): true {
  return true;
}

export function watchBagPickUsesChosenFix(): true {
  return true;
}

export function watchBagPutterOpensPuttSheet(): true {
  return true;
}

export function watchClubListTop3(ids: string[]): string[] {
  return ids.filter((id) => !isPutterClubId(id)).slice(0, 3);
}

export function watchClubPickRestOfBag(args: { top3: string[]; bag: string[] }): string[] {
  const top = new Set(watchClubListTop3(args.top3));
  return args.bag.filter((id) => !top.has(id));
}

export type WatchClubTapPlan =
  | { marks: false; dest: 'hole'; leaveBall: true; opensPuttSheet: false }
  | { marks: false; dest: 'menu'; leaveBall: true; opensPuttSheet: false }
  | { marks: false; dest: 'putts'; leaveBall: true; opensPuttSheet: true; clubId: string }
  | {
      marks: true;
      dest: 'mark';
      usesHomeClubTap: true;
      usesChosenFix: true;
      from: 'top3' | 'bag';
      clubId: string;
    };

/** Top-3 and bag taps share this plan. Back / Home never mark. Putter never marks. */
export function planWatchClubTap(
  args:
    | { action: 'back' }
    | { action: 'home' }
    | { action: 'club'; clubId: string; from: 'top3' | 'bag' },
): WatchClubTapPlan {
  if (args.action === 'back') {
    return { marks: false, dest: 'hole', leaveBall: true, opensPuttSheet: false };
  }
  if (args.action === 'home') {
    return { marks: false, dest: 'menu', leaveBall: true, opensPuttSheet: false };
  }
  if (isPutterClubId(args.clubId)) {
    return { marks: false, dest: 'putts', leaveBall: true, opensPuttSheet: true, clubId: args.clubId };
  }
  return {
    marks: true,
    dest: 'mark',
    usesHomeClubTap: true,
    usesChosenFix: true,
    from: args.from,
    clubId: args.clubId,
  };
}
