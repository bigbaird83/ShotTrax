import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  addShotFramePoints,
  addShotPlaceHintShowsAsFooter,
  addShotPlaceHintShowsOnMap,
  courseCardCameraFramesLonePin,
  courseCardCameraUsesPhone,
  courseCardCameraWaitsForPhoneFix,
  holeCameraHeading,
  holeCameraLeavesAloneAfterOpen,
  holeCameraReframesOnGps,
  holeCameraReframesOnPinDrag,
  holeCameraTeeBelowGreenOnScreen,
  holeCameraUsesDeviceHeading,
  holeFrameRegion,
  openingHoleRegionContainsTeeAndGreen,
  planCourseCardCamera,
} from './holeCamera';
import {
  PLAY_DOCK_ACTIONS,
  PLAY_MAP_MIN_RATIO,
  planPlayLayout,
  playDockRowCount,
  playEmptyMiddle,
  playHeaderEatsMap,
  playInventThirdDock,
  playMapMinRatio,
  playChipRowIncludes,
  playShowsFatAllClubs,
  playShowsFatSayClub,
  playShowsTallSameClub,
  playUsesAddShotCamera,
  anyEarlierShotCanOpenEdit,
  playDeleteIsDockRow,
  playEditIsDockRow,
  playButtonsWaitForHoleFrame,
  playPhonePinMovesCamera,
  playShowsUserLocationFit,
  PLAY_REFRAME_ON,
  nextSuggestedIsNewButton,
  nextSuggestedIsPrimaryChip,
  playHeaderIsOneLine,
  playShowsSi,
  playShowsTeeRating,
  playShotLineIsColumn,
  playInsertPlusIsOwnBand,
  playInPlayShowsTwice,
  playHidesMapsLegal,
  playHidesMapsCompass,
  playMapsChromeUntilTap,
  addShotHidesMapsLegal,
  addShotHidesMapsCompass,
  addShotHidesUserLocation,
  addShotFollowsUserLocation,
  playSuggestedIsSidewaysStrip,
  playStackedSuggestionChips,
  playStripCappedAtThree,
  playUnderWheelIncludes,
  playSameClubSitsUnderWheel,
  playAllClubsSitsUnderWheel,
  playAllClubsSitsAboveWheel,
  playAllClubsSitsInDockRow,
  playAllClubsSitsBesideWheel,
  playShowsSayClub,
  watchShowsSayClub,
  PLAY_CONTROL_MIN_TAP,
  PLAY_DOCK_ACTION_MIN_HEIGHT,
  PLAY_DOCK_HOLE_OUT_SHRINK_FLEX,
  PLAY_DOCK_PUTT_FLEX,
  playDockActionMinHeight,
  playDockHoleOutShrinkFlex,
  playDockPuttFlex,
  playDockPuttIsThirdRow,
  playDockPuttOpensSheet,
  playDockPuttSitsLeftOfHoleOut,
  playDockShrinksHoleOutBesidePutt,
  playMenuIsButton,
  homeMenuIsButton,
  homeMenuOpensSettings,
  playDockIsGlass,
  playDockOverlaysMap,
  playLimeOnlyOnSelectedAndCta,
  playHeaderSecondaryIsMuted,
  playHapticsOnShotLock,
  playHapticsOnHoleChange,
  playDockPassesTwoFingerPan,
  playDockGlassIgnoresTouches,
  playDockFrostPointerEvents,
  addShotOpensOnPlayFrame,
  addShotKeepsPlayMapHeight,
  holeMapViewUsesAbsoluteFill,
  playBlankMapFixIsCourseAgnostic,
  playGlassDockZeroesMapHeight,
  playMapHostUsesAbsoluteFill,
  signalLabAddShotGestureLock,
  signalLabBlankMapBuild38,
  PLAY_GLASS_DOCK_LIFT,
  playScorecardWraps,
  playFinishedHoleMiniSummaryIsChip,
  playFinishedHoleMiniSummaryIsModal,
  playRunningParBadgeHidesDuringCatchUp,
  playRunningParBadgeIsCorner,
  playRunningParBadgeIsModal,
  playScorecardIsHeaderChip,
  playScorecardIsDockAction,
  playShowsSameClub,
  watchShowsSameClub,
  playSameClubHiddenUntilShot,
  playMapMountsWhenYardsShown,
  playRoundStartSecondCameraPath,
  playRoundStartUsesAddShotFramePoints,
  playUsesCourseCardCamera,
  playEditUsesCourseCardCamera,
  playAndAddShotShareCourseCardCamera,
  holeMapCoverLiftsWhenSized,
  holeMapMountsBeforeMeasured,
  holeMapRemountsWhenMapBoxSized,
  holeMapRequiresLocationPermission,
  signalLabBlankMapBuild39,
  signalLabCypressBlankMap,
  signalLabCypressHydrate,
  signalLabGreystoneHydrate,
  signalLabThunderbirdHydrate,
  signalLabMountainRanchHydrate,
  signalLabPleasantValleyHydrate,
} from './playLayout';
import { PHONE_WHEEL_PILL_HEIGHT } from './clubStrip';
import {
  CYPRESS_CREEK_CABOT,
  MAGNOLIA_CC,
  MYSTIC_CREEK_EL_DORADO,
  REPRO_COURSE_CARDS,
  courseCardHoleHasTeeAndGreen,
  cypressCreekHole1Card,
  magnoliaHole1Card,
  mysticCreekHole1Card,
} from './reproCourseCard';

test('play map fills at least 60% down to a two-row dock; header is overlay', () => {
  const layout = planPlayLayout();
  assert.equal(layout.map, 'fill');
  assert.equal(layout.mapMinRatio, 0.6);
  assert.equal(playMapMinRatio(), PLAY_MAP_MIN_RATIO);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(layout.header, 'overlay');
  assert.deepEqual(layout.headerItems, ['menu', 'hole', 'shots']);
  assert.equal(layout.headerLines, 1);
  assert.equal(playHeaderIsOneLine(), true);
  assert.deepEqual(layout.dockRows, ['chips', 'actions']);
  assert.equal(playDockRowCount(), 2);
  assert.deepEqual(layout.dockActions, PLAY_DOCK_ACTIONS);
  assert.deepEqual([...layout.dockActions], ['hole_out', 'add_shot', 'prev', 'next']);
  assert.equal(layout.emptyMiddle, false);
  assert.equal(playEmptyMiddle(), false);
  assert.equal(playHeaderEatsMap(), false);
  assert.equal(layout.shotLine, 'header');
  assert.equal(layout.insertPlus, 'header');
});

test('dock is not fat All clubs, Say a club, or a tall Same club', () => {
  const layout = planPlayLayout();
  assert.equal(layout.allClubs, 'float');
  assert.equal(layout.sayClub, 'off');
  assert.equal(layout.sameClub, 'off');
  assert.equal(playShowsSameClub(), false);
  assert.equal(watchShowsSameClub(), false);
  assert.equal(playScorecardIsHeaderChip(), true);
  assert.equal(playScorecardIsDockAction(), false);
  assert.deepEqual(playChipRowIncludes(), ['suggested']);
  assert.deepEqual(playUnderWheelIncludes(), ['hole_out']);
  assert.equal(playSameClubSitsUnderWheel(), false);
  assert.equal(playAllClubsSitsUnderWheel(), false);
  assert.equal(playAllClubsSitsAboveWheel(), true);
  assert.equal(playAllClubsSitsInDockRow(), false);
  assert.equal(playAllClubsSitsBesideWheel(), false);
  assert.equal(playShowsFatAllClubs(), false);
  assert.equal(playShowsFatSayClub(), false);
  assert.equal(playShowsSayClub(), false);
  assert.equal(watchShowsSayClub(), false);
  assert.equal(playShowsTallSameClub(), false);
  assert.ok(!layout.dockActions.includes('all_clubs' as (typeof layout.dockActions)[number]));
  assert.ok(!layout.dockActions.includes('say_club' as (typeof layout.dockActions)[number]));
});

test('play hole screen uses the fill layout and does not keep the empty middle', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planPlayLayout/);
  assert.match(hole, /styles\.mapFill/);
  assert.match(hole, /minHeight: 0/);
  assert.match(hole, /alignSelf: 'stretch'/);
  assert.match(hole, /StyleSheet\.absoluteFill/);
  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(addShotKeepsPlayMapHeight(), true);
  assert.match(hole, /styles\.dock/);
  assert.match(hole, /styles\.shotLine/);
  assert.match(hole, /COPY\.allClubs/);
  assert.doesNotMatch(hole, /COPY\.sayClub/);
  assert.match(hole, /styles\.dockAction/);
  assert.doesNotMatch(hole, /ThumbZone/);
  assert.doesNotMatch(hole, /styles\.shotList/);
  assert.doesNotMatch(hole, /styles\.clubChip/);
  assert.match(hole, /planCourseCardCamera/);
  assert.doesNotMatch(hole, /lockHoleCamera/);
  assert.match(hole, /lockFrame/);
  assert.doesNotMatch(hole, /lockFrame=\{catchUpFullScreen|lockFrame=\{placing/);
  assert.match(hole, /playMapFrameEpoch/);
  assert.doesNotMatch(hole, /catchUpFullScreen \? 'catchup'/);
  assert.doesNotMatch(hole, /frameEpoch=\{catchUpFullScreen/);
  assert.doesNotMatch(hole, /catchUpFullScreen \? styles\.mapWrapFull/);
  assert.equal(addShotOpensOnPlayFrame(), true);
  assert.equal(playDockFrostPointerEvents(), 'none');
  assert.match(hole, /onFrameReady=\{setMapFramed\}/);
  assert.match(hole, /bumpPlayFrame/);
  assert.equal(playButtonsWaitForHoleFrame(), true);
  assert.equal(playPhonePinMovesCamera(), false);
  assert.equal(playShowsUserLocationFit(), false);
  assert.deepEqual([...PLAY_REFRAME_ON], ['open', 'prev', 'next', 'scorecard_return', 'menu_return']);
  assert.match(hole, /resolvePlayHoleTee/);
  assert.match(hole, /resolveOverlayTee/);
  assert.equal(playUsesAddShotCamera(), true);
  assert.equal(playRoundStartUsesAddShotFramePoints(), true);
  assert.equal(playRoundStartSecondCameraPath(), false);
  assert.equal(playUsesCourseCardCamera(), true);
  assert.equal(playEditUsesCourseCardCamera(), true);
  assert.equal(playAndAddShotShareCourseCardCamera(), true);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /holeMapUserLocationVisible\(\{/);
  assert.match(map, /styles\.mapCover/);
  assert.match(map, /map: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.match(map, /bleed: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.match(map, /tee \+ green only/);
  assert.doesNotMatch(
    map.slice(map.indexOf('const lockedRegion'), map.indexOf('const dragLines')),
    /userFix|coords\.length/,
  );
  const fitBlock = map.slice(map.indexOf('if (lockFrame) {'), map.indexOf('mapRef.current?.fitToCoordinates'));
  assert.match(fitBlock, /if \(framedOnce\.current\) return;/);
});

test('All clubs floats above the wheel; edit is tap a shot, not a dock row', () => {
  assert.equal(playDockRowCount(), 2);
  assert.deepEqual(playChipRowIncludes(), ['suggested']);
  assert.deepEqual(playUnderWheelIncludes(), ['hole_out']);
  assert.equal(playAllClubsSitsInDockRow(), false);
  assert.equal(playEditIsDockRow(), false);
  assert.equal(anyEarlierShotCanOpenEdit(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.doesNotMatch(dock, /COPY\.allClubs/);
  assert.doesNotMatch(dock, /COPY\.sayClub/);
  const wheelAt = dock.indexOf('<ClubStrip');
  const holeOutAt = dock.indexOf('COPY.holeOut');
  const allAt = hole.indexOf('styles.allClubsFloat');
  assert.ok(wheelAt >= 0 && holeOutAt > wheelAt);
  assert.ok(allAt >= 0 && allAt < hole.indexOf('styles.dock'));
  assert.doesNotMatch(dock, /COPY\.editShot|COPY\.changeClub|COPY\.moveFrom|COPY\.moveTo/);
  assert.match(hole, /shots\.map\(\(shot\) => \{[\s\S]*openEdit\(shot\.id\)/);
  assert.match(hole, /label=\{COPY\.changeClub\}/);
  assert.match(hole, /label=\{COPY\.moveFrom\}/);
  assert.match(hole, /label=\{COPY\.moveTo\}/);
  assert.match(hole, /toGreenDisplayFromHole/);
  assert.match(hole, /lastLandingMark/);
  assert.match(hole, /resolveNextShotDistanceTarget/);
  assert.match(hole, /formatPlayHeader/);
  assert.match(hole, /planPlayHeaderYards/);
  assert.doesNotMatch(hole, /formatSiLabel/);
  assert.doesNotMatch(hole, /formatTeeMeta/);
  assert.doesNotMatch(hole, /styles\.stickyMeta|styles\.toGreenChip/);
  assert.doesNotMatch(dock, /COPY\.deleteShot/);
  const editSheet = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editSheet, /COPY\.deleteShot/);
  assert.match(editSheet, /onDeleteShot\(editingShot\.id\)/);
  assert.match(editSheet, /<HoleMap/);
  assert.match(editSheet, /lockFrame/);
  assert.match(editSheet, /frameEpoch=\{`edit-/);
});

test('Add shot, play, and edit open hole-up once; map chip stays, footer does not', () => {
  assert.equal(addShotPlaceHintShowsOnMap(), true);
  assert.equal(addShotPlaceHintShowsAsFooter(), false);
  assert.equal(holeCameraLeavesAloneAfterOpen(), true);
  assert.equal(holeCameraReframesOnGps(), false);
  assert.equal(holeCameraReframesOnPinDrag(), false);
  assert.equal(holeCameraUsesDeviceHeading(), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planCourseCardCamera/);
  assert.doesNotMatch(hole, /lastHoleCamera/);
  assert.doesNotMatch(hole, /lockHoleCamera/);
  assert.match(hole, /styles\.catchUpHint/);
  assert.match(hole, /placeHint=\{placeHint\}/);
  assert.match(hole, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.doesNotMatch(hole, /heading=\{fix|deviceHeading|compass/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /lockFrame/);
  assert.match(playMap, /framePoints=/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.doesNotMatch(playMap, /holeCamera\?\.points/);
  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /<HoleMap/);
  assert.match(editMap, /lockFrame/);
  assert.match(editMap, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.match(editMap, /courseCamera\?\.points/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /initialCamera: paintCamera/);
  assert.match(map, /initialRegion: lockedRegion/);
  assert.doesNotMatch(map, /camera: holeUpCamera/);
  assert.doesNotMatch(map, /[^l]region: lockedRegion/);
  assert.doesNotMatch(map, /styles\.placeHint/);
  const ready = map.slice(map.indexOf('onMapReady'), map.indexOf('onRegionChangeComplete'));
  assert.match(ready, /if \(framedOnce\.current\) return;/);
  assert.doesNotMatch(ready, /applyLockedCamera/);
  const settled = map.slice(map.indexOf('const onRegionSettled'), map.indexOf('if (!lockedRegion)'));
  assert.match(settled, /if \(framedOnce\.current\) return;/);
  assert.doesNotMatch(settled, /framedOnce\.current = false/);
  assert.doesNotMatch(
    settled.slice(settled.indexOf('if (framedOnce.current)'), settled.indexOf('if (regionIsHoleFrame')),
    /applyLockedCamera|frameLockedMap|planCourseCardCamera/,
  );
});

test('opening, Prev/Next, and Scorecard or Menu return reframe before the dock comes back', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /setMapFramed\(false\)/);
  assert.match(hole, /bumpPlayFrame/);
  assert.match(hole, /dismissScorecard/);
  assert.match(hole, /goToHole/);
  assert.match(hole, /showPlayDockForCourseCard\(\{/);
  assert.match(hole, /paintMounts: courseCardPaint\.mount/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /onFrameReady/);
  assert.match(map, /styles\.userDot/);
  assert.match(map, /holeMapUserLocationVisible\(\{/);
  assert.doesNotMatch(
    map.slice(map.indexOf('const coords = useMemo'), map.indexOf('const lockedPoints')),
    /userFix/,
  );
});

test('after a shot lands the next suggested club is already the primary chip', () => {
  assert.equal(nextSuggestedIsNewButton(), false);
  assert.equal(nextSuggestedIsPrimaryChip(), true);
  assert.equal(playSuggestedIsSidewaysStrip(), true);
  assert.equal(playStackedSuggestionChips(), false);
  assert.equal(playStripCappedAtThree(), false);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /<ClubStrip/);
  assert.match(hole, /planClubStrip/);
  assert.match(hole, /target\?\.dYards/);
  assert.match(hole, /applyWheelSelection/);
  assert.match(hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.addShot')), /void markClub\(full\)/);
  assert.match(hole, /resolveNextShotDistanceTarget/);
  assert.match(hole, /lastLandingMark/);
  assert.doesNotMatch(hole, /nextClub|Next club|suggestedButton/);
  assert.doesNotMatch(hole, /ranked\.map\(\(club, index\) =>/);
});

test('tapping a previous shot shows Delete on that shot, not the dock', () => {
  assert.equal(playDeleteIsDockRow(), false);
  assert.equal(playEditIsDockRow(), false);
  assert.equal(playDockRowCount(), 2);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.doesNotMatch(dock, /COPY\.deleteShot|onDeleteShot|Delete this shot/);
  const editSheet = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editSheet, /label=\{COPY\.deleteShot\}/);
  assert.match(editSheet, /onDeleteShot\(editingShot\.id\)/);
  assert.match(hole, /deleteShotPrompt/);
  assert.match(hole, /prompt\.cancel/);
});

test('play header is one line; shot list is one overlay row with + and In play once', () => {
  assert.equal(playHeaderIsOneLine(), true);
  assert.equal(playShowsSi(), false);
  assert.equal(playShowsTeeRating(), false);
  assert.equal(playShotLineIsColumn(), false);
  assert.equal(playInsertPlusIsOwnBand(), false);
  assert.equal(playInPlayShowsTwice(), false);
  assert.equal(playHidesMapsLegal(), true);
  assert.equal(playHidesMapsCompass(), true);
  assert.equal(playMapsChromeUntilTap(), true);
  assert.equal(playHeaderEatsMap(), false);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(playDockRowCount(), 2);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  assert.match(play, /formatPlayHeader\(hole\.number, hole\.par, playHeaderYards\.yards\)/);
  assert.match(play, /yardsToGreen: target\?\.dYards/);
  assert.match(hole, /planPlayHeaderYards\(\{[\s\S]*?shots,/);
  assert.match(play, /numberOfLines=\{1\}/);
  assert.doesNotMatch(play, /formatSiLabel|SI unknown/);
  assert.doesNotMatch(play, /formatTeeMeta|Rating |Slope /);
  assert.match(play, /styles\.shotLine/);
  assert.match(play, /horizontal/);
  assert.match(play, /styles\.shotLinePlus/);
  assert.doesNotMatch(play, /styles\.insertPlus/);
  assert.doesNotMatch(play, /styles\.shotList/);
  const overlayShots = play.slice(play.indexOf('playLayout.shotLine'), play.indexOf('!hideHoleButtons'));
  assert.match(overlayShots, /COPY\.inPlay/);
  assert.doesNotMatch(overlayShots, /QualityBadge/);
  assert.match(overlayShots, /styles\.shotLinePlus/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /showsCompass=\{allowMapsChrome && mapsChrome\}/);
  assert.match(map, /legalLabelInsets/);
  assert.match(map, /revealMapsChrome/);
});

test('Add shot hides the user puck, Legal, and compass; play and edit wait for a tap', () => {
  assert.equal(addShotHidesUserLocation(), true);
  assert.equal(addShotFollowsUserLocation(), false);
  assert.equal(addShotHidesMapsLegal(), true);
  assert.equal(addShotHidesMapsCompass(), true);
  assert.equal(playHidesMapsLegal(), true);
  assert.equal(playHidesMapsCompass(), true);
  assert.equal(playMapsChromeUntilTap(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.match(playMap, /allowMapsChrome=\{!catchUpFullScreen\}/);
  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /showPhonePin=\{false\}/);
  assert.match(editMap, /allowMapsChrome/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const userLoc = map.slice(map.indexOf('showsUserLocation='), map.indexOf('showsMyLocationButton'));
  assert.match(userLoc, /holeMapUserLocationVisible\(\{/);
  assert.match(userLoc, /lockFrame,/);
  assert.match(userLoc, /allowMapsChrome,/);
  assert.doesNotMatch(userLoc, /true/);
  assert.match(map, /followsUserLocation=\{false\}/);
  assert.match(map, /showPhonePin && userDot/);
  assert.match(map, /!allowMapsChrome \? <View pointerEvents="none" style=\{styles\.legalCover\}/);
  assert.match(map, /showsCompass=\{allowMapsChrome && mapsChrome\}/);
  assert.doesNotMatch(map, /followsUserLocation=\{true\}/);
  assert.doesNotMatch(map, /showsUserLocation=\{true\}/);
});

test('play map still mounts; waiting line is off when 282 is on the card; Scorecard is one word; Same club waits for a shot', () => {
  assert.equal(playMapMountsWhenYardsShown(), true);
  assert.equal(playScorecardWraps(), false);
  assert.equal(playFinishedHoleMiniSummaryIsChip(), true);
  assert.equal(playFinishedHoleMiniSummaryIsModal(), false);
  assert.equal(playRunningParBadgeIsCorner(), true);
  assert.equal(playRunningParBadgeIsModal(), false);
  assert.equal(playRunningParBadgeHidesDuringCatchUp(), true);
  assert.equal(playSameClubHiddenUntilShot(), true);
  assert.ok(playMapMinRatio() >= 0.6);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  assert.match(play, /<HoleMap/);
  assert.match(play, /styles\.mapFill/);
  assert.match(hole, /minHeight: 0/);
  assert.match(play, /COPY\.holeOut/);
  assert.doesNotMatch(play, /COPY\.stickyClub/);
  assert.match(hole, /styles\.scorecardChip/);
  assert.equal(playScorecardIsHeaderChip(), true);
  assert.equal(playScorecardIsDockAction(), false);
  assert.match(play, /numberOfLines=\{1\}/);
  assert.match(play, /COPY\.scorecard/);
  assert.doesNotMatch(hole, /'Scoreca'|"Scoreca"/);
  assert.match(hole, /planRunningParBadge/);
  assert.match(hole, /testID="running-par-badge"/);
  assert.match(hole, /pointerEvents="none"/);

  const header = hole.slice(hole.indexOf('styles.stickyInner'), hole.indexOf('styles.shotLine'));
  const scorecard = header.slice(
    header.indexOf('style={styles.scorecardChip}'),
    header.indexOf('styles.scorecardChipText') + 80,
  );
  assert.match(scorecard, /numberOfLines=\{1\}/);
  assert.match(scorecard, /scorecardChip/);
  assert.doesNotMatch(scorecard, /styles\.dock/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /MapView/);
  assert.match(map, /showWaitingOnLocationLine/);
  assert.match(map, /!yardsOnCard/);
  assert.match(map.slice(map.indexOf('function TrailFallback'), map.indexOf('function NativeHoleMap')), /yardsOnCard/);
  assert.doesNotMatch(
    map.slice(map.indexOf('function TrailFallback'), map.indexOf('function NativeHoleMap')),
    /hasGreen \? COPY\.waitingOnLocation/,
  );
});

test('round start and Add shot both call the same helper and frame tee+green with no fix', () => {
  assert.equal(playAndAddShotShareCourseCardCamera(), true);
  assert.equal(playUsesCourseCardCamera(), true);
  assert.equal(playEditUsesCourseCardCamera(), true);
  assert.equal(playRoundStartSecondCameraPath(), false);
  assert.equal(courseCardCameraWaitsForPhoneFix(), false);
  assert.equal(courseCardCameraUsesPhone(), false);
  assert.equal(courseCardCameraFramesLonePin(), false);

  const tee = { lat: 34.11, lng: -85.64 };
  const green = { lat: 34.1124, lng: -85.64 };
  const home = { lat: 40.7128, lng: -74.006 };

  const roundStart = planCourseCardCamera({ tee, green, phone: null });
  const addShot = planCourseCardCamera({ tee, green, phone: null });
  const fromHome = planCourseCardCamera({ tee, green, phone: home });
  const lonePin = planCourseCardCamera({ tee: null, green, phone: home });
  const houseOnly = planCourseCardCamera({ tee: null, green: null, phone: home });

  assert.deepEqual(roundStart, addShot);
  assert.deepEqual(roundStart?.points, [tee, green]);
  assert.deepEqual(addShot?.points, [tee, green]);
  assert.deepEqual(fromHome?.points, [tee, green]);
  assert.deepEqual(fromHome, roundStart);
  assert.equal(roundStart?.heading, holeCameraHeading(tee, green));
  assert.notEqual(roundStart?.heading, holeCameraHeading(home, green));
  assert.equal(holeCameraTeeBelowGreenOnScreen(tee, green, roundStart?.heading ?? null), true);
  assert.equal(openingHoleRegionContainsTeeAndGreen(holeFrameRegion(roundStart?.points ?? []), tee, green), true);
  assert.equal(lonePin, null);
  assert.equal(houseOnly, null);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: null }), roundStart?.points);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: home }), addShot?.points);
  assert.equal(addShotFramePoints({ tee: null, green, phone: home }), null);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.equal((hole.match(/planCourseCardCamera\(/g) ?? []).length, 1);
  assert.match(hole, /const courseCamera = planCourseCardCamera\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);
  assert.doesNotMatch(hole, /lockHoleCamera/);
  assert.doesNotMatch(hole, /addShotFramePoints/);
  assert.doesNotMatch(hole, /shotPinsForHoleCamera/);
  assert.doesNotMatch(hole, /lastHoleCamera/);
  assert.doesNotMatch(hole, /planHoleCamera/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.doesNotMatch(playMap, /holeCamera|addShotPoints|getCurrentFix/);

  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /heading=\{courseCardPaint\.mount \? courseCamera\?\.heading \?\? null : null\}/);
  assert.match(editMap, /courseCamera\?\.points/);
  assert.doesNotMatch(editMap, /holeCamera|lockHoleCamera/);
});

test('build 32 cook-gate: Menu is a button, All clubs floats, dock matches 31 pills, Say a club is gone', () => {
  assert.equal(playMenuIsButton(), true);
  assert.equal(homeMenuIsButton(), true);
  assert.equal(homeMenuOpensSettings(), true);
  assert.equal(playAllClubsSitsInDockRow(), false);
  assert.equal(playAllClubsSitsAboveWheel(), true);
  assert.equal(playShowsSayClub(), false);
  assert.equal(watchShowsSayClub(), false);
  assert.equal(playDockActionMinHeight(), PLAY_DOCK_ACTION_MIN_HEIGHT);
  assert.equal(PLAY_DOCK_ACTION_MIN_HEIGHT, 52);
  assert.ok(playMapMinRatio() >= 0.6);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');

  assert.match(home, /styles\.menuButton/);
  assert.match(home, /COPY\.menu/);
  assert.match(home, /router\.push\('\/settings'\)/);
  assert.match(home, /minHeight: tapTarget/);
  assert.match(hole, /styles\.menuButton/);
  assert.match(hole, /minHeight: tapTarget/);
  assert.match(hole, /COPY\.menu/);
  assert.doesNotMatch(
    hole.slice(hole.indexOf('styles.menuButton'), hole.indexOf('menuButtonText')),
    /styles\.back[^A-Za-z]/,
  );

  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.doesNotMatch(dock, /COPY\.allClubs/);
  assert.doesNotMatch(dock, /COPY\.sayClub/);
  assert.match(dock, /COPY\.holeOut/);
  assert.doesNotMatch(dock, /COPY\.stickyClub/);
  assert.match(dock, /COPY\.addShot/);
  assert.doesNotMatch(dock, /COPY\.scorecard/);
  assert.match(hole, /styles\.scorecardChip/);
  assert.match(dock, /COPY\.prevHole/);
  assert.match(dock, /COPY\.nextHole/);
  assert.match(hole, /styles\.allClubsFloat/);
  assert.match(hole, /styles\.allClubsPill/);
  assert.match(hole, /height: PHONE_WHEEL_PILL_HEIGHT/);
  assert.match(hole, /minHeight: PLAY_DOCK_ACTION_MIN_HEIGHT/);
  assert.doesNotMatch(hole, /COPY\.sayClub/);
  assert.doesNotMatch(pick, /COPY\.sayClub/);
  assert.doesNotMatch(watch, /Say a club/);
  assert.doesNotMatch(watch, /Listening/);
});

test('build 33 cook-gate: play stays on hole, three themes, history row fields', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(hole, /shouldAutoOpenClubPick/);
  assert.match(hole, /playHrefAfterHoleChange/);
  assert.match(hole, /allClubsHref/);
  assert.match(hole, /hapticLight/);
  assert.match(hole, /styles\.holeMeta/);
  assert.match(hole, /formatPlayHeader\(hole\.number, hole\.par, playHeaderYards\.yards\)/);
  assert.match(home, /playHrefAfterRoundStart/);
  assert.match(home, /formatHistoryRow/);
  assert.match(home, /row\.date/);
  assert.match(home, /row\.tees/);
  assert.match(settings, /COLOR_THEME_IDS/);
  assert.match(settings, /COPY\.colorTheme/);
  assert.doesNotMatch(settings, /ColorPicker/);
  assert.ok(playDockActionMinHeight() >= PLAY_CONTROL_MIN_TAP);
  assert.equal(PLAY_CONTROL_MIN_TAP, 44);
  assert.ok(PHONE_WHEEL_PILL_HEIGHT >= PLAY_CONTROL_MIN_TAP);
  assert.match(home, /row\.relative/);
  assert.equal(playHidesMapsLegal(), true);
  assert.equal(playHidesMapsCompass(), true);
});

test('build 35 cook-gate: glass dock, one accent, trails, type, cards, empty, haptics, scorecard, one-press', () => {
  assert.equal(playDockIsGlass(), true);
  assert.equal(playDockOverlaysMap(), true);
  assert.equal(playLimeOnlyOnSelectedAndCta(), true);
  assert.equal(playHeaderSecondaryIsMuted(), true);
  assert.equal(playHapticsOnShotLock(), true);
  assert.equal(playHapticsOnHoleChange(), true);
  assert.equal(playDockPassesTwoFingerPan(), true);
  assert.equal(playDockGlassIgnoresTouches(), true);
  assert.ok(PLAY_GLASS_DOCK_LIFT > PLAY_DOCK_ACTION_MIN_HEIGHT);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const score = readFileSync(new URL('../ui/ScorecardBody.tsx', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('./appIcon.test.ts', import.meta.url), 'utf8');
  const strip = hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.addShot'));
  const mark = hole.slice(hole.indexOf('const markClub'), hole.indexOf('const onMark'));

  assert.match(hole, /colors\.glass/);
  assert.match(hole, /pointerEvents="box-none"/);
  assert.match(hole, /styles\.dockGlass/);
  assert.match(hole, /pointerEvents="none" style=\{styles\.dockGlass\}/);
  assert.match(hole, /pointerEvents="box-none" style=\{styles\.dockRow\}/);
  assert.match(hole, /touches\.length >= 2/);
  assert.match(hole, /dockPassMap \? 'none' : 'box-none'/);
  assert.match(phone, /touches\.length >= 2/);
  assert.match(phone, /passMap \? 'none' : 'box-none'/);
  assert.match(hole, /position: 'absolute'/);
  assert.match(hole, /PLAY_GLASS_DOCK_LIFT/);
  assert.match(hole, /formatPlayHeaderPrimary/);
  assert.match(hole, /formatPlayHeaderSecondary/);
  assert.match(hole, /styles\.holeMeta/);
  assert.match(mark, /hapticMark/);
  assert.match(mark, /hapticLight/);
  assert.match(hole, /hapticLight\(\);\s*\n\s*router\.replace\(playHrefAfterHoleChange/);

  assert.match(map, /planShotTrail/);
  assert.match(map, /lineDashPattern/);
  assert.doesNotMatch(map, /colors\.lime/);

  assert.match(home, /EmptyPanel/);
  assert.match(home, /lastPlayedAtByCourse/);
  assert.match(home, /planCourseCard|formatLastPlayedChip/);

  assert.match(score, /styles\.card/);
  assert.match(score, /scorecardDiffLabel/);
  assert.match(score, /colors\.good/);
  assert.match(score, /colors\.red/);

  assert.match(strip, /void markClub\(full\)/);
  assert.match(strip, /applyWheelSelection/);
  assert.match(mark, /markShotWithClub/);
  assert.match(mark, /tee: holeTee/);
  assert.doesNotMatch(hole, /confirmWheelClub|onConfirm=\{confirmWheelClub\}/);
  assert.doesNotMatch(phone, /onConfirm|PanResponder|clubStripSlideUpConfirmed/);
  assert.match(phone, /onPress=\{\(\) => onPick\(item\.id\)\}/);
  assert.doesNotMatch(phone, /onScroll=\{/);
  assert.match(watch, /session\.pick\(clubId: club.id\)/);
  assert.doesNotMatch(watch, /DragGesture|clubStripSlideUpConfirmed|session\.select\(club.id\)/);
  assert.match(icon, /locked Build 36 night-green Shot\/Traxx/);
});

test('Signal Lab: trail chip is logged yards, soft/forced keep a badge, glass dock passes two-finger pan', () => {
  assert.deepEqual(signalLabAddShotGestureLock(), {
    firstFrameUsesCourseCard: true,
    reframesAfterInitialFrame: false,
    scrollZoomAfterFrame: true,
    dockFrostPointerEvents: 'none',
  });
  assert.equal(playDockPassesTwoFingerPan(), true);
  assert.equal(playDockGlassIgnoresTouches(), true);
  assert.equal(playDockFrostPointerEvents(), 'none');
  assert.equal(addShotOpensOnPlayFrame(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const badge = readFileSync(new URL('../ui/Badge.tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('dockPassMap ?'), hole.indexOf('<FullSheet'));
  const trailBlock = map.slice(map.indexOf('{closed.map((shot, index)'), map.indexOf('{shots.filter(hasGpsStart)'));

  assert.match(dock, /pointerEvents="none" style=\{styles\.dockGlass\}/);
  assert.match(dock, /pointerEvents="box-none" style=\{styles\.dockRow\}/);
  assert.match(dock, /dockPassMap \? 'none' : 'box-none'/);
  assert.match(hole, /touches\.length >= 2/);
  assert.match(phone, /touches\.length >= 2/);
  assert.doesNotMatch(dock, /backgroundColor: colors\.glass/);

  assert.match(trailBlock, /distanceYards: shot\.distanceYards/);
  assert.match(trailBlock, /fixQuality: shot\.fixQuality/);
  assert.match(trailBlock, /QualityBadge/);
  assert.doesNotMatch(trailBlock, /playHeaderYards|hole\.yards|yardsToGreen/);
  assert.match(badge, /quality === 'soft' \|\| quality === 'forced'/);
});

test('P0: full-bleed MapView has real height under the glass dock; Add shot keeps it', () => {
  assert.equal(playBlankMapFixIsCourseAgnostic(), true);
  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(CYPRESS_CREEK_CABOT.city, 'Cabot');
  assert.deepEqual(
    REPRO_COURSE_CARDS.map((course) => course.name),
    ['Magnolia Country Club', 'Cypress Creek', 'Mystic Creek'],
  );
  assert.equal(MYSTIC_CREEK_EL_DORADO.city, 'El Dorado');

  for (const card of [magnoliaHole1Card(), cypressCreekHole1Card(), mysticCreekHole1Card()]) {
    assert.equal(courseCardHoleHasTeeAndGreen(card), true);
    const start = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
    const addShot = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
    assert.ok(start);
    assert.deepEqual(start, addShot);
    assert.deepEqual(start.points, [card.tee, card.green]);
    assert.equal(planCourseCardCamera({ tee: null, green: card.green, phone: null }), null);
    assert.equal(planCourseCardCamera({ tee: card.tee, green: null, phone: { lat: 40.71, lng: -74.0 } }), null);
  }
  assert.equal(MAGNOLIA_CC.name, 'Magnolia Country Club');

  assert.equal(playGlassDockZeroesMapHeight(), false);
  assert.equal(playMapHostUsesAbsoluteFill(), true);
  assert.equal(holeMapViewUsesAbsoluteFill(), true);
  assert.equal(addShotKeepsPlayMapHeight(), true);
  assert.equal(addShotOpensOnPlayFrame(), true);
  assert.equal(playDockOverlaysMap(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const mapFill = hole.slice(hole.indexOf('mapFill:'), hole.indexOf('catchUpBar:'));
  assert.match(mapFill, /StyleSheet\.absoluteFill/);
  assert.match(mapFill, /minHeight: 0/);
  assert.match(mapFill, /alignSelf: 'stretch'/);
  assert.match(hole, /<View collapsable=\{false\} style=\{styles\.mapFill\}>/);
  assert.doesNotMatch(hole, /catchUpFullScreen \? styles\.mapWrapFull/);
  assert.equal((hole.match(/planCourseCardCamera\(/g) ?? []).length, 1);
  assert.match(hole, /const courseCardFrame = diagnoseCourseCardFrame\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);
  assert.match(hole, /courseCardFrame\.ok/);
  assert.match(hole, /const courseCamera = planCourseCardCamera\(\{[\s\S]*?tee: holeTee,[\s\S]*?green,[\s\S]*?phone: null,/);

  assert.match(map, /bleed: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.match(map, /map: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFill,/);
  assert.match(map, /style=\{\[styles\.map, mapBox,/);
  assert.match(map, /holeMapShouldMount\(mapBox\)/);
  assert.match(map, /key=\{mapPaintKey\}/);
  assert.match(map, /holeMapRevealWhenCourseFramePlanned/);
  assert.match(map, /revealCourseFrameIfPlanned/);
  assert.doesNotMatch(map, /styles\.mapHidden/);
  assert.doesNotMatch(map, /opacity: 0/);
  assert.match(map, /showMapCover \? \(/);
  assert.match(map, /initialRegion: lockedRegion/);
  assert.equal(holeMapRemountsWhenMapBoxSized(), true);
  assert.equal(holeMapMountsBeforeMeasured(), false);
  assert.equal(holeMapCoverLiftsWhenSized(), true);
  assert.equal(holeMapRequiresLocationPermission(), false);
  assert.equal(signalLabBlankMapBuild38().remountMapWhenSized, true);
  assert.equal(signalLabBlankMapBuild38().gatesOnLocationPermission, false);
  assert.equal(signalLabBlankMapBuild38().courseCardMissShowsExplicitUi, true);
  assert.equal(signalLabBlankMapBuild38().firstFramePhoneNull, true);
  assert.equal(signalLabBlankMapBuild38().showsUserLocationOnLockFrame, false);
  assert.equal(signalLabBlankMapBuild39().hidesWithOpacity, false);
  assert.equal(signalLabBlankMapBuild39().alwaysPassesInitialRegion, true);
  assert.equal(signalLabBlankMapBuild39().coverLiftsWhenSized, true);
  assert.equal(signalLabBlankMapBuild39().addShotDoesNotRemountSizedMap, true);
  assert.equal(signalLabCypressBlankMap().missDoesNotMountMapView, true);
  assert.equal(signalLabCypressBlankMap().playDockOnMiss, true);
  assert.equal(signalLabCypressBlankMap().magnoliaStillPaints, true);
  assert.equal(signalLabCypressBlankMap().camdenStillPaints, true);
  assert.equal(signalLabCypressBlankMap().cypressSpecific, false);
  assert.equal(signalLabCypressBlankMap().cabotPocket, true);
  assert.equal(signalLabCypressBlankMap().checksCypressAndGreystoneTogether, true);
  assert.equal(signalLabCypressBlankMap().sideBySideMagnoliaCamdenCypress, true);
  assert.equal(signalLabCypressBlankMap().missWhenSamePoint, true);
  assert.equal(signalLabCypressBlankMap().missWhenAbsurdSpan, true);
  assert.equal(signalLabCypressBlankMap().paintOnlyWhenNormalHole, true);
  assert.equal(signalLabCypressBlankMap().logsFailVsPaintCount, true);
  assert.equal(signalLabCypressBlankMap().blanksCypressGreystonePleasantValley, true);
  assert.equal(signalLabCypressBlankMap().threeBlanksNotOneOff, true);
  assert.equal(signalLabCypressBlankMap().logsFailList, true);
  assert.equal(signalLabCypressBlankMap().doesNotAskDocToSmoke, true);
  assert.equal(signalLabCypressHydrate().cypressOnly, true);
  assert.equal(signalLabCypressHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabCypressHydrate().neverInventFromClubhouse, true);
  assert.equal(signalLabCypressHydrate().greystoneWestStillMisses, false);
  assert.equal(signalLabCypressHydrate().pleasantValleyStillMisses, false);
  assert.equal(signalLabGreystoneHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabGreystoneHydrate().cypressStillExclusive, true);
  assert.equal(signalLabGreystoneHydrate().neverInventFromClubhouse, true);
  assert.equal(signalLabGreystoneHydrate().pleasantValleyStillMisses, false);
  assert.equal(signalLabPleasantValleyHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabPleasantValleyHydrate().cypressStillExclusive, true);
  assert.equal(signalLabPleasantValleyHydrate().greystoneStillExclusive, true);
  assert.equal(signalLabPleasantValleyHydrate().neverInventFromClubhouse, true);
  assert.equal(signalLabThunderbirdHydrate().thunderbirdHeberSpringsOnly, true);
  assert.equal(signalLabThunderbirdHydrate().paintsViaHydrateWhenProMisses, false);
  assert.equal(signalLabThunderbirdHydrate().neverInventFromClubhouse, true);
  assert.equal(signalLabThunderbirdHydrate().neverInventUnlabeledGreens, true);
  assert.equal(signalLabThunderbirdHydrate().hardMissAllNine, true);
  assert.equal(signalLabThunderbirdHydrate().needsDocPinSheets, false);
  assert.equal(signalLabThunderbirdHydrate().needsDocTeePins, true);
  assert.equal(signalLabThunderbirdHydrate().greensFromDocPinSheets, true);
  assert.equal(signalLabThunderbirdHydrate().neverInventTees, true);
  assert.equal(signalLabMountainRanchHydrate().mountainRanchFairfieldBayOnly, true);
  assert.equal(signalLabMountainRanchHydrate().paintsViaHydrateWhenProMisses, true);
  assert.equal(signalLabMountainRanchHydrate().neverInventFromClubhouse, true);
  assert.equal(signalLabMountainRanchHydrate().thunderbirdStillExclusive, true);
  assert.match(map, /collapsable=\{false\}/);
  const userLoc = map.slice(map.indexOf('showsUserLocation='), map.indexOf('showsMyLocationButton'));
  assert.match(userLoc, /holeMapUserLocationVisible\(\{/);
  assert.doesNotMatch(userLoc, /true/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  const fallback = map.slice(map.indexOf('function TrailFallback'), map.indexOf('function NativeHoleMap'));
  assert.match(fallback, /frameMiss/);
  assert.match(fallback, /COPY\.courseCardMissingFrame/);
  assert.match(fallback, /styles\.missCard/);
  assert.match(fallback, /course-card-miss/);
  assert.doesNotMatch(
    fallback.slice(fallback.indexOf('if (frameMiss)'), fallback.indexOf('YardsToGreenBadge')),
    /COPY\.waitingOnLocation/,
  );
});

test('Signal: dock Putt sits left of a shrunken Hole Out — not a third row', () => {
  assert.equal(playDockRowCount(), 2);
  assert.equal(playInventThirdDock(), false);
  assert.equal(playDockPuttIsThirdRow(), false);
  assert.equal(playDockPuttSitsLeftOfHoleOut(), true);
  assert.equal(playDockShrinksHoleOutBesidePutt(), true);
  assert.equal(playDockPuttOpensSheet(), true);
  assert.equal(playDockPuttFlex(), PLAY_DOCK_PUTT_FLEX);
  assert.equal(playDockHoleOutShrinkFlex(), PLAY_DOCK_HOLE_OUT_SHRINK_FLEX);
  assert.ok(PLAY_DOCK_PUTT_FLEX > PLAY_DOCK_HOLE_OUT_SHRINK_FLEX);
  assert.ok(PLAY_DOCK_HOLE_OUT_SHRINK_FLEX < 1);
  assert.ok(PLAY_CONTROL_MIN_TAP >= 44);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  const puttAt = dock.indexOf('<PuttDock');
  const holeOutAt = dock.indexOf('testID="play-dock-hole-out"');
  assert.ok(puttAt >= 0 && holeOutAt > puttAt);
  assert.match(dock, /openPuttSheet\(holeNumber\)/);
  assert.match(dock, /onPress=\{onFinishHole\}/);
  assert.doesNotMatch(dock, /onMadeIt/);
  assert.match(dock, /styles\.dockPuttHoleOutRow/);
  assert.match(dock, /styles\.dockPutt/);
  assert.match(dock, /styles\.dockHoleOutShrunk/);
  assert.match(hole, /PLAY_DOCK_PUTT_FLEX/);
  assert.match(hole, /PLAY_DOCK_HOLE_OUT_SHRINK_FLEX/);
  assert.match(hole, /PLAY_CONTROL_MIN_TAP/);
  assert.doesNotMatch(dock, /onAdd=\{onAddPutt\}/);
  assert.doesNotMatch(dock, /onUndo=\{onUndoPutt\}/);
  assert.doesNotMatch(dock, /PUTT_LENGTHS/);

  const layout = readFileSync(new URL('./playLayout.ts', import.meta.url), 'utf8');
  assert.match(layout, /Putt button sits left of a shrunken Hole Out/);
  assert.match(layout, /not a third dock row/);
  assert.match(layout, /unfinished/);
});
