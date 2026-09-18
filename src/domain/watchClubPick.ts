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

export function watchClubPickBackMarksShot(): false {
  return false;
}

/** Watch Home is the in-round menu, not a mark. */
export function watchClubPickHomeOpensInRoundMenu(): true {
  return true;
}

export function watchClubListTop3(ids: string[]): string[] {
  return ids.filter((id) => !isPutterClubId(id)).slice(0, 3);
}

export function watchClubPickRestOfBag(args: { top3: string[]; bag: string[] }): string[] {
  const top = new Set(watchClubListTop3(args.top3));
  return args.bag.filter((id) => !top.has(id));
}
