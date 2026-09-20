/**
 * One press on a Play / Watch wheel club marks that club.
 * That press is the mark — no select-then-press, no slide-up.
 * A later press marks the new club. Scroll / swipe never marks.
 * A new hole may reopen the window.
 */

export type ClubStripGesture = 'tap' | 'swipe' | 'scroll';

export function planClubStripGesture(gesture: ClubStripGesture): {
  selects: boolean;
  marks: boolean;
  usesHomeClubTap: boolean;
} {
  if (gesture === 'tap') return { selects: true, marks: true, usesHomeClubTap: true };
  return { selects: false, marks: false, usesHomeClubTap: false };
}

export function clubStripTapMarksShot(): true {
  return true;
}

export function clubStripTapSelectsClub(): true {
  return true;
}

export function watchStripTapMarksShot(): true {
  return true;
}

export function watchStripTapSelectsClub(): true {
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
}): { selectedId: string; marksShot: true; recomputesWindow: false } {
  void args.openingPickId;
  void args.previousId;
  return { selectedId: args.tappedId, marksShot: true, recomputesWindow: false };
}

export function watchSelectionMatchesPhone(
  phoneId: string | null | undefined,
  watchId: string | null | undefined,
): boolean {
  return phoneId != null && phoneId === watchId;
}

/** Watch strip tap updates phone selectedClub and marks. One press, both. */
export function watchClubTapUpdatesPhoneSelection(): true {
  return true;
}

export function phoneSelectedClubAfterWatchTap(clubId: string): string {
  return applyWheelSelection(clubId);
}

/** Hole start never pre-selects Driver or any club. Top-3 may suggest only. */
export function wheelAutoSelectsOnHoleStart(): false {
  return false;
}

export function holeOpensWithEmptySelection(): true {
  return true;
}

/** Highlight only a tapped club. Never fall back to the suggested pick. */
export function resolveWheelHighlightId(selectedClubId: string | null | undefined): string | null {
  return selectedClubId ?? null;
}
