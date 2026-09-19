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
  playDockActionMinHeight,
  playMenuIsButton,
  homeMenuIsButton,
  homeMenuOpensSettings,
  playScorecardWraps,
  playSameClubHiddenUntilShot,
  playMapMountsWhenYardsShown,
  playRoundStartSecondCameraPath,
  playRoundStartUsesAddShotFramePoints,
  playUsesCourseCardCamera,
  playEditUsesCourseCardCamera,
  playAndAddShotShareCourseCardCamera,
} from './playLayout';
import { PHONE_WHEEL_PILL_HEIGHT } from './clubStrip';

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
  assert.deepEqual([...layout.dockActions], ['same_club', 'add_shot', 'scorecard', 'prev', 'next']);
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
  assert.equal(layout.sameClub, 'short');
  assert.deepEqual(playChipRowIncludes(), ['suggested']);
  assert.deepEqual(playUnderWheelIncludes(), ['same_club']);
  assert.equal(playSameClubSitsUnderWheel(), true);
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
  assert.match(hole, /minHeight: '60%'/);
  assert.match(hole, /flexBasis: '60%'/);
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
  assert.match(hole, /catchUpFullScreen \? 'catchup'/);
  assert.match(hole, /play-\$\{hole\.number\}-\$\{playFrameNonce\}/);
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
  assert.deepEqual(playUnderWheelIncludes(), ['same_club']);
  assert.equal(playAllClubsSitsInDockRow(), false);
  assert.equal(playEditIsDockRow(), false);
  assert.equal(anyEarlierShotCanOpenEdit(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.doesNotMatch(dock, /COPY\.allClubs/);
  assert.doesNotMatch(dock, /COPY\.sayClub/);
  const wheelAt = dock.indexOf('<ClubStrip');
  const sameAt = dock.indexOf('COPY.stickyClub');
  const allAt = hole.indexOf('styles.allClubsFloat');
  assert.ok(wheelAt >= 0 && sameAt > wheelAt);
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
  assert.match(hole, /heading=\{courseCamera\?\.heading \?\? null\}/);
  assert.doesNotMatch(hole, /heading=\{fix|deviceHeading|compass/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /lockFrame/);
  assert.match(playMap, /framePoints=/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.doesNotMatch(playMap, /holeCamera\?\.points/);
  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /<HoleMap/);
  assert.match(editMap, /lockFrame/);
  assert.match(editMap, /heading=\{courseCamera\?\.heading \?\? null\}/);
  assert.match(editMap, /courseCamera\?\.points/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /initialCamera: holeUpCamera/);
  assert.doesNotMatch(map, /camera: holeUpCamera/);
  assert.doesNotMatch(map, /region: lockedRegion/);
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
  assert.match(hole, /!hideHoleButtons && \(catchUpFullScreen \|\| !courseCamera \|\| mapFramed\)/);
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
  assert.doesNotMatch(hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.stickyClub')), /void markClub\(full\)/);
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
  assert.match(play, /yardsToGreen: playHeaderYards\.yards/);
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
  assert.equal(playSameClubHiddenUntilShot(), true);
  assert.ok(playMapMinRatio() >= 0.6);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  assert.match(play, /<HoleMap/);
  assert.match(play, /styles\.mapFill/);
  assert.match(hole, /minHeight: '60%'/);
  assert.match(play, /\{sticky \? \(/);
  assert.match(hole, /styles\.dockScorecard/);
  assert.match(play, /numberOfLines=\{1\}/);
  assert.match(play, /COPY\.scorecard/);
  assert.doesNotMatch(hole, /'Scoreca'|"Scoreca"/);

  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  const scorecard = dock.slice(dock.indexOf('COPY.scorecard') - 120, dock.indexOf('COPY.scorecard') + 40);
  assert.match(scorecard, /numberOfLines=\{1\}/);
  assert.match(scorecard, /dockScorecard/);

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
  assert.match(playMap, /heading=\{courseCamera\?\.heading \?\? null\}/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.doesNotMatch(playMap, /holeCamera|addShotPoints|getCurrentFix/);

  const editMap = hole.slice(hole.indexOf('visible={editOpen && !editClubOpen}'), hole.indexOf('visible={scoreOpen}'));
  assert.match(editMap, /heading=\{courseCamera\?\.heading \?\? null\}/);
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

  const dock = hole.slice(hole.indexOf('<View style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.doesNotMatch(dock, /COPY\.allClubs/);
  assert.doesNotMatch(dock, /COPY\.sayClub/);
  assert.match(dock, /COPY\.stickyClub/);
  assert.match(dock, /COPY\.addShot/);
  assert.match(dock, /COPY\.scorecard/);
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
