import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { setPendingCoursePick } from '@/src/course/pendingCoursePick';
import type { CourseSummary, TeeSet } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import { getCourseDistanceUnit, listRounds } from '@/src/db/repo';
import { CoursePicker, type CoursePick } from '@/src/ui/CoursePicker';
import { Screen } from '@/src/ui/Screen';

/**
 * Search is its own screen. The home pill navigates here on tap.
 * Typing stays here and does not open a modal during layout.
 */
export default function SearchScreen() {
  const { db, revision } = useDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [pickedTee, setPickedTee] = useState<TeeSet | null>(null);
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const courseDistanceUnit = useMemo(() => getCourseDistanceUnit(db), [db, revision]);
  const lastPlayedAtByCourse = useMemo(() => {
    const map: Record<string, string> = {};
    for (const round of rounds) {
      if (round.courseApiId && !map[round.courseApiId]) map[round.courseApiId] = round.startedAt;
      if (round.courseName && !map[round.courseName]) map[round.courseName] = round.startedAt;
    }
    return map;
  }, [rounds]);

  const onSelect = (pick: CoursePick | null) => {
    if (!pick) {
      setPicked(null);
      setPickedTee(null);
      return;
    }
    const needsTee = (pick.detail?.tees.length ?? 0) > 0 && !pick.tee;
    setPicked(pick.course);
    setPickedTee(pick.tee);
    if (needsTee) return;
    setSearchQuery('');
    setPendingCoursePick(pick);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen scroll={false} padded={false} edges={['bottom']}>
      <CoursePicker
        selected={picked}
        selectedTee={pickedTee}
        courseDistanceUnit={courseDistanceUnit}
        query={searchQuery}
        onQueryChange={(text) => {
          setSearchQuery(text);
          setPicked(null);
          setPickedTee(null);
        }}
        onSelect={onSelect}
        lastPlayedAtByCourse={lastPlayedAtByCourse}
      />
    </Screen>
  );
}
