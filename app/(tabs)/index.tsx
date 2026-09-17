import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { layoutFromCourseDetail } from '@/src/course/layout';
import type { CourseDetail, CourseSummary } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import {
  attachCourseToRound,
  finishRound,
  getActiveRound,
  listHoles,
  listRounds,
  startRound,
  type CourseLayoutSeed,
} from '@/src/db/repo';
import { BigButton } from '@/src/ui/BigButton';
import { CoursePicker } from '@/src/ui/CoursePicker';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

async function loadLayout(course: CourseSummary): Promise<CourseLayoutSeed> {
  try {
    const detail: CourseDetail | null = await getCourseDataClient().getCourse(course.id);
    if (detail) return layoutFromCourseDetail(detail);
  } catch {
    // Still attach the name/id; par/green stay blank — never invented.
  }
  return {
    apiId: course.id,
    name: course.name,
    location: course.location,
    holes: [],
  };
}

export default function HomeScreen() {
  const { db, revision, bump } = useDb();
  const [courseName, setCourseName] = useState('');
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [starting, setStarting] = useState(false);
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const active = useMemo(() => getActiveRound(db), [db, revision]);
  const isSimulator = Device.isDevice === false;

  const applyPickedCourse = async (course: CourseSummary, holeCount: 9 | 18) => {
    const layout = await loadLayout(course);
    const name = course.name;
    const round = startRound(db, holeCount, name, layout);
    bump();
    router.push(`/round/${round.id}/hole/1`);
  };

  const onSelectCourse = (course: CourseSummary | null) => {
    if (!course) {
      setPicked(null);
      return;
    }
    if (active) {
      void (async () => {
        setStarting(true);
        try {
          const layout = await loadLayout(course);
          attachCourseToRound(db, active.id, course.name, layout);
          bump();
          setPicked(course);
          router.push(`/round/${active.id}/hole/1`);
        } catch (err) {
          Alert.alert('Could not attach course', err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setStarting(false);
        }
      })();
      return;
    }
    setPicked(course);
    setCourseName(course.name);
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
        Alert.alert('Could not start round', err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setStarting(false);
      }
    })();
  };

  return (
    <Screen>
      <Text style={styles.kicker}>P5 · Nearby courses</Text>
      <Text style={styles.title}>ShotTrax</Text>
      <Text style={styles.lede}>
        Find a nearby course, then start or attach a round. Par and green centroids come from
        Golf Courses API only (blank / “par ?” if missing). Yards to green is phone GPS → that
        centroid. Confirm a club to mark shots.
      </Text>

      {isSimulator ? (
        <GpsBanner message="This is a simulator. ShotTrax uses whatever location the simulator reports and does not invent GPS. Set a GPS pin (Features → Location) and move it between marks or distances will be 0 yd." />
      ) : null}

      <TextInput
        placeholder="Course name (optional)"
        placeholderTextColor={colors.muted}
        value={picked?.name ?? courseName}
        onChangeText={(text) => {
          setPicked(null);
          setCourseName(text);
        }}
        style={styles.input}
      />

      <CoursePicker
        selected={picked}
        attachMode={Boolean(active)}
        onSelect={onSelectCourse}
      />

      {active ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Round in progress</Text>
          <Text style={styles.cardMeta}>
            {active.courseName ?? 'Unnamed'} · {active.holeCount} holes
          </Text>
          <BigButton
            label="Continue round"
            onPress={() => router.push(`/round/${active.id}/hole/1`)}
          />
          <BigButton
            label="Finish without continuing"
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
            label={picked ? `Start 18 at ${picked.name}` : 'Start 18 holes'}
            disabled={starting}
            onPress={() => onStart(18)}
          />
          <BigButton
            label={picked ? `Start 9 at ${picked.name}` : 'Start 9 holes'}
            variant="secondary"
            disabled={starting}
            onPress={() => onStart(9)}
          />
        </View>
      )}

      <Text style={styles.section}>Round history</Text>
      {rounds.length === 0 ? (
        <Text style={styles.muted}>No rounds yet.</Text>
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
              style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>{round.courseName ?? 'Round'}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(round.startedAt).toLocaleString()} · {round.holeCount} holes
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
  kicker: { color: colors.lime, fontWeight: '800', letterSpacing: 1, fontSize: 13 },
  title: { color: colors.cream, fontSize: 36, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22 },
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
  cardMeta: { color: colors.muted, fontSize: 14 },
  section: { color: colors.cream, fontSize: 18, fontWeight: '800', marginTop: 8 },
  muted: { color: colors.muted, fontSize: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: 14,
    borderRadius: 14,
    minHeight: 64,
  },
  rowTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  score: { color: colors.lime, fontSize: 24, fontWeight: '900' },
});
