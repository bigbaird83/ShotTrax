import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './theme';

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.pad}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
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
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
});
