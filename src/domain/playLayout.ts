import { PHONE_WHEEL_STRIP_HEIGHT } from './clubStrip';

/**
 * Play screen: map fills the hole. A frosted two-row dock sits over the map.
 * Header is a thin overlay. Add shot still takes the full screen.
 */

export const PLAY_MAP_MIN_RATIO = 0.6;

export const PLAY_DOCK_ACTIONS = ['same_club', 'add_shot', 'scorecard', 'prev', 'next'] as const;
export type PlayDockAction = (typeof PLAY_DOCK_ACTIONS)[number];

export type PlayLayout = {
  map: 'fill';
  mapMinRatio: typeof PLAY_MAP_MIN_RATIO;
  header: 'overlay';
  headerItems: readonly ['menu', 'hole', 'shots'];
  headerLines: 1;
  dockRows: readonly ['chips', 'actions'];
  dockActions: readonly PlayDockAction[];
  allClubs: 'float';
  sayClub: 'off';
  sameClub: 'short';
  shotLine: 'header';
  insertPlus: 'header';
  emptyMiddle: false;
};

export function planPlayLayout(): PlayLayout {
  return {
    map: 'fill',
    mapMinRatio: PLAY_MAP_MIN_RATIO,
    header: 'overlay',
    headerItems: ['menu', 'hole', 'shots'],
    headerLines: 1,
    dockRows: ['chips', 'actions'],
    dockActions: PLAY_DOCK_ACTIONS,
    allClubs: 'float',
    sayClub: 'off',
    sameClub: 'short',
    shotLine: 'header',
    insertPlus: 'header',
    emptyMiddle: false,
  };
}

export function playMapMinRatio(): number {
  return PLAY_MAP_MIN_RATIO;
}

export function playDockRowCount(): 2 {
  return 2;
}

export function playHeaderEatsMap(): false {
  return false;
}

export function playShowsFatAllClubs(): false {
  return false;
}

export function playShowsFatSayClub(): false {
  return false;
}

/** Wheel is the first dock row. Same club sits under it. All clubs floats above. */
export function playChipRowIncludes(): readonly ['suggested'] {
  return ['suggested'];
}

export function playUnderWheelIncludes(): readonly ['same_club'] {
  return ['same_club'];
}

export function playSameClubSitsUnderWheel(): true {
  return true;
}

export function playAllClubsSitsUnderWheel(): false {
  return false;
}

export function playAllClubsSitsAboveWheel(): true {
  return true;
}

export function playAllClubsSitsInDockRow(): false {
  return false;
}

export function playAllClubsSitsBesideWheel(): false {
  return false;
}

/** Voice club pick is gone. Strip / wheel stays. */
export function playShowsSayClub(): false {
  return false;
}

export function watchShowsSayClub(): false {
  return false;
}

/** Suggested slot is the sideways carry strip, not stacked chips. */
export function playSuggestedIsSidewaysStrip(): true {
  return true;
}

export function playStackedSuggestionChips(): false {
  return false;
}

export function playStripCappedAtThree(): false {
  return false;
}

export function playShowsTallSameClub(): false {
  return false;
}

/** Scorecard is one word on one line. It does not wrap to "Scoreca" / "rd". */
export function playScorecardWraps(): false {
  return false;
}

export function playSameClubHiddenUntilShot(): true {
  return true;
}

export function playMapMountsWhenYardsShown(): true {
  return true;
}

export function playEmptyMiddle(): false {
  return false;
}

/** Play map uses the same tee-to-green lock as Add shot, before Add shot opens. */
export function playUsesAddShotCamera(): true {
  return true;
}

/** Round start does not open a second camera path. Same planCourseCardCamera. */
export function playRoundStartSecondCameraPath(): false {
  return false;
}

/** Round start and Add shot both use planCourseCardCamera. */
export function playRoundStartUsesAddShotFramePoints(): true {
  return true;
}

/** Play, Add shot, and edit call the same course-card helper. */
export function playUsesCourseCardCamera(): true {
  return true;
}

export function playEditUsesCourseCardCamera(): true {
  return true;
}

export function playAndAddShotShareCourseCardCamera(): true {
  return true;
}

export const COURSE_CARD_CAMERA_SURFACES = ['round_start', 'add_shot', 'edit'] as const;

export function courseCardCameraSurfacesShareHelper(): true {
  return true;
}

export function roundStartShowsUserLocation(): false {
  return false;
}

export function addShotShowsUserLocation(): false {
  return false;
}

export function editShowsUserLocation(): false {
  return false;
}

/** Edit is tap-the-shot → club / from / to. Not a dock button or a third row. */
export function playEditIsDockRow(): false {
  return false;
}

/** Delete lives on the opened shot, not a dock button or a third row. */
export function playDeleteIsDockRow(): false {
  return false;
}

export function anyEarlierShotCanOpenEdit(): true {
  return true;
}

export const PLAY_REFRAME_ON = ['open', 'prev', 'next', 'scorecard_return', 'menu_return'] as const;

/** Dock waits until that hole is framed. First visible frame is the hole. */
export function playButtonsWaitForHoleFrame(): true {
  return true;
}

export function playPhonePinMovesCamera(): false {
  return false;
}

export function playShowsUserLocationFit(): false {
  return false;
}

/** After a shot lands, #1 suggested is already the primary chip. Same control. */
export function nextSuggestedIsNewButton(): false {
  return false;
}

export function nextSuggestedIsPrimaryChip(): true {
  return true;
}

/** Hole N · Par X plus yards. No SI. No tee rating. */
export function playHeaderIsOneLine(): true {
  return true;
}

export function playShowsSi(): false {
  return false;
}

export function playShowsTeeRating(): false {
  return false;
}

/** Shot list is one overlay row. Never a column under the map. */
export function playShotLineIsColumn(): false {
  return false;
}

export function playInsertPlusIsOwnBand(): false {
  return false;
}

/** In play is the shot-row text only. Not text plus a badge. */
export function playInPlayShowsTwice(): false {
  return false;
}

/** Apple Maps Legal stays hidden until the player taps the map. */
export function playHidesMapsLegal(): true {
  return true;
}

export function playHidesMapsCompass(): true {
  return true;
}

/** After a tap, Legal and the compass may show. They do not sit on the hole the whole time. */
export function playMapsChromeUntilTap(): true {
  return true;
}

/** Add shot never shows Legal, the compass, or the user-location puck. */
export function addShotHidesMapsLegal(): true {
  return true;
}

export function addShotHidesMapsCompass(): true {
  return true;
}

export function addShotHidesUserLocation(): true {
  return true;
}

export function addShotFollowsUserLocation(): false {
  return false;
}

/** Menu and dock controls — 44pt minimum. No half-size orphans. */
export const PLAY_CONTROL_MIN_TAP = 44;

/** Build 31 club-pill height. Dock actions match this, not the tiny 31 dock chips. */
export const PLAY_DOCK_ACTION_MIN_HEIGHT = 52;

export function playDockActionMinHeight(): number {
  return PLAY_DOCK_ACTION_MIN_HEIGHT;
}

/** Room above the glass dock so All clubs still floats over the map. */
export const PLAY_GLASS_DOCK_LIFT = PHONE_WHEEL_STRIP_HEIGHT + PLAY_DOCK_ACTION_MIN_HEIGHT + 28;

export function playDockIsGlass(): true {
  return true;
}

export function playDockOverlaysMap(): true {
  return true;
}

/** Lime is selected club + primary CTA only. Everything else stays muted. */
export function playLimeOnlyOnSelectedAndCta(): true {
  return true;
}

export function playHeaderSecondaryIsMuted(): true {
  return true;
}

export function playHapticsOnShotLock(): true {
  return true;
}

export function playHapticsOnHoleChange(): true {
  return true;
}

/** Glass bar is box-none so two-finger pan/pinch still hits the map. */
export function playDockPassesTwoFingerPan(): true {
  return true;
}

/** Frost fill never captures. Only the club pills and dock actions take touches. */
export function playDockGlassIgnoresTouches(): true {
  return true;
}

/** Frost layer is pointerEvents none so pinch can reach the map. */
export function playDockFrostPointerEvents(): 'none' {
  return 'none';
}

/** Add shot keeps the play map instance and the first course-card frame. */
export function addShotOpensOnPlayFrame(): true {
  return true;
}

/**
 * Glass dock is an overlay. It must not be the only in-flow sibling that
 * gives the map column height — that zeroes MapView and kills Apple tiles.
 */
export function playGlassDockZeroesMapHeight(): false {
  return false;
}

/** Play + Add shot map host is pinned to the screen under the glass dock. */
export function playMapHostUsesAbsoluteFill(): true {
  return true;
}

/** MapView itself fills that host. `flex: 1` alone collapses under overlays. */
export function holeMapViewUsesAbsoluteFill(): true {
  return true;
}

/** Opening Add shot keeps the same sized play map. No remount, no zero-height wrap. */
export function addShotKeepsPlayMapHeight(): true {
  return true;
}

/** Blank-map hotfix is layout + first-frame camera for every course, not one card. */
export function playBlankMapFixIsCourseAgnostic(): true {
  return true;
}

/**
 * Height-only (#28) was not enough. A MapView that first mounts at 0 never
 * paints tiles when later resized — remount once mapBox is real.
 */
export function holeMapRemountsWhenMapBoxSized(): true {
  return true;
}

export function holeMapMountsBeforeMeasured(): false {
  return false;
}

/** Location permission must not gate MapView. Course tee+green frame first. */
export function holeMapRequiresLocationPermission(): false {
  return false;
}

/** Green cover lifts when the host is sized. Missing tee+green is the miss card. */
export function holeMapCoverLiftsWhenSized(): true {
  return true;
}

/**
 * Signal Lab build 36 — Add shot gesture lock.
 * 1. First frame is course tee + green center only.
 * 2. After that, do not reframe.
 * 3. scrollEnabled / zoomEnabled stay on after the first frame.
 * 4. Glass frost stays pointerEvents none so it cannot eat the pinch.
 */
export function signalLabAddShotGestureLock(): {
  firstFrameUsesCourseCard: true;
  reframesAfterInitialFrame: false;
  scrollZoomAfterFrame: true;
  dockFrostPointerEvents: 'none';
} {
  return {
    firstFrameUsesCourseCard: true,
    reframesAfterInitialFrame: false,
    scrollZoomAfterFrame: true,
    dockFrostPointerEvents: playDockFrostPointerEvents(),
  };
}

/** Menu is a button, not lime text, on home and play. */
export function playMenuIsButton(): true {
  return true;
}

export function homeMenuIsButton(): true {
  return true;
}

export function homeMenuOpensSettings(): true {
  return true;
}
