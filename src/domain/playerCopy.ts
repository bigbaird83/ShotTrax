/** Player-facing copy. Accuracy / API / OSM rules stay in code, not on screen. */

export const COPY = {
  homeLede: 'Find a course nearby, pick your tee, start the round.',
  home: 'Home',
  back: 'Back',
  nearbyHint: 'Courses near you — pull to refresh.',
  nearbyEmpty: 'No courses near you.',
  nearbyUnavailable: 'Courses near you aren’t available. Type a course name to start.',
  nearbyBusy: 'Looking nearby…',
  nearbyRefresh: 'Pull to refresh',
  courseNamePlaceholder: 'Course name (optional)',
  pickTee: 'Pick your tee',
  start18: 'Start 18 holes',
  start9: 'Start 9 holes',
  continueRound: 'Continue round',
  finishRound: 'Finish round',
  deleteRound: 'Delete round',
  deleteRoundConfirm: 'Delete this round? Shots and scores go with it.',
  roundHistory: 'Round history',
  noRounds: 'No rounds yet.',
  roundInProgress: 'Round in progress',
  clearCourse: 'Clear course',
  waitingOnGreen: 'Waiting on green location.',
  waitingOnLocation: 'Waiting on your location.',
  approximate: 'Approximate',
  longPressGreen: 'Long-press to set the green',
  toGreen: 'To green',
  mark: 'Mark',
  marked: 'Marked',
  markWithoutClub: 'Mark without club',
  drop: 'Drop',
  penalty: 'Penalty',
  sayClub: 'Say a club',
  sayAgain: 'Say again',
  listening: 'Listening…',
  bag: 'Bag',
  fullBag: 'Full bag',
  allClubs: 'All clubs',
  top3: 'Top 3',
  top3Unlock: 'Top clubs unlock after a few shots',
  pickClub: 'Pick a club',
  pickClubLede: 'Picking a club marks where you hit from.',
  stickyClub: 'Same club',
  undoLast: 'Undo last',
  endShot: 'End last shot',
  prevHole: 'Prev',
  nextHole: 'Next',
  previousHole: 'Previous hole',
  menu: 'Menu',
  settings: 'Settings',
  courseDistance: 'Course distance',
  courseDistanceSetting: 'Course distance: Miles / Kilometers',
  miles: 'Miles',
  kilometers: 'Kilometers',
  madeIt: 'Made it',
  putts: 'Putts',
  puttSheetLede: 'How long was the putt?',
  addPutt: 'Add a putt',
  undoPutt: 'Undo putt',
  forgotShot: 'Log a missed shot',
  score: 'Score',
  shots: 'Shots',
  noShots: 'No shots yet.',
  inPlay: 'In play',
  logged: 'Logged',
  didntCatchClub: 'Didn’t catch a club. Say it again or pick one.',
  suggested: 'Suggested',
  changeClub: 'Change club',
  weakLocation: 'Location is weak. Mark anyway?',
  tooFar: 'That looks too far. Mark anyway?',
  markAnyway: 'Mark anyway',
  dropAnyway: 'Drop anyway',
  cancel: 'Cancel',
  locationOff: 'Turn on location to mark.',
  simulator: 'Simulator — move the location pin between shots.',
  restoreBag: 'Restore stock bag',
  bagLede: 'Your bag. Turn off what you don’t carry.',
  averagesLede: 'How far you hit each club — from marked shots.',
  noClosedShots: 'No marked shots yet',
  typicalCarry: 'Typical',
  typicalCarryYards: 'Typical carry (yd)',
  clearTypicalCarry: 'Clear typical carry',
  summaryHome: 'Home',
} as const;

export function finishPuttsChip(holeNumber: number): string {
  return `Finish putts · Hole ${holeNumber}`;
}

export function markedSuggestedMessage(shortName: string): string {
  return `Marked ${shortName} (suggested) · Change club.`;
}

/** Voice fail always offers a tap into the bag — never voice-only recovery. */
export function voiceFailRecovery(): {
  banner: string;
  primaryLabel: string;
  secondaryLabel: string;
} {
  return {
    banner: COPY.didntCatchClub,
    primaryLabel: COPY.pickClub,
    secondaryLabel: COPY.sayAgain,
  };
}

export function formatParLabel(par: number | null): string {
  return par == null ? 'Par unknown' : `Par ${par}`;
}

export function formatSiLabel(handicap: number | null): string {
  return handicap == null ? 'SI unknown' : `SI ${handicap}`;
}

export function formatHoleHeader(holeNumber: number, par: number | null): string {
  return `Hole ${holeNumber} · ${formatParLabel(par)}`;
}

export function formatTeeMeta(tee: {
  name: string;
  rating: number | null;
  slope: number | null;
  totalYards: number | null;
}): string {
  const bits = [
    tee.rating != null ? `Rating ${tee.rating}` : null,
    tee.slope != null ? `Slope ${tee.slope}` : null,
    tee.totalYards != null ? `${tee.totalYards} yd` : null,
  ].filter(Boolean);
  return bits.length ? `${tee.name} · ${bits.join(' · ')}` : tee.name;
}

export function yardsToGreenPlayerLabel(
  result: { yards: number | null; quality: string },
  ctx: { hasGreen?: boolean; hasFix?: boolean } = {},
): { heading: string; value: string; detail: string } {
  const heading = COPY.toGreen;
  if (result.quality !== 'none' && result.yards != null) {
    return { heading, value: `${result.yards}`, detail: 'yd' };
  }
  const detail = !ctx.hasGreen
    ? COPY.waitingOnGreen
    : !ctx.hasFix
      ? COPY.waitingOnLocation
      : COPY.waitingOnGreen;
  return { heading, value: '—', detail };
}

export function scoreMismatchPlayerMessage(args: {
  score: number | null;
  shotCount: number;
  penaltyStrokes: number;
  puttCount?: number;
}): string {
  return `Score ${args.score} doesn’t match ${args.shotCount} shots + ${args.puttCount ?? 0} putts + ${args.penaltyStrokes} penalties.`;
}
