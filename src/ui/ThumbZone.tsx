import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, thumbZoneMin } from './theme';

/** Layout K — primary actions sit in the thumb zone above the home indicator. */
export function ThumbZone({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
    minHeight: thumbZoneMin,
  },
});
