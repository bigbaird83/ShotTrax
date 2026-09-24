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
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopWidth: colors.flat ? 2 : 0,
          borderTopColor: colors.line,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          paddingHorizontal: 10,
          paddingTop: 6,
        },
        tabBarItemStyle: { borderRadius: 18, marginHorizontal: 4 },
        tabBarActiveBackgroundColor: colors.flat ? colors.lime : colors.accentWash,
        tabBarActiveTintColor: colors.flat ? colors.onAccent : colors.cream,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '700' },
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
          tabBarIcon: ({ color }) => (
            <SymbolView name="star.fill" tintColor={color} size={26} fallback={null} />
          ),
        }}
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
