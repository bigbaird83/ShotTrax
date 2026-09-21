import { Stack } from 'expo-router';
import { useColors } from '@/src/ui/ColorThemeProvider';

export default function RoundLayout() {
  const colors = useColors();
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
      <Stack.Screen name="board" options={{ title: 'Live board' }} />
    </Stack>
  );
}
