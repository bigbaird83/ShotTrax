import { isPutterClubId } from './defaultBag';

/** Phone All clubs is the whole bag on one screen. No ScrollView. */
export function phoneAllClubsScreenScrolls(): false {
  return false;
}

export function phoneAllClubsIsOneScreen(): true {
  return true;
}

export function phoneAllClubsIncludesPutter(): true {
  return true;
}

export function phoneAllClubsIncludesDashClubs(): true {
  return true;
}

export function phoneAllClubsMarksWithHomeClubTap(): true {
  return true;
}

/** Every bag club: wheel clubs, dash/no-carry clubs, and the putter. */
export function planAllClubsBag(clubs: { id: string }[]): string[] {
  return clubs.map((club) => club.id);
}

export function allClubsBagIncludesPutter(ids: string[]): boolean {
  return ids.some((id) => isPutterClubId(id));
}
