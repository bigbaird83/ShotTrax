/**
 * Play / Watch wheel taps select a club. They do not mark a shot.
 * A later tap replaces the selection. A new hole may reopen the window.
 * Slide the lifted center club up to mark — same path as today's mark tap.
 */

export type ClubStripGesture = 'tap' | 'swipe' | 'scroll' | 'slide_up';

export function planClubStripGesture(gesture: ClubStripGesture): {
  selects: boolean;
  marks: boolean;
  usesHomeClubTap: boolean;
} {
  if (gesture === 'tap') return { selects: true, marks: false, usesHomeClubTap: false };
  if (gesture === 'slide_up') return { selects: true, marks: true, usesHomeClubTap: true };
  return { selects: false, marks: false, usesHomeClubTap: false };
}

export function clubStripTapMarksShot(): false {
  return false;
}

export function clubStripTapSelectsClub(): true {
  return true;
}

export function watchStripTapMarksShot(): false {
  return false;
}

export function watchStripTapSelectsClub(): true {
  return true;
}

export function clubStripSlideUpMarksShot(): true {
  return true;
}

export function watchStripSlideUpMarksShot(): true {
  return true;
}

export function watchBagTapMarksShot(): true {
  return true;
}

export function wheelSelectionSyncsPhoneAndWatch(): true {
  return true;
}

export function wheelRecomputesOnSelection(): false {
  return false;
}

export function wheelRecomputesOnNewHole(): true {
  return true;
}

export function applyWheelSelection(tappedId: string): string {
  return tappedId;
}

export function wheelSelectionAfterTap(args: {
  openingPickId: string | null;
  previousId: string | null;
  tappedId: string;
}): { selectedId: string; marksShot: false; recomputesWindow: false } {
  void args.openingPickId;
  void args.previousId;
  return { selectedId: args.tappedId, marksShot: false, recomputesWindow: false };
}

export function watchSelectionMatchesPhone(
  phoneId: string | null | undefined,
  watchId: string | null | undefined,
): boolean {
  return phoneId != null && phoneId === watchId;
}
