/**
 * Round start and hole change stay on the play/hole view.
 * All clubs is a separate control — never the dest of start / Prev / Next.
 */

export function playHoleHref(
  roundId: string,
  holeNumber: number,
): `/round/${string}/hole/${number}` {
  return `/round/${roundId}/hole/${holeNumber}`;
}

/** Fresh round always opens hole 1 play — not All clubs. */
export function playHrefAfterRoundStart(roundId: string): `/round/${string}/hole/1` {
  return `/round/${roundId}/hole/1`;
}

/** Prev hole / Next hole stay on play. Never club-pick. Past edit keeps ?edit=1. */
export function playHrefAfterHoleChange(
  roundId: string,
  holeNumber: number,
  keepPastEdit = false,
): string {
  const href = playHoleHref(roundId, holeNumber);
  return keepPastEdit ? `${href}?edit=1` : href;
}

export function allClubsHref(roundId: string, holeNumber: number): string {
  return `/round/${roundId}/club-pick?hole=${holeNumber}`;
}

export function playHrefIsAllClubs(href: string): boolean {
  return href.includes('club-pick');
}

/** All clubs opens only from the All clubs control. */
export function allClubsOnlyViaControl(): true {
  return true;
}

/** Settings back label. Never Expo folder paths like (tabs) or round/[id]. */
export function expoStackBackTitle(routeName: string | undefined): 'Home' | 'Round' {
  if (routeName === 'round/[id]') return 'Round';
  return 'Home';
}

export function expoTitleLooksLikeFolderPath(title: string): boolean {
  return /[()[\]]/.test(title);
}
