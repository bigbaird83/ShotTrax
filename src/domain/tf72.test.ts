import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { layoutForFavoriteStart, favoriteStartHoleCount } from '../course/startRoundEntry';
import { thunderbirdGolfApiPaintBlocked } from '../course/thunderbirdLock';
import { planNearbyCourseSearch } from './coursePick';
import { inventGreenFromCenterPlusYards, inventGreenFromCourseCenter } from './courseCardPaint';
import {
  CRASH_PRONE_SEARCH_QUERIES,
  courseSearchInventsPaint,
  courseSearchOpensFromFirstLetter,
  courseSearchOpensOnPillTap,
  courseSearchRendersMap,
  courseSearchUsesMainThreadSetNeedsLayout,
  deferCourseSearchLayout,
} from './courseSearchLayout';
import {
  FAVORITE_READY_ROW_MIN_HEIGHT,
  favoriteDisplayedOfflineStatus,
  favoriteNameStartsPlay,
  favoriteReadyChipOnly,
  favoriteRowCompact,
  favoriteRowMinHeight,
  favoriteShowsDownloadPill,
  favoritesLeftEdgeSwipeGoesHome,
  favoritesShowsBackButton,
  favoritesSwipeHomeHref,
  offlineStatusAfterDownload,
} from './favorites';
import {
  armHoleTransition,
  consumeHoleTransition,
  holeNavDirection,
  holeSlideAnimation,
  holeSlideStartsOffscreenX,
  resetHoleTransitionForTests,
} from './holeTransition';

test('search for Thunderbird or Magnolia does not layout on the main thread or invent paint', async () => {
  assert.equal(courseSearchUsesMainThreadSetNeedsLayout(), false);
  assert.equal(courseSearchOpensFromFirstLetter(), false);
  assert.equal(courseSearchOpensOnPillTap(), true);
  assert.equal(courseSearchInventsPaint(), false);
  assert.equal(courseSearchRendersMap(), false);
  assert.equal(inventGreenFromCourseCenter(), false);
  assert.equal(inventGreenFromCenterPlusYards(), false);

  for (const query of CRASH_PRONE_SEARCH_QUERIES) {
    const plan = planNearbyCourseSearch({ query, phoneFix: null, nowMs: 1 });
    assert.equal(plan.mode, 'search');
    if (plan.mode === 'search') assert.equal(plan.q, query);
  }

  let ran = false;
  deferCourseSearchLayout(() => {
    ran = true;
  });
  assert.equal(ran, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ran, true);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const search = readFileSync(new URL('../../app/search.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  assert.match(home, /router\.push\('\/search'\)/);
  assert.match(home, /COPY\.courseNamePlaceholder/);
  assert.doesNotMatch(home, /onChangeText/);
  assert.doesNotMatch(home, /setSheetOpen\(true\)/);
  assert.doesNotMatch(home, /TextInput/);
  assert.match(search, /CoursePicker/);
  assert.doesNotMatch(search, /FullSheet|MapView|HoleMap|setNeedsLayout|inventGreen/);
  assert.match(picker, /deferCourseSearchLayout/);
  assert.doesNotMatch(picker, /UIManager|setNeedsLayout|MapView|HoleMap|inventGreen|resolveCoursePaint/);
});

test('tapping a favorite name starts play on the Start Round path', () => {
  assert.equal(favoriteNameStartsPlay(), true);
  assert.equal(thunderbirdGolfApiPaintBlocked(), true);
  const thunderbird = {
    id: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    country: 'US',
    location: THUNDERBIRD_HEBER_CLUBHOUSE,
  };
  assert.equal(favoriteStartHoleCount(thunderbird), 9);
  assert.equal(favoriteStartHoleCount({ id: 'magnolia-cc' }), 18);
  const layout = layoutForFavoriteStart(thunderbird);
  assert.equal(layout.holes?.length ?? 0, 0);
  assert.equal(
    layout.holes?.some(
      (hole) =>
        hole.teeCentroid?.lat === THUNDERBIRD_HEBER_CLUBHOUSE.lat ||
        hole.greenCentroid?.lat === THUNDERBIRD_HEBER_CLUBHOUSE.lat,
    ) ?? false,
    false,
  );
  assert.equal(offlineStatusAfterDownload(
    { courseKey: thunderbird.id, name: thunderbird.name, city: thunderbird.city, state: thunderbird.state },
    true,
  ), 'miss');

  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  const play = favorites.slice(favorites.indexOf('const playFavorite'), favorites.indexOf('return ('));
  assert.match(play, /favoriteStartHoleCount/);
  assert.match(play, /layoutForFavoriteStart/);
  assert.match(play, /startRound\(/);
  assert.match(play, /playHrefAfterRoundStart/);
  assert.match(play, /prefetchCourseCardInBackground/);
  assert.ok(play.indexOf('startRound') < play.indexOf('router.push'));
  assert.ok(play.indexOf('router.push') < play.indexOf('prefetchCourseCardInBackground'));
  assert.doesNotMatch(play, /await /);
  assert.match(favorites, /onPress=\{\(\) => playFavorite\(course\)\}/);
  assert.doesNotMatch(favorites, /MapView|HoleMap|inventGreen/);
});

test('Ready offline hides Download, stays a chip, and collapses the row', () => {
  assert.equal(favoriteShowsDownloadPill('ready'), false);
  assert.equal(favoriteShowsDownloadPill('miss'), true);
  assert.equal(favoriteShowsDownloadPill('downloading'), true);
  assert.equal(favoriteShowsDownloadPill(null), true);
  assert.equal(favoriteReadyChipOnly('ready'), true);
  assert.equal(favoriteReadyChipOnly('miss'), false);
  assert.equal(favoriteRowCompact('ready'), true);
  assert.equal(favoriteRowCompact('miss'), false);
  assert.equal(favoriteRowMinHeight('ready'), FAVORITE_READY_ROW_MIN_HEIGHT);
  assert.equal(favoriteRowMinHeight('miss'), null);
  assert.ok(FAVORITE_READY_ROW_MIN_HEIGHT < 120);
  assert.equal(favoriteDisplayedOfflineStatus('ready', true), 'miss');
  assert.equal(favoriteDisplayedOfflineStatus('ready', false), 'ready');
  assert.equal(favoriteDisplayedOfflineStatus('downloading', true), 'downloading');

  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  assert.match(favorites, /favoriteShowsDownloadPill/);
  assert.match(favorites, /COPY\.downloadForOffline/);
  assert.match(favorites, /COPY\.offlineReady/);
  assert.match(favorites, /favoriteRowMinHeight/);
  assert.match(favorites, /cardCompact/);
  assert.match(favorites, /COPY\.offlineMiss|offlineStatusLabel/);
  assert.doesNotMatch(favorites, /MapView|HoleMap/);
});

test('Favorites has no Back button; a left-edge swipe goes Home', () => {
  assert.equal(favoritesShowsBackButton(), false);
  assert.equal(favoritesSwipeHomeHref(), '/');
  assert.equal(favoritesLeftEdgeSwipeGoesHome({ startX: 8, dx: 80, dy: 6 }), true);
  assert.equal(favoritesLeftEdgeSwipeGoesHome({ startX: 8, dx: 20, dy: 0 }), false);
  assert.equal(favoritesLeftEdgeSwipeGoesHome({ startX: 120, dx: 90, dy: 4 }), false);
  assert.equal(favoritesLeftEdgeSwipeGoesHome({ startX: 4, dx: 80, dy: 90 }), false);

  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  const tabs = readFileSync(new URL('../../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.match(favorites, /favoritesLeftEdgeSwipeGoesHome/);
  assert.match(favorites, /favoritesSwipeHomeHref/);
  assert.match(favorites, /router\.navigate\(favoritesSwipeHomeHref\(\)\)/);
  assert.match(favorites, /FAVORITES_SWIPE_EDGE_PX/);
  assert.match(favorites, /favoritesShowsBackButton/);
  assert.doesNotMatch(favorites, /COPY\.back|>Back<|>Back</);
  assert.match(tabs, /name="favorites"[\s\S]*headerLeft: \(\) => null/);
  assert.match(tabs, /name="favorites"[\s\S]*headerBackVisible: false/);
});

test('previous hole slides in from the left and next hole from the right', () => {
  resetHoleTransitionForTests();
  assert.equal(holeNavDirection(5, 4), 'previous');
  assert.equal(holeNavDirection(5, 6), 'next');
  assert.equal(holeSlideAnimation('previous'), 'slide_from_left');
  assert.equal(holeSlideAnimation('next'), 'slide_from_right');
  assert.equal(holeSlideStartsOffscreenX('previous', 390), -390);
  assert.equal(holeSlideStartsOffscreenX('next', 390), 390);

  armHoleTransition('previous');
  assert.equal(consumeHoleTransition(), 'previous');
  assert.equal(consumeHoleTransition(), null);
  armHoleTransition(holeNavDirection(2, 3));
  assert.equal(consumeHoleTransition(), 'next');

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const round = readFileSync(new URL('../../app/round/[id]/_layout.tsx', import.meta.url), 'utf8');
  const go = hole.slice(hole.indexOf('const goToHole'), hole.indexOf('const lastShotClubId'));
  assert.match(go, /armHoleTransition\(holeNavDirection/);
  assert.match(go, /playHrefAfterHoleChange/);
  assert.doesNotMatch(go, /club-pick/);
  assert.match(hole, /holeSlideStartsOffscreenX/);
  assert.match(hole, /HOLE_SLIDE_MS/);
  assert.match(hole, /useNativeDriver: true/);
  assert.match(hole, /translateX: slideX/);
  assert.match(round, /animation: 'none'/);
});
