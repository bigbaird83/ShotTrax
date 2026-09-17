import { Stack } from 'expo-router';
import { colors } from '@/src/ui/theme';

export default function RoundLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="hole/[number]" options={{ headerShown: false, title: 'Hole' }} />
      <Stack.Screen name="club-pick" options={{ title: 'Pick a club', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="summary" options={{ title: 'Round summary' }} />
    </Stack>
  );
}
