import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { createMemoryCoursePaintCache } from '../course/paintCache';
import { hole1EntryFromLayout, layoutForFavoriteStart } from '../course/startRoundEntry';
import { loadOsmOpenGolfCandidate, resolveCoursePaint } from '../course/waterfall';
import { deleteFillsGap, deleteInventsPoints, planDeleteShot } from './deleteShot';
import {
  favoriteRowPressAction,
  favoritesBannerChrome,
} from './favorites';
import { yardsFromShotPins } from './insertShot';
import { inventGreenFromCenterPlusYards, inventGreenFromCourseCenter } from './courseCardPaint';
import {
  ADD_SHOT_TO_PIN_PRESSED_SCALE,
  addShotToPinScaleOnRelease,
  addShotToPinScalesUpOnPressOrDrag,
  addShotToPinVisualScale,
  toPinYardsRecalcOnDragMove,
  toPinYardsRecalcOnReleaseOnly,
} from './placeToDrag';
import { COPY } from './playerCopy';
import {
  historyDeletePrompt,
  historyDeleteRequiresConfirm,
  historySwipeShouldClose,
  historySwipeShouldOpen,
  pastRoundCanAddShot,
  pastRoundEditAnytime,
  pastRoundEditInventsPaint,
  pastRoundEditInventsShots,
  pastRoundEditRequested,
  pastRoundHoleHref,
  pastRoundMarksOnly,
  pastRoundStoredPaintOnly,
} from './roundHistory';
import type { Shot } from './types';

function shot(partial: Partial<Shot> & { id: string; seq: number }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    startLat: 37,
    startLng: -122,
    startAccuracyM: 5,
    startFixQuality: 'good',
    endLat: 37.001,
    endLng: -122,
    endAccuracyM: 6,
    endFixQuality: 'good',
    distanceYards: 120,
    typedYards: null,
    fixQuality: 'good',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: 't1',
    source: 'gps',
    suggested: false,
    holeOut: false,
    ...partial,
  };
}

test('Favorites banner is plain text and the row plays except the star', () => {
  assert.equal(favoritesBannerChrome(), 'plain');
  assert.equal(favoriteRowPressAction('row'), 'play');
  assert.equal(favoriteRowPressAction('star'), 'toggle');

  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  const styles = favorites.slice(favorites.indexOf('function makeStyles'));
  assert.match(favorites, /<Text style=\{styles\.bannerText\}>\{FAVORITES_BANNER\}<\/Text>/);
  assert.doesNotMatch(styles, /\bbanner:\s*\{/);
  const bannerText = styles.slice(styles.indexOf('bannerText:'), styles.indexOf('card:'));
  assert.doesNotMatch(bannerText, /backgroundColor|borderWidth|borderColor|borderRadius|bgElevated/);

  const playPress = favorites.slice(
    favorites.indexOf('accessibilityLabel={`Start round ${course.name}`}'),
    favorites.indexOf('accessibilityLabel={COPY.unfavorite}'),
  );
  assert.match(playPress, /onPress=\{\(\) => playFavorite\(course\)\}/);
  assert.match(playPress, /styles\.playHit/);
  assert.match(playPress, /styles\.name/);
  assert.match(playPress, /styles\.meta/);
  assert.doesNotMatch(playPress, /unstar\(/);
  const starPress = favorites.slice(
    favorites.indexOf('accessibilityLabel={COPY.unfavorite}'),
    favorites.indexOf('COPY.downloadForOffline'),
  );
  assert.match(starPress, /onPress=\{\(\) => unstar\(course\)\}/);
  assert.doesNotMatch(starPress, /playFavorite/);
  assert.match(styles, /playHit:\s*\{[\s\S]*?flex:\s*1/);
});

test('favorite row start still runs the paint waterfall and Thunderbird stays a miss', async () => {
  assert.equal(inventGreenFromCourseCenter(), false);
  assert.equal(inventGreenFromCenterPlusYards(), false);
  const thunderbird = {
    id: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    country: 'US',
    location: THUNDERBIRD_HEBER_CLUBHOUSE,
  };
  const layout = layoutForFavoriteStart(thunderbird);
  assert.equal(hole1EntryFromLayout(layout), 'miss');
  assert.equal(
    layout.holes?.some((hole) => hole.greenCentroid != null || hole.teeCentroid != null) ?? false,
    false,
  );

  const match = {
    name: thunderbird.name,
    city: thunderbird.city,
    state: thunderbird.state,
    location: thunderbird.location,
    courseKey: thunderbird.id,
  };
  let golfapi = false;
  let gca = false;
  const painted = await resolveCoursePaint(match, {
    cache: createMemoryCoursePaintCache(),
    loadOsm: async () => loadOsmOpenGolfCandidate(match),
    loadGca: async () => {
      gca = true;
      return {
        source: 'gca',
        numHoles: 9,
        holes: [
          {
            hole: 1,
            tee: THUNDERBIRD_HEBER_CLUBHOUSE,
            green: THUNDERBIRD_HEBER_CLUBHOUSE,
            par: 4,
            yards: 100,
          },
        ],
      };
    },
    loadGolfApi: async () => {
      golfapi = true;
      return {
        source: 'golfapi',
        numHoles: 9,
        holes: [
          {
            hole: 1,
            tee: THUNDERBIRD_HEBER_CLUBHOUSE,
            green: THUNDERBIRD_HEBER_CLUBHOUSE,
            par: 4,
            yards: 100,
          },
        ],
      };
    },
  });
  assert.equal(painted.ok, false);
  assert.equal(painted.holes.length, 0);
  assert.equal(gca, false);
  assert.equal(golfapi, false);

  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  const play = favorites.slice(favorites.indexOf('const playFavorite'), favorites.indexOf('return ('));
  assert.match(play, /prefetchCourseCardInBackground/);
  assert.ok(play.indexOf('startRound') < play.indexOf('prefetchCourseCardInBackground'));
  assert.doesNotMatch(play, /inventGreen|THUNDERBIRD_HEBER_CLUBHOUSE/);
});

test('add-shot pin scales up on press or drag and yards stay on release', () => {
  assert.equal(addShotToPinScalesUpOnPressOrDrag(), true);
  assert.equal(addShotToPinScaleOnRelease(), 1);
  assert.equal(addShotToPinVisualScale(true), ADD_SHOT_TO_PIN_PRESSED_SCALE);
  assert.equal(addShotToPinVisualScale(false), 1);
  assert.ok(ADD_SHOT_TO_PIN_PRESSED_SCALE > 1);
  assert.equal(toPinYardsRecalcOnDragMove(), false);
  assert.equal(toPinYardsRecalcOnReleaseOnly(), true);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /addShotToPinVisualScale\(toPinEngaged\)/);
  assert.match(map, /onTouchStart=/);
  assert.match(map, /setToPinHeld\(true\)/);
  const dragStart = map.indexOf('onDragStart=');
  const dragEnd = map.indexOf('onDragEnd=');
  assert.ok(dragStart > 0 && dragEnd > dragStart);
  const during = map.slice(dragStart, dragEnd);
  assert.doesNotMatch(during, /onPlaceToDrag\(/);
  const release = map.slice(dragEnd, map.indexOf('testID="to-pin-hit"'));
  assert.match(release, /setToPinHeld\(false\)/);
  assert.match(release, /setToPinDragOrigin\(null\)/);
  assert.match(release, /placeToDraftFromDragRelease/);
  assert.ok(
    release.indexOf('placeToDraftFromDragRelease') <
      release.indexOf('onPlaceToDrag({ lat: latitude, lng: longitude })'),
  );
  const hitStyle = map.slice(map.indexOf('toPinHit:'), map.indexOf('toPinHead:'));
  assert.match(hitStyle, /width: ADD_SHOT_TO_PIN_HIT_W/);
  assert.doesNotMatch(hitStyle, /scale:/);
});

test('round history swipe reveals Edit and Delete, and past edit does not invent', () => {
  assert.equal(historySwipeShouldOpen(-60, 4), true);
  assert.equal(historySwipeShouldOpen(-10, 0), false);
  assert.equal(historySwipeShouldOpen(-80, 90), false);
  assert.equal(historySwipeShouldClose(60, 4), true);
  assert.equal(historySwipeShouldClose(10, 0), false);
  assert.equal(historyDeleteRequiresConfirm(), true);
  const prompt = historyDeletePrompt();
  assert.equal(prompt.cancelIsDefault, true);
  assert.equal(prompt.title, COPY.deleteRound);
  assert.equal(prompt.body, COPY.deleteRoundConfirm);
  assert.equal(pastRoundEditAnytime(), true);
  assert.equal(pastRoundEditRequested('1'), true);
  assert.equal(pastRoundEditRequested(undefined), false);
  assert.equal(pastRoundMarksOnly({ finished: true, editRequested: true }), true);
  assert.equal(pastRoundMarksOnly({ finished: false, editRequested: true }), false);
  assert.equal(pastRoundMarksOnly({ finished: true, editRequested: false }), false);
  assert.equal(pastRoundCanAddShot(true), false);
  assert.equal(pastRoundCanAddShot(false), true);
  assert.equal(pastRoundEditInventsShots(), false);
  assert.equal(pastRoundEditInventsPaint(), false);
  assert.equal(pastRoundStoredPaintOnly(true), true);
  assert.equal(pastRoundStoredPaintOnly(false), false);
  assert.equal(pastRoundHoleHref('round-1', 1), '/round/round-1/hole/1?edit=1');

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /HistorySwipeRow/);
  assert.match(home, /historySwipeShouldOpen|historyDeletePrompt/);
  assert.match(home, /pastRoundHoleHref\(round\.id, 1\)/);
  assert.match(home, /style: 'cancel'/);
  assert.match(home, /style: 'destructive'/);
  assert.match(home, /deleteRound\(db, round\.id\)/);
  assert.doesNotMatch(home, /onLongPress/);
  const swipe = readFileSync(new URL('../ui/HistorySwipeRow.tsx', import.meta.url), 'utf8');
  assert.match(swipe, /COPY\.edit/);
  assert.match(swipe, /✕/);
  assert.match(swipe, /historySwipeShouldOpen/);
  assert.doesNotMatch(swipe, /deleteRound\(/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /pastRoundMarksOnly/);
  assert.match(hole, /pastRoundCanAddShot\(marksOnly\)/);
  assert.match(hole, /pastRoundStoredPaintOnly\(marksOnly\) \? proTee : hydrated\.tee/);
  assert.match(hole, /pastRoundStoredPaintOnly\(marksOnly\) \? proGreen : hydrated\.green/);
  assert.match(hole, /if \(marksOnly\) return;/);
  const catchUp = hole.slice(hole.indexOf('const startCatchUp'), hole.indexOf('const closeEdit'));
  assert.match(catchUp, /if \(!pastRoundCanAddShot\(marksOnly\)\) return;/);
  const mark = hole.slice(hole.indexOf('const markClub'), hole.indexOf('const onMark'));
  assert.match(mark, /pastRoundCanAddShot\(marksOnly\)/);

  assert.equal(deleteFillsGap(), false);
  assert.equal(deleteInventsPoints(), false);
  const prior = shot({
    id: 's1',
    seq: 1,
    startLat: 37,
    startLng: -122,
    endLat: 37.001,
    endLng: -122,
    distanceYards: 999,
  });
  const middle = shot({
    id: 's2',
    seq: 2,
    startLat: 37.001,
    startLng: -122,
    endLat: 37.01,
    endLng: -122,
    distanceYards: 400,
  });
  const after = shot({
    id: 's3',
    seq: 3,
    startLat: 36.5,
    startLng: -121.5,
    endLat: 36.51,
    endLng: -121.5,
    distanceYards: 80,
  });
  const fromPins = yardsFromShotPins(prior);
  assert.notEqual(fromPins, 999);
  assert.notEqual(fromPins, null);
  const plan = planDeleteShot([prior, middle, after], 's2');
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const kept = plan.remaining.find((row) => row.id === 's1');
  const other = plan.remaining.find((row) => row.id === 's3');
  assert.equal(kept?.endLat, 37.001);
  assert.equal(kept?.startLat, 37);
  assert.equal(kept?.distanceYards, fromPins);
  assert.equal(other?.startLat, 36.5);
  assert.equal(other?.distanceYards, 80);
  assert.equal(plan.remaining.some((row) => row.id === 's2'), false);
  assert.equal(
    plan.remaining.some(
      (row) => row.startLat === middle.endLat && row.id !== 's2' && row.endLat === middle.endLat && row.startLat !== prior.endLat,
    ),
    false,
  );
});
