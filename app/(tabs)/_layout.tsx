import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { colors } from '@/src/ui/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.lime,
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
