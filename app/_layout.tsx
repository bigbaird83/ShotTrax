import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { DbProvider } from '@/src/db/DbProvider';
import { BrandedSplash } from '@/src/ui/BrandedSplash';
import { colors } from '@/src/ui/theme';

export { ErrorBoundary } from 'expo-router';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.lime,
    text: colors.cream,
    border: colors.line,
  },
};

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DbProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.cream,
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="round/[id]" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </DbProvider>
      {splashDone ? null : <BrandedSplash onDone={onSplashDone} />}
    </View>
  );
}
