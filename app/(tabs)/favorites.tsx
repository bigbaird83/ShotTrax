import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
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
  favoriteRowCompact,
  favoriteRowMinHeight,
  favoriteShowsDownloadPill,
  favoritesLeftEdgeSwipeGoesHome,
  favoritesShowsBackButton,
  favoritesSwipeHomeHref,
  listFavorites,
  offlinePackFor,
  offlineStatusLabel,
  setFavorite,
  type FavoriteCourse,
} from '@/src/domain/favorites';
import { COPY } from '@/src/domain/playerCopy';
import { playHrefAfterRoundStart } from '@/src/domain/playNav';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { Screen } from '@/src/ui/Screen';
import { space, tapTarget, type, type ColorPalette } from '@/src/ui/theme';

export default function FavoritesScreen() {
  const { db, revision, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const store = useMemo(() => readSettingStore(db), [db]);
  const favorites = useMemo(() => listFavorites(store), [store, revision]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const swipeHome = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (event, gesture) => {
        const startX = event.nativeEvent.pageX - gesture.dx;
        if (!favoritesLeftEdgeSwipeGoesHome({ startX, dx: gesture.dx, dy: gesture.dy })) return;
        router.navigate(favoritesSwipeHomeHref());
      },
    }),
  ).current;

  const unstar = (course: FavoriteCourse) => {
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
    <Screen scroll={false} padded={false}>
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{COPY.favorites}</Text>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{FAVORITES_BANNER}</Text>
          </View>
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
                    <View style={styles.nameCol}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Start round ${course.name}`}
                        onPress={() => playFavorite(course)}>
                        <Text style={styles.name}>{course.name}</Text>
                      </Pressable>
                      {place ? <Text style={styles.meta}>{place}</Text> : null}
                      {hardMiss ? <Text style={styles.warn}>{COPY.hardMissNeedPins}</Text> : null}
                      {readyChip ? <Text style={styles.readyChip}>{COPY.offlineReady}</Text> : null}
                      {!readyChip && label ? <Text style={styles.status}>{label}</Text> : null}
                    </View>
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
                  {compact ? null : (
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
                  )}
                </View>
              );
            })
          )}
          <BigButton
            label={COPY.requestThisCourse}
            variant="ghost"
            onPress={() => router.push('/request-course')}
          />
        </ScrollView>
        {favoritesShowsBackButton() ? null : (
          <View style={styles.homeSwipeEdge} {...swipeHome.panHandlers} />
        )}
      </View>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    fill: { flex: 1 },
    scroll: { padding: space.md, paddingBottom: 32, gap: 12 },
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    banner: {
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
    },
    bannerText: { color: colors.cream, fontSize: type.body, fontWeight: '700', lineHeight: 22 },
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
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    nameCol: { flex: 1, gap: 4 },
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
