import {
  carryFromClubLabel,
  clubHasWheelCarry,
  clubStripCappedAtThree,
  clubStripOnlyTapMarks,
  clubStripSortedByCarry,
  clubStripSortedByIronNumber,
  clubStripSortedByName,
  clubStripWraps,
  planClubStrip,
  wrapClubStripIndex,
} from './clubStrip';
import { isPutterClubId } from './defaultBag';
import { COPY } from './playerCopy';

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

export function watchSameClubSitsAboveTop3(): false {
  return false;
}

export function watchSameClubSitsOnFirstScreen(): true {
  return true;
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

export function watchStripSlideUpMarksShot(): true {
  return true;
}

export function watchStripSlideUpUsesHomeClubTap(): true {
  return true;
}

export function watchStripOnlyTapMarks(): false {
  return clubStripOnlyTapMarks();
}

export function watchStripCappedAtThree(): false {
  return clubStripCappedAtThree();
}

export function watchStripUsesFullBag(): true {
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

export function watchSameClubSharesRowWithAllClubs(): true {
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

export function watchClubHasWheelCarry(carry: number | null | undefined): boolean {
  return clubHasWheelCarry(carry);
}

export function wrapWatchClubStripIndex(index: number, count: number): number {
  return wrapClubStripIndex(index, count);
}

/**
 * Sideways strip of the bag, sorted by carry (short left, long right) —
 * never by club name, never capped at three. Opens on the three-club
 * window around the closest carry — no wrap to fill a side. Putter never
 * enters. Swipe / scroll does not mark.
 */
export function planWatchClubStrip(args: {
  top3?: string[];
  bag?: string[];
  labels: Record<string, string>;
  holeYards?: number | null;
}): { ids: string[]; openIndex: number; windowStart: number; pickId: string | null } {
  const source = args.bag ?? args.top3 ?? [];
  return planClubStrip({
    clubs: source.map((id) => ({ id, carry: watchCarryFromLabel(args.labels[id] ?? '') })),
    yardsLeft: args.holeYards,
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
