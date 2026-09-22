import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { createMemoryCoursePaintCache } from '../course/paintCache';
import { hole1EntryFromLayout, layoutForFavoriteStart } from '../course/startRoundEntry';
import { loadOsmOpenGolfCandidate, resolveCoursePaint } from '../course/waterfall';
import {
  favoriteRowPressAction,
  favoritesBannerChrome,
} from './favorites';
import { inventGreenFromCenterPlusYards, inventGreenFromCourseCenter } from './courseCardPaint';
import {
  ADD_SHOT_TO_PIN_PRESSED_SCALE,
  addShotToPinScaleOnRelease,
  addShotToPinScalesUpOnPressOrDrag,
  addShotToPinTracksViewChanges,
  addShotToPinVisualScale,
  toPinYardsRecalcOnDragMove,
  toPinYardsRecalcOnReleaseOnly,
} from './placeToDrag';

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
  assert.equal(ADD_SHOT_TO_PIN_PRESSED_SCALE, 2);
  assert.equal(addShotToPinTracksViewChanges({ dragOriginSet: false, capturingScale: false }), true);
  assert.equal(addShotToPinTracksViewChanges({ dragOriginSet: true, capturingScale: true }), true);
  assert.equal(addShotToPinTracksViewChanges({ dragOriginSet: true, capturingScale: false }), false);
  assert.equal(toPinYardsRecalcOnDragMove(), false);
  assert.equal(toPinYardsRecalcOnReleaseOnly(), true);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /addShotToPinVisualScale\(toPinEngaged\)/);
  assert.match(map, /addShotToPinTracksViewChanges/);
  assert.match(map, /onTouchStart=/);
  assert.match(map, /setToPinHeld\(true\)/);
  assert.match(map, /setToPinTracksView\(true\)/);
  assert.doesNotMatch(map, /onDrag=\{/);
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
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
