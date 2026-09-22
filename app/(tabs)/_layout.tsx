import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { useColors } from '@/src/ui/ColorThemeProvider';

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.cream,
        tabBarInactiveTintColor: colors.muted,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rounds',
          tabBarIcon: ({ color }) => (
            <SymbolView name="flag.fill" tintColor={color} size={26} fallback={null} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          // Tab header types omit this stack flag. Favorites stays a root: no Back.
          headerBackVisible: false,
          headerLeft: () => null,
          tabBarIcon: ({ color }: { color: string }) => (
            <SymbolView name="star.fill" tintColor={color} size={26} fallback={null} />
          ),
        } as never}
      />
      <Tabs.Screen
        name="bag"
        options={{
          title: 'Bag',
          tabBarIcon: ({ color }) => (
            <SymbolView name="bag.fill" tintColor={color} size={26} fallback={null} />
          ),
        }}
      />
      <Tabs.Screen
        name="averages"
        options={{
          title: 'Averages',
          tabBarIcon: ({ color }) => (
            <SymbolView name="chart.bar.fill" tintColor={color} size={26} fallback={null} />
          ),
        }}
      />
    </Tabs>
  );
}
