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
import { fillLayoutTeesFromOsm } from '@/src/course/osmOverlay';
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
import { formatLastPlayedChip, lastPlayedAtForCourse } from '@/src/domain/courseCard';
import { canStartRound } from '@/src/domain/coursePick';
import { COPY, formatTeeMeta } from '@/src/domain/playerCopy';
import { playHrefAfterRoundStart } from '@/src/domain/playNav';
import { formatHistoryRow } from '@/src/domain/roundHistory';
import { describeGpsSource } from '@/src/services/location';
import { BagCarryList, BagCustomizeActions } from '@/src/ui/BagCarryList';
import { BigButton } from '@/src/ui/BigButton';
import { CoursePicker, type CoursePick } from '@/src/ui/CoursePicker';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { FullSheet } from '@/src/ui/Sheet';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';
import { getCurrentFix } from '@/src/services/location';
import { setWatchCoursePickedHandler } from '@/src/services/watchNearby';

async function loadLayout(
  course: CourseSummary,
  detail: CourseDetail | null,
  tee: TeeSet | null,
): Promise<CourseLayoutSeed> {
  const resolved = detail ?? (await getCourseDataClient().getCourse(course.id).catch(() => null));
  if (resolved) return fillLayoutTeesFromOsm(layoutFromTee(resolved, tee), { timeoutMs: 3500 });
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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');
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
  const lastPlayedAtByCourse = useMemo(() => {
    const map: Record<string, string> = {};
    for (const round of rounds) {
      if (round.courseApiId && !map[round.courseApiId]) map[round.courseApiId] = round.startedAt;
      if (round.courseName && !map[round.courseName]) map[round.courseName] = round.startedAt;
    }
    return map;
  }, [rounds]);

  useEffect(() => {
    setWatchCoursePickedHandler((pick) => {
      setPicked(pick.course);
      setPickedDetail(pick.detail);
      setPickedTee(null);
      setSearchQuery(pick.course.name);
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
    router.push(playHrefAfterRoundStart(round.id));
  };

  const commitPick = async (pick: CoursePick) => {
    const needsTee = (pick.detail?.tees.length ?? 0) > 0 && !pick.tee;
    setPicked(pick.course);
    setPickedTee(pick.tee);
    setPickedDetail(pick.detail);
    setSearchQuery(pick.course.name);
    if (needsTee) return;
    setSheetOpen(false);
    if (active) {
      setStarting(true);
      try {
        const layout = await loadLayout(pick.course, pick.detail, pick.tee);
        attachCourseToRound(db, active.id, pick.course.name, layout);
        bump();
        router.push(playHrefAfterRoundStart(active.id));
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

  const teeCount = picked ? (pickedDetail == null ? null : pickedDetail.tees.length) : 0;
  const needsTee = Boolean(picked) && (teeCount == null || (teeCount > 0 && !pickedTee));
  const canStart = canStartRound({ picked, teeCount, pickedTee });

  const onStart = (holeCount: 9 | 18) => {
    if (active) {
      router.push(playHrefAfterRoundStart(active.id));
      return;
    }
    if (!canStart || !picked) return;
    void (async () => {
      setStarting(true);
      try {
        await applyPickedCourse(picked, holeCount);
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
      <View style={styles.homeBar}>
        <Text style={styles.title}>ShotTraxx</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={styles.menuButton}>
          <Text style={styles.menuButtonText}>{COPY.menu}</Text>
        </Pressable>
      </View>
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
        value={searchQuery}
        onChangeText={(text) => {
          setPicked(null);
          setPickedTee(null);
          setPickedDetail(null);
          setSearchQuery(text);
          setSheetOpen(true);
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{picked.name}</Text>
          {teeLabel || needsTee ? (
            <Text style={styles.cardMeta}>{teeLabel ? teeLabel : COPY.pickTee}</Text>
          ) : null}
          {formatLastPlayedChip(lastPlayedAtForCourse(rounds, { id: picked.id, name: picked.name })) ? (
            <Text style={styles.chip}>
              {formatLastPlayedChip(lastPlayedAtForCourse(rounds, { id: picked.id, name: picked.name }))}
            </Text>
          ) : null}
        </View>
      ) : null}

      <FullSheet visible={sheetOpen} title={COPY.selectCourse} onClose={() => setSheetOpen(false)}>
        <CoursePicker
          selected={picked}
          selectedTee={pickedTee}
          attachMode={Boolean(active)}
          courseDistanceUnit={courseDistanceUnit}
          query={searchQuery}
          onQueryChange={(text) => {
            setSearchQuery(text);
            setPicked(null);
            setPickedTee(null);
            setPickedDetail(null);
          }}
          onSelect={onSelectCourse}
          lastPlayedAtByCourse={lastPlayedAtByCourse}
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
            onPress={() => router.push(playHrefAfterRoundStart(active.id))}
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
            disabled={starting || !canStart}
            onPress={() => onStart(18)}
          />
          <BigButton
            label={
              picked
                ? `Start 9 at ${picked.name}${pickedTee ? ` · ${pickedTee.name}` : ''}`
                : COPY.start9
            }
            variant="secondary"
            disabled={starting || !canStart}
            onPress={() => onStart(9)}
          />
        </View>
      )}

      <Text style={styles.section}>{COPY.roundHistory}</Text>
      {rounds.length === 0 ? (
        <EmptyPanel title={COPY.noRounds} hint={COPY.firstRoundHint} />
      ) : (
        rounds.map((round) => {
          const holes = listHoles(db, round.id);
          const scored = holes.filter((h) => h.score != null);
          const total = scored.reduce((sum, h) => sum + (h.score ?? 0), 0);
          const open = round.finishedAt == null;
          const row = formatHistoryRow({
            startedAt: round.startedAt,
            courseName: round.courseName,
            teeName: round.teeName,
            score: scored.length ? total : null,
          });
          return (
            <Pressable
              key={round.id}
              onPress={() =>
                router.push(open ? playHrefAfterRoundStart(round.id) : `/round/${round.id}/summary`)
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
                <Text style={styles.rowTitle}>{row.courseName}</Text>
                <Text style={styles.cardMeta}>
                  {row.date} · {row.tees}
                  {open ? ' · in progress' : ''}
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text style={styles.chip}>{row.relative}</Text>
                <Text style={styles.score}>{row.score}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    homeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { color: colors.cream, fontSize: type.title, fontWeight: '900', flex: 1 },
    menuButton: {
      minHeight: tapTarget,
      minWidth: 88,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuButtonText: { color: colors.cream, fontWeight: '800', fontSize: type.button },
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
    chip: {
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.bgElevated,
      padding: 16,
      borderRadius: 16,
      minHeight: tapTarget + 8,
      gap: 8,
    },
    rowTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
    scoreCol: { alignItems: 'flex-end', gap: 2 },
    relative: { color: colors.muted, fontSize: type.tiny, fontWeight: '800' },
    score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
  });
}
