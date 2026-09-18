import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
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
  playSuggestedIsSidewaysStrip,
  playStackedSuggestionChips,
  playStripCappedAtThree,
  playUnderWheelIncludes,
  playSameClubSitsUnderWheel,
  playAllClubsSitsUnderWheel,
  playAllClubsSitsBesideWheel,
} from './playLayout';

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
  assert.equal(layout.allClubs, 'chip');
  assert.equal(layout.sayClub, 'chip');
  assert.equal(layout.sameClub, 'short');
  assert.deepEqual(playChipRowIncludes(), ['suggested']);
  assert.deepEqual(playUnderWheelIncludes(), ['same_club', 'all_clubs']);
  assert.equal(playSameClubSitsUnderWheel(), true);
  assert.equal(playAllClubsSitsUnderWheel(), true);
  assert.equal(playAllClubsSitsBesideWheel(), false);
  assert.equal(playShowsFatAllClubs(), false);
  assert.equal(playShowsFatSayClub(), false);
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
  assert.match(hole, /COPY\.sayClub/);
  assert.match(hole, /styles\.dockAction/);
  assert.doesNotMatch(hole, /ThumbZone/);
  assert.doesNotMatch(hole, /styles\.shotList/);
  assert.doesNotMatch(hole, /styles\.clubChip/);
  assert.match(hole, /lockHoleCamera/);
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
  assert.match(hole, /resolveHoleTee/);
  assert.match(hole, /teePointFromHoleFeature/);
  assert.equal(playUsesAddShotCamera(), true);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /holeMapShowsUserLocation\(Boolean\(lockFrame\)\)/);
  assert.match(map, /styles\.mapCover/);
  assert.match(map, /if \(lockFrame\) return null;/);
  assert.doesNotMatch(
    map.slice(map.indexOf('const lockedRegion'), map.indexOf('const dragPreview')),
    /userFix/,
  );
  const fitBlock = map.slice(map.indexOf('if (lockFrame) {'), map.indexOf('mapRef.current?.fitToCoordinates'));
  assert.match(fitBlock, /if \(framedOnce\.current\) return;/);
});

test('All clubs and Say a club are chips in row 1; edit is tap a shot, not a dock row', () => {
  assert.equal(playDockRowCount(), 2);
  assert.deepEqual(playChipRowIncludes(), ['suggested']);
  assert.deepEqual(playUnderWheelIncludes(), ['same_club', 'all_clubs']);
  assert.equal(playEditIsDockRow(), false);
  assert.equal(anyEarlierShotCanOpenEdit(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.match(dock, /COPY\.allClubs/);
  assert.match(dock, /COPY\.sayClub/);
  const wheelAt = dock.indexOf('<ClubStrip');
  const sameAt = dock.indexOf('COPY.stickyClub');
  const allAt = dock.indexOf('COPY.allClubs');
  assert.ok(wheelAt >= 0 && sameAt > wheelAt && allAt > sameAt);
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

test('opening, Prev/Next, and Scorecard or Menu return reframe before the dock comes back', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /setMapFramed\(false\)/);
  assert.match(hole, /bumpPlayFrame/);
  assert.match(hole, /dismissScorecard/);
  assert.match(hole, /goToHole/);
  assert.match(hole, /!hideHoleButtons && \(catchUpFullScreen \|\| !holeCamera \|\| mapFramed\)/);
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /onFrameReady/);
  assert.match(map, /styles\.userDot/);
  assert.match(map, /holeMapShowsUserLocation\(Boolean\(lockFrame\)\)/);
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
  assert.match(hole, /void markClub\(full\)/);
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
  assert.match(map, /showsCompass=\{mapsChrome\}/);
  assert.match(map, /legalLabelInsets/);
  assert.match(map, /revealMapsChrome/);
});
