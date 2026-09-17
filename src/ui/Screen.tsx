import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from './theme';

export function Screen({
  children,
  scroll = true,
  edges = ['bottom'],
  padded = true,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const pad = padded ? styles.pad : styles.bare;
  const refresh =
    onRefresh != null ? (
      <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.lime} />
    ) : undefined;
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={[pad, styles.fill]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <ScrollView
        contentContainerStyle={pad}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pad: {
    padding: space.md,
    paddingBottom: 32,
    gap: 12,
  },
  bare: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});
