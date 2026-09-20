import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { isGolfCoursesApiConfigured } from '@/src/course/config';
import { getCourseDataClient } from '@/src/course/client';
import { formatTeeHoleYards, formatTeeMeta } from '@/src/course/layout';
import type { CourseDetail, CourseSummary, TeeSet } from '@/src/course/types';
import type { GpsFix } from '@/src/domain/types';
import { COPY } from '@/src/domain/playerCopy';
import { planCourseCard } from '@/src/domain/courseCard';
import {
  planCourseList,
  planCourseSearchParams,
  planNearbyCourseSearch,
  showNearbyCourseList,
} from '@/src/domain/coursePick';
import { type CourseDistanceUnit } from '@/src/domain/courseDistance';
import { getCurrentFix } from '@/src/services/location';
import { BigButton } from './BigButton';
import { EmptyPanel } from './EmptyPanel';
import { useColors } from './ColorThemeProvider';
import { thumbZoneMin, type, type ColorPalette } from './theme';

export type CoursePick = {
  course: CourseSummary;
  detail: CourseDetail | null;
  tee: TeeSet | null;
};

type Props = {
  selected: CourseSummary | null;
  selectedTee: TeeSet | null;
  onSelect: (pick: CoursePick | null) => void;
  attachMode?: boolean;
  autoFind?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  onRefreshReady?: (refresh: () => Promise<void>) => void;
  courseDistanceUnit?: CourseDistanceUnit;
  lastPlayedAtByCourse?: Record<string, string | null | undefined>;
};

function placeLine(course: CourseSummary): string {
  return [course.city, course.state].filter(Boolean).join(', ') || course.club || 'Course';
}

export function CoursePicker({
  selected,
  selectedTee,
  onSelect,
  autoFind = true,
  query = '',
  onQueryChange,
  onRefreshReady,
  courseDistanceUnit = 'mi',
  lastPlayedAtByCourse,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const configured = isGolfCoursesApiConfigured();
  const [busy, setBusy] = useState(false);
  const [teeBusy, setTeeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [listPhoneFix, setListPhoneFix] = useState<GpsFix | null>(null);
  const [listNowMs, setListNowMs] = useState<number | null>(null);
  const [tees, setTees] = useState<TeeSet[] | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);

  const onFind = useCallback(async () => {
    if (!configured) return;
    setBusy(true);
    setError(null);
    try {
      const rawFix = await getCurrentFix().catch(() => null);
      const nowMs = Date.now();
      const plan = planNearbyCourseSearch({ query, phoneFix: rawFix, nowMs });
      setListPhoneFix(rawFix);
      setListNowMs(nowMs);
      if (plan.mode === 'needs_location') {
        setResults([]);
        setError(COPY.nearbyNeedsLocation);
        return;
      }
      const found =
        plan.mode === 'search'
          ? await getCourseDataClient().searchCourses(plan.q)
          : await getCourseDataClient().nearbyCourses(plan.from);
      const listed = planCourseList({
        courses: found,
        lastPlayedAtByCourse,
        phoneFix: rawFix,
        nowMs,
      });
      setResults(listed);
      if (listed.length === 0) {
        setError(COPY.nearbyEmpty);
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Couldn’t find courses.');
    } finally {
      setBusy(false);
    }
  }, [configured, query, lastPlayedAtByCourse]);

  useEffect(() => {
    onRefreshReady?.(onFind);
  }, [onFind, onRefreshReady]);

  useEffect(() => {
    if (!configured || !autoFind) return;
    const delay = planCourseSearchParams(query) ? 280 : 0;
    const timer = setTimeout(() => {
      void onFind();
    }, delay);
    return () => clearTimeout(timer);
  }, [configured, autoFind, onFind, query]);

  const pickCourse = async (course: CourseSummary) => {
    setTeeBusy(true);
    setError(null);
    setTees(null);
    setDetail(null);
    try {
      const next = await getCourseDataClient().getCourse(course.id);
      setDetail(next);
      const nextTees = next?.tees ?? [];
      setTees(nextTees);
      if (nextTees.length === 1) {
        onSelect({ course, detail: next, tee: nextTees[0] });
      } else {
        onSelect({ course, detail: next, tee: null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load that course.');
      onSelect({ course, detail: null, tee: null });
    } finally {
      setTeeBusy(false);
    }
  };

  const emptyNearby = configured && results != null && results.length === 0 && !busy;
  const needsLocation = error === COPY.nearbyNeedsLocation;
  const showList = showNearbyCourseList(selected);
  const listed = planCourseList({
    courses: results ?? [],
    lastPlayedAtByCourse,
    phoneFix: listPhoneFix,
    nowMs: listNowMs ?? undefined,
  });

  return (
    <View style={styles.box}>
      {showList ? (
        <>
          <TextInput
            placeholder={COPY.courseNamePlaceholder}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.search}
          />
          {query.trim() ? (
            <BigButton
              label={COPY.clearSearch}
              variant="ghost"
              onPress={() => onQueryChange?.('')}
            />
          ) : null}
          <Text style={styles.label}>{COPY.nearbyHint}</Text>
          {!configured ? <Text style={styles.meta}>{COPY.nearbyUnavailable}</Text> : null}
          {error && !emptyNearby ? <Text style={styles.warn}>{error}</Text> : null}
          {busy ? <Text style={styles.meta}>{COPY.nearbyBusy}</Text> : null}
          {emptyNearby ? (
            <EmptyPanel
              title={needsLocation ? COPY.nearbyNeedsLocation : COPY.nearbyEmpty}
              hint={COPY.nearbyEmptyHint}
            />
          ) : null}
        </>
      ) : selected ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.meta}>{placeLine(selected)}</Text>
          {selectedTee ? (
            <>
              <Text style={styles.meta}>{formatTeeMeta(selectedTee)}</Text>
              {formatTeeHoleYards(selectedTee.holes) ? (
                <Text style={styles.meta}>{formatTeeHoleYards(selectedTee.holes)}</Text>
              ) : null}
            </>
          ) : null}
          <BigButton
            label={COPY.clearCourse}
            variant="ghost"
            onPress={() => {
              setTees(null);
              setDetail(null);
              onSelect(null);
            }}
          />
          {error ? <Text style={styles.warn}>{error}</Text> : null}
        </View>
      ) : null}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {showList
          ? listed.map((course) => {
              const card = planCourseCard({
                name: course.name,
                distanceMeters: course.distanceMeters,
                unit: courseDistanceUnit,
                lastPlayedAt: lastPlayedAtByCourse?.[course.id] ?? lastPlayedAtByCourse?.[course.name],
              });
              return (
                <Pressable
                  key={course.id}
                  onPress={() => void pickCourse(course)}
                  style={styles.row}>
                  <Text style={styles.rowTitle}>{card.name}</Text>
                  <View style={styles.chips}>
                    {card.distance ? <Text style={styles.chip}>{card.distance}</Text> : null}
                    {card.lastPlayed ? <Text style={styles.chip}>{card.lastPlayed}</Text> : null}
                  </View>
                  <Text style={styles.meta}>{placeLine(course)}</Text>
                </Pressable>
              );
            })
          : null}
        {teeBusy ? <Text style={styles.meta}>Loading tees…</Text> : null}
        {selected && tees && tees.length === 0 ? (
          <Text style={styles.meta}>No tees listed for this course.</Text>
        ) : null}
        {selected && tees && tees.length > 0 ? (
          <View style={styles.teeBox}>
            <Text style={styles.label}>{COPY.pickTee}</Text>
            {tees.map((tee) => (
              <Pressable
                key={tee.name}
                onPress={() => onSelect({ course: selected, detail, tee })}
                style={[styles.row, selectedTee?.name === tee.name && styles.rowOn]}>
                <Text style={styles.rowTitle}>{tee.name}</Text>
                <Text style={styles.meta}>{formatTeeMeta(tee)}</Text>
                {formatTeeHoleYards(tee.holes) ? (
                  <Text style={styles.meta}>{formatTeeHoleYards(tee.holes)}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  box: { flex: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  list: { flex: 1 },
  search: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.cream,
    fontSize: 18,
    backgroundColor: colors.bgElevated,
  },
  label: { color: colors.muted, fontSize: type.meta, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  selected: { gap: 6 },
  selectedName: { color: colors.cream, fontSize: 18, fontWeight: '800' },
  row: {
    minHeight: thumbZoneMin,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    backgroundColor: colors.bgElevated,
    marginBottom: 10,
    gap: 6,
  },
  rowOn: { borderColor: colors.cream },
  rowTitle: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    color: colors.cream,
    fontSize: type.tiny,
    fontWeight: '800',
    backgroundColor: colors.accentWash,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  teeBox: { gap: 8, marginTop: 8 },
  });
}
