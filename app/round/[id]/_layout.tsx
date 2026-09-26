import { useEffect } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { backfillReadyFavoriteOverlays } from '@/src/course/offlineFavorite';
import { useDb } from '@/src/db/DbProvider';
import { getRound, readSettingStore } from '@/src/db/repo';
import { useColors } from '@/src/ui/ColorThemeProvider';

export default function RoundLayout() {
  const colors = useColors();
  const { db } = useDb();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const roundId = typeof params.id === 'string' ? params.id : params.id?.[0] ?? null;
  useEffect(() => {
    const round = roundId ? getRound(db, roundId) : null;
    void backfillReadyFavoriteOverlays(readSettingStore(db), {
      courseId: round?.courseApiId ?? null,
    });
  }, [db, roundId]);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen
        name="hole/[number]"
        options={{ headerShown: false, title: 'Hole', animation: 'none' }}
      />
      <Stack.Screen name="club-pick" options={{ title: 'Pick a club', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="summary" options={{ title: 'Round summary' }} />
      <Stack.Screen name="board" options={{ title: 'Live board' }} />
      <Stack.Screen name="group" options={{ title: 'Group' }} />
      <Stack.Screen name="group-card" options={{ title: 'Group scorecard' }} />
    </Stack>
  );
}
