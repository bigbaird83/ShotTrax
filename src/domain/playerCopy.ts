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
  deleteShot: 'Delete shot',
  deleteShotConfirm: 'Delete this shot?',
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
  prevHole: 'Prev hole',
  nextHole: 'Next hole',
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
  addShot: 'Add shot',
  shot: 'Shot',
  placed: 'Placed',
  placeFromHint: 'Tap where you hit from.',
  placeToHint: 'Tap or drag where it landed.',
  cancelPlace: 'Cancel',
  confirmPlace: 'Confirm shot',
  openPhone: 'open the phone',
  score: 'Score',
  shots: 'Shots',
  noShots: 'No shots yet.',
  inPlay: 'In play',
  logged: 'Logged',
  didntCatchClub: 'Didn’t catch a club. Say it again or pick one.',
  suggested: 'Suggested',
  changeClub: 'Change club',
  editShot: 'Edit shot',
  moveFrom: 'Move from',
  moveTo: 'Move to',
  undoEdit: 'Undo edit',
  editFromHint: 'Tap the new from pin.',
  editToHint: 'Tap the new landing pin.',
  weakLocation: 'Location is weak. Mark anyway?',
  tooFar: 'That looks too far. Mark anyway?',
  markAnyway: 'Mark anyway',
  dropAnyway: 'Drop anyway',
  cancel: 'Cancel',
  locationOff: 'Turn on location to mark.',
  simulator: 'Simulator — move the location pin between shots.',
  restoreBag: 'Restore stock bag',
  bagLede: 'Your bag. Turn off what you don’t carry. Carry is on each row.',
  bagCustomizeTitle: 'Your bag',
  bagCustomizeLede:
    'Set the clubs you carry and each club’s typical carry. That helps narrow club selection during the round.',
  bagCustomizeSkip: 'Skip',
  bagCustomizeDone: 'Done',
  averagesLede: 'How far you hit each club — from marked shots.',
  noClosedShots: 'No marked shots yet',
  typicalCarry: 'Typical',
  typicalCarryYards: 'Carry (yd)',
  clearTypicalCarry: 'Clear carry',
  estimated: 'Estimated',
  insertShot: 'Insert shot',
  nerdOut: 'Nerd out',
  nerdOutLede: 'Score, putts, and how far you hit each club.',
  scorecard: 'Scorecard',
  scorecardPar: 'Par',
  summaryHome: 'Home',
} as const;

/** Suggested chip: that club's carry, not yards-to-green. */
export function formatSuggestedClubChip(shortName: string, carryYards: number | null | undefined): string {
  return carryYards != null && Number.isFinite(carryYards) ? `${shortName} · ${Math.round(carryYards)}` : `${shortName} · —`;
}

/** Picker remaining yards. Pass the planned to-green display. Never invent. */
export function formatPickerLeftYards(result: {
  yards: number | null;
  quality: string;
}): string {
  if (
    (result.quality === 'good' || result.quality === 'soft') &&
    result.yards != null &&
    Number.isFinite(result.yards)
  ) {
    return `${Math.round(result.yards)} left`;
  }
  return '—';
}

export function finishPuttsChip(holeNumber: number): string {
  return `Finish putts · Hole ${holeNumber}`;
}

export function finishShotChip(holeNumber: number): string {
  return `Finish shot · Hole ${holeNumber}`;
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

/** Play header: Hole N · Par X plus the yards. No SI. No tee rating. */
export function formatPlayHeader(
  holeNumber: number,
  par: number | null,
  yards: number | null,
): string {
  const yardsBit =
    yards != null && Number.isFinite(yards) ? `${Math.round(yards)} yd` : '—';
  return `${formatHoleHeader(holeNumber, par)} · ${yardsBit}`;
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
  if (result.quality !== 'none' && result.yards != null && Number.isFinite(result.yards)) {
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
