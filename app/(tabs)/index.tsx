import * as Device from 'expo-device';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { catalogEntryById } from '@/src/course/catalog';
import { applyCourseHydrateToLayout } from '@/src/course/hydrate';
import { layoutFromTee } from '@/src/course/layout';
import { downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
import { prefetchCourseCardInBackground, rememberLayoutHoles } from '@/src/course/prefetch';
import type { CourseDetail, CourseSummary, TeeSet } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import {
  attachCourseToRound,
  deleteRound,
  finishRound,
  getActiveRound,
  hasSeenBagCustomize,
  listClubs,
  markBagCustomizeSkipped,
  listHoles,
  listRounds,
  markBagCustomizeSeen,
  readSettingStore,
  startRound,
  type CourseLayoutSeed,
} from '@/src/db/repo';
import { formatLastPlayedChip, formatPaintSourceChip } from '@/src/domain/courseCard';
import { canFinishBagCarrySetup, countTypedCarries } from '@/src/domain/bagCustomize';
import { canStartRound } from '@/src/domain/coursePick';
import { COPY, formatTeeMeta, SHOTTRAXX_BRAND } from '@/src/domain/playerCopy';
import { playHrefAfterRoundStart } from '@/src/domain/playNav';
import {
  favoriteFromHistoryRound,
  historyStarInventsPaint,
  historyStarUsesFavoritesList,
  isFavorite,
  setFavorite,
} from '@/src/domain/favorites';
import { layoutForPlayedHoles, resolveCourseNumHoles } from '@/src/domain/nineByTwo';
import { formatRoundPaceLine, planLivePace } from '@/src/domain/livePace';
import { formatHistoryRow, historyDeletePrompt, pastRoundEditAnytime, pastRoundHoleHref } from '@/src/domain/roundHistory';
import { describeGpsSource } from '@/src/services/location';
import { BagCarryList, BagCustomizeActions } from '@/src/ui/BagCarryList';
import { BigButton } from '@/src/ui/BigButton';
import { takePendingCoursePick } from '@/src/course/pendingCoursePick';
import type { CoursePick } from '@/src/ui/CoursePicker';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { HistorySwipeRow } from '@/src/ui/HistorySwipeRow';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { FullSheet } from '@/src/ui/Sheet';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';
import { getCurrentFix } from '@/src/services/location';
import { setWatchCoursePickedHandler } from '@/src/services/watchNearby';

function playedLayout(
  layout: CourseLayoutSeed,
  course: CourseSummary,
  detail: CourseDetail | null,
  holeCount: 9 | 18,
): CourseLayoutSeed {
  return layoutForPlayedHoles(layout, {
    numHoles: resolveCourseNumHoles({
      detailHoleCount: detail?.holeCount,
      catalogHoleCount: catalogEntryById(course.id)?.holeCount ?? null,
    }),
    playHoleCount: holeCount,
  });
}

function loadLayout(
  course: CourseSummary,
  detail: CourseDetail | null,
  tee: TeeSet | null,
): CourseLayoutSeed {
  const resolved = detail;
  const base = resolved
    ? layoutFromTee(resolved, tee)
    : {
        apiId: course.id,
        name: course.name,
        location: course.location,
        teeName: tee?.name ?? null,
        teeRating: tee?.rating ?? null,
        teeSlope: tee?.slope ?? null,
        teeTotalYards: tee?.totalYards ?? null,
        holes: [],
      };
  const layout = applyCourseHydrateToLayout(base, {
    name: course.name,
    city: course.city,
    state: course.state,
    location: course.location ?? base.location ?? null,
    courseKey: course.id,
  });
  rememberLayoutHoles(layout);
  return layout;
}

export default function HomeScreen() {
  const { db, revision, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [pickedTee, setPickedTee] = useState<TeeSet | null>(null);
  const [pickedDetail, setPickedDetail] = useState<CourseDetail | null>(null);
  const [starting, setStarting] = useState(false);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(
    Device.isDevice === false ? COPY.simulator : null,
  );
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const active = useMemo(() => getActiveRound(db), [db, revision]);
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const bagPromptOpen = useMemo(() => !hasSeenBagCustomize(db), [db, revision]);
  const typedCarryCount = useMemo(() => countTypedCarries(clubs), [clubs]);
  const canFinishBag = canFinishBagCarrySetup(typedCarryCount);
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
    });
    return () => setWatchCoursePickedHandler(null);
  }, []);

  const skipBagSetup = () => {
    markBagCustomizeSkipped(db);
    bump();
  };

  const finishBagSetup = () => {
    if (!canFinishBag) return;
    markBagCustomizeSeen(db);
    bump();
  };

  const applyPickedCourse = (course: CourseSummary, holeCount: 9 | 18) => {
    const numHoles = resolveCourseNumHoles({
      detailHoleCount: pickedDetail?.holeCount,
      catalogHoleCount: catalogEntryById(course.id)?.holeCount ?? null,
    });
    const layout = playedLayout(loadLayout(course, pickedDetail, pickedTee), course, pickedDetail, holeCount);
    const round = startRound(db, holeCount, course.name, layout);
    bump();
    router.push(playHrefAfterRoundStart(round.id));
    prefetchCourseCardInBackground(layout, {
      holeCount,
      courseNumHoles: numHoles,
      applyLayout: (painted) => {
        attachCourseToRound(
          db,
          round.id,
          course.name,
          layoutForPlayedHoles(painted, { numHoles, playHoleCount: holeCount }),
        );
        bump();
      },
    });
  };

  const commitPick = async (pick: CoursePick) => {
    const needsTee = (pick.detail?.tees.length ?? 0) > 0 && !pick.tee;
    setPicked(pick.course);
    setPickedTee(pick.tee);
    setPickedDetail(pick.detail);
    if (needsTee) return;
    if (active) {
      setStarting(true);
      try {
        const holeCount = active.holeCount === 9 ? 9 : 18;
        const numHoles = resolveCourseNumHoles({
          detailHoleCount: pick.detail?.holeCount,
          catalogHoleCount: catalogEntryById(pick.course.id)?.holeCount ?? null,
        });
        const layout = playedLayout(loadLayout(pick.course, pick.detail, pick.tee), pick.course, pick.detail, holeCount);
        attachCourseToRound(db, active.id, pick.course.name, layout);
        bump();
        router.push(playHrefAfterRoundStart(active.id));
        prefetchCourseCardInBackground(layout, {
          holeCount,
          courseNumHoles: numHoles,
          applyLayout: (painted) => {
            attachCourseToRound(
              db,
              active.id,
              pick.course.name,
              layoutForPlayedHoles(painted, { numHoles, playHoleCount: holeCount }),
            );
            bump();
          },
        });
      } catch (err) {
        Alert.alert('Couldn’t attach course', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setStarting(false);
      }
    }
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
    setStarting(true);
    try {
      applyPickedCourse(picked, holeCount);
    } catch (err) {
      Alert.alert('Couldn’t start round', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setStarting(false);
    }
  };

  const favoriteStore = useMemo(() => readSettingStore(db), [db]);

  const starHistoryRound = (round: (typeof rounds)[number]) => {
    if (!historyStarUsesFavoritesList() || historyStarInventsPaint()) return;
    const catalog = round.courseApiId ? catalogEntryById(round.courseApiId) : null;
    const favorite = favoriteFromHistoryRound({
      courseApiId: round.courseApiId,
      courseName: round.courseName,
      courseLat: round.courseLat,
      courseLng: round.courseLng,
      city: catalog?.city ?? null,
      state: catalog?.state ?? null,
      country: catalog?.country ?? null,
    });
    if (!favorite) return;
    const starred = isFavorite(favoriteStore, favorite.id);
    setFavorite(favoriteStore, favorite, !starred);
    bump();
    if (starred) return;
    void downloadFavoriteForOffline(favorite, favoriteStore, { onStatus: () => bump() });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (Device.isDevice === false) {
        const fix = await getCurrentFix().catch(() => null);
        setSimMessage(fix ? describeGpsSource(fix) : COPY.simulator);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const commitRef = useRef(commitPick);
  commitRef.current = commitPick;
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingCoursePick();
      if (pending) void commitRef.current(pending);
    }, []),
  );
  const paintSourceLabel = formatPaintSourceChip(pickedDetail?.paintSource);
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
        <Text style={styles.title}>{SHOTTRAXX_BRAND}</Text>
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
        onClose={skipBagSetup}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <Text style={styles.lede}>{COPY.bagCustomizeLede}</Text>
          <BagCustomizeActions
            onSkip={skipBagSetup}
            onDone={finishBagSetup}
            doneDisabled={!canFinishBag}
          />
          <BagCarryList db={db} clubs={clubs} onChange={bump} />
        </ScrollView>
      </FullSheet>

      {simMessage ? <GpsBanner message={simMessage} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.courseNamePlaceholder}
        onPress={() => router.push('/search')}
        style={styles.searchPill}>
        <Text style={styles.searchPillText}>{COPY.courseNamePlaceholder}</Text>
      </Pressable>

      <BigButton
        label="Courses near you"
        variant="secondary"
        onPress={() => router.push('/search')}
      />
      <Text style={styles.hint}>{COPY.nearbyHint}</Text>
      {picked ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{picked.name}</Text>
          {paintSourceLabel ? (
            <Text testID="paint-source-chip" style={styles.paintSource}>
              {paintSourceLabel}
            </Text>
          ) : null}
          {teeLabel || needsTee ? (
            <Text style={styles.cardMeta}>{teeLabel ? teeLabel : COPY.pickTee}</Text>
          ) : null}
          {formatLastPlayedChip(
            lastPlayedAtByCourse[picked.id] ?? lastPlayedAtByCourse[picked.name],
          ) ? (
            <Text style={styles.chip}>
              {formatLastPlayedChip(lastPlayedAtByCourse[picked.id] ?? lastPlayedAtByCourse[picked.name])}
            </Text>
          ) : null}
        </View>
      ) : null}

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

      <BigButton
        label={COPY.nerdOut}
        variant="ghost"
        onPress={() =>
          router.push({
            pathname: '/nerd-out',
            params: active ? { roundId: active.id } : undefined,
          })
        }
      />
      <BigButton label={COPY.liveBoardWatch} variant="ghost" onPress={() => router.push('/board')} />

      <Text style={styles.section}>{COPY.roundHistory}</Text>
      {rounds.length === 0 ? (
        <EmptyPanel title={COPY.noRounds} hint={COPY.firstRoundHint} />
      ) : (
        rounds.map((round) => {
          const holes = listHoles(db, round.id);
          const scored = holes.filter((h) => h.score != null);
          const total = scored.reduce((sum, h) => sum + (h.score ?? 0), 0);
          const open = round.finishedAt == null;
          const paceLine = open
            ? null
            : formatRoundPaceLine(
                planLivePace({
                  holes: holes.map((h) => ({
                    hole: h.number,
                    score: h.score,
                    par: h.par,
                    startedAt: h.startedAt,
                    completedAt: h.completedAt,
                  })),
                  nowMs: Date.now(),
                  finished: true,
                }),
              );
          const row = formatHistoryRow({
            startedAt: round.startedAt,
            courseName: round.courseName,
            teeName: round.teeName,
            score: scored.length ? total : null,
          });
          const prompt = historyDeletePrompt();
          const catalog = round.courseApiId ? catalogEntryById(round.courseApiId) : null;
          const favorite = favoriteFromHistoryRound({
            courseApiId: round.courseApiId,
            courseName: round.courseName,
            courseLat: round.courseLat,
            courseLng: round.courseLng,
            city: catalog?.city ?? null,
            state: catalog?.state ?? null,
            country: catalog?.country ?? null,
          });
          const starred = favorite ? isFavorite(favoriteStore, favorite.id) : false;
          return (
            <HistorySwipeRow
              key={round.id}
              open={openHistoryId === round.id}
              onOpen={() => setOpenHistoryId(round.id)}
              onClose={() => setOpenHistoryId((current) => (current === round.id ? null : current))}
              onPress={() =>
                router.push(open ? playHrefAfterRoundStart(round.id) : `/round/${round.id}/summary`)
              }
              onEdit={() => {
                if (!pastRoundEditAnytime()) return;
                setOpenHistoryId(null);
                router.push(pastRoundHoleHref(round.id, 1));
              }}
              onDelete={() => {
                if (!prompt.cancelIsDefault) return;
                Alert.alert(prompt.title, prompt.body, [
                  { text: COPY.cancel, style: 'cancel' },
                  {
                    text: COPY.deleteRound,
                    style: 'destructive',
                    onPress: () => {
                      deleteRound(db, round.id);
                      setOpenHistoryId(null);
                      bump();
                    },
                  },
                ]);
              }}
              rowStyle={styles.row}>
              {favorite ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={starred ? COPY.unfavorite : COPY.favorite}
                  onPress={() => starHistoryRound(round)}
                  style={styles.star}>
                  <Text style={styles.starText}>{starred ? '★' : '☆'}</Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{row.courseName}</Text>
                <Text style={styles.cardMeta}>
                  {row.date} · {row.tees}
                  {open ? ' · in progress' : ''}
                  {paceLine ? ` · ${paceLine}` : ''}
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text style={styles.chip}>{row.relative}</Text>
                <Text style={styles.score}>{row.score}</Text>
              </View>
            </HistorySwipeRow>
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
    searchPill: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
    },
    searchPillText: { color: colors.muted, fontSize: 18, fontWeight: '700' },
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cardTitle: { color: colors.cream, fontSize: 20, fontWeight: '800' },
    paintSource: { color: colors.muted, fontSize: type.tiny, fontWeight: '600' },
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
    star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    starText: { color: colors.lime, fontSize: 28, fontWeight: '900' },
  });
}
