import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { backfillReadyFavoriteOverlays, downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
import { layoutForFavoriteStart, favoriteStartHoleCount } from '@/src/course/startRoundEntry';
import { prefetchCourseCardInBackground, rememberLayoutHoles } from '@/src/course/prefetch';
import { useDb } from '@/src/db/DbProvider';
import { attachCourseToRound, readSettingStore, startRound } from '@/src/db/repo';
import {
  courseIsHardMiss,
  FAVORITES_BANNER,
  FAVORITES_SWIPE_EDGE_PX,
  favoriteDisplayedOfflineStatus,
  favoriteNameStartsPlay,
  favoriteReadyChipOnly,
  favoriteRowPressAction,
  favoriteRowCompact,
  favoriteRowMinHeight,
  favoriteShowsDownloadPill,
  favoritesBackAndSwipeGoHome,
  favoritesLeftEdgeSwipeGoesHome,
  favoritesShowsBackButton,
  favoritesSwipeHomeHref,
  listFavorites,
  offlinePackFor,
  offlineStatusLabel,
  setFavorite,
  type FavoriteCourse,
} from '@/src/domain/favorites';
import { requestThisCourseVisible } from '@/src/domain/courseRequest';
import { COPY } from '@/src/domain/playerCopy';
import { playHrefAfterRoundStart } from '@/src/domain/playNav';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { Screen } from '@/src/ui/Screen';
import { space, tapTarget, type, type ColorPalette } from '@/src/ui/theme';
import { TabSwipe } from '@/src/ui/TabSwipe';

export default function FavoritesScreen() {
  const { db, revision, bump } = useDb();
  const navigation = useNavigation();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const store = useMemo(() => readSettingStore(db), [db]);
  const favorites = useMemo(() => listFavorites(store), [store, revision]);
  useFocusEffect(
    useCallback(() => {
      void backfillReadyFavoriteOverlays(store);
    }, [store]),
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const goHome = () => {
    router.navigate(favoritesSwipeHomeHref());
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: favoritesShowsBackButton()
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.back}
              onPress={goHome}
              style={styles.back}>
              <Text style={styles.backText}>{COPY.back}</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, styles.back, styles.backText]);

  const swipeHome = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (event, gesture) => {
        const startX = event.nativeEvent.pageX - gesture.dx;
        if (!favoritesLeftEdgeSwipeGoesHome({ startX, dx: gesture.dx, dy: gesture.dy })) return;
        if (!favoritesBackAndSwipeGoHome()) return;
        router.navigate(favoritesSwipeHomeHref());
      },
    }),
  ).current;

  const unstar = (course: FavoriteCourse) => {
    if (favoriteRowPressAction('star') !== 'toggle') return;
    setFavorite(store, course, false);
    bump();
  };

  const download = (course: FavoriteCourse) => {
    setBusyId(course.id);
    void downloadFavoriteForOffline(course, store, {
      onStatus: () => bump(),
    }).finally(() => {
      setBusyId(null);
      bump();
    });
  };

  const playFavorite = (course: FavoriteCourse) => {
    if (favoriteRowPressAction('row') !== 'play') return;
    if (!favoriteNameStartsPlay()) return;
    const holeCount = favoriteStartHoleCount(course);
    const layout = layoutForFavoriteStart(course);
    rememberLayoutHoles(layout);
    const round = startRound(db, holeCount, course.name, layout);
    bump();
    router.push(playHrefAfterRoundStart(round.id));
    prefetchCourseCardInBackground(layout, {
      holeCount,
      applyLayout: (painted) => {
        attachCourseToRound(db, round.id, course.name, painted);
        bump();
      },
    });
  };

  return (
    <TabSwipe tab="favorites">
      <Screen scroll={false} padded={false}>
        <View style={styles.fill}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{COPY.favorites}</Text>
            <Text style={styles.bannerText}>{FAVORITES_BANNER}</Text>
            {favorites.length === 0 ? (
              <EmptyPanel title={COPY.favorites} hint={FAVORITES_BANNER} />
            ) : (
              favorites.map((course) => {
                const pack = offlinePackFor(store, course.id);
                const hardMiss = courseIsHardMiss({
                  courseKey: course.id,
                  courseApiId: course.id,
                  name: course.name,
                  city: course.city,
                  state: course.state,
                  location: course.location,
                });
                const displayed = favoriteDisplayedOfflineStatus(pack?.status ?? null, hardMiss);
                const label = offlineStatusLabel(displayed);
                const compact = favoriteRowCompact(displayed);
                const showDownload = favoriteShowsDownloadPill(displayed);
                const readyChip = favoriteReadyChipOnly(displayed);
                const place = [course.city, course.state].filter(Boolean).join(', ');
                return (
                  <View
                    key={course.id}
                    style={[
                      styles.card,
                      compact && styles.cardCompact,
                      { minHeight: favoriteRowMinHeight(displayed) ?? undefined },
                    ]}>
                    <View style={styles.row}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Start round ${course.name}`}
                        onPress={() => playFavorite(course)}
                        style={styles.playHit}>
                        <Text style={styles.name}>{course.name}</Text>
                        {place ? <Text style={styles.meta}>{place}</Text> : null}
                        {hardMiss ? <Text style={styles.warn}>{COPY.hardMissNeedPins}</Text> : null}
                        {readyChip ? <Text style={styles.readyChip}>{COPY.offlineReady}</Text> : null}
                        {!readyChip && label ? <Text style={styles.status}>{label}</Text> : null}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={COPY.unfavorite}
                        onPress={() => unstar(course)}
                        style={styles.star}>
                        <Text style={styles.starText}>★</Text>
                      </Pressable>
                    </View>
                    {showDownload ? (
                      <BigButton
                        label={COPY.downloadForOffline}
                        variant="secondary"
                        disabled={busyId === course.id || displayed === 'downloading'}
                        onPress={() => download(course)}
                      />
                    ) : null}
                    {requestThisCourseVisible({
                      course: {
                        courseKey: course.id,
                        courseApiId: course.id,
                        name: course.name,
                        city: course.city,
                        state: course.state,
                        location: course.location,
                      },
                      hasTeeGreenPaint: displayed === 'ready',
                      paintKnown: displayed === 'ready' || displayed === 'miss',
                    }) ? (
                      <BigButton
                        label={COPY.requestThisCourse}
                        variant="ghost"
                        onPress={() =>
                          router.push({
                            pathname: '/request-course',
                            params: {
                              name: course.name,
                              city: course.city ?? '',
                              courseId: course.id,
                            },
                          })
                        }
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.homeSwipeEdge} {...swipeHome.panHandlers} />
        </View>
      </Screen>
    </TabSwipe>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    fill: { flex: 1 },
    back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    backText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    scroll: { padding: space.md, paddingBottom: 32, gap: 12 },
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    bannerText: { color: colors.cream, fontSize: type.body, lineHeight: 22 },
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      gap: 10,
    },
    cardCompact: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      gap: 4,
    },
    row: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    playHit: { flex: 1, gap: 4, justifyContent: 'center' },
    name: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    meta: { color: colors.muted, fontSize: type.meta },
    warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
    status: { color: colors.cream, fontSize: type.meta, fontWeight: '800' },
    readyChip: {
      alignSelf: 'flex-start',
      color: colors.cream,
      fontSize: type.tiny,
      fontWeight: '800',
      backgroundColor: colors.accentWash,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    star: { minWidth: tapTarget, minHeight: tapTarget, alignItems: 'center', justifyContent: 'center' },
    starText: { color: colors.cream, fontSize: 22, fontWeight: '800' },
    homeSwipeEdge: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: FAVORITES_SWIPE_EDGE_PX,
      zIndex: 4,
    },
  });
}
