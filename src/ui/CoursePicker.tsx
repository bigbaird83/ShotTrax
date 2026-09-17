import { useState } from 'react';
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
};

/**
 * Nearby course picker. Disabled and graceful when the Golf Courses API key is missing.
 */
export function CoursePicker({ selected, onSelect }: Props) {
  const configured = isGolfCoursesApiConfigured();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseSummary[] | null>(null);

  const onFind = async () => {
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
  };

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Nearby courses</Text>
      <Text style={styles.meta}>
        {configured
          ? 'Uses Golf Courses API for name, par (if present), and green centroid. Missing par/green stay blank.'
          : 'Add EXPO_PUBLIC_GOLF_COURSES_API_KEY (or expo extra golfCoursesApiKey) to enable the picker. Yards to green still works from a GPS or map green pin.'}
      </Text>
      <BigButton
        label={configured ? (busy ? 'Finding…' : 'Find nearby courses') : 'Nearby courses — needs API key'}
        variant="secondary"
        disabled={!configured || busy}
        onPress={() => void onFind()}
      />
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {selected ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.meta}>{[selected.city, selected.state].filter(Boolean).join(', ') || 'Selected'}</Text>
          <BigButton label="Clear course" variant="ghost" onPress={() => onSelect(null)} />
        </View>
      ) : null}
      {results?.map((course) => (
        <Pressable
          key={course.id}
          onPress={() => onSelect(course)}
          style={[styles.row, selected?.id === course.id && styles.rowOn]}>
          <Text style={styles.rowTitle}>{course.name}</Text>
          <Text style={styles.meta}>
            {[course.city, course.state].filter(Boolean).join(', ') || 'Course'}
          </Text>
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
