import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isGolfCoursesApiConfigured } from '@/src/course/config';
import { getCourseDataClient } from '@/src/course/client';
import type { CourseSummary } from '@/src/course/types';
import { getCurrentFix } from '@/src/services/location';
import { BigButton } from './BigButton';
import { colors } from './theme';

type Props = {
  selected: CourseSummary | null;
  onSelect: (course: CourseSummary | null) => void;
  /** When set, picking a course attaches it to the in-progress round. */
  attachMode?: boolean;
  autoFind?: boolean;
};

function formatDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function placeLine(course: CourseSummary): string {
  const place = [course.city, course.state].filter(Boolean).join(', ');
  const dist = formatDistance(course.distanceMeters);
  return [place || course.club || 'Course', dist].filter(Boolean).join(' · ');
}

/**
 * Nearby course picker (Golf Courses API Pro).
 * Disabled and graceful when the EAS secret / local key is missing.
 */
export function CoursePicker({ selected, onSelect, attachMode = false, autoFind = true }: Props) {
  const configured = isGolfCoursesApiConfigured();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseSummary[] | null>(null);

  const onFind = useCallback(async () => {
    if (!configured) return;
    setBusy(true);
    setError(null);
    try {
      const fix = await getCurrentFix();
      const nearby = await getCourseDataClient().nearbyCourses({ lat: fix.lat, lng: fix.lng });
      setResults(nearby);
      if (nearby.length === 0) {
        setError('No nearby courses returned. ShotTrax does not invent a course list.');
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Could not look up nearby courses');
    } finally {
      setBusy(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured || !autoFind) return;
    void onFind();
  }, [configured, autoFind, onFind]);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Nearby courses</Text>
      <Text style={styles.meta}>
        {configured
          ? attachMode
            ? 'Pick a course to attach par (if present) and green centroids to this round. Missing par stays “par ?”; missing greens stay blank.'
            : 'GPS nearby search. Selecting a course starts a round (or attach if one is in progress). Par and greens come from the API only — never invented.'
          : 'Nearby picker needs the Golf Courses API key. CoS: EAS secret GOLF_COURSES_API_KEY (prod/preview/dev). Local: EXPO_PUBLIC_GOLF_COURSES_API_KEY in .env. You can still type a course name and drop a green pin.'}
      </Text>
      <BigButton
        label={
          configured
            ? busy
              ? 'Finding…'
              : results
                ? 'Refresh nearby'
                : 'Find nearby courses'
            : 'Nearby courses — needs API key'
        }
        variant="secondary"
        disabled={!configured || busy}
        onPress={() => void onFind()}
      />
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {selected ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.meta}>{placeLine(selected)}</Text>
          <BigButton label="Clear course" variant="ghost" onPress={() => onSelect(null)} />
        </View>
      ) : null}
      {results?.map((course) => (
        <Pressable
          key={course.id}
          onPress={() => onSelect(course)}
          style={[styles.row, selected?.id === course.id && styles.rowOn]}>
          <Text style={styles.rowTitle}>{course.name}</Text>
          <Text style={styles.meta}>{placeLine(course)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: { color: colors.cream, fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  warn: { color: colors.orange, fontSize: 14, fontWeight: '700' },
  selected: { gap: 6 },
  selectedName: { color: colors.lime, fontSize: 18, fontWeight: '800' },
  row: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.bg,
  },
  rowOn: { borderColor: colors.lime },
  rowTitle: { color: colors.cream, fontSize: 16, fontWeight: '700' },
});
