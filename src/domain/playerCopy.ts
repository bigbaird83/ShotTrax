/** Player-facing copy. Accuracy / API / OSM rules stay in code, not on screen. */

/** Published mark (USPTO SN 50113482). ™ only. Not ®. */
export const SHOTTRAXX_BRAND = 'ShotTraxx™' as const;

export const COPY = {
  homeLede: 'Find a course, pick your tee, start the round.',
  home: 'Home',
  back: 'Back',
  nearbyHint: 'Courses near you — pull to refresh.',
  nearbyEmpty: 'No courses found.',
  nearbyUnavailable: 'Courses aren’t available right now. Pull to refresh or try again.',
  nearbyBusy: 'Looking nearby…',
  nearbyRefresh: 'Pull to refresh',
  courseNamePlaceholder: 'Search by name, city, state, or zip',
  pickTee: 'Pick your tee',
  start18: 'Start 18 holes',
  start9: 'Start 9 holes',
  continueRound: 'Continue round',
  finishRound: 'Finish round',
  edit: 'Edit',
  deleteRound: 'Delete round',
  deleteRoundConfirm: 'Delete this round? Shots and scores go with it.',
  deleteShot: 'Delete shot',
  deleteShotConfirm: 'Delete this shot?',
  roundHistory: 'Round history',
  exportRounds: 'Export rounds',
  exportRoundsEmpty: 'No rounds to export.',
  exportRoundsFailed: 'Couldn’t open the share sheet.',
  restoreRounds: 'Restore rounds',
  restoreRoundsTitle: 'Restore rounds',
  restoreRoundsHint: `Paste the ${SHOTTRAXX_BRAND} rounds JSON from the other phone. No account.`,
  restoreRoundsAction: 'Restore',
  restoreRoundsFailed: `That isn’t a ${SHOTTRAXX_BRAND} rounds file.`,
  restoreRoundsEmpty: 'Those rounds are already on this phone.',
  noRounds: 'Your first round will show up here.',
  firstRoundHint: 'Pick a course and start 9 or 18.',
  nearbyEmptyHint: 'Pull to refresh, or search by name, city, state, or zip.',
  nearbyNeedsLocation: 'Nearby needs location',
  zipGeocodeMiss: 'Couldn’t find that zip.',
  zipGeocodeMissHint: 'Try a city or course name.',
  lastPlayedChip: 'Played',
  roundInProgress: 'Round in progress',
  clearCourse: 'Clear course',
  clearSearch: 'Clear search',
  waitingOnGreen: 'Waiting on green location.',
  waitingOnLocation: 'Waiting on your location.',
  courseCardMissingFrame: 'Need the course tee and green for this hole.',
  hardMissNeedPins: 'HARD-MISS — need pins.',
  hardMissNeedPinsDetail: 'Tee and green are not on file.',
  pinSheet: 'Pin sheet',
  approximate: 'Approximate',
  unavailable: 'Unavailable',
  share: 'Share',
  shareFail: "Couldn't open share",
  shareLive: 'Share live',
  shareScorecard: 'Share scorecard',
  shareLiveRound: 'Share live round',
  liveBoard: 'Live board',
  liveBoardLede: 'Hole scores for friends. No map.',
  liveBoardPrivacy: 'Scores only — no map.',
  liveBoardCode: 'Board code',
  liveBoardWatch: 'Watch a live board',
  liveBoardCodeHint: 'Enter the 6-character code.',
  liveBoardNeedsHost: 'Live refresh on other phones needs the share host.',
  liveFollowSameDevice: 'Following on this phone. Live refresh on other phones needs the share host.',
  paceOfPlay: 'Pace of play',
  liveFollowOpen: 'Follow on this phone',
  liveFollowRefresh: 'Updates after each finished hole.',
  spectatorTitle: SHOTTRAXX_BRAND,
  spectatorLive: 'Live',
  spectatorFinished: 'Finished',
  spectatorNeedsNoLocation: 'Spectator view — no location needed.',
  spectatorEmpty: 'Nothing to show yet.',
  longPressGreen: 'Long-press to set the green',
  toGreen: 'To green',
  mark: 'Mark',
  marked: 'Marked',
  markWithoutClub: 'Mark without club',
  drop: 'Drop',
  penalty: 'Penalty',
  sayClub: 'Say a club',
  bag: 'Bag',
  fullBag: 'Full bag',
  allClubs: 'All clubs',
  top3: 'Top 3',
  top3Unlock: 'Top clubs unlock after a few shots',
  pickClub: 'Pick a club',
  pickClubLede: 'Picking a club marks where you hit from.',
  firstLaunchTip: 'Pick a club → walk → press to mark',
  dismissFirstLaunchTip: 'Got it',
  stickyClub: 'Same club',
  undoLast: 'Undo last',
  endShot: 'End last shot',
  prevHole: 'Prev hole',
  nextHole: 'Next hole',
  previousHole: 'Previous hole',
  menu: 'Menu',
  settings: 'Settings',
  credits: 'Credits',
  courseDataCredits: 'Hole maps © OpenStreetMap contributors and OpenGolf (ODbL).',
  courseDistance: 'Course distance',
  courseDistanceSetting: 'Course distance: Miles / Kilometers',
  colorTheme: 'Color theme',
  themeDarkLime: 'Dark lime',
  themeLight: 'Light',
  themeHighContrast: 'High contrast',
  miles: 'Miles',
  kilometers: 'Kilometers',
  madeIt: 'Made it',
  holeDone: 'Hole Out',
  finishHole: 'Hole Out',
  holeOut: 'Hole Out',
  putt: 'Putt',
  putts: 'Putts',
  puttSheetLede: 'How long was the putt?',
  puttSheetHint: 'Pick a length, then Made it — or Add putt if you miss.',
  noLength: 'No length',
  noLengthCue: 'No length — pick a distance',
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
  selectCourse: 'Select course',
  score: 'Score',
  shots: 'Shots',
  noShots: 'Tap your club after hitting to mark your shot.',
  inPlay: 'In play',
  logged: 'Logged',
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
    'Type carry on any 3 clubs to estimate the rest, or calculate from actual play.',
  bagCustomizeSkip: 'Calculate from actual play',
  bagCustomizeDone: 'Done',
  averagesLede: 'How far you hit each club — from marked shots.',
  noClosedShots: 'No marked shots yet. Play a hole and they land here.',
  typicalCarry: 'Typical',
  typicalCarryYards: 'Carry (yd)',
  clearTypicalCarry: 'Clear carry',
  estimated: 'Estimated',
  insertShot: 'Insert shot',
  nerdOut: 'Nerd out',
  nerdOutLede: 'Score vs par, putts, and club-book carries from saved rounds.',
  nerdOutLimits: 'GIR and fairway hits are not tracked. No strokes gained.',
  nerdOutThisRound: 'This round',
  nerdOutLifetime: 'Saved rounds',
  nerdOutVsPar: 'Vs par',
  nerdOutPuttsPerHole: 'Putts / hole',
  nerdOutPuttsPerRound: 'Putts / round',
  nerdOutFinishedRounds: 'Finished rounds',
  favorites: 'Favorites',
  favoritesBanner: 'Add your favorite courses here to play without internet.',
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
  downloadForOffline: 'Download for offline',
  offlineDownloading: 'Downloading',
  offlineReady: 'Ready offline',
  offlineMiss: 'Miss (no map)',
  requestThisCourse: 'Request this course',
  requestCourseTitle: 'Request this course',
  requestCourseLede: `Tell us the course. This opens your email app — ${SHOTTRAXX_BRAND} does not send it for you.`,
  contributeCourse: 'Contribute a course',
  contributeCourseTitle: 'Add this course',
  contributeOnTee: 'I’m on this tee',
  contributeOnGreen: 'I’m on this green',
  contributeTakePhoto: 'Take scorecard photo',
  contributePickPhoto: 'Pick scorecard photo',
  contributeLocation: 'City or town',
  contributeReviewNote: 'We check every course by hand before it shows up in play.',
  contributeThanks: 'Thanks — if we accept and publish your map, you get 1 free year.',
  contributeGrant: `I grant ${SHOTTRAXX_BRAND} commercial use of this map under terms compatible with ODbL.`,
  contributeEmailButton: 'Email this course',
  requestEmailButton: 'Email this request',
  requestCourseEmailBrand: SHOTTRAXX_BRAND,
  contactEmail: 'ShotTraxx@gmail.com',
  contactHandle: '@ShotTraxx',
  contactLine: 'ShotTraxx@gmail.com · X @ShotTraxx',
  courseName: 'Course name',
  city: 'City',
  notes: 'Notes',
  yourEmail: 'Your email',
  holeCount: 'Holes',
  sheet: 'Tee and green sheet',
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

export function formatPuttN(n: number): string {
  return `Putt ${n}`;
}

export function finishPuttsChip(holeNumber: number): string {
  return `Finish putts · Hole ${holeNumber}`;
}

export function finishShotChip(holeNumber: number): string {
  return `Finish shot · Hole ${holeNumber}`;
}

/** Hole summary: which real shot closed the hole. Never invented yards. */
export function holeOutClosedOnShot(seq: number): string {
  return `Hole Out · shot ${seq}`;
}

export function formatShotCount(n: number): string {
  const count = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return count === 1 ? '1 shot' : `${count} shots`;
}

export function formatPuttCount(n: number): string {
  const count = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return count === 1 ? '1 putt' : `${count} putts`;
}

/** In-round HUD: thru N holes and ±par from finished persisted scores. */
export function formatRunningParBadge(thru: number, toParLabel: string | null): string {
  return toParLabel ? `thru ${thru}, ${toParLabel}` : `thru ${thru}`;
}

export function markedSuggestedMessage(shortName: string): string {
  return `Marked ${shortName} (suggested) · Change club.`;
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

export function formatPlayHeaderPrimary(holeNumber: number): string {
  return `Hole ${holeNumber}`;
}

export function formatPlayHeaderSecondary(
  par: number | null,
  teeName?: string | null,
): string {
  const tee = teeName?.trim();
  return tee ? `${formatParLabel(par)} · ${tee}` : formatParLabel(par);
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

/** Card yards already on screen → never also say we are waiting on location. */
export function waitingOnLocationWhenYardsShown(): false {
  return false;
}

/** Lock-frame miss is a missing course tee/green. Never a GPS wait. */
export function lockFrameEmptyStateWaitsForPhone(): false {
  return false;
}

export function yardsAreOnTheCard(result: { yards: number | null; quality?: string } | null | undefined): boolean {
  return result?.yards != null && Number.isFinite(result.yards);
}

export function showWaitingOnLocationLine(args: {
  yards: number | null;
  quality?: string;
  hasFix?: boolean;
  hasGreen?: boolean;
}): boolean {
  if (yardsAreOnTheCard(args)) return false;
  if (!args.hasGreen) return false;
  return !args.hasFix;
}

export function yardsToGreenPlayerLabel(
  result: { yards: number | null; quality: string },
  ctx: { hasGreen?: boolean; hasFix?: boolean } = {},
): { heading: string; value: string; detail: string } {
  const heading = COPY.toGreen;
  if (result.yards != null && Number.isFinite(result.yards)) {
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
