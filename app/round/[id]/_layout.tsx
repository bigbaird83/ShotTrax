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
      <Stack.Screen name="hole/[number]" options={{ title: 'Hole' }} />
      <Stack.Screen name="club-pick" options={{ title: 'Pick club', presentation: 'modal' }} />
      <Stack.Screen name="summary" options={{ title: 'Round summary' }} />
    </Stack>
  );
}
