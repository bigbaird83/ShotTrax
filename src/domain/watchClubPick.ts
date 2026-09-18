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
