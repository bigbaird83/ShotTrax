import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { formatParLabel } from '@/src/course/layout';
import { teePointForHole, teePointFromHoleFeature } from '@/src/course/osmOverlay';
import type { OsmOverlay } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import { getClubMap, getRound, listHoles, listShotsForHole } from '@/src/db/repo';
import { lockHoleCamera, resolveHoleTee, shotPinsForHoleCamera } from '@/src/domain/holeCamera';
import { COPY } from '@/src/domain/playerCopy';
import {
  SHOT_REVIEW_MAP_MIN_HEIGHT,
  SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT,
  shotReviewFramePoints,
  shotReviewShotListWindow,
} from '@/src/domain/shotReviewLayout';
import type { Club, Shot } from '@/src/domain/types';
import { BigButton } from '@/src/ui/BigButton';
import { HoleMap } from '@/src/ui/HoleMap';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { tapTarget, type ColorPalette } from '@/src/ui/theme';

const REVIEW_TRAIL_TO_GREEN = { yards: null, quality: 'none' as const };

/**
 * Saved-round shot review: one locked tee-to-green map per hole with the marked shots
 * and their yard chips. Hole list + Prev / Next. No live GPS — the phone fix is never used.
 *
 * The map slot is the only flexible region (HoleMap's shared card is a fixed height,
 * so this screen overrides it with flex). The shot list and hole buttons are a pinned
 * bottom section, just above the screen safe area. Long lists scroll inside a cap.
 */
export default function ReviewShotsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);
  const [index, setIndex] = useState(0);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const clubs = useMemo(() => getClubMap(db), [db, revision]);
  const hole = holes[Math.min(index, Math.max(0, holes.length - 1))] ?? null;
  const shots = useMemo(() => (hole ? listShotsForHole(db, hole.id) : []), [db, hole, revision]);

  useEffect(() => {
    if (!round || round.courseLat == null || round.courseLng == null) {
      setOsmOverlay(null);
      return;
    }
    let live = true;
    void getCourseDataClient()
      .fetchOsmOverlay({
        courseId: round.courseApiId,
        location: { lat: round.courseLat, lng: round.courseLng },
      })
      .then((overlay) => {
        if (live) setOsmOverlay(overlay);
      })
      .catch(() => {
        if (live) setOsmOverlay(null);
      });
    return () => {
      live = false;
    };
  }, [round]);

  if (!round) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const green =
    hole && hole.greenLat != null && hole.greenLng != null
      ? { lat: hole.greenLat, lng: hole.greenLng }
      : null;
  const storedTee =
    hole && hole.teeLat != null && hole.teeLng != null ? { lat: hole.teeLat, lng: hole.teeLng } : null;
  const tee = hole
    ? resolveHoleTee({
        holeTee: storedTee ?? teePointFromHoleFeature(osmOverlay, hole.number, green),
        osmTee: teePointForHole(osmOverlay, hole.number),
        green,
      })
    : null;
  const shotPins = shotPinsForHoleCamera(shots);
  const camera = hole
    ? lockHoleCamera({
        tee,
        green,
        shotPins,
        phone: null,
      })
    : null;

  return (
    <Screen scroll={false}>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chips}>
        {holes.map((row, i) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`Hole ${row.number}`}
            testID={`shot-review-hole-${row.number}`}
            onPress={() => setIndex(i)}
            style={[styles.chip, hole?.id === row.id && styles.chipOn]}>
            <Text style={[styles.chipText, hole?.id === row.id && styles.chipTextOn]}>{row.number}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.holeColumn}>
        {hole ? (
          <Text style={styles.label}>
            {formatParLabel(hole.par)} · Hole {hole.number}
            {hole.score != null ? ` · ${COPY.score} ${hole.score}` : ''}
          </Text>
        ) : null}
        <View style={styles.mapSlot} testID="shot-review-map">
          {hole && camera ? (
            <HoleMap
              holeNumber={hole.number}
              shots={shots}
              userFix={null}
              green={green}
              yardsToGreen={REVIEW_TRAIL_TO_GREEN}
              osmOverlay={osmOverlay}
              lockFrame
              hideYardsOverlay
              frameEpoch={`review-${round.id}-${hole.number}`}
              heading={camera.heading}
              framePoints={shotReviewFramePoints({ tee, green, shotPins }).map((point) => ({
                latitude: point.lat,
                longitude: point.lng,
              }))}
              style={styles.mapFill}
            />
          ) : hole ? (
            <Text style={styles.muted}>{COPY.shotReviewNoMap}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bottom} testID="shot-review-bottom">
        {hole && shots.length > 0 ? (
          <ReviewShotList
            key={hole.id}
            shots={shots}
            clubs={clubs}
            textStyle={styles.muted}
            listStyle={styles.shotList}
            contentStyle={styles.shotListContent}
          />
        ) : null}
        <View style={styles.nav}>
          <BigButton
            label={COPY.previousHole}
            variant="ghost"
            disabled={index <= 0}
            onPress={() => setIndex((i) => Math.max(0, i - 1))}
            style={styles.navBtn}
          />
          <BigButton
            label={COPY.nextHole}
            variant="ghost"
            disabled={index >= holes.length - 1}
            onPress={() => setIndex((i) => Math.min(holes.length - 1, i + 1))}
            style={styles.navBtn}
          />
        </View>
      </View>
    </Screen>
  );
}

function ReviewShotList({
  shots,
  clubs,
  textStyle,
  listStyle,
  contentStyle,
}: {
  shots: Shot[];
  clubs: Record<string, Club>;
  textStyle: StyleProp<TextStyle>;
  listStyle: StyleProp<ViewStyle>;
  contentStyle: StyleProp<ViewStyle>;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const windowHeight = shotReviewShotListWindow(contentHeight);
  return (
    <ScrollView
      testID="shot-review-shots"
      style={[listStyle, windowHeight > 0 ? { height: windowHeight } : null]}
      contentContainerStyle={contentStyle}
      nestedScrollEnabled
      scrollEnabled={contentHeight > SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT}
      onContentSizeChange={(_width, height) => {
        setContentHeight((prev) => (prev === height ? prev : height));
      }}>
      {shots.map((shot) => (
        <Text key={shot.id} style={textStyle}>
          {shot.seq}. {shot.clubId ? (clubs[shot.clubId]?.name ?? 'Club') : '—'}
          {shot.distanceYards != null ? ` · ${Math.round(shot.distanceYards)} yd` : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 24, fontWeight: '900', flexShrink: 0 },
    label: { color: colors.muted, fontSize: 14, fontWeight: '800', flexShrink: 0 },
    muted: { color: colors.muted, fontSize: 16 },
    holeColumn: { flex: 1, minHeight: 0, gap: 8 },
    mapSlot: { flex: 1, minHeight: SHOT_REVIEW_MAP_MIN_HEIGHT },
    // HoleMap's shared card sets a fixed height. A later height fills this slot
    // so the review map can flex without editing that shared style.
    mapFill: {
      flex: 1,
      width: '100%',
      height: '100%',
      minHeight: SHOT_REVIEW_MAP_MIN_HEIGHT,
    },
    chipRow: { flexGrow: 0, flexShrink: 0 },
    chips: { gap: 8 },
    chip: {
      minWidth: tapTarget,
      minHeight: tapTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
    },
    chipOn: { backgroundColor: colors.cream },
    chipText: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    chipTextOn: { color: colors.bg },
    bottom: { flexGrow: 0, flexShrink: 1, gap: 12, minHeight: 0 },
    shotList: {
      flexGrow: 0,
      flexShrink: 1,
      maxHeight: SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT,
    },
    shotListContent: { gap: 8 },
    nav: { flexDirection: 'row', gap: 8, flexShrink: 0 },
    navBtn: { flex: 1 },
  });
}
