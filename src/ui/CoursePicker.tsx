import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isGolfCoursesApiConfigured } from '@/src/course/config';
import { getCourseDataClient } from '@/src/course/client';
import { formatTeeHoleYards, formatTeeMeta } from '@/src/course/layout';
import type { CourseDetail, CourseSummary, TeeSet } from '@/src/course/types';
import { COPY } from '@/src/domain/playerCopy';
import { formatCourseDistance, type CourseDistanceUnit } from '@/src/domain/courseDistance';
import { getCurrentFix } from '@/src/services/location';
import { BigButton } from './BigButton';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';

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
  onRefreshReady?: (refresh: () => Promise<void>) => void;
  courseDistanceUnit?: CourseDistanceUnit;
};

function formatDistance(meters: number | null, unit: CourseDistanceUnit): string | null {
  return formatCourseDistance(meters, unit);
}

function placeLine(course: CourseSummary, unit: CourseDistanceUnit): string {
  const place = [course.city, course.state].filter(Boolean).join(', ');
  const dist = formatDistance(course.distanceMeters, unit);
  return [place || course.club || 'Course', dist].filter(Boolean).join(' · ');
}

export function CoursePicker({
  selected,
  selectedTee,
  onSelect,
  autoFind = true,
  onRefreshReady,
  courseDistanceUnit = 'mi',
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const configured = isGolfCoursesApiConfigured();
  const [busy, setBusy] = useState(false);
  const [teeBusy, setTeeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [tees, setTees] = useState<TeeSet[] | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);

  const onFind = useCallback(async () => {
    if (!configured) return;
    setBusy(true);
    setError(null);
    try {
      const fix = await getCurrentFix();
      const nearby = await getCourseDataClient().nearbyCourses({ lat: fix.lat, lng: fix.lng });
      setResults(nearby);
      if (nearby.length === 0) {
        setError(COPY.nearbyEmpty);
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Couldn’t find courses nearby.');
    } finally {
      setBusy(false);
    }
  }, [configured]);

  useEffect(() => {
    onRefreshReady?.(onFind);
  }, [onFind, onRefreshReady]);

  useEffect(() => {
    if (!configured || !autoFind) return;
    void onFind();
  }, [configured, autoFind, onFind]);

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

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{COPY.nearbyHint}</Text>
      {!configured ? <Text style={styles.meta}>{COPY.nearbyUnavailable}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {busy ? <Text style={styles.meta}>{COPY.nearbyBusy}</Text> : null}
      {selected ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.meta}>{placeLine(selected, courseDistanceUnit)}</Text>
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
        </View>
      ) : null}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {results?.map((course) => (
          <Pressable
            key={course.id}
            onPress={() => void pickCourse(course)}
            style={[styles.row, selected?.id === course.id && styles.rowOn]}>
            <Text style={styles.rowTitle}>{course.name}</Text>
            <Text style={styles.meta}>{placeLine(course, courseDistanceUnit)}</Text>
          </Pressable>
        ))}
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
  label: { color: colors.muted, fontSize: type.meta, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  selected: { gap: 6 },
  selectedName: { color: colors.lime, fontSize: 18, fontWeight: '800' },
  row: {
    minHeight: tapTarget,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.bgElevated,
    marginBottom: 8,
  },
  rowOn: { borderColor: colors.lime },
  rowTitle: { color: colors.cream, fontSize: type.body, fontWeight: '700' },
  teeBox: { gap: 8, marginTop: 8 },
  });
}
