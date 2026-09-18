import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { layoutFromTee } from '@/src/course/layout';
import type { CourseDetail, CourseSummary, TeeSet } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import {
  attachCourseToRound,
  deleteRound,
  finishRound,
  getActiveRound,
  getCourseDistanceUnit,
  hasSeenBagCustomize,
  listClubs,
  listHoles,
  listRounds,
  markBagCustomizeSeen,
  startRound,
  type CourseLayoutSeed,
} from '@/src/db/repo';
import { COPY, formatTeeMeta } from '@/src/domain/playerCopy';
import { describeGpsSource } from '@/src/services/location';
import { BagCarryList, BagCustomizeActions } from '@/src/ui/BagCarryList';
import { BigButton } from '@/src/ui/BigButton';
import { CoursePicker, type CoursePick } from '@/src/ui/CoursePicker';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { FullSheet } from '@/src/ui/Sheet';
import { colors, tapTarget, type } from '@/src/ui/theme';
import { getCurrentFix } from '@/src/services/location';
import { setWatchCoursePickedHandler } from '@/src/services/watchNearby';

async function loadLayout(
  course: CourseSummary,
  detail: CourseDetail | null,
  tee: TeeSet | null,
): Promise<CourseLayoutSeed> {
  const resolved = detail ?? (await getCourseDataClient().getCourse(course.id).catch(() => null));
  if (resolved) return layoutFromTee(resolved, tee);
  return {
    apiId: course.id,
    name: course.name,
    location: course.location,
    teeName: tee?.name ?? null,
    teeRating: tee?.rating ?? null,
    teeSlope: tee?.slope ?? null,
    teeTotalYards: tee?.totalYards ?? null,
    holes: [],
  };
}

export default function HomeScreen() {
  const { db, revision, bump } = useDb();
  const [courseName, setCourseName] = useState('');
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [pickedTee, setPickedTee] = useState<TeeSet | null>(null);
  const [pickedDetail, setPickedDetail] = useState<CourseDetail | null>(null);
  const [starting, setStarting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(
    Device.isDevice === false ? COPY.simulator : null,
  );
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const active = useMemo(() => getActiveRound(db), [db, revision]);
  const courseDistanceUnit = useMemo(() => getCourseDistanceUnit(db), [db, revision]);
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const bagPromptOpen = useMemo(() => !hasSeenBagCustomize(db), [db, revision]);

  useEffect(() => {
    setWatchCoursePickedHandler((pick) => {
      setPicked(pick.course);
      setPickedDetail(pick.detail);
      setPickedTee(null);
      setCourseName(pick.course.name);
    });
    return () => setWatchCoursePickedHandler(null);
  }, []);

  const finishBagPrompt = () => {
    markBagCustomizeSeen(db);
    bump();
  };

  const applyPickedCourse = async (course: CourseSummary, holeCount: 9 | 18) => {
    const layout = await loadLayout(course, pickedDetail, pickedTee);
    const round = startRound(db, holeCount, course.name, layout);
    bump();
    router.push(`/round/${round.id}/hole/1`);
  };

  const commitPick = async (pick: CoursePick) => {
    const needsTee = (pick.detail?.tees.length ?? 0) > 1 && !pick.tee;
    setPicked(pick.course);
    setPickedTee(pick.tee);
    setPickedDetail(pick.detail);
    setCourseName(pick.course.name);
    if (needsTee) return;
    setSheetOpen(false);
    if (active) {
      setStarting(true);
      try {
        const layout = await loadLayout(pick.course, pick.detail, pick.tee);
        attachCourseToRound(db, active.id, pick.course.name, layout);
        bump();
        router.push(`/round/${active.id}/hole/1`);
      } catch (err) {
        Alert.alert('Couldn’t attach course', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setStarting(false);
      }
    }
  };

  const onSelectCourse = (pick: CoursePick | null) => {
    if (!pick) {
      setPicked(null);
      setPickedTee(null);
      setPickedDetail(null);
      return;
    }
    void commitPick(pick);
  };

  const onStart = (holeCount: 9 | 18) => {
    if (active) {
      router.push(`/round/${active.id}/hole/1`);
      return;
    }
    void (async () => {
      setStarting(true);
      try {
        if (picked) {
          await applyPickedCourse(picked, holeCount);
          return;
        }
        const name = courseName.trim() || null;
        const round = startRound(db, holeCount, name);
        bump();
        router.push(`/round/${round.id}/hole/1`);
      } catch (err) {
        Alert.alert('Couldn’t start round', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setStarting(false);
      }
    })();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (Device.isDevice === false) {
        const fix = await getCurrentFix().catch(() => null);
        setSimMessage(fix ? describeGpsSource(fix) : COPY.simulator);
      }
      await refreshRef.current?.();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const needsTee = Boolean(picked) && (pickedDetail?.tees.length ?? 0) > 1 && !pickedTee;
  const teeLabel = pickedTee
    ? formatTeeMeta({
        name: pickedTee.name,
        rating: pickedTee.rating,
        slope: pickedTee.slope,
        totalYards: pickedTee.totalYards,
      })
    : null;

  return (
    <Screen edges={['bottom']} refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <Text style={styles.title}>ShotTraxx</Text>
      <Text style={styles.lede}>{COPY.homeLede}</Text>

      <FullSheet
        visible={bagPromptOpen}
        title={COPY.bagCustomizeTitle}
        onClose={finishBagPrompt}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <Text style={styles.lede}>{COPY.bagCustomizeLede}</Text>
          <BagCustomizeActions onSkip={finishBagPrompt} onDone={finishBagPrompt} />
          <BagCarryList db={db} clubs={clubs} onChange={bump} />
        </ScrollView>
      </FullSheet>

      {simMessage ? <GpsBanner message={simMessage} /> : null}

      <TextInput
        placeholder={COPY.courseNamePlaceholder}
        placeholderTextColor={colors.muted}
        value={picked?.name ?? courseName}
        onChangeText={(text) => {
          setPicked(null);
          setPickedTee(null);
          setPickedDetail(null);
          setCourseName(text);
        }}
        style={styles.input}
      />

      <BigButton
        label="Courses near you"
        variant="secondary"
        onPress={() => setSheetOpen(true)}
      />
      <Text style={styles.hint}>{COPY.nearbyHint}</Text>
      {picked ? (
        <Text style={styles.meta}>
          {picked.name}
          {teeLabel ? ` · ${teeLabel}` : needsTee ? ` · ${COPY.pickTee}` : ''}
        </Text>
      ) : null}

      <FullSheet visible={sheetOpen} title="Courses near you" onClose={() => setSheetOpen(false)}>
        <CoursePicker
          selected={picked}
          selectedTee={pickedTee}
          attachMode={Boolean(active)}
          courseDistanceUnit={courseDistanceUnit}
          onSelect={onSelectCourse}
          onRefreshReady={(fn) => {
            refreshRef.current = fn;
          }}
        />
      </FullSheet>

      {active ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{COPY.roundInProgress}</Text>
          <Text style={styles.cardMeta}>
            {active.courseName ?? 'Round'}
            {active.teeName
              ? ` · ${formatTeeMeta({
                  name: active.teeName,
                  rating: active.teeRating,
                  slope: active.teeSlope,
                  totalYards: active.teeTotalYards,
                })}`
              : ''}
            {` · ${active.holeCount} holes`}
          </Text>
          <BigButton
            label={COPY.continueRound}
            onPress={() => router.push(`/round/${active.id}/hole/1`)}
          />
          <BigButton
            label="Finish round"
            variant="ghost"
            onPress={() => {
              finishRound(db, active.id);
              bump();
              router.push(`/round/${active.id}/summary`);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <BigButton
            label={
              picked
                ? `Start 18 at ${picked.name}${pickedTee ? ` · ${pickedTee.name}` : ''}`
                : COPY.start18
            }
            disabled={starting || needsTee}
            onPress={() => onStart(18)}
          />
          <BigButton
            label={
              picked
                ? `Start 9 at ${picked.name}${pickedTee ? ` · ${pickedTee.name}` : ''}`
                : COPY.start9
            }
            variant="secondary"
            disabled={starting || needsTee}
            onPress={() => onStart(9)}
          />
        </View>
      )}

      <Text style={styles.section}>{COPY.roundHistory}</Text>
      {rounds.length === 0 ? (
        <Text style={styles.muted}>{COPY.noRounds}</Text>
      ) : (
        rounds.map((round) => {
          const holes = listHoles(db, round.id);
          const scored = holes.filter((h) => h.score != null);
          const total = scored.reduce((sum, h) => sum + (h.score ?? 0), 0);
          const open = round.finishedAt == null;
          return (
            <Pressable
              key={round.id}
              onPress={() =>
                router.push(open ? `/round/${round.id}/hole/1` : `/round/${round.id}/summary`)
              }
              onLongPress={() => {
                Alert.alert(COPY.deleteRound, COPY.deleteRoundConfirm, [
                  { text: COPY.cancel, style: 'cancel' },
                  {
                    text: COPY.deleteRound,
                    style: 'destructive',
                    onPress: () => {
                      deleteRound(db, round.id);
                      bump();
                    },
                  },
                ]);
              }}
              style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{round.courseName ?? 'Round'}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(round.startedAt).toLocaleString()}
                  {round.teeName ? ` · ${round.teeName}` : ''} · {round.holeCount} holes
                  {open ? ' · in progress' : ''}
                </Text>
              </View>
              <Text style={styles.score}>{scored.length ? total : '—'}</Text>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontSize: type.title, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
  hint: { color: colors.muted, fontSize: type.tiny },
  meta: { color: colors.cream, fontSize: type.meta, fontWeight: '700' },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.cream,
    fontSize: 18,
    backgroundColor: colors.bgElevated,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { color: colors.cream, fontSize: 20, fontWeight: '800' },
  cardMeta: { color: colors.muted, fontSize: type.meta },
  section: { color: colors.cream, fontSize: 18, fontWeight: '800', marginTop: 8 },
  muted: { color: colors.muted, fontSize: type.body },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: 14,
    borderRadius: 14,
    minHeight: tapTarget,
    gap: 8,
  },
  rowTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  score: { color: colors.lime, fontSize: 24, fontWeight: '900' },
});
