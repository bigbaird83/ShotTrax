import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { DbProvider } from '@/src/db/DbProvider';
import { startWatchClubBridge } from '@/src/services/watchClub';
import { useWatchNearbyStart } from '@/src/services/useWatchNearbyStart';
import { BrandedSplash } from '@/src/ui/BrandedSplash';
import { ColorThemeProvider, useColors, useColorTheme } from '@/src/ui/ColorThemeProvider';
import { expoStackBackTitle } from '@/src/domain/playNav';
import { colors as fallbackColors } from '@/src/ui/theme';

export { ErrorBoundary } from 'expo-router';

function WatchNearbyHost() {
  useWatchNearbyStart();
  return null;
}

function ThemedNavigation() {
  const { themeId } = useColorTheme();
  const colors = useColors();
  const theme = useMemo(
    () => ({
      ...(themeId === 'light' ? DefaultTheme : DarkTheme),
      colors: {
        ...(themeId === 'light' ? DefaultTheme.colors : DarkTheme.colors),
        background: colors.bg,
        card: colors.bg,
        primary: colors.cream,
        text: colors.cream,
        border: colors.line,
      },
    }),
    [themeId, colors],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style={colors.statusBar} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.cream,
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="round/[id]" options={{ headerShown: false, title: 'Round' }} />
          <Stack.Screen name="search" options={{ title: 'Search', headerBackTitle: 'Home' }} />
          <Stack.Screen name="s/[token]" options={{ title: 'ShotTraxx' }} />
          <Stack.Screen name="nerd-out" options={{ title: 'Nerd out' }} />
          <Stack.Screen name="board" options={{ title: 'Live board' }} />
          <Stack.Screen name="request-course" options={{ title: 'Request this course' }} />
          <Stack.Screen name="restore-rounds" options={{ title: 'Restore rounds' }} />
          <Stack.Screen name="contribute-course" options={{ title: 'Contribute a course' }} />
          <Stack.Screen
            name="settings"
            options={({ navigation }) => {
              const state = navigation.getState();
              const prev = state.routes[state.index - 1]?.name;
              return { title: 'Settings', headerBackTitle: expoStackBackTitle(prev) };
            }}
          />
        </Stack>
      </ThemeProvider>
    </View>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    startWatchClubBridge();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: fallbackColors.bg }}>
      <DbProvider>
        <WatchNearbyHost />
        <ColorThemeProvider>
          <ThemedNavigation />
        </ColorThemeProvider>
      </DbProvider>
      {splashDone ? null : <BrandedSplash onDone={onSplashDone} />}
    </View>
  );
}
