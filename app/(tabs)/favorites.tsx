import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
import { useDb } from '@/src/db/DbProvider';
import { readSettingStore } from '@/src/db/repo';
import {
  courseIsHardMiss,
  FAVORITES_BANNER,
  listFavorites,
  offlinePackFor,
  offlineStatusLabel,
  setFavorite,
  type FavoriteCourse,
} from '@/src/domain/favorites';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { Screen } from '@/src/ui/Screen';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';

export default function FavoritesScreen() {
  const { db, revision, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const store = useMemo(() => readSettingStore(db), [db]);
  const favorites = useMemo(() => listFavorites(store), [store, revision]);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <Screen>
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
          const label = offlineStatusLabel(pack?.status ?? null);
          const place = [course.city, course.state].filter(Boolean).join(', ');
          return (
            <View key={course.id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name}>{course.name}</Text>
                  {place ? <Text style={styles.meta}>{place}</Text> : null}
                  {hardMiss ? <Text style={styles.warn}>{COPY.hardMissNeedPins}</Text> : null}
                  {label ? <Text style={styles.status}>{label}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.unfavorite}
                  onPress={() => unstar(course)}
                  style={styles.star}>
                  <Text style={styles.starText}>★</Text>
                </Pressable>
              </View>
              <BigButton
                label={COPY.downloadForOffline}
                variant="secondary"
                disabled={busyId === course.id || pack?.status === 'downloading'}
                onPress={() => download(course)}
              />
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
            </View>
          );
        })
      )}
      <BigButton
        label={COPY.requestThisCourse}
        variant="ghost"
        onPress={() => router.push('/request-course')}
      />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
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
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    name: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    meta: { color: colors.muted, fontSize: type.meta },
    warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
    status: { color: colors.cream, fontSize: type.meta, fontWeight: '800' },
    star: { minWidth: tapTarget, minHeight: tapTarget, alignItems: 'center', justifyContent: 'center' },
    starText: { color: colors.cream, fontSize: 22, fontWeight: '800' },
  });
}
