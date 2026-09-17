import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { layoutFromTee } from '@/src/course/layout';
import type { CourseDetail, CourseSummary, TeeSet } from '@/src/course/types';
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
import { CoursePicker, type CoursePick } from '@/src/ui/CoursePicker';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

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
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const active = useMemo(() => getActiveRound(db), [db, revision]);
  const isSimulator = Device.isDevice === false;

  const applyPickedCourse = async (course: CourseSummary, holeCount: 9 | 18) => {
    const layout = await loadLayout(course, pickedDetail, pickedTee);
    const name = course.name;
    const round = startRound(db, holeCount, name, layout);
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
    if (active) {
      setStarting(true);
      try {
        const layout = await loadLayout(pick.course, pick.detail, pick.tee);
        attachCourseToRound(db, active.id, pick.course.name, layout);
        bump();
        router.push(`/round/${active.id}/hole/1`);
      } catch (err) {
        Alert.alert('Could not attach course', err instanceof Error ? err.message : 'Unknown error');
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
        Alert.alert('Could not start round', err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setStarting(false);
      }
    })();
  };

  return (
    <Screen>
      <Text style={styles.kicker}>P5 · Nearby courses</Text>
      <Text style={styles.title}>ShotTraxx</Text>
      <Text style={styles.lede}>
        Find a nearby course, pick a named tee, then start or attach a round. Par, SI, and greens
        come from Golf Courses API only (blank / “par ?” / “SI ?” if missing). Yards to green is
        phone GPS → the Pro green centroid.
      </Text>

      {isSimulator ? (
        <GpsBanner message="This is a simulator. ShotTraxx uses whatever location the simulator reports and does not invent GPS. Set a GPS pin (Features → Location) and move it between marks or distances will be 0 yd." />
      ) : null}

      <TextInput
        placeholder="Course name (optional)"
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

      <CoursePicker
        selected={picked}
        selectedTee={pickedTee}
        attachMode={Boolean(active)}
        onSelect={onSelectCourse}
      />

      {active ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Round in progress</Text>
          <Text style={styles.cardMeta}>
            {active.courseName ?? 'Unnamed'}
            {active.teeName ? ` · ${active.teeName}` : ''} · {active.holeCount} holes
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
            label={
              picked
                ? `Start 18 at ${picked.name}${pickedTee ? ` · ${pickedTee.name}` : ''}`
                : 'Start 18 holes'
            }
            disabled={starting || (Boolean(picked) && (pickedDetail?.tees.length ?? 0) > 1 && !pickedTee)}
            onPress={() => onStart(18)}
          />
          <BigButton
            label={
              picked
                ? `Start 9 at ${picked.name}${pickedTee ? ` · ${pickedTee.name}` : ''}`
                : 'Start 9 holes'
            }
            variant="secondary"
            disabled={starting || (Boolean(picked) && (pickedDetail?.tees.length ?? 0) > 1 && !pickedTee)}
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
